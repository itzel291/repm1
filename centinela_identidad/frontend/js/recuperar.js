/**
 * RECUPERAR.JS - Solicitar recuperación de contraseña
 */

const API_URL = `${window.location.protocol}//${window.location.hostname}:8000`;

const recuperarForm = document.getElementById('recuperarForm');
const btnRecuperar = document.getElementById('btnRecuperar');
const mensajeDiv = document.getElementById('mensaje');

// Mostrar mensaje
function mostrarMensaje(texto, tipo = 'info') {
    mensajeDiv.textContent = texto;
    mensajeDiv.className = `mensaje ${tipo} show`;
    
    setTimeout(() => {
        mensajeDiv.classList.remove('show');
    }, 10000); // 10 segundos para que pueda copiar el link
}

// Solicitar recuperación
async function solicitarRecuperacion(email) {
    try {
        btnRecuperar.disabled = true;
        btnRecuperar.classList.add('loading');
        btnRecuperar.textContent = 'Enviando...';
        
        const xmlData = `
            <recuperacionRequest>
                <email>${email}</email>
            </recuperacionRequest>
        `;
        
        const response = await fetch(`${API_URL}/auth/solicitar-recuperacion`, {
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
            mostrarMensaje(
                '✅ ' + mensaje + '\n\n💡 MODO DESARROLLO: Revisa la consola del servidor backend para ver el link de recuperación.',
                'exito'
            );
            
            recuperarForm.reset();
            
            // Mostrar instrucciones adicionales
            setTimeout(() => {
                mensajeDiv.innerHTML = `
                    <strong>📧 Correo de recuperación enviado</strong><br><br>
                    <strong>MODO DESARROLLO:</strong> El link de recuperación se imprimió en la consola del servidor backend.<br><br>
                    Para usar email real en producción, configura tu servidor SMTP en <code>email_service.py</code>
                `;
            }, 2000);
        } else {
            mostrarMensaje(mensaje, 'error');
        }
        
    } catch (error) {
        console.error('Error:', error);
        mostrarMensaje('Error de conexión. Verifica que la API esté activa.', 'error');
    } finally {
        btnRecuperar.disabled = false;
        btnRecuperar.classList.remove('loading');
        btnRecuperar.textContent = 'Enviar enlace';
    }
}

// Manejar envío del formulario
recuperarForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value.trim().toLowerCase();
    
    if (!email) {
        mostrarMensaje('Por favor, ingresa tu email', 'error');
        return;
    }
    
    await solicitarRecuperacion(email);
});
