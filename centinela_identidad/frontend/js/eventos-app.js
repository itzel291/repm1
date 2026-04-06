(function () {
    const runtime = window.CentinelaRuntime;
    const API = runtime ? runtime.serviceUrl(5002) : 'http://localhost:5002';
    const EVENTS_API = `${API}/events`;
    const NOTIFICATIONS_API = `${API}/notifications`;
    const token = localStorage.getItem('token');
    const nombre = localStorage.getItem('usuarioActual') || localStorage.getItem('nombre') || 'Vecino';
    const casa = localStorage.getItem('numeroCasa') || '';

    if (!token) {
        location.href = runtime ? runtime.appUrl('login.html') : 'http://localhost:3000/login.html';
        return;
    }

    document.getElementById('user-name').textContent = nombre;
    document.getElementById('user-casa').textContent = casa || 'Centinela';
    document.getElementById('user-initial').textContent = nombre.charAt(0).toUpperCase();

    const eventsGrid = document.getElementById('events-grid');
    const modalEvento = document.getElementById('modal-evento');
    const modalMisEventos = document.getElementById('modal-mis-eventos');
    const myEventsList = document.getElementById('mis-eventos-lista');
    const calendarGrid = document.getElementById('events-calendar-grid');
    const calendarMonthLabel = document.getElementById('calendar-month-label');
    const calendarSelectedDateLabel = document.getElementById('calendar-selected-date-label');
    const calendarSelectedEvents = document.getElementById('calendar-selected-events');
    const calendarPrevButton = document.getElementById('calendar-prev');
    const calendarNextButton = document.getElementById('calendar-next');
    const calendarTodayButton = document.getElementById('calendar-today');

    let approvedEvents = [];
    let calendarMonthCursor = new Date();
    let selectedCalendarDate = null;

    window.cerrarSesion = function cerrarSesion(event) {
        event.stopPropagation();
        localStorage.clear();
        location.href = runtime ? runtime.appUrl('login.html') : 'http://localhost:3000/login.html';
    };

    window.abrirNuevoEvento = function abrirNuevoEvento() {
        modalEvento.classList.remove('hidden');
    };

    function initialOf(text) {
        return (text || 'V').charAt(0).toUpperCase();
    }

    function formatCreatedAt(isoString) {
        if (!isoString) return 'Hace unos momentos';
        const date = new Date(isoString);
        if (Number.isNaN(date.getTime())) return 'Hace unos momentos';
        return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
    }

    function formatDate(fecha, hora) {
        if (!fecha && !hora) return '';
        const parts = [];
        if (fecha) parts.push(fecha);
        if (hora) parts.push(hora);
        return parts.join(' | ');
    }

    function toDateKey(value) {
        if (!value) return '';
        const [year, month, day] = String(value).split('-');
        if (!year || !month || !day) return '';
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    function formatHumanDate(dateKey) {
        if (!dateKey) return 'Sin fecha';
        const date = new Date(`${dateKey}T12:00:00`);
        if (Number.isNaN(date.getTime())) return dateKey;
        return new Intl.DateTimeFormat('es-MX', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        }).format(date);
    }

    function groupEventsByDate(events) {
        return events.reduce((acc, evento) => {
            const key = toDateKey(evento.fecha);
            if (!key) return acc;
            if (!acc[key]) acc[key] = [];
            acc[key].push(evento);
            return acc;
        }, {});
    }

    function renderEventCard(evento) {
        const statusLabel = evento.status === 'pending'
            ? '<span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-yellow-500/15 text-yellow-300 border border-yellow-500/30 mb-3">Pendiente de aprobacion</span>'
            : evento.status === 'rejected'
                ? `<span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-red-500/15 text-red-300 border border-red-500/30 mb-3">Rechazado${evento.rejection_reason ? `: ${evento.rejection_reason}` : ''}</span>`
                : '';
        const isMine = (evento.autor || '').trim().toLowerCase() === nombre.trim().toLowerCase();

        return `
            <article class="ev-card card-hover bg-surface-dark border border-border-dark rounded-2xl overflow-hidden cursor-pointer">
                <div class="flex items-center justify-between p-4 border-b border-border-dark">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold text-sm">${initialOf(evento.autor)}</div>
                        <div>
                            <p class="font-bold text-white text-sm">${evento.autor || 'Vecino'}</p>
                            <p class="text-text-muted text-xs">${formatCreatedAt(evento.created_at)}</p>
                        </div>
                    </div>
                    ${isMine ? `
                        <div class="flex items-center gap-2">
                            <button onclick="editarEvento(${evento.id})" class="text-text-muted hover:text-primary transition-colors">
                                <span class="material-icons-round text-base">edit</span>
                            </button>
                            <button onclick="eliminarEvento(${evento.id})" class="text-text-muted hover:text-red-400 transition-colors">
                                <span class="material-icons-round text-base">delete</span>
                            </button>
                        </div>
                    ` : ''}
                </div>
                <div class="p-5">
                    ${statusLabel}
                    <span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-primary/10 text-primary border border-primary/20 mb-3">${evento.categoria || 'Comunitario'}</span>
                    <h4 class="font-bold text-white text-lg mb-2">${evento.titulo || 'Evento'}</h4>
                    ${evento.descripcion ? `<p class="text-gray-300 text-sm leading-relaxed mb-4">${evento.descripcion}</p>` : ''}
                    ${formatDate(evento.fecha, evento.hora)
                        ? `<div class="bg-primary/10 border border-primary/20 rounded-xl p-3 flex items-center gap-3 mb-4">
                            <span class="material-icons-round text-primary text-lg">calendar_today</span>
                            <span class="text-primary text-sm font-semibold">${formatDate(evento.fecha, evento.hora)}</span>
                        </div>`
                        : ''}
                </div>
            </article>
        `;
    }

    function renderSelectedDateEvents() {
        if (!calendarSelectedEvents || !calendarSelectedDateLabel) return;

        const grouped = groupEventsByDate(approvedEvents);
        const items = selectedCalendarDate ? (grouped[selectedCalendarDate] || []) : [];
        calendarSelectedDateLabel.textContent = selectedCalendarDate ? formatHumanDate(selectedCalendarDate) : 'Selecciona un dia';

        if (!selectedCalendarDate) {
            calendarSelectedEvents.innerHTML = '<div class="bg-surface-darker border border-border-dark rounded-2xl p-4 text-text-muted text-sm">Selecciona un dia del calendario para ver sus eventos.</div>';
            return;
        }

        if (!items.length) {
            calendarSelectedEvents.innerHTML = '<div class="bg-surface-darker border border-border-dark rounded-2xl p-4 text-text-muted text-sm">No hay eventos registrados para esta fecha.</div>';
            return;
        }

        calendarSelectedEvents.innerHTML = items.map((evento) => `
            <article class="bg-surface-darker border border-border-dark rounded-2xl p-4">
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <p class="text-xs uppercase tracking-widest text-primary">${evento.categoria || 'Comunitario'}</p>
                        <h4 class="text-base font-bold text-white mt-2">${evento.titulo || 'Evento'}</h4>
                    </div>
                    <span class="text-xs text-text-muted">${evento.hora || 'Sin hora'}</span>
                </div>
                ${evento.descripcion ? `<p class="text-sm text-text-muted mt-3">${evento.descripcion}</p>` : ''}
                <p class="text-xs text-text-muted mt-3">Organiza: ${evento.autor || 'Vecino'}</p>
            </article>
        `).join('');
    }

    function renderCalendar() {
        if (!calendarGrid || !calendarMonthLabel) return;

        const grouped = groupEventsByDate(approvedEvents);
        const year = calendarMonthCursor.getFullYear();
        const month = calendarMonthCursor.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startOffset = (firstDay.getDay() + 6) % 7;
        const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
        const now = new Date();
        const todayKey = toDateKey(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);

        calendarMonthLabel.textContent = new Intl.DateTimeFormat('es-MX', {
            month: 'long',
            year: 'numeric',
        }).format(firstDay);

        const cells = [];
        for (let index = 0; index < totalCells; index += 1) {
            const dayNumber = index - startOffset + 1;
            const inMonth = dayNumber >= 1 && dayNumber <= lastDay.getDate();

            if (!inMonth) {
                cells.push('<div class="min-h-[92px] rounded-2xl border border-transparent bg-transparent"></div>');
                continue;
            }

            const dateKey = toDateKey(`${year}-${String(month + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`);
            const events = grouped[dateKey] || [];
            const isToday = dateKey === todayKey;
            const isSelected = dateKey === selectedCalendarDate;

            cells.push(`
                <button
                    type="button"
                    data-calendar-date="${dateKey}"
                    class="calendar-day min-h-[92px] rounded-2xl border ${isSelected ? 'selected border-primary/60' : 'border-border-dark'} ${events.length ? 'has-events' : 'bg-surface-darker'} p-3 text-left"
                >
                    <div class="flex items-start justify-between gap-2">
                        <span class="text-sm font-bold ${isToday ? 'text-primary' : 'text-white'}">${dayNumber}</span>
                        ${events.length ? `<span class="inline-flex min-w-[22px] h-6 px-2 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-bold">${events.length}</span>` : ''}
                    </div>
                    <div class="mt-3 space-y-1">
                        ${events.slice(0, 2).map((evento) => `
                            <div class="truncate text-xs ${isSelected ? 'text-white' : 'text-text-muted'}">${evento.hora ? `${evento.hora} ` : ''}${evento.titulo || 'Evento'}</div>
                        `).join('')}
                        ${events.length > 2 ? `<div class="text-xs text-primary">+${events.length - 2} mas</div>` : ''}
                    </div>
                </button>
            `);
        }

        calendarGrid.innerHTML = cells.join('');
        calendarGrid.querySelectorAll('[data-calendar-date]').forEach((button) => {
            button.addEventListener('click', () => {
                selectedCalendarDate = button.dataset.calendarDate;
                renderCalendar();
                renderSelectedDateEvents();
            });
        });
    }

    async function refreshNotificationBadge() {
        try {
            const response = await fetch(NOTIFICATIONS_API, {
                headers: { Authorization: `Token ${token}` },
            });
            if (!response.ok) return;
            const data = await response.json();
            const badge = document.getElementById('nav-badge-count');
            if (!badge) return;
            const total = Number(data.unread_count || 0);
            badge.textContent = `${total}`;
            badge.classList.toggle('hidden', total <= 0);
        } catch (error) {}
    }

    async function loadEvents() {
        try {
            const response = await fetch(EVENTS_API, {
                headers: { Authorization: `Token ${token}` },
            });
            const data = await response.json();

            approvedEvents = Array.isArray(data)
                ? data.filter((evento) => evento.status === 'approved' || !evento.status)
                : [];

            if (!selectedCalendarDate && approvedEvents.length) {
                const firstWithDate = approvedEvents.find((evento) => evento.fecha);
                selectedCalendarDate = firstWithDate ? toDateKey(firstWithDate.fecha) : null;
            }

            renderCalendar();
            renderSelectedDateEvents();

            if (!Array.isArray(data) || data.length === 0) {
                eventsGrid.innerHTML = '<div class="col-span-full bg-surface-dark border border-border-dark rounded-2xl p-8 text-text-muted text-center">Aun no hay eventos registrados.</div>';
                return;
            }

            eventsGrid.innerHTML = data.map(renderEventCard).join('');
        } catch (error) {
            approvedEvents = [];
            renderCalendar();
            renderSelectedDateEvents();
            eventsGrid.innerHTML = '<div class="col-span-full bg-surface-dark border border-border-dark rounded-2xl p-8 text-text-muted text-center">No se pudieron cargar los eventos reales.</div>';
        }
    }

    window.crearEvento = async function crearEvento() {
        const titulo = document.getElementById('evt-titulo').value.trim();
        const descripcion = document.getElementById('evt-desc').value.trim();
        const fecha = document.getElementById('evt-fecha').value;
        const hora = document.getElementById('evt-hora').value.trim();
        const categoria = document.getElementById('evt-categoria').value;
        if (!titulo) {
            alert('El titulo es obligatorio');
            return;
        }

        const response = await fetch(EVENTS_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Token ${token}`,
            },
            body: JSON.stringify({ titulo, descripcion, fecha, hora, categoria }),
        });

        if (!response.ok) {
            alert('No se pudo crear el evento.');
            return;
        }

        document.getElementById('evt-titulo').value = '';
        document.getElementById('evt-desc').value = '';
        document.getElementById('evt-fecha').value = '';
        document.getElementById('evt-hora').value = '';
        document.getElementById('evt-categoria').value = 'Cultural';
        modalEvento.classList.add('hidden');
        await loadEvents();
    };

    window.verMisEventos = async function verMisEventos() {
        try {
            const response = await fetch(`${EVENTS_API}/mine`, {
                headers: { Authorization: `Token ${token}` },
            });
            const data = await response.json();
            if (!Array.isArray(data) || data.length === 0) {
                myEventsList.innerHTML = `
                    <div class="text-center py-10">
                        <span class="material-icons-round text-text-muted text-5xl block mb-3">event_busy</span>
                        <p class="text-text-muted text-sm">No has creado eventos aun.</p>
                    </div>`;
            } else {
                myEventsList.innerHTML = data.map((evento) => `
                    <div class="bg-surface-darker border border-border-dark rounded-xl p-4 mb-3">
                        <div class="flex items-start justify-between gap-2 mb-1">
                            <h4 class="font-bold text-white text-sm">${evento.titulo}</h4>
                            <span class="text-text-muted text-xs shrink-0">${formatCreatedAt(evento.created_at)}</span>
                        </div>
                        <div class="flex items-center gap-2 mb-2">
                            <span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-primary/10 text-primary border border-primary/20">${evento.categoria || 'Comunitario'}</span>
                            ${evento.status === 'pending' ? '<span class="text-xs text-yellow-300">Pendiente</span>' : ''}
                            ${evento.status === 'rejected' ? '<span class="text-xs text-red-300">Rechazado</span>' : ''}
                            ${evento.status === 'approved' ? '<span class="text-xs text-primary">Aprobado</span>' : ''}
                        </div>
                        ${evento.descripcion ? `<p class="text-text-muted text-sm mb-2">${evento.descripcion}</p>` : ''}
                        ${formatDate(evento.fecha, evento.hora) ? `
                            <div class="flex items-center gap-2 text-primary text-xs font-semibold mt-2">
                                <span class="material-icons-round text-sm">calendar_today</span>
                                ${formatDate(evento.fecha, evento.hora)}
                            </div>` : ''}
                        <div class="flex items-center gap-2 mt-3">
                            <button onclick="editarEvento(${evento.id})" class="px-3 py-2 rounded-xl bg-surface-dark border border-border-dark text-white text-xs hover:border-primary/40">Editar</button>
                            <button onclick="eliminarEvento(${evento.id})" class="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">Eliminar</button>
                        </div>
                    </div>
                `).join('');
            }
            modalMisEventos.classList.remove('hidden');
        } catch (error) {
            myEventsList.innerHTML = '<div class="text-text-muted text-sm">No se pudieron cargar tus eventos.</div>';
            modalMisEventos.classList.remove('hidden');
        }
    };

    window.editarEvento = async function editarEvento(eventId) {
        const response = await fetch(`${EVENTS_API}/mine`, {
            headers: { Authorization: `Token ${token}` },
        });
        if (!response.ok) {
            alert('No se pudo cargar el evento.');
            return;
        }

        const events = await response.json();
        const evento = Array.isArray(events) ? events.find((item) => item.id === eventId) : null;
        if (!evento) {
            alert('No se encontro el evento.');
            return;
        }

        const titulo = prompt('Editar titulo', evento.titulo || '');
        if (titulo === null) return;
        const descripcion = prompt('Editar descripcion', evento.descripcion || '');
        if (descripcion === null) return;
        const fecha = prompt('Editar fecha (YYYY-MM-DD)', evento.fecha || '');
        if (fecha === null) return;
        const hora = prompt('Editar hora', evento.hora || '');
        if (hora === null) return;
        const categoria = prompt('Editar categoria', evento.categoria || 'Comunitario');
        if (categoria === null) return;

        const updateResponse = await fetch(`${EVENTS_API}/${eventId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Token ${token}`,
            },
            body: JSON.stringify({ titulo, descripcion, fecha, hora, categoria }),
        });
        if (!updateResponse.ok) {
            alert('No se pudo actualizar el evento.');
            return;
        }

        await loadEvents();
        await window.verMisEventos();
    };

    window.eliminarEvento = async function eliminarEvento(eventId) {
        if (!confirm('Eliminar este evento?')) return;
        const response = await fetch(`${EVENTS_API}/${eventId}`, {
            method: 'DELETE',
            headers: { Authorization: `Token ${token}` },
        });
        if (!response.ok) {
            alert('No se pudo eliminar el evento.');
            return;
        }

        await loadEvents();
        if (!modalMisEventos.classList.contains('hidden')) {
            await window.verMisEventos();
        }
    };

    if (calendarPrevButton) {
        calendarPrevButton.addEventListener('click', () => {
            calendarMonthCursor = new Date(calendarMonthCursor.getFullYear(), calendarMonthCursor.getMonth() - 1, 1);
            renderCalendar();
        });
    }

    if (calendarNextButton) {
        calendarNextButton.addEventListener('click', () => {
            calendarMonthCursor = new Date(calendarMonthCursor.getFullYear(), calendarMonthCursor.getMonth() + 1, 1);
            renderCalendar();
        });
    }

    if (calendarTodayButton) {
        calendarTodayButton.addEventListener('click', () => {
            const now = new Date();
            calendarMonthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
            selectedCalendarDate = toDateKey(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
            renderCalendar();
            renderSelectedDateEvents();
        });
    }

    loadEvents();
    refreshNotificationBadge();
})();
