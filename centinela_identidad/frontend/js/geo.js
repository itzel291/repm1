/**
 * GEO.JS - Módulo de geolocalización para Centinela
 */

console.log('[geo.js] cargado correctamente');

window.Geo = (function () {
    'use strict';

    const runtime = window.CentinelaRuntime;
    const API_URL = runtime ? runtime.serviceUrl(8000) : 'http://localhost:8000';

    let watchId = null;
    let datosUbicacion = null;

    // ── Modal de privacidad ─────────────────────────────────────────────────
    // El modal ya está en el HTML de registro.html; solo lo mostramos/ocultamos.

    function mostrarModalPrivacidad() {
        return new Promise((resolve) => {
            const modal = document.getElementById('geoPrivacyModal');

            if (!modal) {
                // Si no hay modal en el DOM (p.ej. login.html), consentir automáticamente
                console.warn('[geo.js] Modal de privacidad no encontrado en el DOM');
                resolve(true);
                return;
            }

            // Mostrar modal
            modal.style.display = 'flex';
            console.log('[geo.js] Modal de privacidad mostrado');

            document.getElementById('geoModalAceptar').onclick = () => {
                modal.style.display = 'none';
                console.log('[geo.js] Usuario aceptó privacidad');
                resolve(true);
            };

            document.getElementById('geoModalRechazar').onclick = () => {
                modal.style.display = 'none';
                console.log('[geo.js] Usuario rechazó privacidad');
                resolve(false);
            };
        });
    }

    // ── Geolocalización ─────────────────────────────────────────────────────

    function obtenerPosicion() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Tu navegador no soporta geolocalización.'));
                return;
            }
            console.log('[geo.js] Solicitando posición al navegador...');
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0,
            });
        });
    }

    async function geocodificarInverso(lat, lon) {
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
            const resp = await fetch(url, { headers: { 'Accept-Language': 'es' } });
            if (!resp.ok) return null;
            const data = await resp.json();
            return data.display_name || null;
        } catch (e) {
            console.warn('[geo.js] Geocodificación inversa fallida:', e);
            return null;
        }
    }

    // ── Backend: consentimiento ─────────────────────────────────────────────

    async function enviarConsentimiento(email, decision) {
        try {
            await fetch(`${API_URL}/api/location/consent/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, decision }),
            });
            console.log('[geo.js] Consentimiento enviado al backend:', decision);
        } catch (e) {
            console.warn('[geo.js] No se pudo enviar consentimiento al backend:', e);
        }
    }

    // ── Backend: actualización de ubicación ────────────────────────────────

    async function enviarUbicacion(token, latitude, longitude, accuracy) {
        try {
            await fetch(`${API_URL}/api/location/update/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Token ${token}`,
                },
                body: JSON.stringify({ latitude, longitude, accuracy }),
            });
        } catch (e) {
            // Falla silenciosa
        }
    }

    // ── API pública: flujo de registro ──────────────────────────────────────

    async function iniciarRegistro(callbacks, email) {
        console.log('[geo.js] iniciarRegistro() llamado');
        const { onLocationReady, onConsentRejected, onLocationDenied } = callbacks;

        // 1. Mostrar modal de privacidad
        const consentido = await mostrarModalPrivacidad();

        // 2. Registrar decisión en el backend
        await enviarConsentimiento(email || '', consentido ? 'accepted' : 'rejected');

        if (!consentido) {
            onConsentRejected();
            return;
        }

        // 3. Solicitar geolocalización
        try {
            const posicion = await obtenerPosicion();
            const { latitude, longitude, accuracy } = posicion.coords;
            console.log('[geo.js] Posición obtenida:', latitude, longitude);

            // 4. Geocodificación inversa
            const address = await geocodificarInverso(latitude, longitude);

            datosUbicacion = {
                latitude,
                longitude,
                accuracy,
                address,
                timestamp: new Date().toISOString(),
            };

            onLocationReady(datosUbicacion);
        } catch (err) {
            console.error('[geo.js] Error obteniendo ubicación:', err.message);
            onLocationDenied(err);
        }
    }

    // ── API pública: flujo de login ─────────────────────────────────────────

    async function capturarLogin() {
        if (!navigator.geolocation) return null;
        try {
            const posicion = await Promise.race([
                obtenerPosicion(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('timeout')), 8000)
                ),
            ]);
            return {
                latitude: posicion.coords.latitude,
                longitude: posicion.coords.longitude,
            };
        } catch (e) {
            return null;
        }
    }

    // ── API pública: tracking continuo ──────────────────────────────────────

    function iniciarTracking(token) {
        if (!navigator.geolocation || watchId !== null) return;
        console.log('[geo.js] Iniciando watchPosition...');

        watchId = navigator.geolocation.watchPosition(
            async (posicion) => {
                const { latitude, longitude, accuracy } = posicion.coords;
                await enviarUbicacion(token, latitude, longitude, accuracy);
            },
            (err) => console.warn('[geo.js] watchPosition error:', err.message),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );

        window.addEventListener('beforeunload', detenerTracking);
    }

    function detenerTracking() {
        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
            console.log('[geo.js] watchPosition detenido');
        }
        window.removeEventListener('beforeunload', detenerTracking);
    }

    function getDatosUbicacion() {
        return datosUbicacion;
    }

    return {
        iniciarRegistro,
        capturarLogin,
        iniciarTracking,
        detenerTracking,
        getDatosUbicacion,
    };
})();

console.log('[geo.js] window.Geo disponible:', typeof window.Geo);

