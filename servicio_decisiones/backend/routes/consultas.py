from flask import Blueprint, Response
from ..models import Consulta, Voto
import xml.etree.ElementTree as ET

consultas_bp = Blueprint('consultas', __name__, url_prefix='/consultas')


def xml_response(root):
    return Response(ET.tostring(root, encoding='utf-8'), mimetype='application/xml')


@consultas_bp.route('/', methods=['GET'])
def obtener_consultas():
    consultas = Consulta.query.order_by(Consulta.created_at.desc(), Consulta.id.desc()).all()
    root = ET.Element("consultas")

    for consulta in consultas:
        c_xml = ET.SubElement(root, "consulta")
        ET.SubElement(c_xml, "id").text = str(consulta.id)
        ET.SubElement(c_xml, "titulo").text = consulta.titulo
        ET.SubElement(c_xml, "estado").text = consulta.estado
        ET.SubElement(c_xml, "created_at").text = consulta.created_at.isoformat() if consulta.created_at else ''

        for pregunta in consulta.preguntas:
            p_xml = ET.SubElement(c_xml, "pregunta")
            ET.SubElement(p_xml, "id").text = str(pregunta.id)
            ET.SubElement(p_xml, "texto").text = pregunta.texto

            for opcion in pregunta.opciones:
                o_xml = ET.SubElement(p_xml, "opcion")
                ET.SubElement(o_xml, "id").text = str(opcion.id)
                ET.SubElement(o_xml, "texto").text = opcion.texto
                ET.SubElement(o_xml, "votos").text = str(len(opcion.votos))

    return xml_response(root)


@consultas_bp.route('/<int:consulta_id>/resultados', methods=['GET'])
def resultados_consulta(consulta_id):
    consulta = Consulta.query.get_or_404(consulta_id)
    root = ET.Element("resultados")
    ET.SubElement(root, "consulta_id").text = str(consulta.id)
    ET.SubElement(root, "titulo").text = consulta.titulo
    ET.SubElement(root, "estado").text = consulta.estado

    total_consulta = sum(len(op.votos) for pregunta in consulta.preguntas for op in pregunta.opciones)
    ET.SubElement(root, "total_votos").text = str(total_consulta)

    for pregunta in consulta.preguntas:
        p_xml = ET.SubElement(root, "pregunta")
        ET.SubElement(p_xml, "id").text = str(pregunta.id)
        ET.SubElement(p_xml, "texto").text = pregunta.texto

        total_pregunta = Voto.query.filter_by(pregunta_id=pregunta.id).count()
        ET.SubElement(p_xml, "total_votos").text = str(total_pregunta)

        for opcion in pregunta.opciones:
            votos = len(opcion.votos)
            porcentaje = (votos / total_pregunta * 100) if total_pregunta else 0
            o_xml = ET.SubElement(p_xml, "opcion")
            ET.SubElement(o_xml, "id").text = str(opcion.id)
            ET.SubElement(o_xml, "texto").text = opcion.texto
            ET.SubElement(o_xml, "votos").text = str(votos)
            ET.SubElement(o_xml, "porcentaje").text = f"{porcentaje:.1f}"

    return xml_response(root)
