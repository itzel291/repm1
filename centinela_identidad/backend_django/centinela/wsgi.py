"""
Configuración WSGI para el proyecto Centinela.
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'centinela.settings')

application = get_wsgi_application()

