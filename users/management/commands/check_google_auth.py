"""Diagnose the Google (Gmail) sign-in configuration of the active database.

Most "HTTP 500 on /accounts/google/login/" reports come from the database the
server actually runs on (production Postgres is not the local sqlite file):
either no SocialApp row exists for the current SITE_ID, or more than one does,
or the Site domain does not match the redirect URI registered with Google.

    python manage.py check_google_auth
"""

from django.conf import settings
from django.contrib.sites.models import Site
from django.core.management.base import BaseCommand

from allauth.socialaccount.models import SocialApp


class Command(BaseCommand):
    help = 'Check the Google OAuth (Site + SocialApp) configuration of this database.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--domain',
            help='Set the Site domain to this value, e.g. findle.uz (no scheme, no trailing slash).',
        )

    def handle(self, *args, **options):
        ok = True
        db = settings.DATABASES['default']
        self.stdout.write('Database: %s (%s)' % (db['ENGINE'].rsplit('.', 1)[-1], db['NAME']))
        self.stdout.write('SITE_ID:  %s' % settings.SITE_ID)

        domain = options.get('domain')
        if domain:
            site, _ = Site.objects.update_or_create(
                id=settings.SITE_ID,
                defaults={'domain': domain, 'name': domain},
            )
            self.stdout.write(self.style.SUCCESS('Site domain set to %s' % site.domain))

        try:
            site = Site.objects.get(id=settings.SITE_ID)
        except Site.DoesNotExist:
            self.stdout.write(self.style.ERROR(
                'No Site row with id=%s. Create one, or rerun with --domain <your-domain>.'
                % settings.SITE_ID))
            return

        self.stdout.write('Site:     %s (%s)' % (site.domain, site.name))

        apps = SocialApp.objects.filter(provider='google', sites=site)
        count = apps.count()
        if count == 0:
            ok = False
            self.stdout.write(self.style.ERROR(
                'No google SocialApp linked to this Site -> allauth raises '
                'SocialApp.DoesNotExist and Django returns HTTP 500.\n'
                'Add one in /admin/socialaccount/socialapp/ with the client id and '
                'secret from the Google Cloud console, and tick this Site.'))
        elif count > 1:
            ok = False
            self.stdout.write(self.style.ERROR(
                'Found %d google SocialApp rows for this Site -> allauth raises '
                'MultipleObjectsReturned and Django returns HTTP 500. Keep exactly one.'
                % count))
            for app in apps:
                self.stdout.write('  id=%s name=%r client_id=%s...' % (app.id, app.name, app.client_id[:16]))
        else:
            app = apps.first()
            self.stdout.write('SocialApp: id=%s client_id=%s...' % (app.id, app.client_id[:16]))
            if not app.client_id or not app.secret:
                ok = False
                self.stdout.write(self.style.ERROR('SocialApp is missing a client_id or secret.'))

        scheme = settings.ACCOUNT_DEFAULT_HTTP_PROTOCOL
        self.stdout.write(
            'Redirect URI that must be registered in the Google Cloud console:\n  '
            '%s://%s/accounts/google/login/callback/' % (scheme, site.domain))

        if ok:
            self.stdout.write(self.style.SUCCESS('Google sign-in configuration looks valid.'))
