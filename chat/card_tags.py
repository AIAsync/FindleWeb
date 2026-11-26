"""
Card tags: a listing's structured fields as short labels, in the visitor's language.

Search and Alerts cards show these instead of a title. A title comes from the source and is often noise: the
first line of a Telegram post ("📍 Chilonzor tumani", "🏠 IJARA | TOSHKENT7️⃣") or a manager's code
("Pm0549-215"). The fields are what the search understood, so every card says the same things the same way.

Most telling first (what, which deal, size, floor, state), amenities last; at most MAX_TAGS.
"""

from django.utils.translation import gettext as _

from .region import is_us_region

MAX_TAGS = 8
_SQFT_PER_M2 = 10.7639


def _categories():
    return {
        'apartments': _('Apartment'), 'houses': _('House'), 'cottages': _('Cottage'),
        'townhouses': _('Townhouse'), 'rooms': _('Room'), 'hostels': _('Hostel'), 'hotels': _('Hotel'),
        'offices': _('Office'), 'retail_space': _('Retail space'), 'shops_and_boutiques': _('Shop'),
        'restaurants_and_cafes': _('Restaurant or cafe'), 'salons': _('Salon'), 'warehouses': _('Warehouse'),
        'factories': _('Production building'), 'logistics_centers': _('Logistics center'),
        'garages': _('Garage'), 'parking_spaces': _('Parking space'), 'parking_lots': _('Parking lot'),
        'plots': _('Land plot'), 'residential_land': _('Residential land'),
        'commercial_land': _('Commercial land'), 'agricultural_land': _('Farmland'),
        'medical_centers': _('Medical center'), 'educational_institutions': _('School building'),
        'sports_complexes': _('Sports complex'),
    }


def _deal(transaction, period):
    if transaction in ('Rent', 'Lease'):
        if period == 'daily':
            return _('Daily rent')
        if period == 'yearly':
            return _('Yearly rent')
        return _('Rent')
    return {'Sale': _('Sale'), 'Exchange': _('Exchange')}.get(transaction)


def _values():
    """Labels for the fields whose value is a word: condition, building, heating, payment."""
    return {
        'condition': {
            'Euro repair': _('Euro renovation'), 'Designer repair': _('Designer renovation'),
            'Cosmetic repair': _('Cosmetic renovation'), 'Needs repair': _('Needs renovation'),
            'Rough': _('Rough finish'), 'White box': _('White box'),
        },
        'building_type': {
            'Brick': _('Brick building'), 'Panel': _('Panel building'), 'Monolithic': _('Monolithic building'),
            'Block': _('Block building'), 'Wood': _('Wooden building'),
        },
        'heating': {
            'Central': _('Central heating'), 'Autonomous': _('Own heating'), 'Gas': _('Gas heating'),
            'Electric': _('Electric heating'),
        },
        'payment_terms': {'Installment': _('Installments'), 'Mortgage': _('Mortgage')},
    }


def _amenities():
    """Yes/no fields shown only when the listing has them."""
    return (
        ('internet', _('Internet')), ('parking', _('Parking')), ('gas', _('Gas')), ('water', _('Water')),
        ('electricity', _('Electricity')), ('sewage', _('Sewer')), ('kitchen', _('Kitchen')),
        ('security', _('Security')), ('pool', _('Pool')), ('gym', _('Gym')), ('ventilation', _('Ventilation')),
    )


def _number(value):
    if value is None or isinstance(value, bool) or value == '':
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _whole(value):
    number = _number(value)
    return int(number) if number is not None and number == int(number) else None


def _amount(number, us):
    """65 → "65", 78.97 → "79", 1.5 → "1.5"; thousands as the country writes them."""
    shown = round(number) if number >= 10 or number == int(number) else round(number, 1)
    text = f'{shown:,}'
    return text if us else text.replace(',', ' ')


def card_tags(res):
    """The tags for one result row (a /search, /chat or alert listing)."""
    structured = res.get('structured') if isinstance(res.get('structured'), dict) else {}
    us = is_us_region(res.get('region'))
    tags = []

    def add(text):
        if text and text not in tags:
            tags.append(str(text))

    # What it is and which deal, in one tag: "Kvartira · Ijara". Two tags would take a line of the card
    # on every result, since they are the same for most of a list.
    kind = _categories().get(res.get('category_title'))
    deal = _deal(res.get('transaction_type'), structured.get('rent_period'))
    add(' · '.join(str(part) for part in (kind, deal) if part))

    rooms = structured.get('rooms')
    if rooms == 0 or rooms == '0':
        add(_('Studio'))
    elif _whole(rooms):
        label = _('%(count)s bd') if us else _('%(count)s-room')
        add(label % {'count': _whole(rooms)})
    baths = _number(structured.get('bathrooms'))
    if baths:
        label = _('%(count)s ba') if us else _('%(count)s bath')
        add(label % {'count': _amount(baths, us)})

    area = _number(res.get('total_area'))
    if area:
        add(f"{_amount(area * _SQFT_PER_M2, us)} {_('sq ft')}" if us else f'{_amount(area, us)} m²')
    land = _number(structured.get('land_area'))
    if land and not us:
        add(_('%(area)s m² land') % {'area': _amount(land, us)})

    floor, floors = _whole(structured.get('floor')), _whole(structured.get('total_floors'))
    if floor and floors:
        add(_('Floor %(floor)s/%(total)s') % {'floor': floor, 'total': floors})
    elif floor:
        add(_('Floor %(floor)s') % {'floor': floor})
    elif floors:
        add(_('%(total)s floors') % {'total': floors})

    values = _values()
    add(values['condition'].get(structured.get('condition')))
    if structured.get('furnished') is True:
        add(_('Furnished'))
    elif structured.get('furnished') is False:
        add(_('Unfurnished'))
    add(values['building_type'].get(structured.get('building_type')))
    add(values['heating'].get(structured.get('heating')))
    if res.get('realtor_is') is False:
        add(_('From owner'))
    add(values['payment_terms'].get(res.get('payment_terms')))

    for name, label in _amenities():
        if structured.get(name) is True:
            add(label)

    year = _whole(structured.get('year_built'))
    if year and 1800 <= year <= 2100:
        add(_('Built %(year)s') % {'year': year})
    return tags[:MAX_TAGS]
