const API_URL = "http://127.0.0.1:5001/api";
let listaGlobalIncidencias = []; // Memoria global para abrir el modal de detalles rápido

// ==========================================
// 1. SESIÓN Y MENÚS
// ==========================================
const usuarioActual = localStorage.getItem('usuarioActual');
const rolActual = localStorage.getItem('rolActual');

if (!usuarioActual || !rolActual) window.location.href = 'login.html';

function cerrarSesion() {
    localStorage.removeItem('usuarioActual');
    localStorage.removeItem('rolActual');
    window.location.href = 'login.html';
}

function toggleMenuSesion() { document.getElementById('menuSesion').classList.toggle('hidden'); }
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('-translate-x-full');
    document.getElementById('sidebar-overlay').classList.toggle('hidden');
    setTimeout(() => { if (mapaPrincipal) mapaPrincipal.invalidateSize(); }, 300);
}

// ==========================================
// 2. REVERSE GEOCODING (CALLES)
// ==========================================
async function obtenerNombreCalle(lat, lon, idElemento) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
        const data = await res.json();
        const calle = data?.address?.road || data?.address?.neighbourhood || data?.address?.suburb || "Ubicación detectada";
        
        // Buscar todos los elementos que deban mostrar la calle (en la tarjeta)
        const elementos = document.querySelectorAll(`.calle-display-${idElemento}`);
        elementos.forEach(el => el.innerText = calle);
    } catch (error) {
        console.log("Error obteniendo calle");
    }
}

// ==========================================
// 3. MAPAS LEAFLET
// ==========================================
let mapaPrincipal = null;
let marcadoresActivos = [];
let miUbicacionLatLng = null;
let mapModal;
let markerModal;

