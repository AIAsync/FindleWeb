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


class UsageDay(models.Model):
    """One browser's active time and clicks on one day (UTC). Read by the FindleBot Telegram bot (/web).

    `visitor` is a random id the page keeps in localStorage, not an IP or a fingerprint: anonymous
    visitors are counted without identifying them. `user` is set once the browser is signed in.
    """
    day = models.DateField()
    visitor = models.CharField(max_length=40)
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='usage_days')
    seconds = models.PositiveIntegerField(default=0)
    clicks = models.PositiveIntegerField(default=0)
    first_at = models.DateTimeField(auto_now_add=True)
    last_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'web_usage_day'
        constraints = [models.UniqueConstraint(fields=['day', 'visitor'], name='web_usage_day_visitor')]
        indexes = [models.Index(fields=['day', 'user'], name='web_usage_day_user')]

    def __str__(self):
        return f"{self.day} {self.user or self.visitor}: {self.seconds}s, {self.clicks} clicks"


class UsageClick(models.Model):
    """How many times one browser clicked one button or link on one day (UTC)."""
    day = models.DateField()
    visitor = models.CharField(max_length=40)
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='usage_clicks')
    target = models.CharField(max_length=100)
    count = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'web_usage_click'
        constraints = [models.UniqueConstraint(fields=['day', 'visitor', 'target'], name='web_usage_click_target')]
        indexes = [models.Index(fields=['day', 'target'], name='web_usage_click_day')]

    def __str__(self):
        return f"{self.day} {self.target}: {self.count}"
