import json
from datetime import datetime, timezone
from functools import wraps

import requests
from flask import Blueprint, jsonify, request

from database import get_connection

posts_bp = Blueprint("posts", __name__)

CENTINELA_URL = "http://localhost:8000"
ALLOWED_MEDIA_TYPES = {"image", "video"}
ADMIN_TOKEN = "centinela-admin-2025"


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def ensure_posts_schema():
    conn = get_connection()
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(posts)").fetchall()}
    event_columns = {row["name"] for row in conn.execute("PRAGMA table_info(events)").fetchall()}
    comment_columns = {row["name"] for row in conn.execute("PRAGMA table_info(post_comments)").fetchall()}

    if "author_id" not in columns:
        conn.execute("ALTER TABLE posts ADD COLUMN author_id INTEGER")

    if "media_json" not in columns:
        conn.execute("ALTER TABLE posts ADD COLUMN media_json TEXT DEFAULT '[]'")

    if "created_at" not in columns:
        conn.execute("ALTER TABLE posts ADD COLUMN created_at TEXT")

    if "status" not in columns:
        conn.execute("ALTER TABLE posts ADD COLUMN status TEXT DEFAULT 'approved'")

    if "reviewed_at" not in columns:
        conn.execute("ALTER TABLE posts ADD COLUMN reviewed_at TEXT")

    if "reviewed_by" not in columns:
        conn.execute("ALTER TABLE posts ADD COLUMN reviewed_by TEXT")

    if "rejection_reason" not in columns:
        conn.execute("ALTER TABLE posts ADD COLUMN rejection_reason TEXT")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS post_likes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            usuario_id INTEGER NOT NULL,
            autor TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(post_id, usuario_id)
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS post_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            usuario_id INTEGER NOT NULL,
            autor TEXT NOT NULL,
            contenido TEXT NOT NULL,
            created_at TEXT NOT NULL,
            parent_comment_id INTEGER
        )
        """
    )

    if "parent_comment_id" not in comment_columns:
        conn.execute("ALTER TABLE post_comments ADD COLUMN parent_comment_id INTEGER")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS comment_likes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            comment_id INTEGER NOT NULL,
            usuario_id INTEGER NOT NULL,
            autor TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(comment_id, usuario_id)
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS post_shares (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            usuario_id INTEGER NOT NULL,
            autor TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER NOT NULL,
            actor_id INTEGER,
            actor_nombre TEXT,
            tipo TEXT NOT NULL,
            titulo TEXT NOT NULL,
            descripcion TEXT NOT NULL,
            link TEXT,
            post_id INTEGER,
            leida INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS admin_notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT NOT NULL,
            titulo TEXT NOT NULL,
            descripcion TEXT NOT NULL,
            link TEXT,
            post_id INTEGER,
            leida INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            titulo TEXT NOT NULL,
            descripcion TEXT,
            fecha TEXT,
            hora TEXT,
            autor TEXT NOT NULL,
            author_id INTEGER,
            created_at TEXT NOT NULL,
            status TEXT DEFAULT 'approved',
            reviewed_at TEXT,
            reviewed_by TEXT,
            rejection_reason TEXT
        )
        """
    )

    if "status" not in event_columns:
        conn.execute("ALTER TABLE events ADD COLUMN status TEXT DEFAULT 'approved'")

    if "reviewed_at" not in event_columns:
        conn.execute("ALTER TABLE events ADD COLUMN reviewed_at TEXT")

    if "reviewed_by" not in event_columns:
        conn.execute("ALTER TABLE events ADD COLUMN reviewed_by TEXT")

    if "rejection_reason" not in event_columns:
        conn.execute("ALTER TABLE events ADD COLUMN rejection_reason TEXT")

    if "categoria" not in event_columns:
        conn.execute("ALTER TABLE events ADD COLUMN categoria TEXT DEFAULT 'Comunitario'")

    conn.commit()
    conn.close()


