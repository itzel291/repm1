from flask import Blueprint, request, Response
import xml.etree.ElementTree as ET
from database import get_connection

auth_bp = Blueprint("auth", __name__)

@auth_bp.route("/auth/login", methods=["POST"])
def login():

    xml_data = request.data

    root = ET.fromstring(xml_data)

    usuario = root.find("usuario").text
    password = root.find("password").text

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT * FROM usuarios WHERE usuario=? AND password=?",
        (usuario,password)
    )

    user = cursor.fetchone()

    conn.close()

    response = ET.Element("loginResponse")

    if user:

        estado = ET.SubElement(response,"estado")
        estado.text="OK"

        mensaje = ET.SubElement(response,"mensaje")
        mensaje.text="Autenticación exitosa"

        token = ET.SubElement(response,"token")
        token.text="token-demo"

    else:

        estado = ET.SubElement(response,"estado")
        estado.text="ERROR"

        mensaje = ET.SubElement(response,"mensaje")
        mensaje.text="Credenciales incorrectas"

    xml_response = ET.tostring(response)

    return Response(xml_response, mimetype="application/xml")

