from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from allauth.account.adapter import DefaultAccountAdapter
from allauth.core.exceptions import ImmediateHttpResponse
from django.contrib.auth import get_user_model
from django.http import HttpResponseRedirect
from django.urls import reverse
from django.contrib import messages
from django.dispatch import receiver
from allauth.socialaccount.signals import pre_social_login

User = get_user_model()


class CustomSocialAccountAdapter(DefaultSocialAccountAdapter):
    """Custom adapter to handle Google login/signup without intermediate forms"""
    
    def is_open_for_signup(self, request, sociallogin):
        """
        Always allow automatic signup from social accounts
        """
        return True
    
    def get_signup_form_class(self, request):
        """
        Never show signup form for social accounts - direct signup
        """
        return None
    
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
            from django.contrib.auth import get_user_model
            User = get_user_model()
            base_username = user.username
            counter = 1
            while User.objects.filter(username=user.username).exists():
                user.username = f"{base_username}{counter}"
                counter += 1
        return user


class CustomAccountAdapter(DefaultAccountAdapter):
    """Custom account adapter for additional account handling"""
    pass


@receiver(pre_social_login)
def handle_social_login_process(sender, request, sociallogin, **kwargs):
    """
    Signal handler to check process parameter and enforce login/signup behavior
    """
    # Get process from session (set when user clicks the Google login button)
    process = request.session.get('socialaccount_process', '')
    
    if process == 'login':
        # Only allow login - user must already exist
        if not sociallogin.is_existing:
            # User doesn't exist, redirect to login page with error
            messages.error(request, 'This Google account is not registered. Please register first.')
            # Clear the process from session
            if 'socialaccount_process' in request.session:
                del request.session['socialaccount_process']
            raise ImmediateHttpResponse(HttpResponseRedirect(reverse('login')))
    
    elif process == 'signup':
        # Only allow signup - user must not exist
        if sociallogin.is_existing:
            # User already exists, redirect to login page
            messages.info(request, 'This Google account is already registered. Please login instead.')
            # Clear the process from session
            if 'socialaccount_process' in request.session:
                del request.session['socialaccount_process']
            raise ImmediateHttpResponse(HttpResponseRedirect(reverse('login')))
    
    # Clear the process from session after use
    if 'socialaccount_process' in request.session:
        del request.session['socialaccount_process']


