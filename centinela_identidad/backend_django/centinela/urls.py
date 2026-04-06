"""
URLs principales del proyecto Centinela
"""

from django.urls import path, include
from centinela import views_ia

urlpatterns = [
    path('', include('auth_app.urls')),
    path('api/ia/chat/', views_ia.chat_ia),
]

