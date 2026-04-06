(function() {
    const runtimeProtocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const runtimeHost = window.location.hostname || 'localhost';
    const frontendPort = window.location.port || '3000';

    const THEME_KEY = 'tema';
    const FONT_SCALE_KEY = 'ui-font-scale';
    const ZOOM_KEY = 'ui-zoom';
    const VOICE_ASSISTANT_KEY = 'voice-assistant-enabled';
    const DEFAULT_THEME = 'dark';
    const DEFAULT_FONT_SCALE = 1;
    const DEFAULT_ZOOM = 1;
    const DEFAULT_VOICE_ASSISTANT = false;
    let voiceAssistantController = null;

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function getCurrentUserScope() {
        const userId = localStorage.getItem('userId');
        const nombre = localStorage.getItem('usuarioActual') || localStorage.getItem('nombre');
        const identity = userId || nombre;

        if (!identity) {
            return 'guest';
        }

        return String(identity).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
    }

    function scopedKey(baseKey) {
        return `ui:${getCurrentUserScope()}:${baseKey}`;
    }

    function readPreference(baseKey) {
        const scopedValue = localStorage.getItem(scopedKey(baseKey));
        if (scopedValue !== null) {
            return scopedValue;
        }

        const legacyValue = localStorage.getItem(baseKey);
        if (legacyValue !== null) {
            localStorage.setItem(scopedKey(baseKey), legacyValue);
            localStorage.removeItem(baseKey);
            return legacyValue;
        }

        return null;
    }

    function writePreference(baseKey, value) {
        localStorage.setItem(scopedKey(baseKey), value);
    }

    function getTheme() {
        return readPreference(THEME_KEY) || DEFAULT_THEME;
    }

    function getFontScale() {
        const value = parseFloat(readPreference(FONT_SCALE_KEY) || `${DEFAULT_FONT_SCALE}`);
        return Number.isFinite(value) ? clamp(value, 0.9, 1.3) : DEFAULT_FONT_SCALE;
    }

    function getZoom() {
        const value = parseFloat(readPreference(ZOOM_KEY) || `${DEFAULT_ZOOM}`);
        return Number.isFinite(value) ? clamp(value, 0.9, 1.15) : DEFAULT_ZOOM;
    }

    function getVoiceAssistantEnabled() {
        const value = readPreference(VOICE_ASSISTANT_KEY);
        if (value === null) {
            return DEFAULT_VOICE_ASSISTANT;
        }
        return value === 'true';
    }

    function applyTheme(theme) {
        const root = document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(theme === 'light' ? 'light' : 'dark');
        root.dataset.theme = theme;

        const themeIcon = document.getElementById('theme-icon');
        if (themeIcon) {
            themeIcon.textContent = theme === 'light' ? 'dark_mode' : 'light_mode';
        }
    }

    function applyTypography(fontScale) {
        document.documentElement.style.setProperty('--app-font-scale', `${fontScale}`);
    }

    function applyZoom(zoom) {
        document.documentElement.style.setProperty('--app-page-zoom', `${zoom}`);
        if (document.body) {
            document.body.style.zoom = `${zoom}`;
        }
    }

    function applyPreferences() {
        applyTheme(getTheme());
        applyTypography(getFontScale());
        applyZoom(getZoom());
    }

    function setTheme(theme) {
        const nextTheme = theme === 'light' ? 'light' : 'dark';
        writePreference(THEME_KEY, nextTheme);
        applyTheme(nextTheme);
    }

    function toggleTheme() {
        setTheme(getTheme() === 'dark' ? 'light' : 'dark');
    }

    function setFontScale(fontScale) {
        const nextValue = clamp(parseFloat(fontScale), 0.9, 1.3);
        writePreference(FONT_SCALE_KEY, `${nextValue}`);
        applyTypography(nextValue);
    }

    function setZoom(zoom) {
        const nextValue = clamp(parseFloat(zoom), 0.9, 1.15);
        writePreference(ZOOM_KEY, `${nextValue}`);
        applyZoom(nextValue);
    }

    function setVoiceAssistantEnabled(enabled) {
        const nextValue = Boolean(enabled);
        writePreference(VOICE_ASSISTANT_KEY, `${nextValue}`);

        if (voiceAssistantController) {
            voiceAssistantController.setEnabled(nextValue);
        }
    }

    function xmlText(node, selector) {
        return node.querySelector(selector)?.textContent?.trim() || '';
    }

    function createVoiceAssistant() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const canRecognize = Boolean(SpeechRecognition);
        const canSpeak = Boolean(window.speechSynthesis);
        const supported = canRecognize && canSpeak;
        const runtime = window.CentinelaRuntime;
        const token = localStorage.getItem('token');
        const userName = localStorage.getItem('usuarioActual') || localStorage.getItem('nombre') || 'Vecino';
        const viviendaId = localStorage.getItem('numeroCasa') || localStorage.getItem('viviendaId') || 'sin-casa';
        let enabled = getVoiceAssistantEnabled();
        let recognition = null;
        let listening = false;
        let starting = false;
        let stopRequested = false;
        let isSpeaking = false;
        let statusNode = null;
        let floatingNode = null;
        let draggingFab = false;
        let movedFab = false;
        let fabPointerId = null;
        let fabStartX = 0;
        let fabStartY = 0;
        let fabInitialLeft = 0;
        let fabInitialTop = 0;

        function getModeLabel() {
            return canRecognize ? 'voz' : 'modo compatible';
        }

        function ensureUi() {
            if (!document.body) return;
            if (!floatingNode) {
                floatingNode = document.createElement('button');
                floatingNode.type = 'button';
                floatingNode.className = 'centinela-voice-fab';
                floatingNode.innerHTML = '<span class="material-icons-round">mic</span><span>Centinela</span>';
                floatingNode.style.position = 'fixed';
                floatingNode.style.right = '24px';
                floatingNode.style.bottom = '24px';
                floatingNode.style.zIndex = '70';
                floatingNode.style.display = 'flex';
                floatingNode.style.alignItems = 'center';
                floatingNode.style.gap = '10px';
                floatingNode.style.padding = '12px 16px';
                floatingNode.style.borderRadius = '999px';
                floatingNode.style.border = '1px solid rgba(13,242,204,0.25)';
                floatingNode.style.background = 'rgba(15,26,23,0.94)';
                floatingNode.style.color = '#0DF2CC';
                floatingNode.style.boxShadow = '0 16px 36px rgba(0,0,0,0.28)';
                floatingNode.style.fontWeight = '700';
                floatingNode.style.backdropFilter = 'blur(10px)';
                floatingNode.style.cursor = 'pointer';
                floatingNode.style.touchAction = 'none';
                floatingNode.addEventListener('click', async () => {
                    if (movedFab) {
                        movedFab = false;
                        return;
                    }
                    if (!enabled) {
                        setEnabled(true);
                        if (!canRecognize) {
                            await promptCommand();
                        }
                        return;
                    }

                    if (!canRecognize) {
                        await promptCommand();
                        return;
                    }

                    stopListening();
                    setEnabled(false);
                });

                const onFabPointerMove = (event) => {
                    if (!draggingFab) return;

                    const nextLeft = fabInitialLeft + (event.clientX - fabStartX);
                    const nextTop = fabInitialTop + (event.clientY - fabStartY);
                    const maxLeft = Math.max(window.innerWidth - floatingNode.offsetWidth, 0);
                    const maxTop = Math.max(window.innerHeight - floatingNode.offsetHeight, 0);

                    if (Math.abs(event.clientX - fabStartX) > 4 || Math.abs(event.clientY - fabStartY) > 4) {
                        movedFab = true;
                    }

                    floatingNode.style.left = `${Math.min(Math.max(nextLeft, 0), maxLeft)}px`;
                    floatingNode.style.top = `${Math.min(Math.max(nextTop, 0), maxTop)}px`;
                    floatingNode.style.right = 'auto';
                    floatingNode.style.bottom = 'auto';
                };

                const stopFabDragging = () => {
                    if (!draggingFab) return;
                    draggingFab = false;
                    floatingNode.releasePointerCapture?.(fabPointerId);
                    window.removeEventListener('pointermove', onFabPointerMove);
                    window.removeEventListener('pointerup', stopFabDragging);
                    window.removeEventListener('pointercancel', stopFabDragging);
                };

                floatingNode.addEventListener('pointerdown', (event) => {
                    if (event.button !== 0) return;

                    const rect = floatingNode.getBoundingClientRect();
                    draggingFab = true;
                    movedFab = false;
                    fabPointerId = event.pointerId;
                    fabStartX = event.clientX;
                    fabStartY = event.clientY;
                    fabInitialLeft = rect.left;
                    fabInitialTop = rect.top;

                    floatingNode.style.left = `${rect.left}px`;
                    floatingNode.style.top = `${rect.top}px`;
                    floatingNode.style.right = 'auto';
                    floatingNode.style.bottom = 'auto';

                    floatingNode.setPointerCapture?.(fabPointerId);
                    window.addEventListener('pointermove', onFabPointerMove);
                    window.addEventListener('pointerup', stopFabDragging);
                    window.addEventListener('pointercancel', stopFabDragging);
                });

                document.body.appendChild(floatingNode);
            }

            statusNode = document.getElementById('voice-assistant-status');
        }

        function updateUi(extraMessage) {
            ensureUi();
            const checkbox = document.getElementById('voice-assistant-enabled');
            const toggleRow = document.getElementById('voice-assistant-toggle-row');
            const testButton = document.getElementById('voice-test-button');
            const commandButton = document.getElementById('voice-command-button');
            const readButton = document.getElementById('voice-read-screen-button');
            const toggleTrack = document.getElementById('voice-toggle-track');
            const toggleThumb = document.getElementById('voice-toggle-thumb');

            if (checkbox) {
                checkbox.checked = enabled;
            }
            if (toggleRow) {
                toggleRow.setAttribute('aria-pressed', enabled ? 'true' : 'false');
            }
            if (toggleTrack) {
                toggleTrack.style.background = enabled ? 'rgba(13,242,204,0.30)' : '#1E3330';
                toggleTrack.style.border = enabled ? '1px solid rgba(13,242,204,0.35)' : '1px solid transparent';
            }
            if (toggleThumb) {
                toggleThumb.style.transform = enabled ? 'translateX(20px)' : 'translateX(0)';
            }
            if (testButton) testButton.disabled = !canSpeak;
            if (commandButton) commandButton.disabled = false;
            if (readButton) readButton.disabled = !canSpeak;

            if (floatingNode) {
                floatingNode.style.opacity = enabled ? '1' : '0.7';
                floatingNode.style.borderColor = listening ? 'rgba(13,242,204,0.7)' : 'rgba(13,242,204,0.25)';
                floatingNode.querySelector('.material-icons-round').textContent = listening ? 'mic' : 'mic_none';
            }

            if (!statusNode) return;

            if (!canRecognize && !canSpeak) {
                statusNode.textContent = 'Tu navegador no soporta voz ni lectura hablada en esta funcion.';
                return;
            }

            if (extraMessage) {
                statusNode.textContent = extraMessage;
                return;
            }

            if (!enabled) {
                statusNode.textContent = 'El asistente esta desactivado.';
            } else if (listening) {
                statusNode.textContent = 'Asistente activo. Di "Centinela" seguido de tu comando.';
            } else if (starting) {
                statusNode.textContent = 'Iniciando escucha de voz...';
            } else if (!canRecognize) {
                statusNode.textContent = 'Asistente activado en modo compatible. Usa "Escribir comando" para consultar a Centinela en este navegador.';
            } else {
                statusNode.textContent = `Asistente activado en modo ${getModeLabel()}. Di "Centinela" seguido de tu comando.`;
            }
        }

        function speak(text) {
            if (!window.speechSynthesis || !text) return;
            const shouldResumeAfterSpeak = enabled && canRecognize && listening;
            if (shouldResumeAfterSpeak) {
                stopRequested = true;
                recognition?.stop();
            }
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'es-MX';
            utterance.rate = 1;
            utterance.pitch = 1;
            utterance.onstart = () => {
                isSpeaking = true;
            };
            utterance.onend = () => {
                isSpeaking = false;
                if (enabled && canRecognize) {
                    stopRequested = false;
                    window.setTimeout(startListening, 250);
                }
            };
            utterance.onerror = () => {
                isSpeaking = false;
                if (enabled && canRecognize) {
                    stopRequested = false;
                    window.setTimeout(startListening, 250);
                }
            };
            window.speechSynthesis.speak(utterance);
            updateUi(text);
        }

        function normalizeText(value) {
            return String(value || '')
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^\w\s]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

        function collectReadableScreenText() {
            const selectors = ['h1', 'h2', 'h3', 'p', 'button', '[aria-label]'];
            const nodes = Array.from(document.querySelectorAll(selectors.join(',')));
            const texts = nodes
                .map((node) => (node.getAttribute?.('aria-label') || node.textContent || '').trim())
                .filter((value) => value && value.length > 2)
                .filter((value, index, arr) => arr.indexOf(value) === index)
                .slice(0, 16);

            if (!texts.length) {
                return 'No encontre texto claro para leer en esta pantalla.';
            }

            return `En esta pantalla aparece: ${texts.join('. ')}.`;
        }

        async function fetchNotificationsSummary() {
            if (!token) {
                return 'No puedo revisar notificaciones porque no hay una sesion iniciada.';
            }

            const response = await fetch(runtime.serviceUrl(5002, '/notifications'), {
                headers: { Authorization: `Token ${token}` },
            });
            if (!response.ok) {
                throw new Error('No pude consultar tus notificaciones.');
            }

            const data = await response.json();
            const allItems = Array.isArray(data.items) ? data.items : [];
            const unread = Number(data.unread_count || 0);
            const unreadItems = allItems.filter((item) => !item.leida);
            const sourceItems = unreadItems.length ? unreadItems : allItems;

            if (!sourceItems.length) {
                return 'No tienes notificaciones por ahora.';
            }

            const preview = sourceItems.slice(0, 3).map((item) => {
                const title = item.titulo || 'Notificacion';
                const desc = item.descripcion ? ` ${item.descripcion}` : '';
                return `${title}.${desc}`.trim();
            }).join('. ');

            if (!unread) {
                return `No tienes notificaciones sin leer. Las mas recientes son: ${preview}.`;
            }

            return `Tienes ${unread} notificaciones pendientes. ${preview}.`;
        }

        async function fetchEncuestasSummary() {
            const response = await fetch(runtime.serviceUrl(5004, '/consultas/'));
            if (!response.ok) {
                throw new Error('No pude consultar tus encuestas.');
            }

            const xmlString = await response.text();
            const xml = new DOMParser().parseFromString(xmlString, 'application/xml');
            const consultas = Array.from(xml.querySelectorAll('consulta'));
            let pendientes = 0;
            const titulos = [];

            for (const consulta of consultas) {
                const estado = xmlText(consulta, 'estado');
                if (estado && estado !== 'abierta') continue;

                const titulo = xmlText(consulta, 'titulo') || 'Consulta sin titulo';
                const preguntas = Array.from(consulta.querySelectorAll(':scope > pregunta'));

                for (const pregunta of preguntas) {
                    const preguntaId = xmlText(pregunta, 'id');
                    if (!preguntaId) continue;

                    try {
                        const verifyResponse = await fetch(runtime.serviceUrl(5004, `/votos/verificar/${preguntaId}`), {
                            headers: { 'X-Vivienda-ID': viviendaId },
                        });
                        if (!verifyResponse.ok) continue;
                        const verifyXml = new DOMParser().parseFromString(await verifyResponse.text(), 'application/xml');
                        const estadoVoto = xmlText(verifyXml, 'estado');
                        if (estadoVoto !== 'ya_voto') {
                            pendientes += 1;
                            if (!titulos.includes(titulo)) {
                                titulos.push(titulo);
                            }
                        }
                    } catch (_) {
                        continue;
                    }
                }
            }

            if (!pendientes) {
                return 'No tienes encuestas pendientes por responder.';
            }

            return titulos.length
                ? `Tienes ${pendientes} encuesta${pendientes === 1 ? '' : 's'} pendiente${pendientes === 1 ? '' : 's'}. Corresponden a: ${titulos.slice(0, 3).join(', ')}.`
                : `Tienes ${pendientes} encuesta${pendientes === 1 ? '' : 's'} pendiente${pendientes === 1 ? '' : 's'}.`;
        }

        function extractCommandFromTranscript(rawTranscript) {
            const normalized = normalizeText(rawTranscript);
            const wakeWord = 'centinela';
            if (!normalized) return '';
            if (normalized.includes(wakeWord)) {
                return normalized.slice(normalized.indexOf(wakeWord) + wakeWord.length).trim();
            }
            return normalized;
        }

        function commandMatches(command, patterns) {
            return patterns.some((pattern) => command.includes(pattern));
        }

        async function executeCommand(rawTranscript) {
            const command = extractCommandFromTranscript(rawTranscript);
            if (!command) {
                speak('Te escucho. Puedes preguntarme por notificaciones, encuestas o pedirme que lea la pantalla.');
                return;
            }

            try {
                const asksNotifications = commandMatches(command, [
                    'notificacion',
                    'notificaciones',
                    'notificaion',
                    'notifcaciones',
                    'mis avisos',
                    'avisos',
                    'avisame mis notificaciones',
                    'que notificaciones tengo',
                    'si tengo notificaciones',
                    'tengo notificaciones',
                    'leer notificaciones',
                    'dime las notificaciones',
                    'muestrame las notificaciones',
                ]);

                const asksEncuestas = commandMatches(command, [
                    'encuesta',
                    'encuestas',
                    'encuestas pendientes',
                    'si tengo encuestas',
                    'tengo encuestas pendientes',
                    'votaciones pendientes',
                    'votacion pendiente',
                ]);

                const asksScreen = commandMatches(command, [
                    'lee',
                    'leeme',
                    'pantalla',
                    'leer pantalla',
                    'que aparece en esta pantalla',
                    'que hay en esta pantalla',
                    'leeme lo que aparece',
                ]);

                if (asksNotifications) {
                    speak(await fetchNotificationsSummary());
                    return;
                }

                if (asksEncuestas) {
                    speak(await fetchEncuestasSummary());
                    return;
                }

                if (asksScreen) {
                    speak(collectReadableScreenText());
                    return;
                }

                speak(`No reconoci bien ese comando, ${userName}. Prueba con: dime mis notificaciones, dime si tengo encuestas pendientes, o leeme esta pantalla.`);
            } catch (error) {
                speak(error.message || 'Ocurrio un error al procesar tu comando.');
            }
        }

        async function promptCommand() {
            if (!enabled) {
                setVoiceAssistantEnabled(true);
            }

            const input = window.prompt('Escribe tu comando para Centinela.\nEjemplo: Centinela, dime si tengo notificaciones');
            if (!input) {
                updateUi();
                return;
            }

            await executeCommand(input);
        }

        function startListening() {
            if (!canRecognize || !enabled || listening || starting || isSpeaking) {
                updateUi();
                return;
            }

            starting = true;
            stopRequested = false;
            updateUi();

            recognition = new SpeechRecognition();
            recognition.lang = 'es-MX';
            recognition.continuous = true;
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;

            recognition.onstart = () => {
                starting = false;
                listening = true;
                updateUi();
            };

            recognition.onresult = async (event) => {
                if (isSpeaking) return;
                const transcript = Array.from(event.results)
                    .slice(event.resultIndex)
                    .map((result) => result[0]?.transcript || '')
                    .join(' ')
                    .trim();

                if (transcript) {
                    await executeCommand(transcript);
                }
            };

            recognition.onerror = (event) => {
                if (event.error === 'not-allowed') {
                    enabled = false;
                    writePreference(VOICE_ASSISTANT_KEY, 'false');
                    updateUi('No tengo permiso para usar el microfono. Activalo en el navegador.');
                    return;
                }
                updateUi(`Asistente en pausa por: ${event.error}.`);
            };

            recognition.onend = () => {
                listening = false;
                starting = false;
                recognition = null;
                updateUi();

                if (enabled && !stopRequested) {
                    window.setTimeout(startListening, 1200);
                }
            };

            recognition.start();
        }

        function stopListening() {
            stopRequested = true;
            if (recognition) {
                recognition.stop();
            }
            listening = false;
            starting = false;
            updateUi();
        }

        function setEnabled(nextEnabled) {
            enabled = Boolean(nextEnabled);
            updateUi();
            if (!canRecognize) {
                return;
            }

            if (enabled) {
                startListening();
            } else {
                stopListening();
            }
        }

        function wireSettings() {
            const checkbox = document.getElementById('voice-assistant-enabled');
            const toggleRow = document.getElementById('voice-assistant-toggle-row');
            const testButton = document.getElementById('voice-test-button');
            const commandButton = document.getElementById('voice-command-button');
            const readButton = document.getElementById('voice-read-screen-button');

            if (checkbox) {
                checkbox.checked = enabled;
                checkbox.addEventListener('change', (event) => {
                    setVoiceAssistantEnabled(event.target.checked);
                });
            }

            if (toggleRow) {
                toggleRow.addEventListener('click', (event) => {
                    if (event.target.closest('button')) return;
                    if (event.target.closest('label')) return;
                    const nextValue = !getVoiceAssistantEnabled();
                    if (checkbox) {
                        checkbox.checked = nextValue;
                    }
                    setVoiceAssistantEnabled(nextValue);
                });
            }

            if (testButton) {
                testButton.addEventListener('click', () => {
                    if (!enabled) {
                        setVoiceAssistantEnabled(true);
                    }
                    if (!canSpeak) {
                        updateUi('Este navegador no puede reproducir voz.');
                        return;
                    }
                    speak(canRecognize
                        ? 'Centinela por voz esta listo. Puedes decir: Centinela, dime si tengo notificaciones.'
                        : 'La lectura por voz funciona, pero los comandos por voz requieren Chrome o Edge.');
                });
            }

            if (commandButton) {
                commandButton.addEventListener('click', async () => {
                    await promptCommand();
                });
            }

            if (readButton) {
                readButton.addEventListener('click', () => {
                    if (!enabled) {
                        setVoiceAssistantEnabled(true);
                    }
                    if (!canSpeak) {
                        updateUi('Este navegador no puede leer la pantalla en voz alta.');
                        return;
                    }
                    speak(collectReadableScreenText());
                });
            }
        }

        return {
            supported,
            init() {
                ensureUi();
                wireSettings();
                updateUi();
                if (canRecognize && enabled) {
                    startListening();
                }
            },
            setEnabled,
            promptCommand,
            readCurrentScreen() {
                speak(collectReadableScreenText());
            },
        };
    }

    function closeMobileNav() {
        document.body.classList.remove('mobile-nav-open');
    }

    function openMobileNav() {
        document.body.classList.add('mobile-nav-open');
    }

    function injectConfigLink() {
        const nav = document.querySelector('aside nav');
        if (!nav || nav.querySelector('[data-config-link="true"]')) {
            return;
        }

        const pathname = window.location.pathname.toLowerCase();
        const isAdminSession = sessionStorage.getItem('centinela_admin') === '1' || (localStorage.getItem('rolActual') || '').toLowerCase() === 'admin';
        const isAdminPage = pathname.endsWith('/admin.html')
            || pathname.endsWith('admin.html')
            || pathname.endsWith('/admin_encuestas.html')
            || pathname.endsWith('admin_encuestas.html')
            || pathname.endsWith('/admin_configuracion.html')
            || pathname.endsWith('admin_configuracion.html');

        if (isAdminPage && nav.querySelector('a[href="admin_configuracion.html"]')) {
            return;
        }

        const configHref = (isAdminSession || isAdminPage) ? 'admin_configuracion.html' : 'configuracion.html';
        const isConfigPage = pathname.endsWith(`/${configHref}`) || pathname.endsWith(configHref);

        const configLink = document.createElement('a');
        configLink.href = configHref;
        configLink.dataset.configLink = 'true';
        configLink.className = `nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${isConfigPage ? 'active' : 'text-text-muted'}`;
        configLink.innerHTML = '<span class="material-icons-round text-xl">settings</span>Configuracion';

        if (isAdminSession || isAdminPage) {
            const adminEncuestasLink = Array.from(nav.querySelectorAll('a')).find((link) => link.getAttribute('href') === 'admin_encuestas.html');
            const adminPanelLink = Array.from(nav.querySelectorAll('a')).find((link) => link.getAttribute('href') === 'admin.html');
            const anchor = adminEncuestasLink || adminPanelLink;
            if (anchor) {
                anchor.insertAdjacentElement('afterend', configLink);
            } else {
                nav.appendChild(configLink);
            }
        } else {
            const perfilLink = Array.from(nav.querySelectorAll('a')).find((link) => link.getAttribute('href') === 'perfil.html');
            if (perfilLink) {
                perfilLink.insertAdjacentElement('afterend', configLink);
            } else {
                nav.appendChild(configLink);
            }
        }
    }

    function injectDecisionLinks() {
        const nav = document.querySelector('aside nav');
        if (!nav || nav.querySelector('[data-decisions-link="true"]')) {
            return;
        }

        const pathname = window.location.pathname.toLowerCase();
        const rol = (localStorage.getItem('rolActual') || 'usuario').toLowerCase();
        const isAdminPage = pathname.endsWith('/admin.html')
            || pathname.endsWith('admin.html')
            || pathname.endsWith('/admin_encuestas.html')
            || pathname.endsWith('admin_encuestas.html')
            || pathname.endsWith('/admin_configuracion.html')
            || pathname.endsWith('admin_configuracion.html');

        if (isAdminPage) {
            return;
        }

        const isEncuestasPage = pathname.endsWith('/encuestas.html') || pathname.endsWith('encuestas.html');
        const isAdminEncuestasPage = pathname.endsWith('/admin_encuestas.html') || pathname.endsWith('admin_encuestas.html');

        const encuestasLink = document.createElement('a');
        encuestasLink.href = 'encuestas.html';
        encuestasLink.dataset.decisionsLink = 'true';
        encuestasLink.className = `nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${isEncuestasPage ? 'active' : 'text-text-muted'}`;
        encuestasLink.innerHTML = '<span class="material-icons-round text-xl">ballot</span>Encuestas';

        const noticiasLink = Array.from(nav.querySelectorAll('a')).find((link) => link.getAttribute('href') === 'noticias.html');
        if (noticiasLink) {
            noticiasLink.insertAdjacentElement('beforebegin', encuestasLink);
        } else {
            nav.appendChild(encuestasLink);
        }

        if (rol === 'admin') {
            const adminLink = document.createElement('a');
            adminLink.href = 'admin_encuestas.html';
            adminLink.dataset.decisionsAdminLink = 'true';
            adminLink.className = `nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${isAdminEncuestasPage ? 'active' : 'text-text-muted'}`;
            adminLink.innerHTML = '<span class="material-icons-round text-xl">how_to_vote</span>Panel de encuestas';

            const securityPanel = Array.from(nav.querySelectorAll('a')).find((link) => link.getAttribute('href') === 'admin.html');
            if (securityPanel) {
                securityPanel.insertAdjacentElement('afterend', adminLink);
            } else {
                nav.appendChild(adminLink);
            }
        }
    }

    function sanitizeAdminNav() {
        const nav = document.querySelector('aside nav');
        if (!nav) {
            return;
        }

        const pathname = window.location.pathname.toLowerCase();
        const isAdminPage = pathname.endsWith('/admin.html')
            || pathname.endsWith('admin.html')
            || pathname.endsWith('/admin_encuestas.html')
            || pathname.endsWith('admin_encuestas.html')
            || pathname.endsWith('/admin_configuracion.html')
            || pathname.endsWith('admin_configuracion.html');

        if (!isAdminPage) {
            return;
        }

        nav.querySelectorAll('a[href="encuestas.html"], a[href="configuracion.html"]').forEach((link) => {
            link.remove();
        });

        ['admin.html', 'admin_encuestas.html', 'admin_configuracion.html'].forEach((href) => {
            const links = Array.from(nav.querySelectorAll(`a[href="${href}"]`));
            links.slice(1).forEach((link) => link.remove());
        });

        const seenLabels = new Set();
        Array.from(nav.querySelectorAll('a')).forEach((link) => {
            const label = (link.textContent || '')
                .trim()
                .toLowerCase()
                .replace(/\s+/g, ' ');

            if (!label) {
                return;
            }

            if (label === 'panel de encuestas' || label === 'configuracion' || label === 'encuestas') {
                if (seenLabels.has(label)) {
                    link.remove();
                    return;
                }
                seenLabels.add(label);
            }
        });
    }

    function enhanceMobileShell() {
        const aside = document.querySelector('body > aside');
        const main = document.querySelector('body > div.flex-1');
        const header = main ? main.querySelector('header') : null;

        if (!aside || !header || header.querySelector('.app-mobile-menu-btn')) {
            return;
        }

        document.body.classList.add('app-mobile-shell');

        const overlay = document.createElement('button');
        overlay.type = 'button';
        overlay.className = 'app-sidebar-overlay';
        overlay.setAttribute('aria-label', 'Cerrar menu lateral');
        overlay.addEventListener('click', closeMobileNav);
        document.body.appendChild(overlay);

        const menuButton = document.createElement('button');
        menuButton.type = 'button';
        menuButton.className = 'app-mobile-menu-btn';
        menuButton.setAttribute('aria-label', 'Abrir menu lateral');
        menuButton.innerHTML = '<span class="material-icons-round">menu</span>';
        menuButton.addEventListener('click', () => {
            if (document.body.classList.contains('mobile-nav-open')) {
                closeMobileNav();
            } else {
                openMobileNav();
            }
        });

        const headerStart = document.createElement('div');
        headerStart.className = 'app-mobile-header-start';
        headerStart.appendChild(menuButton);

        const firstChild = header.firstElementChild;
        if (firstChild) {
            header.insertBefore(headerStart, firstChild);
        } else {
            header.appendChild(headerStart);
        }

        aside.querySelectorAll('a').forEach((link) => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 1024) {
                    closeMobileNav();
                }
            });
        });
    }

    function repairMojibake(value) {
        if (!value || typeof value !== 'string') {
            return value;
        }

        const replacements = [
            ['Ã¡', 'á'], ['Ã©', 'é'], ['Ã­', 'í'], ['Ã³', 'ó'], ['Ãº', 'ú'],
            ['Ã', 'Á'], ['Ã‰', 'É'], ['Ã', 'Í'], ['Ã“', 'Ó'], ['Ãš', 'Ú'],
            ['Ã±', 'ñ'], ['Ã‘', 'Ñ'], ['Ã¼', 'ü'], ['Ãœ', 'Ü'],
            ['Â¡', '¡'], ['Â¿', '¿'], ['â€”', '—'], ['â€“', '–'], ['â€¦', '…'],
            ['â€œ', '“'], ['â€\u009d', '”'], ['â€\u0098', '‘'], ['â€\u0099', '’'],
            ['âœ…', '✅'], ['ðŸŸ¢', '🟢'], ['ðŸš¨', '🚨'], ['ðŸ”’', '🔒'],
            ['ðŸ“', '📍'], ['â“˜', 'ⓘ'], ['ðŸ˜ï¸', '🏘️'], ['ðŸ’¬', '💬'],
        ];

        let result = value;
        replacements.forEach(([broken, fixed]) => {
            result = result.split(broken).join(fixed);
        });
        return result;
    }

    function fixDocumentText() {
        if (document.title) {
            document.title = repairMojibake(document.title);
        }

        document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach((element) => {
            element.placeholder = repairMojibake(element.placeholder);
        });
    }

    function hydrateSettingsPage() {
        if (!document.body || !['configuracion', 'admin-configuracion'].includes(document.body.dataset.page)) {
            return;
        }

        const themeSelect = document.getElementById('theme-select');
        const fontRange = document.getElementById('font-scale');
        const zoomRange = document.getElementById('zoom-scale');
        const voiceCheckbox = document.getElementById('voice-assistant-enabled');
        const fontValue = document.getElementById('font-scale-value');
        const zoomValue = document.getElementById('zoom-scale-value');

        if (!themeSelect || !fontRange || !zoomRange) {
            return;
        }

        const syncLabels = () => {
            if (fontValue) {
                fontValue.textContent = `${Math.round(parseFloat(fontRange.value) * 100)}%`;
            }
            if (zoomValue) {
                zoomValue.textContent = `${Math.round(parseFloat(zoomRange.value) * 100)}%`;
            }
        };

        themeSelect.value = getTheme();
        fontRange.value = `${getFontScale()}`;
        zoomRange.value = `${getZoom()}`;
        syncLabels();

        themeSelect.addEventListener('change', (event) => {
            setTheme(event.target.value);
        });

        fontRange.addEventListener('input', (event) => {
            setFontScale(event.target.value);
            syncLabels();
        });

        zoomRange.addEventListener('input', (event) => {
            setZoom(event.target.value);
            syncLabels();
        });

        const resetButton = document.getElementById('reset-preferences');
        if (resetButton) {
            resetButton.addEventListener('click', () => {
                setTheme(DEFAULT_THEME);
                setFontScale(DEFAULT_FONT_SCALE);
                setZoom(DEFAULT_ZOOM);
                setVoiceAssistantEnabled(DEFAULT_VOICE_ASSISTANT);
                themeSelect.value = DEFAULT_THEME;
                fontRange.value = `${DEFAULT_FONT_SCALE}`;
                zoomRange.value = `${DEFAULT_ZOOM}`;
                if (voiceCheckbox) {
                    voiceCheckbox.checked = DEFAULT_VOICE_ASSISTANT;
                }
                syncLabels();
            });
        }
    }

    window.CentinelaUIPreferences = {
        getTheme,
        getFontScale,
        getZoom,
        setTheme,
        toggleTheme,
        setFontScale,
        setZoom,
        getVoiceAssistantEnabled,
        setVoiceAssistantEnabled,
        applyPreferences,
    };

    window.CentinelaRuntime = {
        protocol: runtimeProtocol,
        host: runtimeHost,
        frontendPort,
        serviceUrl(port, path = '') {
            const normalizedPath = path.startsWith('/') ? path : `/${path}`;
            return `${runtimeProtocol}//${runtimeHost}:${port}${path ? normalizedPath : ''}`;
        },
        appUrl(path = '') {
            const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
            return `${runtimeProtocol}//${runtimeHost}:${frontendPort}${normalizedPath ? `/${normalizedPath}` : ''}`;
        },
    };

    window.toggleTheme = toggleTheme;

    applyTheme(getTheme());
    applyTypography(getFontScale());

    document.addEventListener('DOMContentLoaded', () => {
        applyPreferences();
        sanitizeAdminNav();
        injectDecisionLinks();
        injectConfigLink();
        sanitizeAdminNav();
        enhanceMobileShell();
        fixDocumentText();
        hydrateSettingsPage();
        try {
            voiceAssistantController = createVoiceAssistant();
            voiceAssistantController.init();
        } catch (error) {
            console.error('Centinela voice assistant failed to initialize:', error);
        }

        window.addEventListener('resize', () => {
            if (window.innerWidth > 1024) {
                closeMobileNav();
            }
        });
    });
})();