def parse_media_items(raw_media):
    media = raw_media if isinstance(raw_media, list) else []
    sanitized = []

    for item in media:
        if not isinstance(item, dict):
            continue

        media_type = (item.get("type") or "").strip().lower()
        url = (item.get("url") or "").strip()
        if media_type not in ALLOWED_MEDIA_TYPES or not url:
            continue

        sanitized.append(
            {
                "type": media_type,
                "url": url,
                "name": (item.get("name") or "").strip()[:120],
            }
        )

    return sanitized


def verify_token(token):
    if not token:
        return None

    try:
        response = requests.get(
            f"{CENTINELA_URL}/auth/verificar-token",
            headers={"Authorization": f"Token {token}"},
            timeout=5,
        )
        data = response.json()
    except Exception:
        return None

    if not data.get("valido"):
        return None

    return data.get("usuario") or None


def extract_token():
    return request.headers.get("Authorization", "").replace("Token ", "").strip()


def optional_user():
    return verify_token(extract_token())


def is_admin_request():
    return request.headers.get("X-Admin-Token", "").strip() == ADMIN_TOKEN


def requiere_token(func):
    @wraps(func)
    def decorado(*args, **kwargs):
        usuario = verify_token(extract_token())
        if not usuario:
            return jsonify({"error": "Sesion invalida o expirada"}), 401

        request.usuario_actual = usuario
        return func(*args, **kwargs)

    return decorado


def get_post_row(conn, post_id):
    return conn.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()


def get_comment_row(conn, comment_id):
    return conn.execute("SELECT * FROM post_comments WHERE id = ?", (comment_id,)).fetchone()


def find_user_id_by_name(nombre_autor):
    if not nombre_autor:
        return None

    try:
        response = requests.get(f"{CENTINELA_URL}/api/admin/usuarios/", timeout=5)
        if not response.ok:
            return None
        usuarios = response.json()
    except Exception:
        return None

    buscado = nombre_autor.strip().lower()
    for usuario in usuarios:
        nombre = (usuario.get("nombre_completo") or "").strip().lower()
        if nombre == buscado:
            return usuario.get("id")

    return None


def get_post_owner_id(conn, post_row):
    if not post_row:
        return None

    if post_row["author_id"]:
        return post_row["author_id"]

    owner_id = find_user_id_by_name(post_row["autor"])
    if owner_id:
        conn.execute("UPDATE posts SET author_id = ? WHERE id = ?", (owner_id, post_row["id"]))
    return owner_id


def serialize_comments(conn, post_id):
    comments = conn.execute(
        """
        SELECT id, usuario_id, autor, contenido, created_at, parent_comment_id
        FROM post_comments
        WHERE post_id = ?
        ORDER BY id ASC
        """,
        (post_id,),
    ).fetchall()
    likes_by_comment = {
        row["comment_id"]: row["total"]
        for row in conn.execute(
            """
            SELECT comment_id, COUNT(*) AS total
            FROM comment_likes
            WHERE comment_id IN (
                SELECT id FROM post_comments WHERE post_id = ?
            )
            GROUP BY comment_id
            """,
            (post_id,),
        ).fetchall()
    }

    serialized = []
    for comment in comments:
        item = dict(comment)
        item["like_count"] = likes_by_comment.get(item["id"], 0)
        serialized.append(item)
    return serialized


