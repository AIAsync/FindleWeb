"""
The city the visitor searches in.

Findle keeps listings from many US cities in one table. The visitor picks a city in the header (static/js/
region_picker.js); it lives in the session and goes to every Findle API search, chat and research call as
`region` (views._with_language). A query that names a place ("in Brooklyn") still wins over the picked city.
Without a pick the API uses its own default, San Francisco.

The value is a listing region as the API stores it: "San Francisco" or "City, ST" ("Chicago, IL").
"""

import contextvars
import re

SESSION_KEY = 'findle_region'
DEFAULT_REGION = 'San Francisco'

US_STATES = frozenset((
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY',
    'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH',
    'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
    'PR', 'GU', 'VI', 'AS', 'MP',
))
_LABEL = re.compile(r"^[A-Za-z][A-Za-z .'-]{0,60}, ([A-Z]{2})$")

# Set per request by RegionMiddleware. Streaming responses are iterated in the same worker thread, after
# the middleware has returned, so the value is deliberately left in place until the next request sets it.
_current = contextvars.ContextVar('findle_region', default=None)


def is_us_region(region):
    """US listing: dollars, square feet, English place names (San Francisco, "Chicago, IL")."""
    if region == DEFAULT_REGION:
        return True
    match = _LABEL.match(region or '')
    return bool(match and match.group(1) in US_STATES)


def valid_region(value):
    return isinstance(value, str) and len(value) <= 80 and is_us_region(value.strip())


def current_region():
    """The city picked in this request's session, or None (the API then uses its default)."""
    return _current.get()


def set_current_region(value):
    _current.set(value if valid_region(value) else None)


class RegionMiddleware:
    """Make the session's city available to the Findle API helpers for this request."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        session = getattr(request, 'session', None)
        set_current_region(session.get(SESSION_KEY) if session is not None else None)
        return self.get_response(request)
