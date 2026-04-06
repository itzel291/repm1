from flask import Blueprint, request, Response
from ..models import db, Voto, Pregunta
import xml.etree.ElementTree as ET

votos_bp = Blueprint('votos', __name__, url_prefix='/votos')


def xml_message(tag, text):
    root = ET.Element(tag)
    root.text = text
    return Response(ET.tostring(root, encoding='utf-8'), mimetype='application/xml')


@votos_bp.route('/', methods=['POST'])
def votar():
    user_id = request.headers.get("X-User-ID", "")
    vivienda_id = request.headers.get("X-Vivienda-ID", "")

    root = ET.fromstring(request.data)
    pregunta_id = root.findtext("pregunta_id", "")
    opcion_id = root.findtext("opcion_id", "")

    pregunta = Pregunta.query.get_or_404(int(pregunta_id))
    if pregunta.consulta.estado != 'abierta':
        return xml_message("error", "La consulta está cerrada"), 400

    existe = Voto.query.filter_by(vivienda_id=vivienda_id, pregunta_id=pregunta_id).first()
    if existe:
        return xml_message("error", "Ya votó en esta pregunta"), 400

    voto = Voto(user_id=user_id or vivienda_id, vivienda_id=vivienda_id or user_id, pregunta_id=pregunta_id, opcion_id=opcion_id)
    db.session.add(voto)
    db.session.commit()

    return xml_message("mensaje", "Voto registrado")


@votos_bp.route('/verificar/<int:pregunta_id>', methods=['GET'])
def verificar_voto(pregunta_id):
    vivienda_id = request.headers.get("X-Vivienda-ID", "")
    pregunta = Pregunta.query.get_or_404(pregunta_id)

    if pregunta.consulta.estado != 'abierta':
        return xml_message("estado", "cerrada")

    existe = Voto.query.filter_by(vivienda_id=vivienda_id, pregunta_id=pregunta_id).first()
    return xml_message("estado", "ya_voto" if existe else "no_voto")
