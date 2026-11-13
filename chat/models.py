from django.db import models
from django.contrib.auth.models import User

class Conversation(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='conversations')
    title = models.CharField(max_length=200, default="New Chat")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} - {self.title}"

class Message(models.Model):
    ROLE_CHOICES = (
        ('user', 'User'),
        ('ai', 'AI'),
    )
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    content = models.TextField()
    reasoning_steps = models.JSONField(default=list, blank=True) # List of strings describing AI thinking process
    recommended_products = models.JSONField(default=list, blank=True) # List of product data dictionaries
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.role}: {self.content[:50]}"


def _alert_owner_key():
    import secrets

    return secrets.token_urlsafe(24)


class AlertOwner(models.Model):
    """The key that owns a user's alerts in the Findle API.

    The API does not know Django users: alerts there belong to an opaque key, sent in the
    X-Alert-Owner header. A random key per user, not the user id, so nobody can read another
    user's alerts by guessing a number.
    """
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='alert_owner')
    key = models.CharField(max_length=64, unique=True, default=_alert_owner_key)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} alerts"
