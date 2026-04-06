from flask import Flask, request, Response
from flask_cors import CORS
import sqlite3
import xml.etree.ElementTree as ET

app = Flask(__name__)
CORS(app)

DB_NAME = 'reporteincidencia.db'


def get_db_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute(
        '''
        CREATE TABLE IF NOT EXISTS incidencias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario TEXT NOT NULL,
            descripcion TEXT NOT NULL,
            fecha TEXT,
            hora TEXT,
            prioridad TEXT,
            categoria TEXT DEFAULT 'General',
            latitud TEXT,
            longitud TEXT,
            imagenes TEXT,
            estado TEXT DEFAULT 'Abierto'
        )
        '''
    )
    cursor.execute("PRAGMA table_info(incidencias)")
    columnas = {row[1] for row in cursor.fetchall()}
    if 'categoria' not in columnas:
        cursor.execute("ALTER TABLE incidencias ADD COLUMN categoria TEXT DEFAULT 'General'")
    conn.commit()
    conn.close()


def xml_response(root_name, estado='OK', mensaje=''):
    response = ET.Element(root_name)
    ET.SubElement(response, 'estado').text = estado
    if mensaje:
        ET.SubElement(response, 'mensaje').text = mensaje
    return response


@app.route('/api/reportar_incidencia', methods=['POST'])
def reportar_incidencia():
    try:
        root = ET.fromstring(request.data)
        usuario = root.findtext('usuario', '')
        descripcion = root.findtext('descripcion', '')
        fecha = root.findtext('fecha', '')
        hora = root.findtext('hora', '')
        prioridad = root.findtext('prioridad', 'Baja')
        categoria = root.findtext('categoria', 'General')
        latitud = root.findtext('latitud', '')
        longitud = root.findtext('longitud', '')
        imagenes = root.findtext('imagenes', '[]')

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO incidencias (usuario, descripcion, fecha, hora, prioridad, categoria, latitud, longitud, imagenes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (usuario, descripcion, fecha, hora, prioridad, categoria, latitud, longitud, imagenes),
        )
        conn.commit()
        nuevo_id = cursor.lastrowid
        conn.close()
        response = xml_response('reporteResponse', 'OK', f'Incidencia {nuevo_id} creada')
        status_code = 201
    except Exception as e:
        response = xml_response('reporteResponse', 'ERROR', str(e))
        status_code = 500

    return Response(ET.tostring(response), status=status_code, mimetype='application/xml')


@app.route('/api/consultar_incidencias', methods=['GET'])
def consultar_incidencias():
    rol = request.args.get('rol', 'usuario')
    conn = get_db_connection()
    cursor = conn.cursor()
    if rol == 'admin':
        cursor.execute("SELECT * FROM incidencias ORDER BY id DESC")
    else:
        cursor.execute("SELECT * FROM incidencias WHERE estado != 'Eliminado' ORDER BY id DESC")
    incidencias = cursor.fetchall()
    conn.close()

    root = ET.Element('listaIncidencias')
    for row in incidencias:
        item = ET.SubElement(root, 'incidencia')
        ET.SubElement(item, 'id').text = str(row['id'])
        ET.SubElement(item, 'usuario').text = str(row['usuario'])
        ET.SubElement(item, 'descripcion').text = str(row['descripcion'])
        ET.SubElement(item, 'fecha').text = str(row['fecha'] or '')
        ET.SubElement(item, 'hora').text = str(row['hora'] or '')
        ET.SubElement(item, 'prioridad').text = str(row['prioridad'] or 'Baja')
        ET.SubElement(item, 'categoria').text = str(row['categoria'] or 'General')
        ET.SubElement(item, 'estado').text = str(row['estado'] or 'Abierto')
        ET.SubElement(item, 'latitud').text = str(row['latitud'] or '')
        ET.SubElement(item, 'longitud').text = str(row['longitud'] or '')
        ET.SubElement(item, 'imagenes').text = str(row['imagenes'] or '[]')

    return Response(ET.tostring(root), status=200, mimetype='application/xml')


@app.route('/api/eliminar_incidencia', methods=['POST', 'DELETE'])
def eliminar_incidencia():
    try:
        root = ET.fromstring(request.data)
        id_incidencia = root.findtext('id', '')
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE incidencias SET estado = 'Eliminado' WHERE id = ?", (id_incidencia,))
        conn.commit()
        conn.close()
        response = xml_response('eliminarResponse')
    except Exception:
        response = xml_response('eliminarResponse', 'ERROR')
    return Response(ET.tostring(response), status=200, mimetype='application/xml')


@app.route('/api/reactivar_incidencia', methods=['POST'])
def reactivar_incidencia():
    try:
        root = ET.fromstring(request.data)
        id_incidencia = root.findtext('id', '')
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE incidencias SET estado = 'Abierto' WHERE id = ?", (id_incidencia,))
        conn.commit()
        conn.close()
        response = xml_response('reactivarResponse')
    except Exception:
        response = xml_response('reactivarResponse', 'ERROR')
    return Response(ET.tostring(response), status=200, mimetype='application/xml')


@app.route('/api/editar_incidencia', methods=['POST'])
def editar_incidencia():
    try:
        root = ET.fromstring(request.data)
        id_incidencia = root.findtext('id', '')
        descripcion = root.findtext('descripcion', '')
        hora = root.findtext('hora', '')
        prioridad = root.findtext('prioridad', 'Baja')
        categoria = root.findtext('categoria', 'General')
        latitud = root.findtext('latitud', '')
        longitud = root.findtext('longitud', '')
        imagenes = root.findtext('imagenes', '[]')

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE incidencias
            SET descripcion = ?, hora = ?, prioridad = ?, categoria = ?, latitud = ?, longitud = ?, imagenes = ?
            WHERE id = ?
            """,
            (descripcion, hora, prioridad, categoria, latitud, longitud, imagenes, id_incidencia),
        )
        conn.commit()
        conn.close()
        response = xml_response('editarResponse')
    except Exception:
        response = xml_response('editarResponse', 'ERROR')
    return Response(ET.tostring(response), status=200, mimetype='application/xml')


if __name__ == '__main__':
    init_db()
    app.run(debug=False, host="0.0.0.0", port=5001)
