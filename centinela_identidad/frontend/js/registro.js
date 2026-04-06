/**
 * REGISTRO.JS - Registro de nuevos usuarios con geolocalización
 */

const runtime = window.CentinelaRuntime;
const API_URL = runtime ? runtime.serviceUrl(8000) : 'http://localhost:8000';

const registroForm = document.getElementById('registroForm');
const btnRegistro = document.getElementById('btnRegistro');
const mensajeDiv = document.getElementById('mensaje');
const inputEdad = document.getElementById('edad');
const edadInfo = document.getElementById('edad-info');
const inputPassword = document.getElementById('password');
const passwordStrengthBar = document.getElementById('passwordStrengthBar');
const geoStatusDiv = document.getElementById('geoStatus');

// El botón siempre está activo; la ubicación es opcional
btnRegistro.disabled = false;

// Mostrar mensaje
function mostrarMensaje(texto, tipo = 'info') {
    mensajeDiv.textContent = texto;
    mensajeDiv.className = `mensaje ${tipo} show`;
    mensajeDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    setTimeout(() => {
        mensajeDiv.classList.remove('show');
    }, 7000);
}

// Actualizar el indicador de estado de geolocalización
function mostrarGeoStatus(texto, tipo) {
    if (!geoStatusDiv) return;
    geoStatusDiv.textContent = texto;
    geoStatusDiv.className = `geo-status geo-status-${tipo}`;
    geoStatusDiv.style.display = 'block';
}

// Validar edad y mostrar info
inputEdad.addEventListener('input', () => {
    const edad = parseInt(inputEdad.value);

    if (edad < 18 && edad > 0) {
        edadInfo.textContent = '⚠️ Debes ser mayor de 18 años';
        edadInfo.style.color = '#ef4444';
    } else if (edad >= 18 && edad < 120) {
        edadInfo.textContent = '✓ Edad válida';
        edadInfo.style.color = '#10b981';
    } else {
        edadInfo.textContent = '';
    }
});

// Indicador de fortaleza de contraseña
inputPassword.addEventListener('input', () => {
    const password = inputPassword.value;
    let strength = 0;

    if (password.length >= 6) strength++;
    if (password.length >= 10) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;

    passwordStrengthBar.className = 'password-strength-bar';

    if (strength <= 2) {
        passwordStrengthBar.classList.add('weak');
    } else if (strength <= 4) {
        passwordStrengthBar.classList.add('medium');
    } else {
        passwordStrengthBar.classList.add('strong');
    }
});

// Auto-formatear número de casa
document.getElementById('numero_casa').addEventListener('blur', (e) => {
    let valor = e.target.value.trim();

    if (/^\d+$/.test(valor)) {
        e.target.value = `Casa ${valor}`;
    } else if (valor.toLowerCase().startsWith('casa')) {
        e.target.value = valor.charAt(0).toUpperCase() + valor.slice(1).toLowerCase();
    }
});

// Validar que las contraseñas coincidan
function validarPasswords() {
    const password = document.getElementById('password').value;
    const passwordConfirm = document.getElementById('password_confirm').value;

    if (password !== passwordConfirm) {
        document.getElementById('password_confirm').setCustomValidity('Las contraseñas no coinciden');
        return false;
    } else {
        document.getElementById('password_confirm').setCustomValidity('');
        return true;
    }
}

document.getElementById('password_confirm').addEventListener('input', validarPasswords);

