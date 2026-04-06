from flask import Flask, send_from_directory
from flask_cors import CORS

# auth_bp ya no se usa — login va por Centinela (:8000)
from routes.posts import posts_bp

app = Flask(__name__)
CORS(app)

app.register_blueprint(posts_bp)

@app.route("/")
def home():
    return send_from_directory("../frontend", "index.html")

@app.route("/<path:path>")
def static_files(path):
    return send_from_directory("../frontend", path)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002, debug=True)  # ← puerto cambiado a 5002

