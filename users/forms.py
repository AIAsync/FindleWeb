from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.utils.translation import gettext_lazy as _


class RegisterForm(UserCreationForm):
    """UserCreationForm dressed for the auth page.

    The template used to hand-roll each <input>, which dropped `required`,
    `maxlength` and the autocomplete hints password managers rely on. Setting
    the widget attributes here keeps the template to a plain field loop and
    lets the placeholder carry the label, so the form stays short enough to
    fit a laptop screen without scrolling.
    """

    placeholders = {
        'username': _('Username'),
        'password1': _('Password'),
        'password2': _('Confirm password'),
    }
    autocomplete = {
        'username': 'username',
        'password1': 'new-password',
        'password2': 'new-password',
    }

    class Meta(UserCreationForm.Meta):
        fields = ('username',)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for name, field in self.fields.items():
            # Django renders these as a <ul> of password rules; the page shows
            # validation errors instead, which is what users act on.
            field.help_text = ''
            field.widget.attrs.update({
                'placeholder': self.placeholders.get(name, field.label),
                'autocomplete': self.autocomplete.get(name, 'off'),
            })
            if field.required:
                field.widget.attrs['required'] = 'required'
        self.fields['username'].widget.attrs['autofocus'] = 'autofocus'
