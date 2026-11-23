"""
US listings: dollars, square feet and English titles.

Findle keeps rentals from the whole US in one table. The place a visitor searches comes only from the
query (city, state, neighborhood, street): the Findle API extracts it, the site sends nothing extra.
A listing's region is "San Francisco" or "City, ST" ("Chicago, IL").
"""

import re

# A map point without a region (an older API build) is shown with US formatting
DEFAULT_REGION = 'San Francisco'

US_STATES = frozenset((
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY',
    'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH',
    'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
    'PR', 'GU', 'VI', 'AS', 'MP',
))
_LABEL = re.compile(r"^[A-Za-z][A-Za-z .'-]{0,60}, ([A-Z]{2})$")


def is_us_region(region):
    """US listing: dollars, square feet, English place names (San Francisco, "Chicago, IL")."""
    if region == DEFAULT_REGION:
        return True
    match = _LABEL.match(region or '')
    return bool(match and match.group(1) in US_STATES)
