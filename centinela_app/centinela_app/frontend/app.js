// ── Recibir token desde Centinela si vino en la URL ──────
const params = new URLSearchParams(window.location.search)
if (params.get('token')) {
    localStorage.setItem('token', params.get('token'))
    localStorage.setItem('usuarioActual', params.get('usuario') || 'Vecino')
    localStorage.setItem('nombre', params.get('usuario') || 'Vecino')
    if (params.get('casa')) localStorage.setItem('numeroCasa', params.get('casa'))
    window.history.replaceState({}, '', '/')
}

const API = "http://localhost:5002/posts"
const token = localStorage.getItem('token')
const usuarioActual = localStorage.getItem('usuarioActual')

if (!token || !usuarioActual) {
    window.location.href = "http://localhost:3000/login.html"
}

async function cargarPosts() {
    try {
        const res = await fetch(API)
        const data = await res.json()
        let html = ""

        if (data.length === 0) {
            html = "<p>No hay publicaciones aún. ¡Sé el primero en publicar!</p>"
        }

        data.forEach(post => {
            html += `
            <div class="post">
                <div class="autor">Publicado por: ${post.autor}</div>
                <h3>${post.titulo}</h3>
                <div class="contenido">${post.contenido}</div>
            </div>
            `
        })

        document.getElementById("posts").innerHTML = html

    } catch (error) {
        console.error("Error cargando posts:", error)
        document.getElementById("posts").innerHTML = "<p>Error al cargar publicaciones.</p>"
    }
}

async function crearPost() {
    const titulo = document.getElementById("titulo").value.trim()
    const contenido = document.getElementById("contenido").value.trim()

    if (!titulo || !contenido) {
        return alert("Completa el título y el contenido")
    }

    try {
        const res = await fetch(API, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Token ${token}`
            },
            body: JSON.stringify({ titulo, contenido })
        })

        if (res.status === 401) {
            alert("Sesión expirada. Inicia sesión nuevamente.")
            localStorage.clear()
            window.location.href = "http://localhost:3000/login.html"
            return
        }

        document.getElementById("titulo").value = ""
        document.getElementById("contenido").value = ""
        cargarPosts()

    } catch (error) {
        alert("Error de conexión con el servidor.")
        console.error(error)
    }
}

cargarPosts()

