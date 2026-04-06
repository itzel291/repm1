import hashlib
import json
import secrets
import xml.etree.ElementTree as ET
from datetime import timedelta

from django.db import models
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone

from .models import (
    PadronCasas, Usuario, Sesion, TokenRecuperacion,
    LoginActivity, LocationLog, ConsentLog, AuditLog,
)
from . import email_service


# ==================== HELPERS ====================

def crear_hash_password(password):
    """Encripta contraseña con SHA-256"""
    return hashlib.sha256(password.encode()).hexdigest()


def generar_token():
    """Genera token único y seguro"""
    return secrets.token_urlsafe(32)


def crear_respuesta_xml(elemento_raiz, datos, status_code=200):
    root = ET.Element(elemento_raiz)
    for clave, valor in datos.items():
        ET.SubElement(root, clave).text = str(valor)
    xml_string = ET.tostring(root, encoding='unicode')
    return HttpResponse(
        f'<?xml version="1.0" encoding="UTF-8"?>{xml_string}',
        content_type='application/xml',
        status=status_code
    )


def get_client_ip(request):
    """Obtiene la IP real del cliente considerando proxies"""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def xml_text(root, tag):
    """Lee el texto de un nodo XML de forma segura, devuelve None si no existe"""
    node = root.find(tag)
    if node is not None and node.text:
        return node.text.strip()
    return None


# ==================== ENDPOINTS ====================

def index(request):
    return HttpResponse('''
    <h1>🔐 API - Servicio de Autenticación Centinela</h1>
    <h2>Privada la Condesa</h2>
    <p>API funcionando correctamente ✅</p>
    <h3>Endpoints disponibles:</h3>
    <ul>
        <li>POST /auth/registro - Registrar usuario</li>
        <li>POST /auth/login - Iniciar sesión</li>
        <li>POST /auth/solicitar-recuperacion - Solicitar recuperación</li>
        <li>POST /auth/validar-token-recuperacion - Validar token</li>
        <li>POST /auth/cambiar-password - Cambiar contraseña</li>
        <li>POST /auth/logout - Cerrar sesión</li>
        <li>POST /api/location/update/ - Actualizar ubicación (requiere Token)</li>
        <li>POST /api/location/consent/ - Registrar consentimiento de privacidad</li>
        <li>GET  /api/admin/usuarios/ - Listado de usuarios (panel admin)</li>
    </ul>
    ''')


@csrf_exempt
def registro(request):
    """
    Registro de nuevo usuario con datos de geolocalización y consentimiento.

    REQUEST (XML):
    <registroRequest>
        <nombre_completo>Juan Pérez</nombre_completo>
        <numero_casa>Casa 25</numero_casa>
        <edad>25</edad>
        <email>juan@email.com</email>
        <password>contraseña123</password>
        <!-- Campos opcionales de geolocalización -->
        <latitud>19.4326</latitud>
        <longitud>-99.1332</longitud>
        <direccion>Calle Ejemplo, Ciudad de México</direccion>
        <consentimiento>true</consentimiento>
    </registroRequest>
    """
    if request.method != 'POST':
        return HttpResponse(status=405)

    try:
        root = ET.fromstring(request.body)

        nombre_completo = xml_text(root, 'nombre_completo')
        numero_casa = xml_text(root, 'numero_casa')
        edad_str = xml_text(root, 'edad')
        email = (xml_text(root, 'email') or '').lower()
        password = xml_text(root, 'password')

        if not all([nombre_completo, numero_casa, edad_str, email, password]):
            raise ValueError('Faltan campos obligatorios')

        edad = int(edad_str)

        # Campos de geolocalización (opcionales)
        latitud_str = xml_text(root, 'latitud')
        longitud_str = xml_text(root, 'longitud')
        direccion = xml_text(root, 'direccion')
        consentimiento_str = xml_text(root, 'consentimiento')

        latitud = float(latitud_str) if latitud_str else None
        longitud = float(longitud_str) if longitud_str else None
        consentimiento = consentimiento_str == 'true' if consentimiento_str else False

    except Exception as e:
        print(f"Error en registro (parseo XML): {str(e)}")
        return crear_respuesta_xml('registroResponse', {
            'estado': 'ERROR',
            'mensaje': f'Error en el registro: {str(e)}'
        }, 500)

    try:
        # Validación 1: Casa existe en padrón
        try:
            casa = PadronCasas.objects.get(numero_casa=numero_casa)
        except PadronCasas.DoesNotExist:
            return crear_respuesta_xml('registroResponse', {
                'estado': 'ERROR',
                'mensaje': f'La casa "{numero_casa}" no está en el padrón oficial'
            }, 400)

        # Validación 2: Casa no ocupada
        if casa.ocupada:
            return crear_respuesta_xml('registroResponse', {
                'estado': 'ERROR',
                'mensaje': f'La casa "{numero_casa}" ya tiene un usuario registrado'
            }, 400)

        # Validación 3: Mayor de edad
        if edad < 18:
            return crear_respuesta_xml('registroResponse', {
                'estado': 'ERROR',
                'mensaje': 'Debes ser mayor de 18 años para registrarte'
            }, 400)

        # Validación 4: Email único
        if Usuario.objects.filter(email=email).exists():
            return crear_respuesta_xml('registroResponse', {
                'estado': 'ERROR',
                'mensaje': 'El email ya está registrado'
            }, 400)

        # Crear usuario con datos de geolocalización y consentimiento
        password_hash = crear_hash_password(password)
        ahora = timezone.now()

        usuario = Usuario.objects.create(
            nombre_completo=nombre_completo,
            casa=casa,
            edad=edad,
            email=email,
            password=password_hash,
            reg_latitude=latitud,
            reg_longitude=longitud,
            reg_address=direccion,
            reg_location_timestamp=ahora if latitud else None,
            data_consent=consentimiento,
            consent_timestamp=ahora if consentimiento else None,
        )

        # Marcar casa como ocupada
        casa.ocupada = True
        casa.save()

        # Registrar consentimiento en tabla de auditoría de consentimientos
        ConsentLog.objects.create(
            email=email,
            decision='accepted' if consentimiento else 'rejected',
            ip_address=get_client_ip(request),
        )

        return crear_respuesta_xml('registroResponse', {
            'estado': 'OK',
            'mensaje': 'Usuario registrado exitosamente',
            'userId': usuario.id
        }, 201)

    except Exception as e:
        print(f"Error en registro: {str(e)}")
        return crear_respuesta_xml('registroResponse', {
            'estado': 'ERROR',
            'mensaje': f'Error en el registro: {str(e)}'
        }, 500)


