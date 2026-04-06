"""
Comando de gestión para inicializar la base de datos.
Equivalente a ejecutar database.py en el proyecto Flask.

Uso: python manage.py seed_db
"""

import hashlib
from django.core.management.base import BaseCommand
from auth_app.models import PadronCasas, Usuario


def crear_hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()


class Command(BaseCommand):
    help = 'Inicializa la base de datos con 50 casas y usuarios de prueba'

    def handle(self, *args, **options):
        self.stdout.write('=' * 70)
        self.stdout.write('Inicializando base de datos Centinela...')
        self.stdout.write('=' * 70)

        # Insertar padrón de casas (1-50)
        self.stdout.write('\nCreando padron de casas...')
        casas_creadas = 0
        for i in range(1, 51):
            _, created = PadronCasas.objects.get_or_create(
                numero_casa=f'Casa {i}',
                defaults={'ocupada': False}
            )
            if created:
                casas_creadas += 1

        self.stdout.write(self.style.SUCCESS(f'[OK] {casas_creadas} casas creadas (50 total en padron)'))

        # Usuarios de prueba (mismos que en database.py de Flask)
        usuarios_prueba = [
            ('Administrador Sistema', 'Casa 1',  30, 'admin@centinela.com', 'admin123'),
            ('Maria Gonzalez Lopez',  'Casa 5',  72, 'maria@email.com',     'maria123'),
            ('Carlos Ramirez Perez',  'Casa 10', 45, 'carlos@email.com',    'carlos123'),
        ]

        self.stdout.write('\nCreando usuarios de prueba...')
        for nombre, numero_casa, edad, email, password in usuarios_prueba:
            casa = PadronCasas.objects.get(numero_casa=numero_casa)
            password_hash = crear_hash_password(password)

            usuario, created = Usuario.objects.get_or_create(
                email=email,
                defaults={
                    'nombre_completo': nombre,
                    'casa': casa,
                    'edad': edad,
                    'password': password_hash,
                }
            )
            if created:
                casa.ocupada = True
                casa.save()
                self.stdout.write(self.style.SUCCESS(f'   [OK] Creado: {email}'))
            else:
                self.stdout.write(f'   [!] Ya existe: {email}')

        self.stdout.write('\n' + '=' * 70)
        self.stdout.write(self.style.SUCCESS('[OK] Base de datos inicializada correctamente'))
        self.stdout.write('\nCREDENCIALES DE PRUEBA:')
        self.stdout.write('   Email: admin@centinela.com | Password: admin123')
        self.stdout.write('   Email: maria@email.com     | Password: maria123')
        self.stdout.write('   Email: carlos@email.com    | Password: carlos123')
        self.stdout.write('=' * 70 + '\n')


