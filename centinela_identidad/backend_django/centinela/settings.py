"""
Configuración de Django - Centinela Identidad
"""

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = 'django-insecure-centinela-identidad-2026-cambia-esto-en-produccion'

DEBUG = True

ALLOWED_HOSTS = ['*']

INSTALLED_APPS = [
    'django.contrib.contenttypes',
    'corsheaders',
    'auth_app',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
]

ROOT_URLCONF = 'centinela.urls'

WSGI_APPLICATION = 'centinela.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'centinela.db',
    }
}

# Zona horaria
LANGUAGE_CODE = 'es-mx'
TIME_ZONE = 'America/Mexico_City'
USE_I18N = True
USE_TZ = True

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ==================== CORS ====================
# Equivalente a CORS(app) de Flask - permite todas las origenes
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_METHODS = ['GET', 'POST', 'OPTIONS']
CORS_ALLOW_HEADERS = ['Content-Type', 'Authorization']

# ==================== EMAIL (Gmail SMTP) ====================
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.gmail.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = 'carolinaserranotoom@gmail.com'
EMAIL_HOST_PASSWORD = 'zdfbsmeajfcgxsli'

