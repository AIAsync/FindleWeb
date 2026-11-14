"""
Help, Terms of Service, Privacy Policy and About pages.

Each page is written whole in every language (templates/pages/<page>_<language>.html) instead of
as gettext strings: legal text is read, reviewed and changed as one document. A language without
its own file gets the English one.
"""

from django.shortcuts import render
from django.utils.translation import get_language

PAGES = ('help', 'terms', 'privacy', 'about')


def info_page(request, page):
    language = (get_language() or 'en')[:2]
    templates = [f'pages/{page}_{language}.html', f'pages/{page}_en.html']
    return render(request, templates, {'page': page})