def serialize_post(row, conn, current_user=None):
    post = dict(row)
    media_json = post.get("media_json") or "[]"

    try:
        media = json.loads(media_json)
    except json.JSONDecodeError:
        media = []

    like_count = conn.execute(
        "SELECT COUNT(*) AS total FROM post_likes WHERE post_id = ?",
        (post["id"],),
    ).fetchone()["total"]
    comment_count = conn.execute(
        "SELECT COUNT(*) AS total FROM post_comments WHERE post_id = ?",
        (post["id"],),
    ).fetchone()["total"]
    share_count = conn.execute(
        "SELECT COUNT(*) AS total FROM post_shares WHERE post_id = ?",
        (post["id"],),
    ).fetchone()["total"]

    liked_by_current_user = False
    if current_user:
        liked_by_current_user = bool(
            conn.execute(
                "SELECT 1 FROM post_likes WHERE post_id = ? AND usuario_id = ? LIMIT 1",
                (post["id"], current_user["id"]),
            ).fetchone()
        )

    comments = serialize_comments(conn, post["id"])
    root_comments = []
    replies_by_parent = {}
    for comment in comments:
        comment["liked_by_current_user"] = False
        if current_user:
            comment["liked_by_current_user"] = bool(
                conn.execute(
                    "SELECT 1 FROM comment_likes WHERE comment_id = ? AND usuario_id = ? LIMIT 1",
                    (comment["id"], current_user["id"]),
                ).fetchone()
            )
        comment["replies"] = []
        parent_id = comment.get("parent_comment_id")
        if parent_id:
            replies_by_parent.setdefault(parent_id, []).append(comment)
        else:
            root_comments.append(comment)

    for comment in root_comments:
        comment["replies"] = replies_by_parent.get(comment["id"], [])

    serialized = {
        "id": post["id"],
        "titulo": post.get("titulo") or "",
        "contenido": post.get("contenido") or "",
        "autor": post.get("autor") or "Vecino",
        "author_id": post.get("author_id"),
        "created_at": post.get("created_at") or "",
        "status": post.get("status") or "approved",
        "reviewed_at": post.get("reviewed_at") or "",
        "reviewed_by": post.get("reviewed_by") or "",
        "rejection_reason": post.get("rejection_reason") or "",
        "media": media,
        "like_count": like_count,
        "comment_count": comment_count,
        "share_count": share_count,
        "liked_by_current_user": liked_by_current_user,
        "comments": root_comments,
    }
    return serialized


def create_notification(conn, usuario_id, actor, tipo, titulo, descripcion, link, post_id):
    if not usuario_id or not actor:
        return

    if usuario_id == actor.get("id"):
        return

    conn.execute(
        """
        INSERT INTO notifications (
            usuario_id, actor_id, actor_nombre, tipo, titulo, descripcion, link, post_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            usuario_id,
            actor.get("id"),
            actor.get("nombre") or "Vecino",
            tipo,
            titulo,
            descripcion,
            link,
            post_id,
            utc_now_iso(),
        ),
    )


def create_admin_notification(conn, tipo, titulo, descripcion, link=None, post_id=None):
    conn.execute(
        """
        INSERT INTO admin_notifications (tipo, titulo, descripcion, link, post_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (tipo, titulo, descripcion, link, post_id, utc_now_iso()),
    )


def can_manage_post(post_row, current_user):
    if not post_row or not current_user:
        return False

    if post_row["author_id"]:
        return post_row["author_id"] == current_user["id"]

    return (post_row["autor"] or "").strip().lower() == (current_user.get("nombre") or "").strip().lower()


ensure_posts_schema()


@posts_bp.route("/posts", methods=["GET"])
def obtener_posts():
    current_user = optional_user()
    conn = get_connection()
    if current_user:
        posts = conn.execute(
            """
            SELECT * FROM posts
            WHERE status = 'approved' OR author_id = ?
            ORDER BY id DESC
            """,
            (current_user["id"],),
        ).fetchall()
    else:
        posts = conn.execute(
            "SELECT * FROM posts WHERE status = 'approved' ORDER BY id DESC"
        ).fetchall()
    data = [serialize_post(post, conn, current_user) for post in posts]
    conn.close()
    return jsonify(data)


@posts_bp.route("/posts", methods=["POST"])
@requiere_token
def crear_post():
    data = request.json or {}
    titulo = (data.get("titulo") or "").strip()
    contenido = (data.get("contenido") or "").strip()
    media = parse_media_items(data.get("media"))

    if not titulo:
        titulo = (contenido[:40] if contenido else "Nueva publicacion").strip() or "Nueva publicacion"

    if not contenido and not media:
        return jsonify({"error": "Debes escribir contenido o adjuntar un archivo"}), 400

    usuario = request.usuario_actual
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO posts (titulo, contenido, autor, author_id, media_json, created_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            titulo,
            contenido,
            usuario.get("nombre") or "Vecino",
            usuario.get("id"),
            json.dumps(media),
            utc_now_iso(),
            "pending",
        ),
    )
    post_id = cursor.lastrowid
    post = get_post_row(conn, post_id)
    create_admin_notification(
        conn,
        "post_pending",
        "Nueva publicacion pendiente",
        f"{usuario.get('nombre') or 'Un vecino'} envio una publicacion para revision.",
        "admin.html",
        post_id,
    )
    conn.commit()
    payload = serialize_post(post, conn, usuario)
    conn.close()

    return jsonify({"mensaje": "Post enviado a revision", "post": payload}), 201


