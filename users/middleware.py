class SocialAccountProcessMiddleware:
    """
    Middleware to capture process parameter from Google OAuth URLs
    and store it in session for signal handler
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Check if this is a Google OAuth login request with process parameter
        if request.path.startswith('/accounts/google/login/') and 'process' in request.GET:
            process = request.GET.get('process', '')
            if process in ['login', 'signup']:
                # Store in session for signal handler
                request.session['socialaccount_process'] = process
        
        response = self.get_response(request)
        return response

