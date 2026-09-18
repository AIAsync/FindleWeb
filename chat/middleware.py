from django.conf import settings


class ForceDefaultLanguageMiddleware:
    """
    Django's LocaleMiddleware falls back to the browser's Accept-Language
    header when no language cookie/session is set, which overrides
    LANGUAGE_CODE for visitors whose browser is set to Uzbek. Strip that
    header for anyone who hasn't explicitly picked a language via the
    language switcher (which sets the language cookie), so first-time
    visitors always land on LANGUAGE_CODE (English).
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        cookie_name = getattr(settings, 'LANGUAGE_COOKIE_NAME', 'django_language')
        if cookie_name not in request.COOKIES:
            request.META.pop('HTTP_ACCEPT_LANGUAGE', None)

        return self.get_response(request)
