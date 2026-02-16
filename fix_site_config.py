#!/usr/bin/env python
"""
Script to check and fix Django Sites configuration for Google OAuth
"""
import os
import sys
import django

# Set up Django environment
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.sites.models import Site

def fix_site_configuration():
    """Fix site configuration for OAuth"""
    print("Checking Site configuration...")
    
    # Get or create site with ID 1
    site, created = Site.objects.get_or_create(
        id=1,
        defaults={
            'domain': 'localhost:8000',
            'name': 'Findle Local'
        }
    )
    
    if created:
        print(f"✓ Created new Site: {site.domain}")
    else:
        # Update existing site
        old_domain = site.domain
        site.domain = 'localhost:8000'
        site.name = 'Findle Local'
        site.save()
        print(f"✓ Updated Site: {old_domain} -> {site.domain}")
    
    # Show all sites
    print("\nCurrent Sites in database:")
    for s in Site.objects.all():
        print(f"  ID {s.id}: {s.domain} ({s.name})")
    
    print("\n✓ Site configuration is ready for Google OAuth!")
    print("  Make sure your Google Console redirect URI is:")
    print("  http://localhost:8000/accounts/google/login/callback/")
    
if __name__ == '__main__':
    fix_site_configuration()
