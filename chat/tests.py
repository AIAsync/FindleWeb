import json
from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from django.urls import reverse

from . import alerts, pages
from .models import AlertOwner


class _Response:
    def __init__(self, status, body):
        self.status_code = status
        self._body = body
        self.text = json.dumps(body)

    def json(self):
        if self._body is None:
            raise ValueError('no body')
        return self._body


def _listing(**extra):
    return {'product_id': '42', 'title': '371 Waller St', 'price': 3800, 'currency': 'USD', 'region': 'San Francisco',
            'district': 'Hayes Valley', 'transaction_type': 'Rent', 'structured': {'rooms': 1, 'bathrooms': 1},
            'site_name': 'zillow_rentals', 'product_url': 'https://example.com/42', **extra}


class AlertsApiTests(TestCase):
    """The Alerts tab proxies the Findle API with a per-user key; the API itself never sees a user id."""

    def setUp(self):
        self.user = User.objects.create_user('ali', password='pass-1234-word')
        self.client.force_login(self.user)

    def call(self, response):
        return mock.patch('chat.alerts.requests.request', return_value=response)

    def test_signed_out_users_get_json_401(self):
        self.client.logout()
        with self.call(_Response(200, {})) as api:
            response = self.client.get('/api/alerts/')
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()['status'], 'error')
        api.assert_not_called()

    def test_owner_key_is_random_stable_and_per_user(self):
        with self.call(_Response(200, {'alerts': [], 'unread': 0})) as api:
            self.client.get('/api/alerts/')
            self.client.get('/api/alerts/')
        keys = [call.kwargs['headers']['X-Alert-Owner'] for call in api.call_args_list]
        self.assertEqual(keys[0], keys[1])
        self.assertEqual(keys[0], AlertOwner.objects.get(user=self.user).key)
        self.assertGreaterEqual(len(keys[0]), 16)

        other = User.objects.create_user('vali', password='pass-1234-word')
        self.client.force_login(other)
        with self.call(_Response(200, {'alerts': [], 'unread': 0})) as api:
            self.client.get('/api/alerts/')
        self.assertNotEqual(api.call_args.kwargs['headers']['X-Alert-Owner'], keys[0])

    def test_create_forwards_the_description_and_the_interface_language(self):
        body = {'alert': {'id': 7, 'query': '2 bedroom in Mission', 'conditions': []}, 'preview': {'current': 12}}
        with self.call(_Response(201, body)) as api:
            response = self.client.post('/api/alerts/', data=json.dumps({'query': '  2 bedroom in Mission  '}),
                                        content_type='application/json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['alert']['id'], 7)
        self.assertEqual(response.json()['preview'], {'current': 12})
        sent = api.call_args.kwargs['json']
        self.assertEqual(sent['query'], '2 bedroom in Mission')
        self.assertIn(sent['language'], ('uz', 'en'))
        self.assertEqual(api.call_args.args[:2], ('POST', f'{alerts.FINDLE_API_BASE}/alerts'))

    def test_the_api_reason_reaches_the_user(self):
        detail = {'code': 'no_conditions', 'message': 'No concrete condition found.'}
        with self.call(_Response(422, {'detail': detail})):
            response = self.client.post('/api/alerts/', data=json.dumps({'query': 'nice'}),
                                        content_type='application/json')
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()['message'], 'No concrete condition found.')
        self.assertEqual(response.json()['code'], 'no_conditions')

    def test_empty_description_is_not_sent(self):
        with self.call(_Response(201, {})) as api:
            response = self.client.post('/api/alerts/', data=json.dumps({'query': '   '}),
                                        content_type='application/json')
        self.assertEqual(response.status_code, 400)
        api.assert_not_called()

    def test_api_down_is_a_short_message_not_a_trace(self):
        with mock.patch('chat.alerts.requests.request', side_effect=ConnectionError('refused')):
            response = self.client.get('/api/alerts/')
        self.assertEqual(response.status_code, 502)
        self.assertNotIn('refused', response.json()['message'])

    def test_notifications_are_search_cards(self):
        body = {'items': [{'id': 9, 'alert_id': 7, 'matched_at': '2026-11-13T10:00:00Z', 'seen': False,
                           'listing': _listing()}], 'unread': 1, 'next_before': None}
        with self.call(_Response(200, body)) as api:
            response = self.client.get('/api/alerts/notifications/?alert_id=7&limit=500&before=abc')
        self.assertEqual(api.call_args.kwargs['params'], {'limit': 48, 'alert_id': 7})
        (item,) = response.json()['items']
        self.assertEqual(item['card']['title'], '371 Waller St')
        self.assertEqual(item['card']['units'], 'us')
        self.assertEqual((item['id'], item['alert_id'], item['seen']), (9, 7, False))

    def test_pause_rename_and_delete(self):
        with self.call(_Response(200, {'alert': {'id': 7, 'active': False}})) as api:
            response = self.client.patch('/api/alerts/7/', data=json.dumps({'active': False, 'extra': 'x'}),
                                         content_type='application/json')
        self.assertEqual(response.json()['alert']['active'], False)
        self.assertEqual(api.call_args.args[:2], ('PATCH', f'{alerts.FINDLE_API_BASE}/alerts/7'))
        self.assertNotIn('extra', api.call_args.kwargs['json'])
        with self.call(_Response(404, {'detail': {'code': 'not_found', 'message': 'Alert not found.'}})):
            self.assertEqual(self.client.delete('/api/alerts/8/').status_code, 404)

    def test_seen_and_unread(self):
        with self.call(_Response(200, {'updated': 3, 'unread': 0})) as api:
            response = self.client.post('/api/alerts/notifications/seen/', data=json.dumps({'alert_id': 7}),
                                        content_type='application/json')
        self.assertEqual(response.json()['unread'], 0)
        self.assertEqual(api.call_args.kwargs['json'], {'alert_id': 7})
        with self.call(_Response(200, {'unread': 5})):
            self.assertEqual(self.client.get('/api/alerts/unread/').json()['unread'], 5)
        with self.call(_Response(503, None)):
            self.assertEqual(self.client.get('/api/alerts/unread/').json(), {'status': 'error', 'unread': 0})

    def test_service_key_is_sent_when_configured(self):
        with mock.patch.object(alerts, 'ALERTS_KEY', 'service-secret'), \
                self.call(_Response(200, {'unread': 0})) as api:
            self.client.get('/api/alerts/unread/')
        self.assertEqual(api.call_args.kwargs['headers']['X-Alerts-Key'], 'service-secret')


