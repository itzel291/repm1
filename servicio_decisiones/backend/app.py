from flask import Flask, request, Response
from flask_cors import CORS
from sqlalchemy import inspect, text
from pathlib import Path
from .db import db
from .routes.admin import admin_bp
from .routes.votos import votos_bp
from .routes.consultas import consultas_bp

app = Flask(__name__)
BASE_DIR = Path(__file__).resolve().parents[2]
DB_PATH = BASE_DIR / 'instance' / 'decisiones.db'
app.config['SQLALCHEMY_DATABASE_URI'] = f"sqlite:///{DB_PATH.as_posix()}"
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)
CORS(app)

app.register_blueprint(admin_bp)
app.register_blueprint(votos_bp)
app.register_blueprint(consultas_bp)


def ensure_schema():
    inspector = inspect(db.engine)
    columnas = {col["name"] for col in inspector.get_columns("consulta")} if inspector.has_table("consulta") else set()

    if "titulo" not in columnas:
        db.session.execute(text("ALTER TABLE consulta ADD COLUMN titulo VARCHAR(200)"))
        if "pregunta" in columnas:
            db.session.execute(text("UPDATE consulta SET titulo = COALESCE(pregunta, 'Consulta sin titulo') WHERE titulo IS NULL OR titulo = ''"))
        else:
            db.session.execute(text("UPDATE consulta SET titulo = 'Consulta sin titulo' WHERE titulo IS NULL OR titulo = ''"))
    if "estado" not in columnas:
        db.session.execute(text("ALTER TABLE consulta ADD COLUMN estado VARCHAR(20) NOT NULL DEFAULT 'abierta'"))
    if "created_at" not in columnas:
        db.session.execute(text("ALTER TABLE consulta ADD COLUMN created_at DATETIME"))
        db.session.execute(text("UPDATE consulta SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"))

    if inspector.has_table("opcion"):
        columnas_opcion = {col["name"] for col in inspector.get_columns("opcion")}
        if "pregunta_id" not in columnas_opcion:
            db.session.execute(text("ALTER TABLE opcion ADD COLUMN pregunta_id INTEGER"))
            if "consulta_id" in columnas_opcion:
                db.session.execute(text("""
                    UPDATE opcion
                    SET pregunta_id = (
                        SELECT pregunta.id
                        FROM pregunta
                        WHERE pregunta.consulta_id = opcion.consulta_id
                        ORDER BY pregunta.id ASC
                        LIMIT 1
                    )
                    WHERE pregunta_id IS NULL
                """))

    columnas_voto = {col["name"] for col in inspector.get_columns("voto")} if inspector.has_table("voto") else set()
    if "user_id" not in columnas_voto:
        db.session.execute(text("ALTER TABLE voto ADD COLUMN user_id VARCHAR(50)"))
        if "usuario_id" in columnas_voto:
            db.session.execute(text("UPDATE voto SET user_id = CAST(usuario_id AS TEXT) WHERE user_id IS NULL OR user_id = ''"))
        else:
            db.session.execute(text("UPDATE voto SET user_id = 'sin-usuario' WHERE user_id IS NULL OR user_id = ''"))
    if "pregunta_id" not in columnas_voto:
        db.session.execute(text("ALTER TABLE voto ADD COLUMN pregunta_id INTEGER"))
        if "consulta_id" in columnas_voto:
            db.session.execute(text("""
                UPDATE voto
                SET pregunta_id = (
                    SELECT pregunta.id
                    FROM pregunta
                    WHERE pregunta.consulta_id = voto.consulta_id
                    ORDER BY pregunta.id ASC
                    LIMIT 1
                )
                WHERE pregunta_id IS NULL
            """))
    if "created_at" not in columnas_voto:
        db.session.execute(text("ALTER TABLE voto ADD COLUMN created_at DATETIME"))
        db.session.execute(text("UPDATE voto SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"))

    db.session.commit()


with app.app_context():
    db.create_all()
    ensure_schema()


@app.route("/admin_encuestas", methods=["POST", "OPTIONS"])
@app.route("/admin_encuestas/", methods=["POST", "OPTIONS"])
@app.route("/crear-consulta", methods=["POST", "OPTIONS"])
def legacy_create_consulta():
    # Compatibilidad con frontends en cache que siguen apuntando
    # a rutas antiguas sin el prefijo /admin.
    from .routes.admin import crear_consulta
    if request.method == "OPTIONS":
        return Response(status=204)
    return crear_consulta()


@app.route("/")
def home():
    return {"mensaje": "Servicio de decisiones activo"}


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5004, debug=False, use_reloader=False)