@posts_bp.route("/posts/<int:post_id>", methods=["PUT"])
@requiere_token
def actualizar_post(post_id):
    data = request.json or {}
    conn = get_connection()
    post = get_post_row(conn, post_id)
    if not post:
        conn.close()
        return jsonify({"error": "Post no encontrado"}), 404

    if not can_manage_post(post, request.usuario_actual):
        conn.close()
        return jsonify({"error": "No puedes editar esta publicacion"}), 403

    titulo = (data.get("titulo") or post["titulo"] or "").strip()
    contenido = (data.get("contenido") or "").strip()
    media = parse_media_items(data.get("media"))

    conn.execute(
        """
        UPDATE posts
        SET titulo = ?, contenido = ?, media_json = ?, status = ?, reviewed_at = NULL, reviewed_by = NULL, rejection_reason = NULL
        WHERE id = ?
        """,
        (titulo, contenido, json.dumps(media), "pending", post_id),
    )
    create_admin_notification(
        conn,
        "post_pending",
        "Publicacion editada pendiente",
        f"{request.usuario_actual.get('nombre') or 'Un vecino'} actualizo una publicacion y espera revision.",
        "admin.html",
        post_id,
    )
    conn.commit()
    updated = get_post_row(conn, post_id)
    payload = serialize_post(updated, conn, request.usuario_actual)
    conn.close()
    return jsonify({"mensaje": "Post actualizado", "post": payload})


@posts_bp.route("/posts/<int:post_id>", methods=["DELETE"])
@requiere_token
def eliminar_post(post_id):
    conn = get_connection()
    post = get_post_row(conn, post_id)
    if not post:
        conn.close()
        return jsonify({"error": "Post no encontrado"}), 404

    if not can_manage_post(post, request.usuario_actual):
        conn.close()
        return jsonify({"error": "No puedes eliminar esta publicacion"}), 403

    conn.execute("DELETE FROM post_likes WHERE post_id = ?", (post_id,))
    conn.execute("DELETE FROM post_comments WHERE post_id = ?", (post_id,))
    conn.execute("DELETE FROM post_shares WHERE post_id = ?", (post_id,))
    conn.execute("DELETE FROM notifications WHERE post_id = ?", (post_id,))
    conn.execute("DELETE FROM posts WHERE id = ?", (post_id,))
    conn.commit()
    conn.close()
    return jsonify({"mensaje": "Post eliminado"})