class UsageTests(TestCase):
    """static/js/usage.js reports clicks and active seconds; daily counters per browser, no typed text."""

    VISITOR = 'a1b2c3d4e5f6a7b8c9d0e1f2'

    def report(self, client=None, **data):
        payload = {'visitor': self.VISITOR, 'seconds': 0, 'clicks': {}, **data}
        return (client or self.client).post('/api/usage/', {'data': json.dumps(payload)})

    def test_anonymous_visitor_is_counted_without_a_user(self):
        from .models import UsageClick, UsageDay

        self.assertEqual(self.report(seconds=45, clicks={'#send-btn': 2, '#tab-map': 1}).status_code, 204)
        self.assertEqual(self.report(seconds=60, clicks={'#send-btn': 1}).status_code, 204)
        day = UsageDay.objects.get(visitor=self.VISITOR)
        self.assertEqual((day.seconds, day.clicks, day.user), (105, 4, None))
        counts = dict(UsageClick.objects.filter(visitor=self.VISITOR).values_list('target', 'count'))
        self.assertEqual(counts, {'#send-btn': 3, '#tab-map': 1})

    def test_signed_in_user_owns_the_browser_day(self):
        from .models import UsageClick, UsageDay

        self.report(seconds=30)
        user = User.objects.create_user('alice', password='pw-123456')
        self.client.force_login(user)
        self.report(seconds=30, clicks={'#tab-alert': 1})
        self.assertEqual(UsageDay.objects.get(visitor=self.VISITOR).user, user)
        self.assertEqual(UsageClick.objects.get(target='#tab-alert').user, user)

    def test_reports_are_bounded(self):
        from .models import UsageClick, UsageDay

        clicks = {f'.button-{i}': 1000 for i in range(80)}
        self.report(seconds=100000, clicks=clicks)
        day = UsageDay.objects.get(visitor=self.VISITOR)
        self.assertEqual(day.seconds, 120)
        self.assertEqual(UsageClick.objects.count(), 50)
        self.assertEqual(day.clicks, 50 * 200)

    def test_bad_reports_are_rejected(self):
        self.assertEqual(self.report(visitor='short').status_code, 400)
        self.assertEqual(self.client.post('/api/usage/', {'data': 'not json'}).status_code, 400)
        self.assertEqual(self.client.get('/api/usage/').status_code, 405)

    def test_csrf_token_from_the_page_is_required(self):
        from django.test import Client, override_settings

        # Pages use the manifest storage in settings; tests have no collected static files
        plain = {'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
                 'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'}}
        with override_settings(STORAGES=plain):
            self._csrf_flow(Client(enforce_csrf_checks=True))

    def _csrf_flow(self, client):

        self.assertEqual(self.report(client, seconds=15).status_code, 403)
        page = client.get('/')
        self.assertContains(page, 'js/usage.js')
        token = page.content.decode().split('name="csrf-token" content="', 1)[1].split('"', 1)[0]
        payload = {'visitor': self.VISITOR, 'seconds': 15, 'clicks': {}}
        response = client.post('/api/usage/', {'csrfmiddlewaretoken': token, 'data': json.dumps(payload)})
        self.assertEqual(response.status_code, 204)


