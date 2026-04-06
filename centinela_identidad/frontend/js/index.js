/**
 * INDEX.JS - Página inicial de Centinela
 */

// Verificar si ya hay sesión activa
window.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    
    if (token) {
        // Ya hay sesión activa, verificar si es válida
        verificarSesion(token);
    }
});

async function verificarSesion(token) {
    try {
        const xmlData = `
            <verificarRequest>
                <token>${token}</token>
            </verificarRequest>
        `;
        
        const response = await fetch('http://10.0.35.195:8000/auth/verificar-sesion', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/xml'
            },
            body: xmlData.trim()
        });
        
        const responseText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(responseText, 'application/xml');
        const estado = xmlDoc.getElementsByTagName('valido')[0]?.textContent;
        
        if (estado === 'true') {
            // Sesión válida, redirigir a dashboard
            alert('Ya tienes una sesión activa');
            // window.location.href = 'dashboard.html'; // Cuando tengas el dashboard
        } else {
            // Token inválido, limpiar
            localStorage.clear();
        }
    } catch (error) {
        console.error('Error al verificar sesión:', error);
        localStorage.clear();
    }
}

