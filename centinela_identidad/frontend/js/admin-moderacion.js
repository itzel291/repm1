(function () {
    const runtime = window.CentinelaRuntime;
    const API = runtime ? runtime.serviceUrl(5002) : 'http://localhost:5002';
    const ADMIN_TOKEN = 'centinela-admin-2025';
    const MODERATION_VERSION = '2026-03-31-media-v2';

    async function fetchPendingPosts() {
        const response = await fetch(`${API}/admin/posts/pending`, {
            headers: { 'X-Admin-Token': ADMIN_TOKEN },
        });
        if (!response.ok) throw new Error('No se pudieron cargar las publicaciones pendientes');
        return response.json();
    }

    async function fetchAdminNotifications() {
        const response = await fetch(`${API}/admin/notifications`, {
            headers: { 'X-Admin-Token': ADMIN_TOKEN },
        });
        if (!response.ok) throw new Error('No se pudieron cargar las notificaciones del admin');
        return response.json();
    }

    async function fetchPendingEvents() {
        const response = await fetch(`${API}/admin/events/pending`, {
            headers: { 'X-Admin-Token': ADMIN_TOKEN },
        });
        if (!response.ok) throw new Error('No se pudieron cargar los eventos pendientes');
        return response.json();
    }

    function createCardShell() {
        const card = document.createElement('div');
        card.style.background = '#1c2030';
        card.style.border = '1px solid rgba(255,255,255,0.08)';
        card.style.borderRadius = '12px';
        card.style.padding = '16px';
        card.style.marginBottom = '12px';

        const layout = document.createElement('div');
        layout.style.display = 'flex';
        layout.style.justifyContent = 'space-between';
        layout.style.gap = '16px';
        layout.style.alignItems = 'flex-start';

        const content = document.createElement('div');
        content.style.flex = '1';

        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '8px';
        actions.style.flexShrink = '0';

        layout.appendChild(content);
        layout.appendChild(actions);
        card.appendChild(layout);

        return { card, content, actions };
    }

    function createMetaLabel(text, color) {
        const p = document.createElement('p');
        p.textContent = text;
        p.style.fontSize = '12px';
        p.style.color = color;
        p.style.marginBottom = '6px';
        return p;
    }

    function createTitle(text) {
        const p = document.createElement('p');
        p.textContent = text || 'Sin titulo';
        p.style.fontWeight = '600';
        p.style.color = '#e8eaf0';
        p.style.marginBottom = '6px';
        return p;
    }

    function createMeta(text) {
        const p = document.createElement('p');
        p.textContent = text;
        p.style.fontSize = '12px';
        p.style.color = '#6b7280';
        p.style.marginBottom = '10px';
        return p;
    }

    function createBody(text) {
        const p = document.createElement('p');
        p.textContent = text;
        p.style.fontSize = '14px';
        p.style.color = '#cbd5e1';
        p.style.lineHeight = '1.5';
        return p;
    }

    function createActionButton(label, background, color, onClick) {
        const button = document.createElement('button');
        button.textContent = label;
        button.style.background = background;
        button.style.color = color;
        button.style.border = 'none';
        button.style.borderRadius = '10px';
        button.style.padding = '10px 14px';
        button.style.fontWeight = '600';
        button.style.cursor = 'pointer';
        button.addEventListener('click', onClick);
        return button;
    }

    function normalizeMediaItem(item) {
        if (!item) return null;

        if (typeof item === 'string') {
            return {
                type: item.startsWith('data:video/') ? 'video' : 'image',
                url: item,
                name: 'Adjunto',
            };
        }

        const url = item.url || item.src || item.media_url || item.data || '';
        const rawType = (item.type || item.media_type || '').toLowerCase();
        let type = rawType;

        if (!type && typeof url === 'string') {
            if (url.startsWith('data:image/')) type = 'image';
            if (url.startsWith('data:video/')) type = 'video';
        }
        if (type.includes('image')) type = 'image';
        if (type.includes('video')) type = 'video';

        return {
            type,
            url,
            name: item.name || item.filename || item.original_name || 'Adjunto',
        };
    }

    function createMediaNode(item) {
        const media = normalizeMediaItem(item);
        const type = (media?.type || '').toLowerCase();
        const url = media?.url || '';
        if (!url) return null;

        const wrapper = document.createElement('div');
        wrapper.style.marginTop = '12px';

        const label = document.createElement('p');
        label.textContent = type === 'video' ? 'Adjunto: video' : 'Adjunto: imagen';
        label.style.fontSize = '12px';
        label.style.color = '#94a3b8';
        label.style.marginBottom = '8px';
        wrapper.appendChild(label);

        if (type === 'image') {
            const link = document.createElement('a');
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.style.display = 'block';

            const img = document.createElement('img');
            img.alt = media?.name || 'Imagen adjunta';
            img.src = url;
            img.style.display = 'block';
            img.style.width = '100%';
            img.style.maxWidth = '320px';
            img.style.maxHeight = '220px';
            img.style.objectFit = 'cover';
            img.style.borderRadius = '12px';
            img.style.border = '1px solid rgba(255,255,255,0.1)';
            img.style.background = '#0d0f14';

            const fallback = document.createElement('a');
            fallback.href = url;
            fallback.target = '_blank';
            fallback.rel = 'noopener noreferrer';
            fallback.textContent = 'Abrir imagen adjunta';
            fallback.style.display = 'none';
            fallback.style.marginTop = '8px';
            fallback.style.fontSize = '12px';
            fallback.style.color = '#60a5fa';

            img.addEventListener('error', () => {
                fallback.style.display = 'inline-block';
            });

            link.appendChild(img);
            wrapper.appendChild(link);
            wrapper.appendChild(fallback);
            return wrapper;
        }

        if (type === 'video') {
            const video = document.createElement('video');
            video.controls = true;
            video.preload = 'metadata';
            video.src = url;
            video.style.display = 'block';
            video.style.width = '100%';
            video.style.maxWidth = '320px';
            video.style.maxHeight = '220px';
            video.style.borderRadius = '12px';
            video.style.border = '1px solid rgba(255,255,255,0.1)';
            video.style.background = '#0d0f14';
            wrapper.appendChild(video);
            return wrapper;
        }

        return null;
    }

    function createPostBlock(post) {
        const { card, content, actions } = createCardShell();

        content.appendChild(createMetaLabel('Publicacion', '#00c896'));
        content.appendChild(createTitle(post.titulo || 'Sin titulo'));
        content.appendChild(createMeta(`Autor: ${post.autor || 'Vecino'} · ${post.created_at || ''}`));
        content.appendChild(createBody(post.contenido || 'Sin contenido'));

        const mediaItems = Array.isArray(post.media) ? post.media : (post.media ? [post.media] : []);
        if (mediaItems.length > 0) {
            mediaItems.forEach((item) => {
                const mediaNode = createMediaNode(item);
                if (mediaNode) content.appendChild(mediaNode);
            });
        }

        actions.appendChild(
            createActionButton('Aprobar', '#00c896', '#04120d', () => aprobarPublicacion(post.id))
        );
        actions.appendChild(
            createActionButton('Rechazar', '#ef4444', '#ffffff', () => rechazarPublicacion(post.id))
        );

        return card;
    }

    function createEventBlock(event) {
        const { card, content, actions } = createCardShell();

        content.appendChild(createMetaLabel('Evento', '#60a5fa'));
        content.appendChild(createTitle(event.titulo || 'Sin titulo'));
        content.appendChild(createMeta(`Autor: ${event.autor || 'Vecino'} · ${event.created_at || ''}`));
        content.appendChild(createBody(event.descripcion || 'Sin descripcion'));

        const date = [event.fecha, event.hora].filter(Boolean).join(' · ');
        if (date) {
            const dateNode = document.createElement('p');
            dateNode.textContent = date;
            dateNode.style.fontSize = '12px';
            dateNode.style.color = '#6b7280';
            dateNode.style.marginTop = '8px';
            content.appendChild(dateNode);
        }

        actions.appendChild(
            createActionButton('Aprobar', '#00c896', '#04120d', () => aprobarEvento(event.id))
        );
        actions.appendChild(
            createActionButton('Rechazar', '#ef4444', '#ffffff', () => rechazarEvento(event.id))
        );

        return card;
    }

    function createNotificationBlock(item) {
        const card = document.createElement('div');
        card.style.background = '#1c2030';
        card.style.border = '1px solid rgba(255,255,255,0.08)';
        card.style.borderRadius = '12px';
        card.style.padding = '14px';
        card.style.marginBottom = '12px';

        const title = document.createElement('p');
        title.textContent = item.titulo || 'Notificacion';
        title.style.fontWeight = '600';
        title.style.color = '#e8eaf0';
        title.style.marginBottom = '4px';

        const desc = document.createElement('p');
        desc.textContent = item.descripcion || '';
        desc.style.fontSize = '14px';
        desc.style.color = '#cbd5e1';
        desc.style.lineHeight = '1.5';

        const date = document.createElement('p');
        date.textContent = item.created_at || '';
        date.style.fontSize = '12px';
        date.style.color = '#6b7280';
        date.style.marginTop = '8px';

        card.appendChild(title);
        card.appendChild(desc);
        card.appendChild(date);
        return card;
    }

    function renderEmpty(container, message) {
        container.innerHTML = '';
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = message;
        container.appendChild(empty);
    }

    async function refreshModerationPanels() {
        if (sessionStorage.getItem('centinela_admin') !== '1') return;

        const pendingList = document.getElementById('pending-posts-list');
        const pendingCount = document.getElementById('pendingPostsCount');
        const notifList = document.getElementById('admin-notifications-list');
        const notifCount = document.getElementById('adminNotifCount');

        try {
            const [posts, events, notifications] = await Promise.all([
                fetchPendingPosts(),
                fetchPendingEvents(),
                fetchAdminNotifications(),
            ]);

            const totalPending = posts.length + events.length;
            pendingCount.textContent = `${totalPending} pendientes`;

            pendingList.innerHTML = '';
            pendingList.dataset.moderationVersion = MODERATION_VERSION;
            if (posts.length === 0 && events.length === 0) {
                renderEmpty(pendingList, 'No hay solicitudes pendientes.');
            } else {
                posts.forEach((post) => pendingList.appendChild(createPostBlock(post)));
                events.forEach((event) => pendingList.appendChild(createEventBlock(event)));
            }

            const items = Array.isArray(notifications.items) ? notifications.items : [];
            notifCount.textContent = `${notifications.unread_count || 0} sin leer`;
            notifList.innerHTML = '';

            if (items.length === 0) {
                renderEmpty(notifList, 'No hay notificaciones de moderacion.');
            } else {
                items.forEach((item) => notifList.appendChild(createNotificationBlock(item)));
            }
        } catch (error) {
            renderEmpty(pendingList, 'No se pudo cargar la moderacion.');
            renderEmpty(notifList, 'No se pudieron cargar las notificaciones del admin.');
        }
    }

    window.aprobarPublicacion = async function aprobarPublicacion(postId) {
        const response = await fetch(`${API}/admin/posts/${postId}/approve`, {
            method: 'POST',
            headers: { 'X-Admin-Token': ADMIN_TOKEN },
        });
        if (!response.ok) {
            alert('No se pudo aprobar la publicacion.');
            return;
        }
        await refreshModerationPanels();
    };

    window.rechazarPublicacion = async function rechazarPublicacion(postId) {
        const reason = prompt('Motivo del rechazo (opcional):', '') || '';
        const response = await fetch(`${API}/admin/posts/${postId}/reject`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Token': ADMIN_TOKEN,
            },
            body: JSON.stringify({ reason }),
        });
        if (!response.ok) {
            alert('No se pudo rechazar la publicacion.');
            return;
        }
        await refreshModerationPanels();
    };

    window.aprobarEvento = async function aprobarEvento(eventId) {
        const response = await fetch(`${API}/admin/events/${eventId}/approve`, {
            method: 'POST',
            headers: { 'X-Admin-Token': ADMIN_TOKEN },
        });
        if (!response.ok) {
            alert('No se pudo aprobar el evento.');
            return;
        }
        await refreshModerationPanels();
    };

    window.rechazarEvento = async function rechazarEvento(eventId) {
        const reason = prompt('Motivo del rechazo (opcional):', '') || '';
        const response = await fetch(`${API}/admin/events/${eventId}/reject`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Token': ADMIN_TOKEN,
            },
            body: JSON.stringify({ reason }),
        });
        if (!response.ok) {
            alert('No se pudo rechazar el evento.');
            return;
        }
        await refreshModerationPanels();
    };

    const originalMostrarPanel = window.mostrarPanel;
    if (typeof originalMostrarPanel === 'function') {
        window.mostrarPanel = function mostrarPanelConModeracion() {
            originalMostrarPanel();
            refreshModerationPanels();
        };
    }

    if (sessionStorage.getItem('centinela_admin') === '1') {
        refreshModerationPanels();
    }
})();
