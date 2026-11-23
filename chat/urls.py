from django.urls import path
from . import alerts, pages, usage, views

urlpatterns = [
    path('', views.home, name='home'),
    # Help, Terms of Service, Privacy Policy, About (chat/pages.py, one template per language)
    path('help/', pages.info_page, {'page': 'help'}, name='help'),
    path('terms/', pages.info_page, {'page': 'terms'}, name='terms'),
    path('privacy/', pages.info_page, {'page': 'privacy'}, name='privacy'),
    path('about/', pages.info_page, {'page': 'about'}, name='about'),
    # path('search/', views.search_page, name='search_page'),
    path('api/chat/', views.chat_api, name='chat_api'),
    path('api/ai-chat/', views.ai_chat_api, name='ai_chat_api'),
    path('api/ai-chat/intent/', views.chat_intent_api, name='chat_intent_api'),
    path('api/deep-research/', views.deep_research_api, name='deep_research_api'),
    path('api/search/stream/', views.search_stream_api, name='search_stream_api'),
    # Map tab: the located listings of a search and the rail stations layer
    path('api/geo/search/<str:search_id>/', views.geo_search_api, name='geo_search_api'),
    path('api/geo/stations/', views.geo_stations_api, name='geo_stations_api'),
    # Alerts tab: descriptions that notify when a new listing matches (Findle API /alerts, no LLM)
    path('api/alerts/', alerts.alerts_api, name='alerts_api'),
    path('api/alerts/unread/', alerts.alert_unread_api, name='alert_unread_api'),
    path('api/alerts/notifications/', alerts.alert_notifications_api, name='alert_notifications_api'),
    path('api/alerts/notifications/seen/', alerts.alert_seen_api, name='alert_seen_api'),
    path('api/alerts/<int:alert_id>/', alerts.alert_detail_api, name='alert_detail_api'),
    path('api/deep-research/stream/', views.deep_research_stream_api, name='deep_research_stream_api'),
    # Usage monitoring: clicks and active time from static/js/usage.js (read by the FindleBot Telegram bot)
    path('api/usage/', usage.usage_collect_api, name='usage_collect_api'),
    # Above the /api/chat/<int:chat_id>/ routes below, which would otherwise not
    # match a session id anyway — kept adjacent so the ordering stays obvious.
    path('api/chat/memory/<str:session_id>/', views.chat_memory_api, name='chat_memory_api'),
    path('api/chat/save/', views.save_chat, name='save_chat'),
    path('api/chat/<int:chat_id>/rename/', views.rename_chat, name='rename_chat'),
    path('api/chat/<int:chat_id>/delete/', views.delete_chat, name='delete_chat'),
    path('api/chat/<int:conversation_id>/', views.get_conversation, name='get_conversation'),
    path('api/message/<int:message_id>/delete/', views.delete_message, name='delete_message'),
]