const crearIcono = (color) => new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${color}.png`,
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});
const iconRojo = crearIcono('red');
const iconNaranja = crearIcono('orange');
const iconAzulClaro = crearIcono('lightblue');
const iconAzul = crearIcono('blue'); // Para el usuario

function inicializarMapaPrincipal() {
    if (mapaPrincipal) return; 
    mapaPrincipal = L.map('mapa-principal').setView([19.4326, -99.1332], 10);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapaPrincipal);
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
            miUbicacionLatLng = [pos.coords.latitude, pos.coords.longitude];
            L.marker(miUbicacionLatLng, {icon: iconAzul}).addTo(mapaPrincipal).bindPopup("📍 <b>Tú</b>");
        });
    }
}

function centrarMapaPrincipalEnUsuario() {
    if (miUbicacionLatLng && mapaPrincipal) mapaPrincipal.setView(miUbicacionLatLng, 15);
}

function verEnMapaPrincipal(event, lat, lng) {
    event.stopPropagation(); // Evitar que se abra el modal de detalles
    if (mapaPrincipal) {
        document.getElementById('mapa-principal').scrollIntoView({ behavior: 'smooth', block: 'center' });
        mapaPrincipal.flyTo([lat, lng], 17, { animate: true, duration: 1.5 });
    }
}

function inicializarMapaOSM() {
    if (mapModal) return; 
    mapModal = L.map('mapa-osm').setView([19.4326, -99.1332], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapModal);
    markerModal = L.marker([19.4326, -99.1332], {draggable: true}).addTo(mapModal);
    markerModal.on('dragend', () => actualizarCoordenadasModal(markerModal.getLatLng().lat, markerModal.getLatLng().lng));
    mapModal.on('click', (e) => { markerModal.setLatLng(e.latlng); actualizarCoordenadasModal(e.latlng.lat, e.latlng.lng); });
}

function actualizarCoordenadasModal(lat, lng) {
    document.getElementById('latitud').value = lat;
    document.getElementById('longitud').value = lng;
}

// ==========================================
// 4. MÚLTIPLES FOTOS A BASE64
// ==========================================
const convertirMultiplesBase64 = async (files) => {
    const promesas = Array.from(files).map(file => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    });
    return Promise.all(promesas); // Retorna un array de strings base64
}

// ==========================================
// 5. LÓGICA CRUD E INTERFAZ
// ==========================================
async function cargarIncidencias() {
    try {
        const response = await fetch(`${API_URL}/consultar_incidencias?rol=${rolActual}`);
        const strXml = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(strXml, "text/xml");
        const incidenciasXml = xmlDoc.getElementsByTagName("incidencia");
        
        const contenedor = document.getElementById("contenedor-incidencias");
        contenedor.innerHTML = ""; 
        listaGlobalIncidencias = []; // Limpiar memoria
        let datosParaMapaGeneral = [];
        marcadoresActivos.forEach(m => mapaPrincipal?.removeLayer(m));
        marcadoresActivos = [];

        if(incidenciasXml.length === 0) {
            contenedor.innerHTML = `<p class="col-span-full text-center text-slate-500 py-10">No hay incidencias reportadas.</p>`;
            return;
        }

        for (let i = 0; i < incidenciasXml.length; i++) {
            const xml = incidenciasXml[i];
            
            // Extraer datos creando un objeto
            const inc = {
                id: xml.getElementsByTagName("id")[0].textContent,
                usuario: xml.getElementsByTagName("usuario")[0].textContent,
                desc: xml.getElementsByTagName("descripcion")[0].textContent,
                fecha: xml.getElementsByTagName("fecha")[0].textContent,
                hora: xml.getElementsByTagName("hora")[0]?.textContent || "--:--",
                prioridad: xml.getElementsByTagName("prioridad")[0]?.textContent || "Baja",
                estado: xml.getElementsByTagName("estado")[0]?.textContent || "Abierto",
                lat: xml.getElementsByTagName("latitud")[0]?.textContent || "",
                lon: xml.getElementsByTagName("longitud")[0]?.textContent || "",
                imagenesString: xml.getElementsByTagName("imagenes")[0]?.textContent || "[]"
            };
            
            // Guardar en memoria global para el modal de detalles
            listaGlobalIncidencias.push(inc);

            const estaActiva = (inc.estado !== 'Eliminado');
            const esMia = (inc.usuario === usuarioActual);
            const esAdmin = (rolActual === 'admin');

            // --- Lógica de Color por Prioridad ---
            let colorBorde = "bg-blue-500";
            let colorBgHover = "hover:shadow-blue-500/20";
            let colorBadgePrioridad = "bg-blue-100 text-blue-700 border-blue-200";
            let iconoMapaPin = iconAzulClaro;

            if (inc.prioridad === 'Crítica') {
                colorBorde = "bg-red-600";
                colorBgHover = "bg-red-50/30 dark:bg-red-900/10 hover:shadow-red-500/30 border-red-200 dark:border-red-800/50";
                colorBadgePrioridad = "bg-red-100 text-red-700 border-red-300 shadow-sm animate-pulse";
                iconoMapaPin = iconRojo;
            } else if (inc.prioridad === 'Media') {
                colorBorde = "bg-yellow-500";
                colorBadgePrioridad = "bg-yellow-100 text-yellow-700 border-yellow-300";
                iconoMapaPin = iconNaranja;
            }

            if (estaActiva && inc.lat && inc.lon) {
                datosParaMapaGeneral.push(inc);
                if (mapaPrincipal) {
                    let marker = L.marker([inc.lat, inc.lon], {icon: iconoMapaPin}).addTo(mapaPrincipal);
                    marker.bindPopup(`<b>#${inc.id} - ${inc.prioridad}</b><br>${inc.desc}`);
                    marcadoresActivos.push(marker);
                }
            }

            // Botones acción
            let btnAccionHtml = "";
            if (estaActiva && (esAdmin || esMia)) {
                btnAccionHtml = `<button onclick="eliminarIncidencia(event, '${inc.id}')" class="text-slate-400 hover:text-red-500 bg-white dark:bg-slate-800 p-1.5 rounded-lg shadow-sm" title="Ocultar"><span class="material-icons-round text-lg">delete</span></button>`;
            } else if (!estaActiva && esAdmin) {
                btnAccionHtml = `<button onclick="reactivarIncidencia(event, '${inc.id}')" class="text-slate-400 hover:text-emerald-500 bg-white dark:bg-slate-800 p-1.5 rounded-lg shadow-sm" title="Reactivar"><span class="material-icons-round text-lg">restore</span></button>`;
            }

            let badgeEstado = estaActiva 
                ? `<span class="px-2 py-0.5 text-[10px] font-bold rounded uppercase border bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600">Activa</span>`
                : `<span class="px-2 py-0.5 text-[10px] font-bold rounded uppercase border bg-slate-200 text-slate-500 dark:bg-slate-700 border-slate-300 dark:border-slate-600">Eliminada</span>`;

            // Extraer la primera imagen para la portada
            let arrImgs = [];
            try { arrImgs = JSON.parse(inc.imagenesString); } catch(e){}
            let htmlImagen = arrImgs.length > 0 ? `<div class="h-40 w-full mb-3 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 relative"><img src="${arrImgs[0]}" class="w-full h-full object-cover"><div class="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-md backdrop-blur-sm">+${arrImgs.length} fotos</div></div>` : "";
            
            let htmlMapa = (inc.lat && inc.lon) ? `<button onclick="verEnMapaPrincipal(event, ${inc.lat}, ${inc.lon})" class="flex items-center gap-1 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 px-2 py-1.5 rounded-lg hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all"><span class="material-icons-round text-sm text-blue-500">my_location</span></button>` : "";

            const tarjeta = `
                <div onclick="abrirModalDetalles('${inc.id}')" class="cursor-pointer bg-surface-light dark:bg-surface-dark rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-md ${colorBgHover} ${estaActiva ? 'opacity-100' : 'opacity-60 grayscale'}">
                    <div class="absolute left-0 top-0 bottom-0 w-1.5 ${colorBorde}"></div>
                    
                    <div class="flex justify-between items-start mb-3 pl-2">
                        <div class="flex flex-col gap-1.5">
                            <div class="flex items-center gap-2">
                                <span class="px-2 py-0.5 text-[10px] font-extrabold rounded uppercase border ${colorBadgePrioridad}">${inc.prioridad}</span>
                                ${badgeEstado}
                            </div>
                            <span class="text-[11px] text-slate-400 font-bold tracking-widest uppercase">ID-${inc.id}</span>
                        </div>
                        <div class="flex gap-2 items-center z-10">
                            ${htmlMapa}
                            ${btnAccionHtml}
                        </div>
                    </div>

                    ${htmlImagen}

                    <div class="pl-2">
                        <p class="text-xs text-slate-500 dark:text-slate-400 mb-2 font-medium flex justify-between items-center">
                            <span><span class="material-icons-round text-[11px] align-middle">person</span> ${inc.usuario}</span>
                            <span>${inc.fecha} ${inc.hora}</span>
                        </p>
                        <p class="text-sm text-slate-700 dark:text-slate-300 line-clamp-2 leading-relaxed mb-2">${inc.desc}</p>
                        <p class="text-[10px] text-slate-400 flex items-center gap-1 truncate"><span class="material-icons-round text-[12px]">place</span> <span class="calle-display-${inc.id}">${inc.lat ? 'Buscando ubicación...' : 'Sin ubicación GPS'}</span></p>
                    </div>
                </div>
            `;
            contenedor.innerHTML += tarjeta;

            if (inc.lat && inc.lon) obtenerNombreCalle(inc.lat, inc.lon, inc.id);
        }

        // Lógica de centrado del mapa general
        if (!miUbicacionLatLng && datosParaMapaGeneral.length > 0 && mapaPrincipal) {
            mapaPrincipal.setView([datosParaMapaGeneral[0].lat, datosParaMapaGeneral[0].lon], 13);
        }

    } catch (error) {
        console.error("Error cargando incidencias:", error);
    }
}

