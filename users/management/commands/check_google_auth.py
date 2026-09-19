"""Diagnose (and optionally repair) the Google (Gmail) sign-in configuration.

Most "HTTP 500 on /accounts/google/login/" reports come down to the database the
server actually runs on: production Postgres is not the local sqlite file, so a
SocialApp that exists in development is simply absent there.

The subtle case this command exists for: allauth looks the app up with
SocialApp.objects.on_site(request), which filters sites__id=SITE_ID. An app saved
from the admin WITHOUT moving the site into the "Chosen sites" box therefore
exists in the table but is invisible to allauth, and the login view raises
SocialApp.DoesNotExist -> HTTP 500.

    python manage.py check_google_auth
    python manage.py check_google_auth --domain findle.uz
    python manage.py check_google_auth --link        # attach the app to this Site
    python manage.py check_google_auth --trace       # show the real traceback

--trace matters in production, where DEBUG=False replaces the traceback with a
generic 500 page: it drives the sign-in URL through the request stack in this
process and prints whatever exception the view actually raises.
"""

import traceback

from django.conf import settings
from django.contrib.sites.models import Site
from django.core.management.base import BaseCommand

from allauth.socialaccount.models import SocialApp


def mask(value):
    if not value:
        return '(empty)'
    return '%s…%s (%d chars)' % (value[:12], value[-4:], len(value))


