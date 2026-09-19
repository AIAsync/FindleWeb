from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from allauth.account.adapter import DefaultAccountAdapter
from allauth.account.models import EmailAddress
from allauth.core.exceptions import ImmediateHttpResponse
from django.contrib.auth import get_user_model
from django.http import HttpResponseRedirect
from django.urls import reverse
from django.contrib import messages
from django.dispatch import receiver
from django.utils.translation import gettext_lazy as _
from allauth.socialaccount.signals import pre_social_login

User = get_user_model()


def get_verified_email(sociallogin):
    """
    Return the account's email address, but only when the provider states that
    it has verified it. Google sets 'email_verified'; returning None for
    anything else keeps us from trusting an address the provider did not check.
    """
    extra_data = sociallogin.account.extra_data or {}
    if not (extra_data.get('email_verified') or extra_data.get('verified_email')):
        return None

    email = extra_data.get('email')
    if not email:
        for address in sociallogin.email_addresses:
            if address.verified:
                email = address.email
                break
    return email.lower() if email else None


def find_user_by_email(email):
    """Find an existing local account owning this email address."""
    address = EmailAddress.objects.filter(email__iexact=email).select_related('user').first()
    if address:
        return address.user
    return User.objects.filter(email__iexact=email).first()


class CustomSocialAccountAdapter(DefaultSocialAccountAdapter):
    """Custom adapter to handle Google login/signup without intermediate forms"""

    def is_open_for_signup(self, request, sociallogin):
        """
        Always allow automatic signup from social accounts
        """
        return True

    def populate_user(self, request, sociallogin, data):
        """
        Automatically populate user data from social account
        """
        user = super().populate_user(request, sociallogin, data)
        # Generate username from email if not provided
        if not user.username and sociallogin.account.extra_data.get('email'):
            email = sociallogin.account.extra_data.get('email')
            user.username = email.split('@')[0]
            # Ensure username is unique
            base_username = user.username
            counter = 1
            while User.objects.filter(username=user.username).exists():
                user.username = f"{base_username}{counter}"
                counter += 1
        return user

    def authentication_error(self, request, provider, error=None, exception=None, extra_context=None):
        """
        Send the user back to the login page with a message instead of
        rendering allauth's stand-alone provider error page.
        """
        messages.error(request, _('Google sign-in failed. Please try again.'))


class CustomAccountAdapter(DefaultAccountAdapter):
    """Custom account adapter for additional account handling"""
    pass


@receiver(pre_social_login)
def handle_social_login_process(sender, request, sociallogin, **kwargs):
    """
    Signal handler to check process parameter and enforce login/signup behavior
    """
    # Get process from session (set when user clicks the Google login button)
    process = request.session.pop('socialaccount_process', '')

    if not sociallogin.is_existing:
        # The Google account is not linked yet. If the provider verified the
        # email address and a local account already owns it, connect the two
        # instead of letting allauth fall through to its conflict signup form,
        # which cannot be rendered with this project's ACCOUNT_SIGNUP_FIELDS.
        email = get_verified_email(sociallogin)
        existing_user = find_user_by_email(email) if email else None
        if existing_user is not None:
            sociallogin.connect(request, existing_user)
            return

    if process == 'login':
        # Only allow login - user must already exist
        if not sociallogin.is_existing:
            # User doesn't exist, redirect to login page with error
            messages.error(request, _('This Google account is not registered. Please register first.'))
            raise ImmediateHttpResponse(HttpResponseRedirect(reverse('login')))

    elif process == 'signup':
        # Only allow signup - user must not exist
        if sociallogin.is_existing:
            # User already exists, redirect to login page
            messages.info(request, _('This Google account is already registered. Please login instead.'))
            raise ImmediateHttpResponse(HttpResponseRedirect(reverse('login')))