@csrf_exempt
def login(request):
    """
    Login de usuario — registra actividad con geolocalización.

    REQUEST (XML):
    <loginRequest>
        <email>juan@email.com</email>
        <password>contraseña123</password>
        <!-- Campos opcionales de geolocalización -->
        <latitud>19.4326</latitud>
        <longitud>-99.1332</longitud>
    </loginRequest>
    """
    if request.method != 'POST':
        return HttpResponse(status=405)

    ip_address = get_client_ip(request)
    user_agent = request.META.get('HTTP_USER_AGENT', '')

    try:
        root = ET.fromstring(request.body)

        email = (xml_text(root, 'email') or '').lower()
        password = xml_text(root, 'password')

        # Campos de geolocalización (opcionales)
        latitud_str = xml_text(root, 'latitud')
        longitud_str = xml_text(root, 'longitud')
        latitud = float(latitud_str) if latitud_str else None
        longitud = float(longitud_str) if longitud_str else None

    except Exception as e:
        print(f"Error en login (parseo XML): {str(e)}")
        return crear_respuesta_xml('loginResponse', {
            'estado': 'ERROR',
            'mensaje': f'Error en la autenticación: {str(e)}'
        }, 500)

    try:
        password_hash = crear_hash_password(password)

        try:
            usuario = Usuario.objects.get(email=email, password=password_hash)
        except Usuario.DoesNotExist:
            # Registrar intento fallido
            LoginActivity.objects.create(
                usuario=None,
                email_intento=email,
                latitude=latitud,
                longitude=longitud,
                ip_address=ip_address,
                user_agent=user_agent,
                exitoso=False,
            )
            return crear_respuesta_xml('loginResponse', {
                'estado': 'ERROR',
                'mensaje': 'Credenciales inválidas'
            }, 401)

        if not usuario.activo:
            LoginActivity.objects.create(
                usuario=usuario,
                email_intento=email,
                latitude=latitud,
                longitude=longitud,
                ip_address=ip_address,
                user_agent=user_agent,
                exitoso=False,
            )
            return crear_respuesta_xml('loginResponse', {
                'estado': 'ERROR',
                'mensaje': 'Usuario desactivado. Contacta al administrador'
            }, 403)

        # Crear sesión (24 horas de duración)
        token = generar_token()
        fecha_expiracion = timezone.now() + timedelta(hours=24)

        Sesion.objects.create(
            usuario=usuario,
            token=token,
            fecha_expiracion=fecha_expiracion
        )

        # Registrar actividad de login exitoso
        LoginActivity.objects.create(
            usuario=usuario,
            email_intento=email,
            latitude=latitud,
            longitude=longitud,
            ip_address=ip_address,
            user_agent=user_agent,
            exitoso=True,
        )

        return crear_respuesta_xml('loginResponse', {
            'estado': 'OK',
            'mensaje': 'Autenticación exitosa',
            'token': token,
            'userId': usuario.id,
            'nombre': usuario.nombre_completo,
            'numeroCasa': usuario.casa.numero_casa
        }, 200)

    except Exception as e:
        print(f"Error en login: {str(e)}")
        return crear_respuesta_xml('loginResponse', {
            'estado': 'ERROR',
            'mensaje': f'Error en la autenticación: {str(e)}'
        }, 500)