class Command(BaseCommand):
    help = 'Check, and optionally repair, the Google OAuth configuration in this database.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--domain',
            help='Set the Site domain, e.g. findle.uz (no scheme, no trailing slash).',
        )
        parser.add_argument(
            '--link',
            action='store_true',
            help='Attach the existing google SocialApp to this Site (fixes an app '
                 'saved from the admin without its Sites box filled in).',
        )
        parser.add_argument(
            '--trace',
            action='store_true',
            help='Request the Google sign-in URL in this process and print the real '
                 'traceback (production hides it behind a generic 500 page).',
        )

    def ok(self, msg):
        self.stdout.write(self.style.SUCCESS(msg))

    def bad(self, msg):
        self.stdout.write(self.style.ERROR(msg))

    def warn(self, msg):
        self.stdout.write(self.style.WARNING(msg))

    def handle(self, *args, **options):
        db = settings.DATABASES['default']
        self.stdout.write('Database: %s (%s)' % (db['ENGINE'].rsplit('.', 1)[-1], db['NAME']))
        self.stdout.write('SITE_ID:  %s' % settings.SITE_ID)

        domain = options.get('domain')
        if domain:
            domain = domain.strip().rstrip('/')
            for prefix in ('https://', 'http://'):
                if domain.startswith(prefix):
                    domain = domain[len(prefix):]
            site, _ = Site.objects.update_or_create(
                id=settings.SITE_ID, defaults={'domain': domain, 'name': domain})
            self.ok('Site domain set to %s' % site.domain)

        try:
            site = Site.objects.get(id=settings.SITE_ID)
        except Site.DoesNotExist:
            self.bad('No Site row with id=%s. Rerun with --domain <your-domain>.' % settings.SITE_ID)
            return

        self.stdout.write('Site:     %s (%s)' % (site.domain, site.name))
        self.stdout.write('')

        # Every google app in the table, whether or not allauth can see it.
        all_apps = list(SocialApp.objects.filter(provider='google').prefetch_related('sites'))
        other_apps = list(SocialApp.objects.exclude(provider='google'))

        if not all_apps:
            self.bad('There is no SocialApp row with provider="google" in this database.')
            if other_apps:
                self.warn('Rows with other providers exist: %s'
                          % ', '.join(sorted({a.provider for a in other_apps})))
                self.warn('If one of those was meant to be Google, its Provider field is wrong.')
            self.stdout.write(
                'Add one at /admin/socialaccount/socialapp/add/ with Provider=Google, '
                'the client id and secret from the Google Cloud console, and this Site '
                'moved into the "Chosen sites" box.')
            return

        self.stdout.write('google SocialApp rows in this database: %d' % len(all_apps))
        for app in all_apps:
            linked = list(app.sites.all())
            self.stdout.write('  id=%s name=%r' % (app.id, app.name))
            self.stdout.write('     client_id: %s' % mask(app.client_id))
            self.stdout.write('     secret:    %s' % mask(app.secret))
            self.stdout.write('     sites:     %s'
                              % (', '.join('%s (id=%s)' % (s.domain, s.id) for s in linked)
                                 if linked else 'NONE'))
        self.stdout.write('')

        # This is the query allauth itself runs.
        visible = list(SocialApp.objects.filter(provider='google', sites__id=site.id))

        if not visible:
            self.bad('None of those rows is linked to Site id=%s, which is the only '
                     'place allauth looks (SocialApp.objects.on_site filters '
                     'sites__id=SITE_ID). The login view therefore raises '
                     'SocialApp.DoesNotExist and Django returns HTTP 500.' % site.id)
            if options.get('link'):
                for app in all_apps:
                    app.sites.add(site)
                self.ok('Linked %d google app(s) to %s. Re-run this command to confirm.'
                        % (len(all_apps), site.domain))
            else:
                self.stdout.write(
                    'Fix it either way:\n'
                    '  - admin: open the app, move "%s" into the "Chosen sites" box, save; or\n'
                    '  - here:  python manage.py check_google_auth --link' % site.domain)
            return

        if len(visible) > 1:
            self.bad('%d google apps are linked to this Site. allauth raises '
                     'MultipleObjectsReturned and Django returns HTTP 500. '
                     'Delete all but one (ids: %s).'
                     % (len(visible), ', '.join(str(a.id) for a in visible)))
            return

        app = visible[0]
        problems = False
        if not app.client_id or not app.secret:
            self.bad('The app is missing a client_id or secret.')
            problems = True
        if app.client_id and not app.client_id.endswith('.apps.googleusercontent.com'):
            self.warn('client_id does not end in .apps.googleusercontent.com — check it '
                      'is the OAuth *client id*, not the project id or API key.')
        if app.secret and not app.secret.startswith('GOCSPX-'):
            self.warn('secret does not start with GOCSPX- — current Google client '
                      'secrets do. Check it is the client secret, not an API key.')
        if app.client_id and app.client_id.strip() != app.client_id:
            self.bad('client_id has leading/trailing whitespace.')
            problems = True
        if app.secret and app.secret.strip() != app.secret:
            self.bad('secret has leading/trailing whitespace.')
            problems = True

        scheme = settings.ACCOUNT_DEFAULT_HTTP_PROTOCOL
        self.stdout.write('')
        self.stdout.write('Authorised redirect URI for the Google Cloud console:')
        self.stdout.write('  %s://%s/accounts/google/login/callback/' % (scheme, site.domain))
        self.stdout.write('Authorised JavaScript origin:')
        self.stdout.write('  %s://%s' % (scheme, site.domain))

        if not problems:
            self.ok('\nGoogle sign-in configuration in this database looks valid.')

        if options.get('trace'):
            self.trace(site)

    def trace(self, site):
        """Drive /accounts/google/login/ through the stack and report the outcome."""
        from django.test import Client

        self.stdout.write('')
        self.stdout.write('--- requesting /accounts/google/login/?process=login ---')

        original_hosts = settings.ALLOWED_HOSTS
        settings.ALLOWED_HOSTS = list(original_hosts) + [site.domain, 'testserver']
        try:
            client = Client(raise_request_exception=True)
            response = client.get('/accounts/google/login/', {'process': 'login'},
                                  HTTP_HOST=site.domain, secure=True)
        except Exception:
            self.bad('The view raised:')
            self.stdout.write(traceback.format_exc())
            return
        finally:
            settings.ALLOWED_HOSTS = original_hosts

        location = response.headers.get('Location', '')
        if response.status_code == 302 and 'accounts.google.com' in location:
            self.ok('HTTP 302 to accounts.google.com — the sign-in redirect works.')
            self.stdout.write('  %s' % location[:160])
        else:
            self.bad('Unexpected HTTP %s%s' % (
                response.status_code, (' -> ' + location) if location else ''))