// ==========================================
// 6. ACCIONES: REGISTRAR, ELIMINAR, REACTIVAR
// ==========================================
async function reportar_incidencia() {
    const btn = document.getElementById("btnRegistrar");
    btn.innerText = "Procesando..."; btn.disabled = true;

    const usuario = usuarioActual;
    const fecha = document.getElementById("fecha").value;
    const hora = document.getElementById("hora").value;
    const prioridad = document.getElementById("prioridad").value;
    const descripcion = document.getElementById("descripcion").value;
    const latitud = document.getElementById("latitud").value;
    const longitud = document.getElementById("longitud").value;
    const archivoInput = document.getElementById("fotoInput");
    
    if(!descripcion || !fecha) {
        btn.innerText = "Registrar Incidencia"; btn.disabled = false;
        return alert("Completa la fecha y descripción de los hechos");
    }

    // Convertir todas las imágenes seleccionadas a Base64
    let arregloImagenes = [];
    if (archivoInput.files.length > 0) {
        arregloImagenes = await convertirMultiplesBase64(archivoInput.files);
    }
    const imagenesJSON = JSON.stringify(arregloImagenes); // Array a texto

    const xmlData = `
    <reporte>
        <usuario>${usuario}</usuario>
        <fecha>${fecha}</fecha>
        <hora>${hora}</hora>
        <prioridad>${prioridad}</prioridad>
        <descripcion>${descripcion}</descripcion>
        <latitud>${latitud}</latitud>
        <longitud>${longitud}</longitud>
        <imagenes>${imagenesJSON}</imagenes>
    </reporte>`;

    try {
        const response = await fetch(`${API_URL}/reportar_incidencia`, { method: "POST", headers: { "Content-Type": "application/xml" }, body: xmlData });
        const strXml = await response.text();
        const xmlDoc = new DOMParser().parseFromString(strXml, "text/xml");
        
        if (xmlDoc.getElementsByTagName("estado")[0].textContent === 'OK') {
            cerrarModal();
            document.getElementById("descripcion").value = "";
            document.getElementById("hora").value = "";
            document.getElementById("fotoInput").value = "";
            cargarIncidencias(); 
        } else alert("Error del servidor.");
    } catch (error) {
        alert("Falla de conexión.");
    } finally {
        btn.innerText = "Registrar Incidencia"; btn.disabled = false;
    }
}