@csrf_exempt
def solicitar_recuperacion(request):
    """
    Solicita recuperación de contraseña y envía email.

    REQUEST:
    <recuperacionRequest>
        <email>juan@email.com</email>
    </recuperacionRequest>
    """
    if request.method != 'POST':
        return HttpResponse(status=405)

    try:
        root = ET.fromstring(request.body)
        email = (xml_text(root, 'email') or '').lower()
    except Exception as e:
        return crear_respuesta_xml('recuperacionResponse', {
            'estado': 'ERROR',
            'mensaje': f'Error al solicitar recuperación: {str(e)}'
        }, 500)

    try:
        try:
            usuario = Usuario.objects.get(email=email)
        except Usuario.DoesNotExist:
            return crear_respuesta_xml('recuperacionResponse', {
                'estado': 'OK',
                'mensaje': 'Si el email existe, recibirás un correo con instrucciones'
            }, 200)

        token = generar_token()
        fecha_expiracion = timezone.now() + timedelta(hours=1)

        TokenRecuperacion.objects.create(
            usuario=usuario,
            token=token,
            fecha_expiracion=fecha_expiracion
        )

        email_enviado = email_service.enviar_email(
            email,
            usuario.nombre_completo,
            token,
            modo_produccion=True
        )

        if email_enviado:
            return crear_respuesta_xml('recuperacionResponse', {
                'estado': 'OK',
                'mensaje': 'Correo de recuperación enviado exitosamente'
            }, 200)
        else:
            return crear_respuesta_xml('recuperacionResponse', {
                'estado': 'ERROR',
                'mensaje': 'Error al enviar el correo. Intenta más tarde'
            }, 500)

    except Exception as e:
        print(f"Error en recuperación: {str(e)}")
        return crear_respuesta_xml('recuperacionResponse', {
            'estado': 'ERROR',
            'mensaje': f'Error al solicitar recuperación: {str(e)}'
        }, 500)


@csrf_exempt
def validar_token_recuperacion(request):
    """
    Valida si un token de recuperación es válido.

    REQUEST:
    <validarTokenRequest>
        <token>token-de-recuperacion</token>
    </validarTokenRequest>
    """
    if request.method != 'POST':
        return HttpResponse(status=405)

    try:
        root = ET.fromstring(request.body)
        token = xml_text(root, 'token')
    except Exception as e:
        return crear_respuesta_xml('validarTokenResponse', {
            'estado': 'ERROR',
            'mensaje': f'Error al validar token: {str(e)}'
        }, 500)

    try:
        token_info = TokenRecuperacion.objects.select_related('usuario').get(
            token=token,
            usado=False,
            fecha_expiracion__gt=timezone.now()
        )

        return crear_respuesta_xml('validarTokenResponse', {
            'estado': 'OK',
            'valido': 'true',
            'nombre': token_info.usuario.nombre_completo
        }, 200)

    except TokenRecuperacion.DoesNotExist:
        return crear_respuesta_xml('validarTokenResponse', {
            'estado': 'ERROR',
            'valido': 'false',
            'mensaje': 'Token inválido o expirado'
        }, 400)

    except Exception as e:
        return crear_respuesta_xml('validarTokenResponse', {
            'estado': 'ERROR',
            'mensaje': f'Error al validar token: {str(e)}'
        }, 500)