@posts_bp.route("/posts/<int:post_id>/likes", methods=["POST"])
@requiere_token
def dar_like(post_id):
    conn = get_connection()
    post = get_post_row(conn, post_id)
    if not post:
        conn.close()
        return jsonify({"error": "Post no encontrado"}), 404

    usuario = request.usuario_actual
    existing = conn.execute(
        "SELECT id FROM post_likes WHERE post_id = ? AND usuario_id = ?",
        (post_id, usuario["id"]),
    ).fetchone()

    if not existing:
        conn.execute(
            """
            INSERT INTO post_likes (post_id, usuario_id, autor, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (post_id, usuario["id"], usuario.get("nombre") or "Vecino", utc_now_iso()),
        )
        owner_id = get_post_owner_id(conn, post)
        create_notification(
            conn,
            owner_id,
            usuario,
            "like",
            "Le gustaron tu publicacion",
            f"{usuario.get('nombre') or 'Un vecino'} marco me gusta en tu publicacion.",
            "publicaciones.html",
            post_id,
        )

    conn.commit()
    payload = serialize_post(get_post_row(conn, post_id), conn, usuario)
    conn.close()
    return jsonify(payload)


@posts_bp.route("/posts/<int:post_id>/likes", methods=["DELETE"])
@requiere_token
def quitar_like(post_id):
    conn = get_connection()
    conn.execute(
        "DELETE FROM post_likes WHERE post_id = ? AND usuario_id = ?",
        (post_id, request.usuario_actual["id"]),
    )
    conn.commit()
    post = get_post_row(conn, post_id)
    payload = serialize_post(post, conn, request.usuario_actual) if post else {"id": post_id}
    conn.close()
    return jsonify(payload)


@posts_bp.route("/posts/<int:post_id>/comments", methods=["POST"])
@requiere_token
def comentar_post(post_id):
    data = request.json or {}
    contenido = (data.get("contenido") or "").strip()
    parent_comment_id = data.get("parent_comment_id")
    if not contenido:
        return jsonify({"error": "Escribe un comentario"}), 400

    conn = get_connection()
    post = get_post_row(conn, post_id)
    if not post:
        conn.close()
        return jsonify({"error": "Post no encontrado"}), 404

    if parent_comment_id:
        parent = get_comment_row(conn, int(parent_comment_id))
        if not parent or parent["post_id"] != post_id:
            conn.close()
            return jsonify({"error": "Comentario padre invalido"}), 400

    usuario = request.usuario_actual
    conn.execute(
        """
        INSERT INTO post_comments (post_id, usuario_id, autor, contenido, created_at, parent_comment_id)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (post_id, usuario["id"], usuario.get("nombre") or "Vecino", contenido, utc_now_iso(), parent_comment_id),
    )
    owner_id = get_post_owner_id(conn, post)
    if parent_comment_id:
        create_notification(
            conn,
            owner_id,
            usuario,
            "comment_reply",
            "Respondieron un comentario en tu publicacion",
            f"{usuario.get('nombre') or 'Un vecino'} respondio: \"{contenido[:80]}\"",
            "publicaciones.html",
            post_id,
        )
    else:
        create_notification(
            conn,
            owner_id,
            usuario,
            "comment",
            "Comentaron tu publicacion",
            f"{usuario.get('nombre') or 'Un vecino'} comento: \"{contenido[:80]}\"",
            "publicaciones.html",
            post_id,
        )
    conn.commit()
    payload = serialize_post(get_post_row(conn, post_id), conn, usuario)
    conn.close()
    return jsonify(payload), 201


@posts_bp.route("/posts/<int:post_id>/shares", methods=["POST"])
@requiere_token
def compartir_post(post_id):
    conn = get_connection()
    post = get_post_row(conn, post_id)
    if not post:
        conn.close()
        return jsonify({"error": "Post no encontrado"}), 404

    usuario = request.usuario_actual
    conn.execute(
        """
        INSERT INTO post_shares (post_id, usuario_id, autor, created_at)
        VALUES (?, ?, ?, ?)
        """,
        (post_id, usuario["id"], usuario.get("nombre") or "Vecino", utc_now_iso()),
    )
    owner_id = get_post_owner_id(conn, post)
    create_notification(
        conn,
        owner_id,
        usuario,
        "share",
        "Compartieron tu publicacion",
        f"{usuario.get('nombre') or 'Un vecino'} compartio tu publicacion.",
        "publicaciones.html",
        post_id,
    )
    conn.commit()
    payload = serialize_post(get_post_row(conn, post_id), conn, usuario)
    conn.close()
    return jsonify(payload)


