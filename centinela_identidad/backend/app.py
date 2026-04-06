from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import xml.etree.ElementTree as ET
from models import Usuario, Consulta, Voto
from database import Database
import os
import requests
from functools import wraps

app = Flask(__name__)
CORS(app)

IDENTIDAD_URL = 'http://localhost:8000'

db = Database()


def requiere_token(f):
    """
    Decorador que valida el token de sesión consultando al Servicio
    de Identidad (Centinela). Si el token es válido, inyecta los datos
    del usuario en request.usuario_actual.

    Uso:
        @app.route('/api/votar', methods=['POST'])
        @requiere_token
        def votar():
            usuario = request.usuario_actual
            # ya tienes id, nombre, email, casa
    """
    @wraps(f)
    def decorador(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')

        if not auth_header.startswith('Token '):
            return jsonify({
                'success': False,
                'error': 'Se requiere autenticación. Inicia sesión en Centinela.'
            }), 401

        try:
            respuesta = requests.get(
                f'{IDENTIDAD_URL}/auth/verificar-token',
                headers={'Authorization': auth_header},
                timeout=5
            )
            data = respuesta.json()

            if not data.get('valido'):
                return jsonify({
                    'success': False,
                    'error': data.get('mensaje', 'Token inválido o sesión expirada')
                }), 401

            # Inyectar datos del usuario en el request para usarlos en la vista
            request.usuario_actual = data['usuario']
            return f(*args, **kwargs)

        except requests.exceptions.ConnectionError:
            return jsonify({
                'success': False,
                'error': 'No se pudo conectar al Servicio de Identidad. Verifica que Centinela esté corriendo en puerto 8000.'
            }), 503

        except requests.exceptions.Timeout:
            return jsonify({
                'success': False,
                'error': 'El Servicio de Identidad tardó demasiado en responder.'
            }), 503

        except Exception as e:
            return jsonify({
                'success': False,
                'error': f'Error al verificar autenticación: {str(e)}'
            }), 500

    return decorador


# ============================================================================
# RUTAS PARA SERVIR ARCHIVOS ESTÁTICOS (Frontend)
# ============================================================================

@app.route('/')
def index():
    """Servir página principal"""
    return send_from_directory('../frontend', 'index.html')

@app.route('/admin')
def admin():
    """Servir panel administrativo"""
    return send_from_directory('../frontend', 'admin.html')

@app.route('/css/<path:path>')
def send_css(path):
    return send_from_directory('../frontend/css', path)

@app.route('/js/<path:path>')
def send_js(path):
    return send_from_directory('../frontend/js', path)


# ============================================================================
# API ENDPOINTS - CONSULTAS (lectura pública, no requieren token)
# ============================================================================

@app.route('/api/consultas/activas', methods=['GET'])
def obtener_consultas_activas():
    """
    Obtener consultas activas (lectura pública — no requiere token).
    Retorna: Lista de consultas activas con sus opciones.
    """
    consultas = Consulta.obtener_activas()
    return jsonify({
        'success': True,
        'consultas': consultas
    })


@app.route('/api/consultas/todas', methods=['GET'])
def obtener_todas_consultas():
    """
    Obtener todas las consultas (admin).
    Retorna: Lista de todas las consultas.
    """
    consultas = Consulta.obtener_todas()
    return jsonify({
        'success': True,
        'consultas': consultas
    })


@app.route('/api/consultas/<int:consulta_id>/resultados', methods=['GET'])
def obtener_resultados(consulta_id):
    """
    Obtener resultados de una consulta (lectura pública).
    Retorna: XML con los resultados.
    """
    resultados = Voto.obtener_resultados(consulta_id)

    if not resultados:
        return jsonify({
            'success': False,
            'error': 'Consulta no encontrada'
        }), 404

    # Generar XML con los resultados
    root = ET.Element('resultados')

    consulta = ET.SubElement(root, 'consulta')
    ET.SubElement(consulta, 'id').text = str(resultados['consulta']['id'])
    ET.SubElement(consulta, 'titulo').text = resultados['consulta']['titulo']
    ET.SubElement(consulta, 'total_votos').text = str(resultados['total_votos'])

    opciones_elem = ET.SubElement(root, 'opciones')
    for opcion in resultados['opciones']:
        opcion_elem = ET.SubElement(opciones_elem, 'opcion')
        ET.SubElement(opcion_elem, 'id').text = str(opcion['id'])
        ET.SubElement(opcion_elem, 'texto').text = opcion['texto']
        ET.SubElement(opcion_elem, 'votos').text = str(opcion['votos'])
        ET.SubElement(opcion_elem, 'porcentaje').text = str(opcion['porcentaje'])

    xml_string = ET.tostring(root, encoding='utf-8', method='xml').decode('utf-8')

    return app.response_class(
        response=xml_string,
        status=200,
        mimetype='application/xml'
    )


# ============================================================================
# API ENDPOINTS - ACCIONES (requieren token de Centinela)
# ============================================================================

@app.route('/api/consultas/crear', methods=['POST'])
@requiere_token
def crear_consulta():
    """
    Crear nueva consulta (requiere token de Centinela).
    Recibe: JSON con titulo, descripcion, opciones[].
    """
    usuario = request.usuario_actual

    data = request.json
    titulo = data.get('titulo')
    descripcion = data.get('descripcion', '')
    opciones = data.get('opciones', [])

    if not titulo or len(opciones) < 2:
        return jsonify({
            'success': False,
            'error': 'Se requiere título y al menos 2 opciones'
        }), 400

    consulta_id = Consulta.crear(titulo, descripcion, opciones)

    return jsonify({
        'success': True,
        'consulta_id': consulta_id,
        'message': f'Consulta creada por {usuario["nombre"]}'
    })


@app.route('/api/consultas/<int:consulta_id>/cerrar', methods=['POST'])
@requiere_token
def cerrar_consulta(consulta_id):
    """
    Cerrar/desactivar una consulta (requiere token de Centinela).
    """
    usuario = request.usuario_actual

    Consulta.cerrar(consulta_id)

    return jsonify({
        'success': True,
        'message': f'Consulta cerrada por {usuario["nombre"]}'
    })


@app.route('/api/votar', methods=['POST'])
@requiere_token
def votar():
    """
    Registrar un voto (requiere token de Centinela).

    El usuario_id ya no viene del body — se toma del token validado
    para evitar que alguien vote en nombre de otro.

    Recibe JSON o XML con: consulta_id, opcion_id
    """
    usuario = request.usuario_actual
    usuario_id = usuario['id']

    content_type = request.headers.get('Content-Type', '')

    if 'xml' in content_type:
        xml_data = request.data.decode('utf-8')
        try:
            root = ET.fromstring(xml_data)
            consulta_id = int(root.find('consulta_id').text)
            opcion_id = int(root.find('opcion_id').text)
        except Exception as e:
            return jsonify({'success': False, 'error': f'XML inválido: {str(e)}'}), 400
    else:
        data = request.json or {}
        consulta_id = data.get('consulta_id')
        opcion_id = data.get('opcion_id')

    if not consulta_id or not opcion_id:
        return jsonify({'success': False, 'error': 'Faltan consulta_id u opcion_id'}), 400

    resultado = Voto.registrar(usuario_id, consulta_id, opcion_id)

    if resultado['success']:
        return jsonify(resultado)
    else:
        return jsonify(resultado), 400


@app.route('/api/consultas/<int:consulta_id>/ya-vote', methods=['GET'])
@requiere_token
def verificar_voto(consulta_id):
    """
    Verificar si el usuario autenticado ya votó en una consulta.
    El usuario_id se toma del token, no de la URL.
    """
    usuario = request.usuario_actual
    ya_voto = Voto.usuario_ha_votado(usuario['id'], consulta_id)

    return jsonify({
        'success': True,
        'ya_voto': ya_voto
    })


# ============================================================================
# INICIAR SERVIDOR
# ============================================================================

if __name__ == '__main__':
    print("=" * 60)
    print(" SERVICIO DE TOMA DE DECISIONES")
    print("=" * 60)
    print(f" Puerto:          http://localhost:5000")
    print(f" Identidad en:    {IDENTIDAD_URL}")
    print("=" * 60)
    print("\n IMPORTANTE: El Servicio de Identidad (Centinela)")
    print(" debe estar corriendo en puerto 8000 para que")
    print(" la autenticación funcione correctamente.")
    print("=" * 60)

    app.run(debug=True, host='0.0.0.0', port=5000)