@csrf_exempt
def cambiar_password(request):
    """
    Cambia la contraseña usando token de recuperación.

    REQUEST:
    <cambiarPasswordRequest>
        <token>token-de-recuperacion</token>
        <nueva_password>nueva123</nueva_password>
    </cambiarPasswordRequest>
    """
    if request.method != 'POST':
        return HttpResponse(status=405)

    try:
        root = ET.fromstring(request.body)
        token = xml_text(root, 'token')
        nueva_password = xml_text(root, 'nueva_password')
    except Exception as e:
        return crear_respuesta_xml('cambiarPasswordResponse', {
            'estado': 'ERROR',
            'mensaje': f'Error al cambiar contraseña: {str(e)}'
        }, 500)

    try:
        try:
            token_info = TokenRecuperacion.objects.select_related('usuario').get(
                token=token,
                usado=False,
                fecha_expiracion__gt=timezone.now()
            )
        except TokenRecuperacion.DoesNotExist:
            return crear_respuesta_xml('cambiarPasswordResponse', {
                'estado': 'ERROR',
                'mensaje': 'Token inválido o expirado'
            }, 400)

        usuario = token_info.usuario
        usuario.password = crear_hash_password(nueva_password)
        usuario.save()

        token_info.usado = True
        token_info.save()

        Sesion.objects.filter(usuario=usuario, activa=True).update(activa=False)

        return crear_respuesta_xml('cambiarPasswordResponse', {
            'estado': 'OK',
            'mensaje': 'Contraseña cambiada exitosamente'
        }, 200)

    except Exception as e:
        print(f"Error al cambiar contraseña: {str(e)}")
        return crear_respuesta_xml('cambiarPasswordResponse', {
            'estado': 'ERROR',
            'mensaje': f'Error al cambiar contraseña: {str(e)}'
        }, 500)


@csrf_exempt
def logout(request):
    """
    Cerrar sesión.

    REQUEST:
    <logoutRequest>
        <token>token-de-sesion</token>
    </logoutRequest>
    """
    if request.method != 'POST':
        return HttpResponse(status=405)

    try:
        root = ET.fromstring(request.body)
        token = xml_text(root, 'token')

        Sesion.objects.filter(token=token).update(activa=False)

        return crear_respuesta_xml('logoutResponse', {
            'estado': 'OK',
            'mensaje': 'Sesión cerrada exitosamente'
        }, 200)

    except Exception as e:
        return crear_respuesta_xml('logoutResponse', {
            'estado': 'ERROR',
            'mensaje': f'Error: {str(e)}'
        }, 500)


# ==================== ENDPOINTS DE GEOLOCALIZACIÓN ====================

@csrf_exempt
def actualizar_ubicacion(request):
    """
    Actualiza la ubicación del usuario durante la sesión activa (watchPosition).
    Requiere autenticación mediante token en el header Authorization.

    Headers:
        Authorization: Token <session_token>

    Body (JSON):
    {
        "latitude": 19.4326,
        "longitude": -99.1332,
        "accuracy": 15.0
    }
    """
    if request.method != 'POST':
        return JsonResponse({'estado': 'ERROR', 'mensaje': 'Método no permitido'}, status=405)

    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    if not auth_header.startswith('Token '):
        return JsonResponse({'estado': 'ERROR', 'mensaje': 'Autenticación requerida'}, status=401)

    token = auth_header[6:]

    try:
        sesion = Sesion.objects.select_related('usuario').get(
            token=token,
            activa=True,
            fecha_expiracion__gt=timezone.now()
        )
    except Sesion.DoesNotExist:
        return JsonResponse({'estado': 'ERROR', 'mensaje': 'Token inválido o sesión expirada'}, status=401)

    try:
        data = json.loads(request.body)
        latitude = float(data['latitude'])
        longitude = float(data['longitude'])
        accuracy = float(data['accuracy']) if data.get('accuracy') is not None else None
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        return JsonResponse({'estado': 'ERROR', 'mensaje': f'Datos inválidos: {str(e)}'}, status=400)

    usuario = sesion.usuario

    LocationLog.objects.create(
        usuario=usuario,
        latitude=latitude,
        longitude=longitude,
        accuracy=accuracy,
    )

    sesion.ultima_latitud = latitude
    sesion.ultima_longitud = longitude
    sesion.ultima_ubicacion_timestamp = timezone.now()
    sesion.save(update_fields=['ultima_latitud', 'ultima_longitud', 'ultima_ubicacion_timestamp'])

    AuditLog.objects.create(
        usuario=usuario,
        accion='location_update',
        tabla='location_logs',
        ip_address=get_client_ip(request),
        detalles=f'lat={latitude:.6f}, lon={longitude:.6f}',
    )

    return JsonResponse({'estado': 'OK', 'mensaje': 'Ubicación actualizada'}, status=200)


