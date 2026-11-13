from django.contrib import admin

from .models import UsageClick, UsageDay


@admin.register(UsageDay)
class UsageDayAdmin(admin.ModelAdmin):
    list_display = ('day', 'user', 'visitor', 'seconds', 'clicks', 'last_at')
    list_filter = ('day',)
    search_fields = ('user__username', 'visitor')


@admin.register(UsageClick)
class UsageClickAdmin(admin.ModelAdmin):
    list_display = ('day', 'target', 'count', 'user', 'visitor')
    list_filter = ('day',)
    search_fields = ('target', 'user__username')
