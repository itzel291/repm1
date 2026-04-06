/**
 * CAMBIAR-PASSWORD.JS - Cambiar contraseña con token de recuperación
 */

const API_URL = `${window.location.protocol}//${window.location.hostname}:8000`;

const cambiarPasswordForm = document.getElementById('cambiarPasswordForm');
const btnCambiar = document.getElementById('btnCambiar');
const mensajeDiv = document.getElementById('mensaje');
const inputPassword = document.getElementById('nueva_password');
const passwordStrengthBar = document.getElementById('passwordStrengthBar');

// Obtener token de la URL
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');

// Mostrar mensaje
function mostrarMensaje(texto, tipo = 'info') {
    mensajeDiv.textContent = texto;
    mensajeDiv.className = `mensaje ${tipo} show`;
    mensajeDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    setTimeout(() => {
        mensajeDiv.classList.remove('show');
    }, 7000);
}

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

// Validar que las contraseñas coincidan
function validarPasswords() {
    const password = document.getElementById('nueva_password').value;
    const passwordConfirm = document.getElementById('confirmar_password').value;
    
    if (password !== passwordConfirm) {
        document.getElementById('confirmar_password').setCustomValidity('Las contraseñas no coinciden');
        return false;
    } else {
        document.getElementById('confirmar_password').setCustomValidity('');
        return true;
    }
}

document.getElementById('confirmar_password').addEventListener('input', validarPasswords);

// Validar token al cargar la página
async function validarToken() {
    if (!token) {
        mostrarMensaje('❌ Token de recuperación no válido', 'error');
        btnCambiar.disabled = true;
        return false;
    }
    
    try {
        const xmlData = `
            <validarTokenRequest>
                <token>${token}</token>
            </validarTokenRequest>
        `;
        
        const response = await fetch(`${API_URL}/auth/validar-token-recuperacion`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/xml'
            },
            body: xmlData.trim()
        });
        
        const responseText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(responseText, 'application/xml');
        
        const valido = xmlDoc.getElementsByTagName('valido')[0]?.textContent;
        
        if (valido === 'true') {
            const nombre = xmlDoc.getElementsByTagName('nombre')[0]?.textContent;
            mostrarMensaje(`✅ Token válido. Hola, ${nombre}`, 'exito');
            btnCambiar.disabled = false;
            return true;
        } else {
            mostrarMensaje('❌ El token de recuperación ha expirado o es inválido', 'error');
            btnCambiar.disabled = true;
            return false;
        }

    } catch (error) {
        console.error('Error al validar token:', error);
        mostrarMensaje('Error de conexión al validar el token. Verifica que la API esté activa.', 'error');
        btnCambiar.disabled = true;
        return false;
    }
}

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

// Cambiar contraseña
async function cambiarPassword(nuevaPassword) {
    try {
        btnCambiar.disabled = true;
        btnCambiar.classList.add('loading');
        btnCambiar.textContent = 'Cambiando...';
        
        const xmlData = `
            <cambiarPasswordRequest>
                <token>${token}</token>
                <nueva_password>${escapeXML(nuevaPassword)}</nueva_password>
            </cambiarPasswordRequest>
        `;
        
        const response = await fetch(`${API_URL}/auth/cambiar-password`, {
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
            // Mostrar mensaje de éxito
            document.querySelector('.auth-card').innerHTML = `
                <div class="success-container">
                    <div class="success-icon">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path>
                        </svg>
                    </div>
                    <h2 class="success-title">¡Contraseña cambiada con éxito!</h2>
                    <p class="success-message">
                        Tu seguridad es nuestra prioridad. Ahora puedes acceder a tu cuenta con la nueva contraseña.
                    </p>
                    <a href="login.html" class="btn btn-primary">
                        Ir al inicio de sesión →
                    </a>
                </div>
            `;
            
            // Redirigir automáticamente después de 3 segundos
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 3000);
        } else {
            mostrarMensaje(mensaje, 'error');
        }
        
    } catch (error) {
        console.error('Error:', error);
        mostrarMensaje('Error de conexión. Verifica que la API esté activa.', 'error');
    } finally {
        btnCambiar.disabled = false;
        btnCambiar.classList.remove('loading');
        btnCambiar.textContent = 'Restablecer contraseña';
    }
}

// Manejar envío del formulario
cambiarPasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const nuevaPassword = document.getElementById('nueva_password').value;
    const confirmarPassword = document.getElementById('confirmar_password').value;
    
    // Validaciones
    if (nuevaPassword.length < 6) {
        mostrarMensaje('La contraseña debe tener al menos 6 caracteres', 'error');
        return;
    }
    
    if (nuevaPassword !== confirmarPassword) {
        mostrarMensaje('Las contraseñas no coinciden', 'error');
        return;
    }
    
    await cambiarPassword(nuevaPassword);
});

// Validar token al cargar la página
window.addEventListener('DOMContentLoaded', () => {
    validarToken();
});
