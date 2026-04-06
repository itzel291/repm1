(function () {
    const runtime = window.CentinelaRuntime;
    const API = runtime ? runtime.serviceUrl(5002, '/notifications') : 'http://localhost:5002/notifications';
    const token = localStorage.getItem('token');
    const nombre = localStorage.getItem('usuarioActual') || localStorage.getItem('nombre') || 'Vecino';
    const casa = localStorage.getItem('numeroCasa') || '';

    if (!token) {
        location.href = runtime ? runtime.appUrl('login.html') : 'http://localhost:3000/login.html';
        return;
    }

    const userName = document.getElementById('user-name');
    const userCasa = document.getElementById('user-casa');
    const userInitial = document.getElementById('user-initial');
    const notifCount = document.getElementById('notif-count');
    const badgeCount = document.getElementById('badge-count');
    const notifList = document.getElementById('notif-list');

    if (userName) userName.textContent = nombre;
    if (userCasa) userCasa.textContent = casa || 'Centinela';
    if (userInitial) userInitial.textContent = nombre.charAt(0).toUpperCase();

    window.cerrarSesion = function cerrarSesion(event) {
        event.stopPropagation();
        localStorage.clear();
        location.href = runtime ? runtime.appUrl('login.html') : 'http://localhost:3000/login.html';
    };

    function formatRelativeTime(isoString) {
        if (!isoString) return 'Hace unos momentos';
        const date = new Date(isoString);
        if (Number.isNaN(date.getTime())) return 'Hace unos momentos';

        const diffMs = Date.now() - date.getTime();
        const minutes = Math.max(1, Math.floor(diffMs / 60000));
        if (minutes < 60) return `Hace ${minutes} min`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `Hace ${hours} h`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `Hace ${days} dia${days === 1 ? '' : 's'}`;
        return date.toLocaleDateString('es-MX');
    }

    function styleForType(type) {
        const styles = {
            like: { icono: 'favorite', color: 'text-pink-400', bg: 'bg-pink-500/10 border-pink-500/20' },
            comment: { icono: 'chat_bubble', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
            comment_reply: { icono: 'reply', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
            share: { icono: 'share', color: 'text-primary', bg: 'bg-primary/10 border-primary/20' },
            post: { icono: 'article', color: 'text-primary', bg: 'bg-primary/10 border-primary/20' },
            post_approved: { icono: 'verified', color: 'text-primary', bg: 'bg-primary/10 border-primary/20' },
            post_rejected: { icono: 'report', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
            event_approved: { icono: 'event_available', color: 'text-primary', bg: 'bg-primary/10 border-primary/20' },
            event_rejected: { icono: 'event_busy', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
        };
        return styles[type] || { icono: 'notifications', color: 'text-primary', bg: 'bg-primary/10 border-primary/20' };
    }

    async function fetchNotifications() {
        const response = await fetch(API, {
            headers: { Authorization: `Token ${token}` },
        });

        if (!response.ok) {
            throw new Error('No se pudieron obtener las notificaciones');
        }

        return response.json();
    }

    async function markAsRead(id) {
        await fetch(`${API}/${id}/read`, {
            method: 'POST',
            headers: { Authorization: `Token ${token}` },
        });
    }

    window.marcarTodas = async function marcarTodas() {
        await fetch(`${API}/read-all`, {
            method: 'POST',
            headers: { Authorization: `Token ${token}` },
        });
        await renderNotifications();
    };

    window.abrirNotif = async function abrirNotif(id, link) {
        await markAsRead(id);
        if (link) {
            location.href = link;
            return;
        }
        await renderNotifications();
    };

    async function renderNotifications() {
        try {
            const data = await fetchNotifications();
            const items = Array.isArray(data.items) ? data.items : [];
            const unreadCount = data.unread_count || 0;

            if (notifCount) notifCount.textContent = `${unreadCount} sin leer`;
            if (badgeCount) badgeCount.textContent = unreadCount;

            if (!items.length) {
                notifList.innerHTML = '<div class="bg-surface-dark border border-border-dark rounded-2xl p-6 text-text-muted">No tienes notificaciones todavia.</div>';
                return;
            }

            notifList.innerHTML = items.map((item) => {
                const style = styleForType(item.tipo);
                return `
                    <div onclick="abrirNotif(${item.id}, '${(item.link || '').replace(/'/g, "\\'")}')" class="notif-item cursor-pointer flex items-start gap-4 p-4 rounded-2xl border ${item.leida ? 'border-border-dark bg-surface-dark/50' : 'border-border-dark bg-surface-dark'} relative">
                        ${!item.leida ? '<div class="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 bg-primary rounded-full"></div>' : ''}
                        <div class="w-11 h-11 rounded-xl ${style.bg} border flex items-center justify-center shrink-0 ml-2">
                            <span class="material-icons-round ${style.color}">${style.icono}</span>
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="font-semibold text-white text-sm">${item.titulo || 'Notificacion'}</p>
                            <p class="text-text-muted text-sm mt-0.5 line-clamp-2">${item.descripcion || ''}</p>
                            <p class="text-text-muted text-xs mt-2">${formatRelativeTime(item.created_at)}</p>
                        </div>
                        <span class="material-icons-round text-text-muted text-sm shrink-0 mt-1">chevron_right</span>
                    </div>
                `;
            }).join('');
        } catch (error) {
            notifList.innerHTML = '<div class="bg-surface-dark border border-border-dark rounded-2xl p-6 text-text-muted">No se pudieron cargar las notificaciones reales.</div>';
            if (notifCount) notifCount.textContent = 'Error de carga';
            if (badgeCount) badgeCount.textContent = '0';
        }
    }

    renderNotifications();
})();
