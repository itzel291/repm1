"""
URLs de autenticación - equivalente a los @app.route() de Flask
"""

from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('auth/registro', views.registro, name='registro'),
    path('auth/login', views.login, name='login'),
    path('auth/logout', views.logout, name='logout'),
    path('auth/solicitar-recuperacion', views.solicitar_recuperacion, name='solicitar_recuperacion'),
    path('auth/validar-token-recuperacion', views.validar_token_recuperacion, name='validar_token_recuperacion'),
    path('auth/cambiar-password', views.cambiar_password, name='cambiar_password'),
    # Geolocalización
    path('api/location/update/', views.actualizar_ubicacion, name='actualizar_ubicacion'),
    path('api/location/consent/', views.registrar_consentimiento, name='registrar_consentimiento'),
    # Admin
    path('api/admin/usuarios/', views.admin_usuarios, name='admin_usuarios'),
    # Verificación de token inter-servicios
    path('auth/verificar-token', views.verificar_token, name='verificar_token'),
]