@posts_bp.route("/comments/<int:comment_id>/likes", methods=["POST"])
@requiere_token
def dar_like_comentario(comment_id):
    conn = get_connection()
    comment = get_comment_row(conn, comment_id)
    if not comment:
        conn.close()
        return jsonify({"error": "Comentario no encontrado"}), 404

    usuario = request.usuario_actual
    existing = conn.execute(
        "SELECT id FROM comment_likes WHERE comment_id = ? AND usuario_id = ?",
        (comment_id, usuario["id"]),
    ).fetchone()
    if not existing:
        conn.execute(
            """
            INSERT INTO comment_likes (comment_id, usuario_id, autor, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (comment_id, usuario["id"], usuario.get("nombre") or "Vecino", utc_now_iso()),
        )

    conn.commit()
    post = get_post_row(conn, comment["post_id"])
    payload = serialize_post(post, conn, usuario)
    conn.close()
    return jsonify(payload)


@posts_bp.route("/comments/<int:comment_id>/likes", methods=["DELETE"])
@requiere_token
def quitar_like_comentario(comment_id):
    conn = get_connection()
    comment = get_comment_row(conn, comment_id)
    if not comment:
        conn.close()
        return jsonify({"error": "Comentario no encontrado"}), 404

    conn.execute(
        "DELETE FROM comment_likes WHERE comment_id = ? AND usuario_id = ?",
        (comment_id, request.usuario_actual["id"]),
    )
    conn.commit()
    post = get_post_row(conn, comment["post_id"])
    payload = serialize_post(post, conn, request.usuario_actual)
    conn.close()
    return jsonify(payload)


@posts_bp.route("/notifications", methods=["GET"])
@requiere_token
def obtener_notificaciones():
    usuario = request.usuario_actual
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT id, tipo, titulo, descripcion, link, leida, created_at, actor_nombre, post_id
        FROM notifications
        WHERE usuario_id = ?
        ORDER BY id DESC
        """,
        (usuario["id"],),
    ).fetchall()
    unread_count = conn.execute(
        "SELECT COUNT(*) AS total FROM notifications WHERE usuario_id = ? AND leida = 0",
        (usuario["id"],),
    ).fetchone()["total"]
    conn.close()
    return jsonify(
        {
            "items": [dict(row) for row in rows],
            "unread_count": unread_count,
        }
    )


@posts_bp.route("/notifications/read-all", methods=["POST"])
@requiere_token
def marcar_todas_leidas():
    usuario = request.usuario_actual
    conn = get_connection()
    conn.execute(
        "UPDATE notifications SET leida = 1 WHERE usuario_id = ?",
        (usuario["id"],),
    )
    conn.commit()
    conn.close()
    return jsonify({"mensaje": "Notificaciones marcadas como leidas"})


@posts_bp.route("/notifications/<int:notif_id>/read", methods=["POST"])
@requiere_token
def marcar_notificacion_leida(notif_id):
    usuario = request.usuario_actual
    conn = get_connection()
    conn.execute(
        "UPDATE notifications SET leida = 1 WHERE id = ? AND usuario_id = ?",
        (notif_id, usuario["id"]),
    )
    conn.commit()
    conn.close()
    return jsonify({"mensaje": "Notificacion actualizada"})


@posts_bp.route("/admin/posts/pending", methods=["GET"])
def admin_posts_pendientes():
    if not is_admin_request():
        return jsonify({"error": "No autorizado"}), 401

    conn = get_connection()
    posts = conn.execute(
        "SELECT * FROM posts WHERE status = 'pending' ORDER BY id DESC"
    ).fetchall()
    data = [serialize_post(post, conn) for post in posts]
    conn.close()
    return jsonify(data)


@posts_bp.route("/admin/posts/<int:post_id>/approve", methods=["POST"])
def admin_aprobar_post(post_id):
    if not is_admin_request():
        return jsonify({"error": "No autorizado"}), 401

    conn = get_connection()
    post = get_post_row(conn, post_id)
    if not post:
        conn.close()
        return jsonify({"error": "Post no encontrado"}), 404

    conn.execute(
        """
        UPDATE posts
        SET status = 'approved', reviewed_at = ?, reviewed_by = ?, rejection_reason = NULL
        WHERE id = ?
        """,
        (utc_now_iso(), "admin", post_id),
    )
    owner_id = get_post_owner_id(conn, post)
    create_notification(
        conn,
        owner_id,
        {"id": 0, "nombre": "Administracion"},
        "post_approved",
        "Tu publicacion fue aprobada",
        f'La publicacion "{post["titulo"] or "Sin titulo"}" ya esta visible para los vecinos.',
        "publicaciones.html",
        post_id,
    )
    conn.commit()
    conn.close()
    return jsonify({"mensaje": "Publicacion aprobada"})