@csrf_exempt
def registrar_consentimiento(request):
    """
    Registra la decisión de consentimiento de privacidad del usuario.

    Body (JSON):
    {
        "email": "usuario@email.com",
        "decision": "accepted" | "rejected"
    }
    """
    if request.method != 'POST':
        return JsonResponse({'estado': 'ERROR', 'mensaje': 'Método no permitido'}, status=405)

    try:
        data = json.loads(request.body)
        email = data.get('email', '').strip().lower()
        decision = data.get('decision', '')
    except json.JSONDecodeError as e:
        return JsonResponse({'estado': 'ERROR', 'mensaje': f'JSON inválido: {str(e)}'}, status=400)

    if decision not in ('accepted', 'rejected'):
        return JsonResponse({
            'estado': 'ERROR',
            'mensaje': 'La decisión debe ser "accepted" o "rejected"'
        }, status=400)

    ConsentLog.objects.create(
        email=email,
        decision=decision,
        ip_address=get_client_ip(request),
    )

    return JsonResponse({'estado': 'OK', 'mensaje': 'Consentimiento registrado'}, status=200)


# ==================== ENDPOINT PANEL ADMIN ====================

def admin_usuarios(request):
    """
    Devuelve el listado completo de usuarios para el panel de administración.

    GET /api/admin/usuarios/

    Response (JSON):
    [
        {
            "id": 1,
            "nombre_completo": "Juan Pérez",
            "email": "juan@email.com",
            "edad": 35,
            "casa": "Casa 25",
            "fecha_registro": "2025-02-10T10:22:00",
            "reg_latitude": 19.4326,
            "reg_longitude": -99.1332,
            "reg_address": "Calle Ejemplo, Toluca",
            "data_consent": true,
            "activo": true
        },
        ...
    ]
    """
    if request.method != 'GET':
        return JsonResponse({'estado': 'ERROR', 'mensaje': 'Método no permitido'}, status=405)

    try:
        usuarios = Usuario.objects.select_related('casa').all().order_by('-fecha_registro')

        data = []
        for u in usuarios:
            data.append({
                'id': u.id,
                'nombre_completo': u.nombre_completo,
                'email': u.email,
                'edad': u.edad,
                'casa': u.casa.numero_casa if u.casa else None,
                'fecha_registro': u.fecha_registro.isoformat() if u.fecha_registro else None,
                'reg_latitude': u.reg_latitude,
                'reg_longitude': u.reg_longitude,
                'reg_address': u.reg_address,
                'data_consent': u.data_consent,
                'activo': u.activo,
            })

        return JsonResponse(data, safe=False)

    except Exception as e:
        print(f"Error en admin_usuarios: {str(e)}")
        return JsonResponse({'estado': 'ERROR', 'mensaje': f'Error: {str(e)}'}, status=500)


# ==================== VERIFICACIÓN INTER-SERVICIOS ====================

def verificar_token(request):
    """
    Valida un token de sesión y devuelve los datos del usuario.
    Usado por los demás servicios (Decisiones, Incidencias, etc.)
    para verificar que el usuario está autenticado sin necesidad
    de que cada servicio tenga su propia autenticación.

    GET /auth/verificar-token
    Headers:
        Authorization: Token <session_token>

    Response exitosa (JSON):
    {
        "valido": true,
        "usuario": {
            "id": 1,
            "nombre": "Juan Pérez",
            "email": "juan@email.com",
            "casa": "Casa 25"
        }
    }

    Response fallida (JSON):
    {
        "valido": false,
        "mensaje": "Token inválido o sesión expirada"
    }
    """
    if request.method != 'GET':
        return JsonResponse({'valido': False, 'mensaje': 'Método no permitido'}, status=405)

    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    if not auth_header.startswith('Token '):
        return JsonResponse({'valido': False, 'mensaje': 'Token no proporcionado'}, status=401)

    token = auth_header[6:]

    try:
        sesion = Sesion.objects.select_related('usuario__casa').get(
            token=token,
            activa=True,
            fecha_expiracion__gt=timezone.now()
        )

        usuario = sesion.usuario

        return JsonResponse({
            'valido': True,
            'usuario': {
                'id': usuario.id,
                'nombre': usuario.nombre_completo,
                'email': usuario.email,
                'casa': usuario.casa.numero_casa if usuario.casa else None,
            }
        }, status=200)

    except Sesion.DoesNotExist:
        return JsonResponse({
            'valido': False,
            'mensaje': 'Token inválido o sesión expirada'
        }, status=401)

    except Exception as e:
        print(f"Error en verificar_token: {str(e)}")
        return JsonResponse({
            'valido': False,
            'mensaje': f'Error interno: {str(e)}'
        }, status=500)
