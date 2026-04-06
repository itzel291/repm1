from datetime import datetime
from .db import db


class Consulta(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    titulo = db.Column(db.String(200), nullable=False)
    estado = db.Column(db.String(20), nullable=False, default='abierta')
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    preguntas = db.relationship("Pregunta", backref="consulta", cascade="all, delete-orphan")


class Pregunta(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    texto = db.Column(db.String(300), nullable=False)
    consulta_id = db.Column(db.Integer, db.ForeignKey('consulta.id'), nullable=False)
    opciones = db.relationship("Opcion", backref="pregunta", cascade="all, delete-orphan")
    votos = db.relationship("Voto", backref="pregunta", cascade="all, delete-orphan")


class Opcion(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    texto = db.Column(db.String(200), nullable=False)
    pregunta_id = db.Column(db.Integer, db.ForeignKey('pregunta.id'), nullable=False)
    votos = db.relationship("Voto", backref="opcion")


class Voto(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(50), nullable=False)
    vivienda_id = db.Column(db.String(50), nullable=False)
    pregunta_id = db.Column(db.Integer, db.ForeignKey('pregunta.id'), nullable=False)
    opcion_id = db.Column(db.Integer, db.ForeignKey('opcion.id'), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
