"""Alerts tab: the user's alerts in the Findle API (/alerts), proxied with the user's owner key.

An alert is a description, the same text one would search with ("2 bedroom in Mission under $4000").
The API turns it into the search's own conditions without a language model and, as new listings are
crawled and extracted, records the ones that match. This module only maps the Django user to an
owner key and shapes the listings into the cards the Search tab already draws.
"""

import json
import os

import requests
from django.http import JsonResponse
from django.utils.translation import get_language
from django.utils.translation import gettext as _
from django.views.decorators.http import require_http_methods

from .models import AlertOwner
from .views import FINDLE_API_BASE, _build_card

ALERTS_TIMEOUT = 10
# Optional server-to-server key; the API checks it only when ALERTS_API_KEY is set on its side.
ALERTS_KEY = os.getenv('FINDLE_ALERTS_KEY', '').strip()
MAX_QUERY = 500
MAX_NAME = 120


def _owner_key(user):
    owner, _created = AlertOwner.objects.get_or_create(user=user)
    return owner.key


def _language():
    code = (get_language() or '')[:2]
    return code if code in ('uz', 'ru', 'en') else 'uz'


def _api(method, path, user, payload=None, params=None):
    """Call the alerts API. Returns (parsed body or None, HTTP status; 0 when unreachable)."""
    headers = {'accept': 'application/json', 'X-Alert-Owner': _owner_key(user)}
    if ALERTS_KEY:
        headers['X-Alerts-Key'] = ALERTS_KEY
    url = f"{FINDLE_API_BASE}{path}"
    try:
        res = requests.request(method, url, json=payload, params=params, headers=headers, timeout=ALERTS_TIMEOUT)
    except Exception as e:
        print(f"[findle-api] {method} {url} failed: {e}")
        return None, 0
    try:
        body = res.json()
    except ValueError:
        body = None
    if res.status_code >= 500:
        print(f"[findle-api] {method} {url} returned HTTP {res.status_code}: {res.text[:200]}")
    return body, res.status_code


