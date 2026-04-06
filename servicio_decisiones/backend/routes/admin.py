from flask import Blueprint, request, Response
from ..models import db, Consulta, Pregunta, Opcion
import xml.etree.ElementTree as ET

admin_bp = Blueprint('admin', __name__, url_prefix='/admin')


def xml_response(root):
    return Response(ET.tostring(root, encoding='utf-8'), mimetype='application/xml')


def xml_message(tag, text):
    root = ET.Element(tag)
    root.text = text
    return xml_response(root)


@admin_bp.route('/crear-consulta', methods=['POST', 'OPTIONS'])
@admin_bp.route('/admin_encuestas', methods=['POST', 'OPTIONS'])
def crear_consulta():
    if request.method == 'OPTIONS':
        return Response(status=204)

    root = ET.fromstring(request.data)
    titulo = root.findtext("titulo", "") or root.findtext("pregunta", "Consulta sin titulo")
    preguntas_xml = root.findall("pregunta")
    consulta = Consulta(titulo=titulo, estado='abierta')
    db.session.add(consulta)
    db.session.flush()

    if preguntas_xml:
        for p in preguntas_xml:
            texto_pregunta = p.findtext("texto", "") or titulo
            pregunta = Pregunta(texto=texto_pregunta, consulta_id=consulta.id)
            db.session.add(pregunta)
            db.session.flush()

            for op in p.findall("opcion"):
                db.session.add(Opcion(texto=op.text or 'Opcion', pregunta_id=pregunta.id))
    else:
        texto_principal = root.findtext("pregunta", titulo)
        pregunta = Pregunta(texto=texto_principal, consulta_id=consulta.id)
        db.session.add(pregunta)
        db.session.flush()

        opciones = root.findall("./opciones/opcion")
        for op in opciones:
            db.session.add(Opcion(texto=op.text or 'Opcion', pregunta_id=pregunta.id))

    db.session.commit()
    return xml_message("mensaje", "Consulta creada")


@admin_bp.route('/consultas', methods=['GET'])
def listar_consultas_admin():
    consultas = Consulta.query.order_by(Consulta.created_at.desc(), Consulta.id.desc()).all()
    root = ET.Element("consultas_admin")

    for consulta in consultas:
        c_xml = ET.SubElement(root, "consulta")
        ET.SubElement(c_xml, "id").text = str(consulta.id)
        ET.SubElement(c_xml, "titulo").text = consulta.titulo
        ET.SubElement(c_xml, "estado").text = consulta.estado
        ET.SubElement(c_xml, "created_at").text = consulta.created_at.isoformat() if consulta.created_at else ''
        ET.SubElement(c_xml, "preguntas").text = str(len(consulta.preguntas))
        ET.SubElement(c_xml, "total_votos").text = str(sum(len(op.votos) for pregunta in consulta.preguntas for op in pregunta.opciones))

    return xml_response(root)


@admin_bp.route('/consultas/<int:consulta_id>/cerrar', methods=['POST'])
def cerrar_consulta(consulta_id):
    consulta = Consulta.query.get_or_404(consulta_id)
    consulta.estado = 'cerrada'
    db.session.commit()
    return xml_message("mensaje", "Consulta cerrada")


@admin_bp.route('/consultas/<int:consulta_id>/abrir', methods=['POST'])
def abrir_consulta(consulta_id):
    consulta = Consulta.query.get_or_404(consulta_id)
    consulta.estado = 'abierta'
    db.session.commit()
    return xml_message("mensaje", "Consulta reabierta")