# Pages use the manifest static storage in settings; tests have no collected static files
PLAIN_STORAGES = {'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
                  'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'}}


@override_settings(STORAGES=PLAIN_STORAGES)
class InfoPageTests(TestCase):
    """Help, Terms of Service, Privacy Policy and About: one template per language (chat/pages.py)."""

    TITLES = {
        'en': {'help': 'Help', 'terms': 'Terms of Service', 'privacy': 'Privacy Policy', 'about': 'About Findle AI'},
        'uz': {'help': 'Yordam', 'terms': 'Foydalanish shartlari', 'privacy': 'Maxfiylik siyosati',
               'about': 'Findle AI haqida'},
    }

    def get(self, url, language=None):
        if language:
            self.client.cookies['django_language'] = language
        return self.client.get(url)

    def test_every_page_renders_in_both_languages(self):
        for language, titles in self.TITLES.items():
            for page, title in titles.items():
                with self.subTest(language=language, page=page):
                    response = self.get(reverse(page), language)
                    self.assertEqual(response.status_code, 200)
                    self.assertContains(response, f'<title>{title} · Findle AI</title>', html=False)
                    self.assertContains(response, 'js/usage.js')
                    # Every page links to the other three, and marks itself
                    for other in pages.PAGES:
                        self.assertContains(response, f'href="{reverse(other)}"')
                    self.assertContains(response, f'href="{reverse(page)}" aria-current="page"')

    def test_a_language_without_its_own_page_falls_back_to_english(self):
        with mock.patch.object(pages, 'get_language', return_value='ru'):
            response = self.client.get(reverse('privacy'))
        self.assertContains(response, '<h1>Privacy Policy</h1>', html=False)

    def test_about_describes_the_san_francisco_rental_search(self):
        uz = self.get(reverse('about'), 'uz')
        self.assertContains(uz, "San-Fransisko ijara e'lonlari")
        self.assertContains(uz, 'Aqlli saralash')
        en = self.get(reverse('about'), 'en')
        self.assertContains(en, 'San Francisco rentals')
        self.assertContains(en, 'How it works')
        for response in (uz, en):
            text = response.content.decode().lower()
            # The old marketplace text, the market analysis card and the pricing are gone
            for word in ("o'zbekiston", 'uzbekistan', 'bozor tahlili', 'market analysis', 'tez orada', 'coming soon',
                         'tarif', 'obuna', 'premium', 'subscription', 'pricing', "so'm"):
                self.assertNotIn(word, text)

    def test_home_links_the_pages_and_has_no_subscription(self):
        for user in (None, User.objects.create_user('alice', password='pw-123456')):
            if user:
                self.client.force_login(user)
            response = self.client.get('/')
            for page in pages.PAGES:
                self.assertContains(response, f'href="{reverse(page)}"')
            self.assertNotContains(response, 'Subscription')
            self.assertNotContains(response, 'Obuna')
