from django.urls import path
from . import views

urlpatterns = [
    path('', views.home, name='home'),
    # path('search/', views.search_page, name='search_page'),
    path('api/chat/', views.chat_api, name='chat_api'),
    path('api/ai-chat/', views.ai_chat_api, name='ai_chat_api'),
    path('api/deep-research/', views.deep_research_api, name='deep_research_api'),
    path('api/search/stream/', views.search_stream_api, name='search_stream_api'),
    path('api/deep-research/stream/', views.deep_research_stream_api, name='deep_research_stream_api'),
    # Above the /api/chat/<int:chat_id>/ routes below, which would otherwise not
    # match a session id anyway — kept adjacent so the ordering stays obvious.
    path('api/chat/memory/<str:session_id>/', views.chat_memory_api, name='chat_memory_api'),
    path('api/chat/save/', views.save_chat, name='save_chat'),
    path('api/chat/<int:chat_id>/rename/', views.rename_chat, name='rename_chat'),
    path('api/chat/<int:chat_id>/delete/', views.delete_chat, name='delete_chat'),
    path('api/chat/<int:conversation_id>/', views.get_conversation, name='get_conversation'),
    path('api/message/<int:message_id>/delete/', views.delete_message, name='delete_message'),
]
