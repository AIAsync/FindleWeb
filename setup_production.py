#!/usr/bin/env python3
"""
Production Setup Script for Findle
This script configures Django for production deployment on app.findle.uz
"""
import os
import sys
import django

# Set up Django environment
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

# Set to production mode
os.environ['DJANGO_ENV'] = 'production'

django.setup()

from django.contrib.sites.models import Site
from django.core.management import execute_from_command_line

def setup_production_site():
    """Configure Site for production domain"""
    print("=" * 60)
    print("FINDLE PRODUCTION SETUP")
    print("=" * 60)
    print()
    
    # Check if running in production
    is_production = os.environ.get('DJANGO_ENV') == 'production'
    if not is_production:
        print("⚠️  Warning: DJANGO_ENV is not set to 'production'")
        print("   Set it with: export DJANGO_ENV=production")
        print()
    
    print("Step 1: Configuring Django Site...")
    
    # Update or create production site
    site, created = Site.objects.get_or_create(
        id=1,
        defaults={
            'domain': 'app.findle.uz',
            'name': 'Findle Production'
        }
    )
    
    if not created:
        site.domain = 'app.findle.uz'
        site.name = 'Findle Production'
        site.save()
        print(f"   ✓ Updated Site: {site.domain}")
    else:
        print(f"   ✓ Created Site: {site.domain}")
    
    print()
    print("Step 2: Current Configuration")
    print("-" * 60)
    
    from django.conf import settings
    print(f"   DEBUG: {settings.DEBUG}")
    print(f"   ALLOWED_HOSTS: {settings.ALLOWED_HOSTS}")
    print(f"   SITE_ID: {settings.SITE_ID}")
    print(f"   OAuth Protocol: {settings.ACCOUNT_DEFAULT_HTTP_PROTOCOL}")
    print(f"   Current Site: {site.domain}")
    
    print()
    print("=" * 60)
    print("GOOGLE OAUTH SETUP REQUIRED")
    print("=" * 60)
    print()
    print("Add this redirect URI to Google Cloud Console:")
    print()
    print("   https://app.findle.uz/accounts/google/login/callback/")
    print()
    print("Steps:")
    print("   1. Go to https://console.cloud.google.com/")
    print("   2. Select your project")
    print("   3. Navigate to APIs & Services → Credentials")
    print("   4. Select your OAuth 2.0 Client ID")
    print("   5. Add the redirect URI above")
    print("   6. Click Save")
    print()
    print("=" * 60)
    print("ENVIRONMENT VARIABLES")
    print("=" * 60)
    print()
    print("Make sure these environment variables are set:")
    print()
    print("   export DJANGO_ENV=production")
    print("   export DJANGO_SECRET_KEY='your-secure-random-secret-key'")
    print()
    print("To generate a secure secret key, run:")
    print("   python3 -c 'from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())'")
    print()
    print("=" * 60)
    print("✅ Production setup complete!")
    print("=" * 60)
    print()

if __name__ == '__main__':
    setup_production_site()
