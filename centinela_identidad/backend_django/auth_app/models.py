"""
Modelos - Servicio de Autenticación Centinela
"""

from django.db import models


class PadronCasas(models.Model):
    """Padrón oficial de casas (1-50) - equivalente a tabla padron_casas"""
    numero_casa = models.CharField(max_length=20, unique=True)
    ocupada = models.BooleanField(default=False)

    class Meta:
        db_table = 'padron_casas'
        verbose_name = 'Casa'
        verbose_name_plural = 'Padrón de Casas'

    def __str__(self):
        return f'{self.numero_casa} ({"ocupada" if self.ocupada else "disponible"})'


class Usuario(models.Model):
    """Usuarios registrados - equivalente a tabla usuarios"""
    nombre_completo = models.CharField(max_length=200)
    casa = models.OneToOneField(
        PadronCasas,
        on_delete=models.PROTECT,
        to_field='numero_casa',
        db_column='numero_casa',
        related_name='usuario'
    )
    edad = models.IntegerField()
    email = models.EmailField(unique=True)
    password = models.CharField(max_length=64)  # SHA-256 hash (64 chars hex)
    activo = models.BooleanField(default=True)
    fecha_registro = models.DateTimeField(auto_now_add=True)

    # Geolocalización al momento del registro
    reg_latitude = models.FloatField(null=True, blank=True)
    reg_longitude = models.FloatField(null=True, blank=True)
    reg_address = models.TextField(null=True, blank=True)
    reg_location_timestamp = models.DateTimeField(null=True, blank=True)

    # Consentimiento de privacidad
    data_consent = models.BooleanField(default=False)
    consent_timestamp = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'usuarios'
        verbose_name = 'Usuario'
        verbose_name_plural = 'Usuarios'

    def __str__(self):
        return f'{self.nombre_completo} ({self.email})'


class Sesion(models.Model):
    """Sesiones activas - equivalente a tabla sesiones"""
    usuario = models.ForeignKey(
        Usuario,
        on_delete=models.CASCADE,
        db_column='user_id',
        related_name='sesiones'
    )
    token = models.CharField(max_length=100, unique=True)
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_expiracion = models.DateTimeField()
    activa = models.BooleanField(default=True)

    # Última ubicación conocida de esta sesión
    ultima_latitud = models.FloatField(null=True, blank=True)
    ultima_longitud = models.FloatField(null=True, blank=True)
    ultima_ubicacion_timestamp = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'sesiones'
        verbose_name = 'Sesión'
        verbose_name_plural = 'Sesiones'

    def __str__(self):
        return f'Sesión de {self.usuario.email} (activa={self.activa})'


class TokenRecuperacion(models.Model):
    """Tokens de recuperación de contraseña - equivalente a tabla tokens_recuperacion"""
    usuario = models.ForeignKey(
        Usuario,
        on_delete=models.CASCADE,
        db_column='user_id',
        related_name='tokens_recuperacion'
    )
    token = models.CharField(max_length=100, unique=True)
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_expiracion = models.DateTimeField()
    usado = models.BooleanField(default=False)

    class Meta:
        db_table = 'tokens_recuperacion'
        verbose_name = 'Token de Recuperación'
        verbose_name_plural = 'Tokens de Recuperación'

    def __str__(self):
        return f'Token de {self.usuario.email} (usado={self.usado})'


class LoginActivity(models.Model):
    """Registro de intentos de inicio de sesión con geolocalización"""
    usuario = models.ForeignKey(
        Usuario,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='login_activities'
    )
    email_intento = models.EmailField()
    timestamp = models.DateTimeField(auto_now_add=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(null=True, blank=True)
    exitoso = models.BooleanField(default=False)

    class Meta:
        db_table = 'login_activity'
        verbose_name = 'Actividad de Login'
        verbose_name_plural = 'Actividad de Login'
        ordering = ['-timestamp']

    def __str__(self):
        estado = 'exitoso' if self.exitoso else 'fallido'
        return f'Login {estado} de {self.email_intento} ({self.timestamp})'


class LocationLog(models.Model):
    """Registro de actualizaciones de ubicación continua (watchPosition)"""
    usuario = models.ForeignKey(
        Usuario,
        on_delete=models.CASCADE,
        related_name='location_logs'
    )
    timestamp = models.DateTimeField(auto_now_add=True)
    latitude = models.FloatField()
    longitude = models.FloatField()
    accuracy = models.FloatField(null=True, blank=True)

    class Meta:
        db_table = 'location_logs'
        verbose_name = 'Registro de Ubicación'
        verbose_name_plural = 'Registros de Ubicación'
        ordering = ['-timestamp']

    def __str__(self):
        return f'Ubicación de {self.usuario.email} ({self.timestamp})'


class ConsentLog(models.Model):
    """Registro de decisiones de consentimiento de privacidad"""
    DECISION_CHOICES = [
        ('accepted', 'Aceptado'),
        ('rejected', 'Rechazado'),
    ]
    email = models.EmailField(blank=True)
    decision = models.CharField(max_length=10, choices=DECISION_CHOICES)
    timestamp = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        db_table = 'consent_logs'
        verbose_name = 'Registro de Consentimiento'
        verbose_name_plural = 'Registros de Consentimiento'
        ordering = ['-timestamp']

    def __str__(self):
        return f'Consentimiento {self.decision} de {self.email} ({self.timestamp})'


class AuditLog(models.Model):
    """Registro de auditoría de acceso a datos de ubicación"""
    usuario = models.ForeignKey(
        Usuario,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs'
    )
    accion = models.CharField(max_length=100)
    tabla = models.CharField(max_length=100, null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    detalles = models.TextField(null=True, blank=True)

    class Meta:
        db_table = 'audit_logs'
        verbose_name = 'Registro de Auditoría'
        verbose_name_plural = 'Registros de Auditoría'
        ordering = ['-timestamp']

    def __str__(self):
        return f'{self.accion} por {self.usuario} ({self.timestamp})'