@posts_bp.route("/admin/posts/<int:post_id>/reject", methods=["POST"])
def admin_rechazar_post(post_id):
    if not is_admin_request():
        return jsonify({"error": "No autorizado"}), 401

    data = request.json or {}
    reason = (data.get("reason") or "").strip()
    conn = get_connection()
    post = get_post_row(conn, post_id)
    if not post:
        conn.close()
        return jsonify({"error": "Post no encontrado"}), 404

    conn.execute(
        """
        UPDATE posts
        SET status = 'rejected', reviewed_at = ?, reviewed_by = ?, rejection_reason = ?
        WHERE id = ?
        """,
        (utc_now_iso(), "admin", reason, post_id),
    )
    owner_id = get_post_owner_id(conn, post)
    create_notification(
        conn,
        owner_id,
        {"id": 0, "nombre": "Administracion"},
        "post_rejected",
        "Tu publicacion necesita cambios",
        reason or "Tu publicacion fue rechazada por administracion.",
        "publicaciones.html",
        post_id,
    )
    conn.commit()
    conn.close()
    return jsonify({"mensaje": "Publicacion rechazada"})


@posts_bp.route("/admin/notifications", methods=["GET"])
def admin_notifications():
    if not is_admin_request():
        return jsonify({"error": "No autorizado"}), 401

    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM admin_notifications ORDER BY id DESC"
    ).fetchall()
    unread_count = conn.execute(
        "SELECT COUNT(*) AS total FROM admin_notifications WHERE leida = 0"
    ).fetchone()["total"]
    conn.close()
    return jsonify({"items": [dict(row) for row in rows], "unread_count": unread_count})


@posts_bp.route("/admin/notifications/read-all", methods=["POST"])
def admin_notifications_read_all():
    if not is_admin_request():
        return jsonify({"error": "No autorizado"}), 401

    conn = get_connection()
    conn.execute("UPDATE admin_notifications SET leida = 1")
    conn.commit()
    conn.close()
    return jsonify({"mensaje": "ok"})


@posts_bp.route("/events", methods=["GET"])
def obtener_eventos():
    conn = get_connection()
    current_user = optional_user()
    if current_user:
        eventos = conn.execute(
            """
            SELECT * FROM events
            WHERE status = 'approved' OR author_id = ?
            ORDER BY id DESC
            """,
            (current_user["id"],),
        ).fetchall()
    else:
        eventos = conn.execute(
            "SELECT * FROM events WHERE status = 'approved' ORDER BY id DESC"
        ).fetchall()
    data = [dict(evento) for evento in eventos]
    conn.close()
    return jsonify(data)


@posts_bp.route("/events", methods=["POST"])
@requiere_token
def crear_evento():
    data = request.json or {}
    titulo = (data.get("titulo") or "").strip()
    descripcion = (data.get("descripcion") or "").strip()
    fecha = (data.get("fecha") or "").strip()
    hora = (data.get("hora") or "").strip()
    categoria = (data.get("categoria") or "Comunitario").strip() or "Comunitario"
    if not titulo:
        return jsonify({"error": "Titulo obligatorio"}), 400

    usuario = request.usuario_actual
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO events (titulo, descripcion, fecha, hora, categoria, autor, author_id, created_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (titulo, descripcion, fecha, hora, categoria, usuario.get("nombre") or "Vecino", usuario.get("id"), utc_now_iso(), "pending"),
    )
    event_id = cursor.lastrowid
    evento = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    create_admin_notification(
        conn,
        "event_pending",
        "Nuevo evento pendiente",
        f"{usuario.get('nombre') or 'Un vecino'} envio un evento para revision.",
        "admin.html",
        event_id,
    )
    conn.commit()
    conn.close()
    return jsonify(dict(evento)), 201


@posts_bp.route("/events/mine", methods=["GET"])
@requiere_token
def mis_eventos():
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM events WHERE author_id = ? ORDER BY id DESC",
        (request.usuario_actual["id"],),
    ).fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])