async function eliminarIncidencia(event, id) {
    event.stopPropagation();
    if(!confirm("¿Deseas ocultar el reporte #" + id + "?")) return;
    try {
        await fetch(`${API_URL}/eliminar_incidencia`, { method: "POST", headers: { "Content-Type": "application/xml" }, body: `<eliminar><id>${id}</id></eliminar>` });
        cargarIncidencias(); 
    } catch (error) {}
}

async function reactivarIncidencia(event, id) {
    event.stopPropagation();
    if(!confirm("¿Deseas restaurar el reporte #" + id + "?")) return;
    try {
        await fetch(`${API_URL}/reactivar_incidencia`, { method: "POST", headers: { "Content-Type": "application/xml" }, body: `<reactivar><id>${id}</id></reactivar>` });
        cargarIncidencias(); 
    } catch (error) {}
}

// ==========================================
// 7. MODALES (REGISTRO Y DETALLES)
// ==========================================
function abrirModal() {
    document.getElementById('modalRegistro').classList.remove('hidden');
    document.getElementById('modalNombreUsuario').innerText = "Oficial: " + usuarioActual;
    const ahora = new Date();
    if (!document.getElementById("fecha").value) document.getElementById("fecha").value = ahora.toISOString().split('T')[0];
    if (!document.getElementById("hora").value) document.getElementById("hora").value = ahora.toTimeString().slice(0,5);
    
    if (!mapModal) inicializarMapaOSM();
    setTimeout(() => {
        mapModal.invalidateSize();
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
                mapModal.setView([pos.coords.latitude, pos.coords.longitude], 15);
                markerModal.setLatLng([pos.coords.latitude, pos.coords.longitude]);
                actualizarCoordenadasModal(pos.coords.latitude, pos.coords.longitude);
            });
        }
    }, 200);
}

function cerrarModal() { document.getElementById('modalRegistro').classList.add('hidden'); }

// Modal de Detalles Completos
function abrirModalDetalles(id) {
    const inc = listaGlobalIncidencias.find(i => i.id === id);
    if(!inc) return;

    document.getElementById('detId').innerText = inc.id;
    document.getElementById('detUser').innerText = inc.usuario;
    document.getElementById('detFecha').innerText = inc.fecha;
    document.getElementById('detHora').innerText = inc.hora;
    document.getElementById('detDesc').innerText = inc.desc;
    
    document.getElementById('detEstadoBadge').innerText = inc.estado;
    const badgePrio = document.getElementById('detPrioridadBadge');
    badgePrio.innerText = inc.prioridad;
    badgePrio.className = `px-3 py-1 text-xs font-bold rounded-md uppercase tracking-wide border ${inc.prioridad==='Crítica'?'bg-red-100 text-red-700 border-red-300': inc.prioridad==='Media'?'bg-yellow-100 text-yellow-700 border-yellow-300':'bg-blue-100 text-blue-700 border-blue-300'}`;

    // Buscar calle guardada en el DOM de la tarjeta original
    const calleDOM = document.querySelector(`.calle-display-${id}`);
    document.getElementById('detCalle').innerText = calleDOM ? calleDOM.innerText : (inc.lat ? "Cargando..." : "Sin ubicación");

    // Llenar Galería
    const galeria = document.getElementById('detGaleria');
    galeria.innerHTML = "";
    try {
        const arrImgs = JSON.parse(inc.imagenesString);
        if (arrImgs.length === 0) {
            galeria.innerHTML = "<p class='text-sm text-slate-400 col-span-full'>No hay fotos adjuntas.</p>";
        } else {
            arrImgs.forEach(b64 => {
                galeria.innerHTML += `<a href="${b64}" target="_blank"><img src="${b64}" class="w-full h-32 object-cover rounded-lg border border-slate-200 dark:border-slate-700 hover:opacity-80 transition-opacity"></a>`;
            });
        }
    } catch(e) { galeria.innerHTML = "<p class='text-red-500'>Error leyendo imágenes</p>"; }

    document.getElementById('modalDetalles').classList.remove('hidden');
}

function cerrarModalDetalles() { document.getElementById('modalDetalles').classList.add('hidden'); }

// ==========================================
// 8. INICIO
// ==========================================
document.getElementById('theme-toggle').addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
});
if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.classList.add('dark');

document.addEventListener("DOMContentLoaded", () => {
    inicializarMapaPrincipal();
    cargarIncidencias();
    if(document.getElementById('displayNombreUser')) document.getElementById('displayNombreUser').innerText = usuarioActual;
    if(document.getElementById('displayRolUser')) document.getElementById('displayRolUser').innerText = rolActual === 'admin' ? 'Administrador' : 'Oficial';
    if(document.getElementById('displayInicialUser')) document.getElementById('displayInicialUser').innerText = usuarioActual.charAt(0).toUpperCase();
});