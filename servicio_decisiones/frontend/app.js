const API = "http://127.0.0.1:8000";

async function cargarConsultas() {
    const res = await fetch(`${API}/consultas/`);
    const xmlText = await res.text();
    document.getElementById("consultas").innerText = xmlText;
}

async function votar(usuarioId, consultaId, opcionId) {
    const xml = `
    <voto>
        <usuario_id>${usuarioId}</usuario_id>
        <consulta_id>${consultaId}</consulta_id>
        <opcion_id>${opcionId}</opcion_id>
    </voto>`;

    const res = await fetch(`${API}/votos/`, {
        method: "POST",
        headers: { "Content-Type": "application/xml" },
        body: xml
    });

    alert(await res.text());
}

async function crearConsulta() {
    const pregunta = document.getElementById("pregunta").value;
    const op1 = document.getElementById("op1").value;
    const op2 = document.getElementById("op2").value;

    const xml = `
    <consulta>
        <pregunta>${pregunta}</pregunta>
        <opciones>
            <opcion>${op1}</opcion>
            <opcion>${op2}</opcion>
        </opciones>
    </consulta>`;

    const res = await fetch(`${API}/admin/crear-consulta`, {
        method: "POST",
        headers: { "Content-Type": "application/xml" },
        body: xml
    });

    alert(await res.text());
}