def _login_required_json(view):
    """Like login_required, but a JSON 401 instead of a redirect: these are fetched by script."""
    def wrapped(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({'status': 'error', 'message': _('Please sign in to use alerts.')}, status=401)
        return view(request, *args, **kwargs)
    wrapped.__name__ = view.__name__
    wrapped.__doc__ = view.__doc__
    return wrapped


def _error(body, status):
    """The API's own words when it gave them (why a description cannot be an alert), a short line otherwise."""
    detail = body.get('detail') if isinstance(body, dict) else None
    if isinstance(detail, dict) and detail.get('message') and status < 500:
        return JsonResponse({'status': 'error', 'code': detail.get('code') or '', 'message': detail['message']},
                            status=status)
    if status == 404:
        return JsonResponse({'status': 'error', 'code': 'not_found', 'message': _('Alert not found.')}, status=404)
    return JsonResponse({'status': 'error', 'message': _('Alerts are unavailable right now. Try again later.')},
                        status=502)


def _body(request):
    try:
        data = json.loads(request.body or b'{}')
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


@_login_required_json
@require_http_methods(['GET', 'POST'])
def alerts_api(request):
    """GET: the user's alerts with unread counts. POST: a new alert from a description."""
    if request.method == 'GET':
        body, status = _api('GET', '/alerts', request.user)
        if status != 200 or not isinstance(body, dict):
            return _error(body, status)
        return JsonResponse({'status': 'success', 'alerts': body.get('alerts') or [], 'unread': body.get('unread') or 0})

    data = _body(request)
    query = str((data or {}).get('query') or '').strip()
    if not query:
        return JsonResponse({'status': 'error', 'code': 'empty',
                             'message': _('Describe what you are looking for.')}, status=400)
    payload = {'query': query[:MAX_QUERY], 'language': _language()}
    name = str((data or {}).get('name') or '').strip()
    if name:
        payload['name'] = name[:MAX_NAME]
    body, status = _api('POST', '/alerts', request.user, payload=payload)
    if status != 201 or not isinstance(body, dict):
        return _error(body, status)
    return JsonResponse({'status': 'success', 'alert': body.get('alert'), 'preview': body.get('preview') or {}},
                        status=201)


@_login_required_json
@require_http_methods(['PATCH', 'DELETE'])
def alert_detail_api(request, alert_id):
    """PATCH: pause / resume, rename or change the description. DELETE: remove it with its notifications."""
    if request.method == 'DELETE':
        body, status = _api('DELETE', f'/alerts/{alert_id}', request.user, params={'language': _language()})
        if status != 200:
            return _error(body, status)
        return JsonResponse({'status': 'success'})

    data = _body(request)
    if data is None:
        return JsonResponse({'status': 'error', 'message': _('Invalid request.')}, status=400)
    payload = {'language': _language()}
    if isinstance(data.get('active'), bool):
        payload['active'] = data['active']
    if isinstance(data.get('name'), str):
        payload['name'] = data['name'].strip()[:MAX_NAME]
    if isinstance(data.get('query'), str) and data['query'].strip():
        payload['query'] = data['query'].strip()[:MAX_QUERY]
    body, status = _api('PATCH', f'/alerts/{alert_id}', request.user, payload=payload)
    if status != 200 or not isinstance(body, dict):
        return _error(body, status)
    return JsonResponse({'status': 'success', 'alert': body.get('alert')})


def _positive_int(value):
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


@_login_required_json
@require_http_methods(['GET'])
def alert_notifications_api(request):
    """New listings that matched the user's alerts, newest first, as Search-tab cards."""
    params = {'limit': min(_positive_int(request.GET.get('limit')) or 24, 48)}
    for key in ('alert_id', 'before'):
        value = _positive_int(request.GET.get(key))
        if value:
            params[key] = value
    if request.GET.get('unseen') in ('1', 'true'):
        params['unseen'] = 'true'
    body, status = _api('GET', '/alerts/notifications', request.user, params=params)
    if status != 200 or not isinstance(body, dict):
        return _error(body, status)
    items = []
    for item in body.get('items') or []:
        if not isinstance(item, dict) or not isinstance(item.get('listing'), dict):
            continue
        items.append({
            'id': item.get('id'),
            'alert_id': item.get('alert_id'),
            'matched_at': item.get('matched_at') or '',
            'seen': bool(item.get('seen')),
            'card': _build_card(item['listing']),
        })
    return JsonResponse({'status': 'success', 'items': items, 'unread': body.get('unread') or 0,
                         'next_before': body.get('next_before')})


@_login_required_json
@require_http_methods(['POST'])
def alert_seen_api(request):
    """Mark notifications read: one alert's, the listed ones, or all of them."""
    data = _body(request) or {}
    payload = {}
    alert_id = _positive_int(data.get('alert_id'))
    if alert_id:
        payload['alert_id'] = alert_id
    ids = [number for number in (_positive_int(value) for value in (data.get('ids') or [])[:500]) if number]
    if ids:
        payload['ids'] = ids
    body, status = _api('POST', '/alerts/notifications/seen', request.user, payload=payload)
    if status != 200 or not isinstance(body, dict):
        return _error(body, status)
    return JsonResponse({'status': 'success', 'updated': body.get('updated') or 0, 'unread': body.get('unread') or 0})


@_login_required_json
@require_http_methods(['GET'])
def alert_unread_api(request):
    """The number on the Alerts tab. Polled, so it fails quietly: an unreachable API just shows nothing."""
    body, status = _api('GET', '/alerts/unread', request.user)
    unread = body.get('unread') if status == 200 and isinstance(body, dict) else None
    return JsonResponse({'status': 'success' if unread is not None else 'error', 'unread': unread or 0})
