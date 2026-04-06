"""
Migración 0002: Integración de geolocalización y privacidad
- Añade campos de ubicación y consentimiento al modelo Usuario
- Añade campos de última ubicación al modelo Sesion
- Crea modelos: LoginActivity, LocationLog, ConsentLog, AuditLog
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('auth_app', '0001_initial'),
    ]

    operations = [
        # ── Campos de geolocalización en registro (Usuario) ──────────────────
        migrations.AddField(
            model_name='usuario',
            name='reg_latitude',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='usuario',
            name='reg_longitude',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='usuario',
            name='reg_address',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='usuario',
            name='reg_location_timestamp',
            field=models.DateTimeField(blank=True, null=True),
        ),
        # ── Campos de consentimiento (Usuario) ───────────────────────────────
        migrations.AddField(
            model_name='usuario',
            name='data_consent',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='usuario',
            name='consent_timestamp',
            field=models.DateTimeField(blank=True, null=True),
        ),
        # ── Última ubicación conocida por sesión (Sesion) ────────────────────
        migrations.AddField(
            model_name='sesion',
            name='ultima_latitud',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='sesion',
            name='ultima_longitud',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='sesion',
            name='ultima_ubicacion_timestamp',
            field=models.DateTimeField(blank=True, null=True),
        ),
        # ── Nuevo modelo: LoginActivity ───────────────────────────────────────
        migrations.CreateModel(
            name='LoginActivity',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('email_intento', models.EmailField(max_length=254)),
                ('timestamp', models.DateTimeField(auto_now_add=True)),
                ('latitude', models.FloatField(blank=True, null=True)),
                ('longitude', models.FloatField(blank=True, null=True)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('user_agent', models.TextField(blank=True, null=True)),
                ('exitoso', models.BooleanField(default=False)),
                ('usuario', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='login_activities',
                    to='auth_app.usuario',
                )),
            ],
            options={
                'verbose_name': 'Actividad de Login',
                'verbose_name_plural': 'Actividad de Login',
                'db_table': 'login_activity',
                'ordering': ['-timestamp'],
            },
        ),
        # ── Nuevo modelo: LocationLog ─────────────────────────────────────────
        migrations.CreateModel(
            name='LocationLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('timestamp', models.DateTimeField(auto_now_add=True)),
                ('latitude', models.FloatField()),
                ('longitude', models.FloatField()),
                ('accuracy', models.FloatField(blank=True, null=True)),
                ('usuario', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='location_logs',
                    to='auth_app.usuario',
                )),
            ],
            options={
                'verbose_name': 'Registro de Ubicación',
                'verbose_name_plural': 'Registros de Ubicación',
                'db_table': 'location_logs',
                'ordering': ['-timestamp'],
            },
        ),
        # ── Nuevo modelo: ConsentLog ──────────────────────────────────────────
        migrations.CreateModel(
            name='ConsentLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('email', models.EmailField(blank=True, max_length=254)),
                ('decision', models.CharField(
                    choices=[('accepted', 'Aceptado'), ('rejected', 'Rechazado')],
                    max_length=10,
                )),
                ('timestamp', models.DateTimeField(auto_now_add=True)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
            ],
            options={
                'verbose_name': 'Registro de Consentimiento',
                'verbose_name_plural': 'Registros de Consentimiento',
                'db_table': 'consent_logs',
                'ordering': ['-timestamp'],
            },
        ),
        # ── Nuevo modelo: AuditLog ────────────────────────────────────────────
        migrations.CreateModel(
            name='AuditLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('accion', models.CharField(max_length=100)),
                ('tabla', models.CharField(blank=True, max_length=100, null=True)),
                ('timestamp', models.DateTimeField(auto_now_add=True)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('detalles', models.TextField(blank=True, null=True)),
                ('usuario', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='audit_logs',
                    to='auth_app.usuario',
                )),
            ],
            options={
                'verbose_name': 'Registro de Auditoría',
                'verbose_name_plural': 'Registros de Auditoría',
                'db_table': 'audit_logs',
                'ordering': ['-timestamp'],
            },
        ),
    ]