@posts_bp.route("/events/<int:event_id>", methods=["PUT"])
@requiere_token
def actualizar_evento(event_id):
    data = request.json or {}
    conn = get_connection()
    evento = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    if not evento:
        conn.close()
        return jsonify({"error": "Evento no encontrado"}), 404

    if evento["author_id"] != request.usuario_actual["id"]:
        conn.close()
        return jsonify({"error": "No puedes editar este evento"}), 403

    titulo = (data.get("titulo") or evento["titulo"] or "").strip()
    descripcion = (data.get("descripcion") or "").strip()
    fecha = (data.get("fecha") or "").strip()
    hora = (data.get("hora") or "").strip()
    categoria = (data.get("categoria") or evento["categoria"] or "Comunitario").strip() or "Comunitario"

    conn.execute(
        """
        UPDATE events
        SET titulo = ?, descripcion = ?, fecha = ?, hora = ?, categoria = ?,
            status = 'pending', reviewed_at = NULL, reviewed_by = NULL, rejection_reason = NULL
        WHERE id = ?
        """,
        (titulo, descripcion, fecha, hora, categoria, event_id),
    )
    create_admin_notification(
        conn,
        "event_pending",
        "Evento editado pendiente",
        f"{request.usuario_actual.get('nombre') or 'Un vecino'} actualizo un evento y espera revision.",
        "admin.html",
        event_id,
    )
    conn.commit()
    updated = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    conn.close()
    return jsonify(dict(updated))


@posts_bp.route("/events/<int:event_id>", methods=["DELETE"])
@requiere_token
def eliminar_evento(event_id):
    conn = get_connection()
    evento = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    if not evento:
        conn.close()
        return jsonify({"error": "Evento no encontrado"}), 404

    if evento["author_id"] != request.usuario_actual["id"]:
        conn.close()
        return jsonify({"error": "No puedes eliminar este evento"}), 403

    conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
    conn.commit()
    conn.close()
    return jsonify({"mensaje": "Evento eliminado"})


@posts_bp.route("/admin/events/pending", methods=["GET"])
def admin_eventos_pendientes():
    if not is_admin_request():
        return jsonify({"error": "No autorizado"}), 401

    conn = get_connection()
    eventos = conn.execute(
        "SELECT * FROM events WHERE status = 'pending' ORDER BY id DESC"
    ).fetchall()
    conn.close()
    return jsonify([dict(evento) for evento in eventos])


@posts_bp.route("/admin/events/<int:event_id>/approve", methods=["POST"])
def admin_aprobar_evento(event_id):
    if not is_admin_request():
        return jsonify({"error": "No autorizado"}), 401

    conn = get_connection()
    evento = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    if not evento:
        conn.close()
        return jsonify({"error": "Evento no encontrado"}), 404

    conn.execute(
        """
        UPDATE events
        SET status = 'approved', reviewed_at = ?, reviewed_by = ?, rejection_reason = NULL
        WHERE id = ?
        """,
        (utc_now_iso(), "admin", event_id),
    )
    create_notification(
        conn,
        evento["author_id"],
        {"id": 0, "nombre": "Administracion"},
        "event_approved",
        "Tu evento fue aprobado",
        f'El evento "{evento["titulo"]}" ya es visible para la comunidad.',
        "eventos.html",
        event_id,
    )
    conn.commit()
    conn.close()
    return jsonify({"mensaje": "Evento aprobado"})


@posts_bp.route("/admin/events/<int:event_id>/reject", methods=["POST"])
def admin_rechazar_evento(event_id):
    if not is_admin_request():
        return jsonify({"error": "No autorizado"}), 401

    data = request.json or {}
    reason = (data.get("reason") or "").strip()
    conn = get_connection()
    evento = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    if not evento:
        conn.close()
        return jsonify({"error": "Evento no encontrado"}), 404

    conn.execute(
        """
        UPDATE events
        SET status = 'rejected', reviewed_at = ?, reviewed_by = ?, rejection_reason = ?
        WHERE id = ?
        """,
        (utc_now_iso(), "admin", reason, event_id),
    )
    create_notification(
        conn,
        evento["author_id"],
        {"id": 0, "nombre": "Administracion"},
        "event_rejected",
        "Tu evento necesita cambios",
        reason or "Tu evento fue rechazado por administracion.",
        "eventos.html",
        event_id,
    )
    conn.commit()
    conn.close()
    return jsonify({"mensaje": "Evento rechazado"})
