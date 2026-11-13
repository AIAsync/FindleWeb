"""
Usage monitoring: which buttons people click and how long they actively use the site.

static/js/usage.js counts clicks and active seconds in the browser and sends them here about once a
minute (and when the page is hidden). Rows are daily counters per browser, so the tables stay small;
the FindleBot Telegram bot (/web) reads them. No text the user typed, no message content, no IP.
"""

import json
import re

from django.db import IntegrityError, transaction
from django.db.models import F
from django.http import HttpResponse
from django.utils import timezone
from django.views.decorators.http import require_POST

from .models import UsageClick, UsageDay

VISITOR_RE = re.compile(r'^[A-Za-z0-9_-]{8,40}$')
MAX_TARGETS = 50          # distinct buttons in one report
MAX_CLICKS = 200          # clicks on one button in one report
MAX_SECONDS = 120         # the page reports every 60 s; more is not real use
TARGET_LENGTH = 100


def _clean_clicks(raw):
    clicks = {}
    if not isinstance(raw, dict):
        return clicks
    for target, count in list(raw.items())[:MAX_TARGETS]:
        target = re.sub(r'\s+', ' ', str(target)).strip()[:TARGET_LENGTH]
        try:
            count = int(count)
        except (TypeError, ValueError):
            continue
        if target and count > 0:
            clicks[target] = min(count, MAX_CLICKS)
    return clicks


def _row(model, lookup, defaults):
    """get_or_create that survives two reports of the same browser arriving at once."""
    try:
        with transaction.atomic():
            return model.objects.get_or_create(**lookup, defaults=defaults)[0]
    except IntegrityError:
        return model.objects.get(**lookup)


def record(visitor, user, seconds, clicks, day=None):
    day = day or timezone.now().date()
    owner = {'user': user} if user is not None else {}
    usage = _row(UsageDay, {'day': day, 'visitor': visitor}, owner)
    UsageDay.objects.filter(pk=usage.pk).update(
        seconds=F('seconds') + seconds, clicks=F('clicks') + sum(clicks.values()), last_at=timezone.now(), **owner,
    )
    for target, count in clicks.items():
        click = _row(UsageClick, {'day': day, 'visitor': visitor, 'target': target}, owner)
        UsageClick.objects.filter(pk=click.pk).update(count=F('count') + count, **owner)


@require_POST
def usage_collect_api(request):
    """One report from usage.js: {"visitor": id, "seconds": n, "clicks": {target: count}}."""
    try:
        data = json.loads(request.POST.get('data') or '{}')
    except ValueError:
        return HttpResponse(status=400)
    if not isinstance(data, dict):
        return HttpResponse(status=400)
    visitor = str(data.get('visitor') or '')
    if not VISITOR_RE.match(visitor):
        return HttpResponse(status=400)
    try:
        seconds = max(0, min(int(data.get('seconds') or 0), MAX_SECONDS))
    except (TypeError, ValueError):
        seconds = 0
    clicks = _clean_clicks(data.get('clicks'))
    if seconds or clicks:
        user = request.user if request.user.is_authenticated else None
        record(visitor, user, seconds, clicks)
    return HttpResponse(status=204)