// Función para escapar caracteres XML
function escapeXML(unsafe) {
    if (!unsafe) return '';
    return unsafe.replace(/[<>&'"]/g, function (c) {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
}

// Realizar registro
async function realizarRegistro(nombreCompleto, numeroCasa, edad, email, password) {
    try {
        btnRegistro.disabled = true;
        btnRegistro.classList.add('loading');
        btnRegistro.textContent = 'Registrando...';

        // Obtener datos de ubicación capturados por geo.js
        const geo = window.Geo ? window.Geo.getDatosUbicacion() : null;

        const xmlData = `
            <registroRequest>
                <nombre_completo>${escapeXML(nombreCompleto)}</nombre_completo>
                <numero_casa>${escapeXML(numeroCasa)}</numero_casa>
                <edad>${edad}</edad>
                <email>${escapeXML(email)}</email>
                <password>${escapeXML(password)}</password>
                <latitud>${geo ? geo.latitude : ''}</latitud>
                <longitud>${geo ? geo.longitude : ''}</longitud>
                <direccion>${escapeXML(geo ? (geo.address || '') : '')}</direccion>
                <consentimiento>true</consentimiento>
            </registroRequest>
        `;

        const response = await fetch(`${API_URL}/auth/registro`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/xml'
            },
            body: xmlData.trim()
        });

        const responseText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(responseText, 'application/xml');

        const estado = xmlDoc.getElementsByTagName('estado')[0].textContent;
        const mensaje = xmlDoc.getElementsByTagName('mensaje')[0].textContent;

        if (estado === 'OK') {
            mostrarMensaje('¡Registro exitoso! Redirigiendo al inicio de sesión...', 'exito');
            registroForm.reset();
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        } else {
            mostrarMensaje(mensaje, 'error');
        }

    } catch (error) {
        console.error('Error:', error);
        mostrarMensaje('Error de conexión. Verifica que la API esté activa.', 'error');
    } finally {
        btnRegistro.disabled = false;
        btnRegistro.classList.remove('loading');
        btnRegistro.textContent = 'Registrarme';
    }
}

// Manejar envío del formulario
registroForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nombreCompleto = document.getElementById('nombre_completo').value.trim();
    const numeroCasa = document.getElementById('numero_casa').value.trim();
    const edad = parseInt(document.getElementById('edad').value);
    const email = document.getElementById('email').value.trim().toLowerCase();
    const password = document.getElementById('password').value;
    const passwordConfirm = document.getElementById('password_confirm').value;

    if (nombreCompleto.length < 3) {
        mostrarMensaje('El nombre debe tener al menos 3 caracteres', 'error');
        return;
    }

    if (edad < 18) {
        mostrarMensaje('Debes ser mayor de 18 años para registrarte', 'error');
        return;
    }

    if (password.length < 6) {
        mostrarMensaje('La contraseña debe tener al menos 6 caracteres', 'error');
        return;
    }

    if (password !== passwordConfirm) {
        mostrarMensaje('Las contraseñas no coinciden', 'error');
        return;
    }

    await realizarRegistro(nombreCompleto, numeroCasa, edad, email, password);
});

// ── Iniciar flujo de geolocalización ────────────────────────────────────────
// Los scripts están al final del <body>, el DOM ya está listo — no necesitamos DOMContentLoaded.

console.log('[registro.js] cargado, iniciando flujo de geolocalización...');

if (!window.Geo) {
    console.error('[registro.js] window.Geo no disponible — geo.js no se cargó');
    btnRegistro.disabled = false;
} else {
    setTimeout(() => {
        window.Geo.iniciarRegistro(
            {
                onLocationReady: (datos) => {
                    mostrarGeoStatus(
                        `📍 Ubicación obtenida (precisión: ${Math.round(datos.accuracy || 0)} m)`,
                        'success'
                    );
                    const locationDisplay = document.getElementById('locationDisplay');
                    if (locationDisplay) {
                        locationDisplay.value = datos.address
                            ? datos.address
                            : `${datos.latitude.toFixed(6)}, ${datos.longitude.toFixed(6)}`;
                    }
                    btnRegistro.disabled = false;
                    mostrarMensaje('Ubicación verificada. Puedes completar tu registro.', 'exito');
                },

                onConsentRejected: () => {
                    mostrarGeoStatus('📍 Ubicación no disponible (opcional)', 'warning');
                    const locationDisplay = document.getElementById('locationDisplay');
                    if (locationDisplay) {
                        locationDisplay.value = '';
                        locationDisplay.placeholder = 'Ubicación no disponible (opcional)';
                        locationDisplay.style.color = '#9ca3af';
                    }
                },

                onLocationDenied: () => {
                    mostrarGeoStatus('📍 Ubicación no disponible (opcional)', 'warning');
                    const locationDisplay = document.getElementById('locationDisplay');
                    if (locationDisplay) {
                        locationDisplay.value = '';
                        locationDisplay.placeholder = 'Ubicación no disponible (opcional)';
                        locationDisplay.style.color = '#9ca3af';
                    }
                },
            },
            ''
        );
    }, 300);
}
