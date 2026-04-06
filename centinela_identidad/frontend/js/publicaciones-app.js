(function () {
    const runtime = window.CentinelaRuntime;
    const API = runtime ? runtime.serviceUrl(5002) : 'http://localhost:5002';
    const POSTS_API = `${API}/posts`;
    const NOTIFICATIONS_API = `${API}/notifications`;
    const token = localStorage.getItem('token');
    const nombre = localStorage.getItem('usuarioActual') || localStorage.getItem('nombre') || 'Vecino';
    const casa = localStorage.getItem('numeroCasa') || '';
    let composeMedia = [];

    if (!token) {
        location.href = runtime ? runtime.appUrl('login.html') : 'http://localhost:3000/login.html';
        return;
    }

    const userName = document.getElementById('user-name');
    const userCasa = document.getElementById('user-casa');
    const userInitial = document.getElementById('user-initial');
    const composeInitial = document.getElementById('compose-initial');
    const composeMediaInput = document.getElementById('compose-media');
    const composeMediaPreview = document.getElementById('compose-media-preview');
    const composeTitulo = document.getElementById('compose-titulo');
    const composeContenido = document.getElementById('compose-contenido');
    const postsFeed = document.getElementById('posts-feed');
    const loading = document.getElementById('loading');
    const publishButton = document.getElementById('btn-publicar');

    if (userName) userName.textContent = nombre;
    if (userCasa) userCasa.textContent = casa || 'Centinela';
    if (userInitial) userInitial.textContent = nombre.charAt(0).toUpperCase();
    if (composeInitial) composeInitial.textContent = nombre.charAt(0).toUpperCase();

    const mediaModal = document.createElement('div');
    mediaModal.id = 'media-modal';
    mediaModal.className = 'hidden fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm items-center justify-center p-6';
    mediaModal.innerHTML = `
        <button type="button" onclick="closeMediaModal()" class="absolute top-6 right-6 text-white text-2xl">×</button>
        <img id="media-modal-image" src="" alt="Vista previa" class="max-w-full max-h-full rounded-2xl border border-white/10"/>
    `;
    document.body.appendChild(mediaModal);

    window.cerrarSesion = function cerrarSesion(event) {
        event.stopPropagation();
        localStorage.clear();
        location.href = runtime ? runtime.appUrl('login.html') : 'http://localhost:3000/login.html';
    };

    window.openMediaModal = function openMediaModal(url) {
        document.getElementById('media-modal-image').src = url;
        mediaModal.classList.remove('hidden');
        mediaModal.classList.add('flex');
    };

    window.closeMediaModal = function closeMediaModal() {
        mediaModal.classList.add('hidden');
        mediaModal.classList.remove('flex');
        document.getElementById('media-modal-image').src = '';
    };

    function escapeHtml(text) {
        return (text || '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        }[char]));
    }

    function getInitial(text) {
        return (text || 'V').charAt(0).toUpperCase();
    }

    function formatRelativeTime(isoString) {
        if (!isoString) {
            return 'Hace unos momentos';
        }

        const date = new Date(isoString);
        if (Number.isNaN(date.getTime())) {
            return 'Hace unos momentos';
        }

        const diffMs = Date.now() - date.getTime();
        const minutes = Math.max(1, Math.floor(diffMs / 60000));
        if (minutes < 60) {
            return `Hace ${minutes} min`;
        }

        const hours = Math.floor(minutes / 60);
        if (hours < 24) {
            return `Hace ${hours} h`;
        }

        const days = Math.floor(hours / 24);
        if (days < 7) {
            return `Hace ${days} dia${days === 1 ? '' : 's'}`;
        }

        return date.toLocaleDateString('es-MX');
    }

    function renderMedia(media) {
        if (!Array.isArray(media) || media.length === 0) {
            return '';
        }

        return `
            <div class="grid grid-cols-1 gap-3 mt-4">
                ${media.map((item) => item.type === 'video'
                    ? `<video controls class="w-full rounded-2xl border border-border-dark bg-black max-h-[24rem]"><source src="${item.url}"></video>`
                    : `<img src="${item.url}" alt="${escapeHtml(item.name || 'Imagen de publicacion')}" onclick="openMediaModal('${item.url}')" class="w-full rounded-2xl border border-border-dark object-cover max-h-[24rem] cursor-zoom-in"/>`).join('')}
            </div>
        `;
    }

    function renderComments(post) {
        const comments = Array.isArray(post.comments) ? post.comments : [];
        return `
            <div class="mt-4 border-t border-border-dark pt-4 space-y-3">
                <div class="space-y-2">
                    ${comments.length
                        ? comments.map((comment) => `
                            <div class="bg-surface-darker border border-border-dark rounded-xl p-3">
                                <div class="flex items-center justify-between gap-3 mb-1">
                                    <p class="text-sm font-semibold text-white">${escapeHtml(comment.autor || 'Vecino')}</p>
                                    <p class="text-xs text-text-muted">${formatRelativeTime(comment.created_at)}</p>
                                </div>
                                <p class="text-sm text-gray-300">${escapeHtml(comment.contenido || '')}</p>
                                <div class="flex items-center gap-4 mt-2">
                                    <button onclick="toggleCommentLike(${comment.id}, ${comment.liked_by_current_user ? 'true' : 'false'})" class="text-xs ${comment.liked_by_current_user ? 'text-pink-400' : 'text-text-muted'} hover:text-pink-400 transition-colors">
                                        ${comment.liked_by_current_user ? '♥' : '♡'} ${comment.like_count || 0}
                                    </button>
                                    <button onclick="toggleReplyBox(${comment.id})" class="text-xs text-text-muted hover:text-primary transition-colors">
                                        Responder
                                    </button>
                                </div>
                                <div id="reply-box-${comment.id}" class="hidden mt-3 flex gap-2">
                                    <input id="reply-input-${comment.id}" type="text" placeholder="Responder comentario..."
                                        class="flex-1 bg-surface-dark border border-border-dark rounded-xl px-3 py-2 text-white text-sm placeholder-text-muted focus:outline-none focus:border-primary/50"/>
                                    <button onclick="responderComentario(${post.id}, ${comment.id})"
                                        class="px-3 py-2 rounded-xl bg-primary text-bg-dark font-semibold text-sm hover:bg-primary-dim transition-colors">
                                        Enviar
                                    </button>
                                </div>
                                ${(comment.replies || []).map((reply) => `
                                    <div class="mt-3 ml-4 pl-4 border-l border-border-dark">
                                        <div class="flex items-center justify-between gap-3 mb-1">
                                            <p class="text-sm font-semibold text-white">${escapeHtml(reply.autor || 'Vecino')}</p>
                                            <p class="text-xs text-text-muted">${formatRelativeTime(reply.created_at)}</p>
                                        </div>
                                        <p class="text-sm text-gray-300">${escapeHtml(reply.contenido || '')}</p>
                                        <button onclick="toggleCommentLike(${reply.id}, ${reply.liked_by_current_user ? 'true' : 'false'})" class="text-xs mt-2 ${reply.liked_by_current_user ? 'text-pink-400' : 'text-text-muted'} hover:text-pink-400 transition-colors">
                                            ${reply.liked_by_current_user ? '♥' : '♡'} ${reply.like_count || 0}
                                        </button>
                                    </div>
                                `).join('')}
                            </div>
                        `).join('')
                        : '<p class="text-sm text-text-muted">Todavia no hay comentarios.</p>'}
                </div>
                <div class="flex gap-2">
                    <input id="comment-input-${post.id}" type="text" placeholder="Escribe un comentario..."
                        class="flex-1 bg-surface-darker border border-border-dark rounded-xl px-4 py-2.5 text-white text-sm placeholder-text-muted focus:outline-none focus:border-primary/50"/>
                    <button onclick="comentarPost(${post.id})"
                        class="px-4 py-2.5 rounded-xl bg-primary text-bg-dark font-semibold text-sm hover:bg-primary-dim transition-colors">
                        Comentar
                    </button>
                </div>
            </div>
        `;
    }

    function renderComposeMediaPreview() {
        if (!composeMediaPreview) {
            return;
        }

        if (!composeMedia.length) {
            composeMediaPreview.innerHTML = '';
            return;
        }

        composeMediaPreview.innerHTML = composeMedia.map((item, index) => `
            <div class="relative bg-surface-darker border border-border-dark rounded-2xl overflow-hidden">
                <button type="button" onclick="removeComposeMedia(${index})" class="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center">
                    <span class="material-icons-round text-sm">close</span>
                </button>
                ${item.type === 'video'
                    ? `<video src="${item.url}" class="w-full h-40 object-cover" muted></video>`
                    : `<img src="${item.url}" alt="${escapeHtml(item.name)}" class="w-full h-40 object-cover"/>`}
                <div class="p-3">
                    <p class="text-xs text-text-muted truncate">${escapeHtml(item.name || 'Archivo')}</p>
                </div>
            </div>
        `).join('');
    }

    window.removeComposeMedia = function removeComposeMedia(index) {
        composeMedia.splice(index, 1);
        renderComposeMediaPreview();
    };

    async function filesToMedia(files) {
        const selected = Array.from(files || []);
        const nextMedia = await Promise.all(selected.map((file) => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({
                type: file.type.startsWith('video/') ? 'video' : 'image',
                url: reader.result,
                name: file.name,
            });
            reader.onerror = reject;
            reader.readAsDataURL(file);
        })));

        composeMedia = [...composeMedia, ...nextMedia];
        renderComposeMediaPreview();
    }

    function renderPost(post) {
        const isMine = (post.autor || '').trim().toLowerCase() === nombre.trim().toLowerCase();
        const liked = !!post.liked_by_current_user;
        const content = escapeHtml(post.contenido || '').replace(/\n/g, '<br>');
        const statusLabel = post.status === 'pending'
            ? '<span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-yellow-500/15 text-yellow-300 border border-yellow-500/30">Pendiente de aprobacion</span>'
            : post.status === 'rejected'
                ? `<span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-red-500/15 text-red-300 border border-red-500/30">Rechazada${post.rejection_reason ? `: ${escapeHtml(post.rejection_reason)}` : ''}</span>`
                : '';

        return `
            <div class="card-hover bg-surface-dark border border-border-dark rounded-2xl overflow-hidden fade-up" id="post-${post.id}">
                <div class="p-5">
                    <div class="flex items-center justify-between mb-4">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold text-sm">
                                ${getInitial(post.autor)}
                            </div>
                            <div>
                                <p class="font-semibold text-white text-sm">${escapeHtml(post.autor || 'Vecino')}</p>
                                <p class="text-text-muted text-xs">${formatRelativeTime(post.created_at)}</p>
                            </div>
                        </div>
                        ${isMine ? `
                            <div class="flex items-center gap-2">
                                <button onclick="editarPost(${post.id})" class="text-text-muted hover:text-primary transition-colors p-1"><span class="material-icons-round text-base">edit</span></button>
                                <button onclick="eliminarPost(${post.id})" class="text-text-muted hover:text-sos transition-colors p-1"><span class="material-icons-round text-base">delete</span></button>
                            </div>
                        ` : ''}
                    </div>
                    ${statusLabel ? `<div class="mb-3">${statusLabel}</div>` : ''}
                    ${post.titulo ? `<h3 class="font-bold text-white text-lg mb-2">${escapeHtml(post.titulo)}</h3>` : ''}
                    ${post.contenido ? `<p class="text-gray-300 text-sm leading-relaxed">${content}</p>` : ''}
                    ${renderMedia(post.media)}
                    ${renderComments(post)}
                </div>
                <div class="px-5 pb-4 flex items-center gap-6 border-t border-border-dark pt-4">
                    <button onclick="toggleLike(${post.id}, ${liked ? 'true' : 'false'})" class="like-btn flex items-center gap-2 text-text-muted text-sm ${liked ? 'liked' : ''}">
                        <span class="material-icons-round text-lg">${liked ? 'favorite' : 'favorite_border'}</span>
                        <span>${post.like_count || 0}</span>
                    </button>
                    <button onclick="focusComment(${post.id})" class="flex items-center gap-2 text-text-muted text-sm hover:text-primary transition-colors">
                        <span class="material-icons-round text-lg">chat_bubble_outline</span>
                        <span>${post.comment_count || 0}</span>
                    </button>
                    <button onclick="compartirPost(${post.id})" class="flex items-center gap-2 text-text-muted text-sm hover:text-primary transition-colors ml-auto">
                        <span class="material-icons-round text-lg">share</span>
                        <span>${post.share_count || 0}</span>
                    </button>
                </div>
            </div>
        `;
    }

    async function refreshNotificationBadge() {
        try {
            const response = await fetch(NOTIFICATIONS_API, {
                headers: { Authorization: `Token ${token}` },
            });
            if (!response.ok) {
                return;
            }
            const data = await response.json();
            const badge = document.getElementById('nav-badge-count');
            if (badge) {
                badge.textContent = data.unread_count || 0;
            }
        } catch (error) {}
    }

    async function loadPosts() {
        try {
            const response = await fetch(POSTS_API, {
                headers: { Authorization: `Token ${token}` },
            });
            const data = await response.json();
            if (loading) {
                loading.classList.add('hidden');
            }
            if (postsFeed) {
                postsFeed.classList.remove('hidden');
            }

            if (!Array.isArray(data) || data.length === 0) {
                postsFeed.innerHTML = '<div class="text-center py-10 text-text-muted">No hay publicaciones aun. Se el primero.</div>';
                return;
            }

            postsFeed.innerHTML = data.map(renderPost).join('');
        } catch (error) {
            if (loading) {
                loading.innerHTML = '<p class="text-center text-text-muted py-10">Error al conectar con el Tablon (:5002). Verifica que el servicio este corriendo.</p>';
            }
        }
    }

    window.toggleLike = async function toggleLike(postId, liked) {
        const method = liked ? 'DELETE' : 'POST';
        const response = await fetch(`${POSTS_API}/${postId}/likes`, {
            method,
            headers: { Authorization: `Token ${token}` },
        });

        if (response.ok) {
            await loadPosts();
            await refreshNotificationBadge();
        }
    };

    window.focusComment = function focusComment(postId) {
        const input = document.getElementById(`comment-input-${postId}`);
        if (input) {
            input.focus();
        }
    };

    window.toggleReplyBox = function toggleReplyBox(commentId) {
        const box = document.getElementById(`reply-box-${commentId}`);
        if (box) {
            box.classList.toggle('hidden');
        }
    };

    window.comentarPost = async function comentarPost(postId) {
        const input = document.getElementById(`comment-input-${postId}`);
        const contenido = (input?.value || '').trim();
        if (!contenido) {
            alert('Escribe un comentario antes de enviarlo.');
            return;
        }

        const response = await fetch(`${POSTS_API}/${postId}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Token ${token}`,
            },
            body: JSON.stringify({ contenido }),
        });

        if (!response.ok) {
            alert('No se pudo guardar el comentario.');
            return;
        }

        input.value = '';
        await loadPosts();
        await refreshNotificationBadge();
    };

    window.responderComentario = async function responderComentario(postId, commentId) {
        const input = document.getElementById(`reply-input-${commentId}`);
        const contenido = (input?.value || '').trim();
        if (!contenido) {
            alert('Escribe una respuesta antes de enviarla.');
            return;
        }

        const response = await fetch(`${POSTS_API}/${postId}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Token ${token}`,
            },
            body: JSON.stringify({ contenido, parent_comment_id: commentId }),
        });

        if (!response.ok) {
            alert('No se pudo guardar la respuesta.');
            return;
        }

        input.value = '';
        await loadPosts();
        await refreshNotificationBadge();
    };

    window.toggleCommentLike = async function toggleCommentLike(commentId, liked) {
        const response = await fetch(`${API}/comments/${commentId}/likes`, {
            method: liked ? 'DELETE' : 'POST',
            headers: { Authorization: `Token ${token}` },
        });

        if (!response.ok) {
            alert('No se pudo actualizar el like del comentario.');
            return;
        }

        await loadPosts();
    };

    window.compartirPost = async function compartirPost(postId) {
        const response = await fetch(`${POSTS_API}/${postId}/shares`, {
            method: 'POST',
            headers: { Authorization: `Token ${token}` },
        });

        if (!response.ok) {
            alert('No se pudo compartir la publicacion.');
            return;
        }

        const shareUrl = `${window.location.origin}/publicaciones.html#post-${postId}`;
        const shareText = `Mira esta publicacion en Centinela: ${shareUrl}`;

        try {
            if (navigator.share) {
                await navigator.share({
                    title: 'Publicacion de Centinela',
                    text: shareText,
                    url: shareUrl,
                });
            } else if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(shareText);
                alert('Enlace copiado para compartir.');
            } else {
                alert(shareText);
            }
        } catch (error) {}

        await loadPosts();
        await refreshNotificationBadge();
    };

    window.publicar = async function publicar() {
        const titulo = composeTitulo.value.trim();
        const contenido = composeContenido.value.trim();
        if (!contenido && composeMedia.length === 0) {
            alert('Escribe algo o agrega un archivo para publicar.');
            return;
        }

        publishButton.textContent = 'Publicando...';
        publishButton.disabled = true;

        try {
            const response = await fetch(POSTS_API, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Token ${token}`,
                },
                body: JSON.stringify({
                    titulo: titulo || contenido.slice(0, 40) || 'Nueva publicacion',
                    contenido,
                    media: composeMedia,
                }),
            });

            if (response.ok) {
                composeTitulo.value = '';
                composeContenido.value = '';
                if (composeMediaInput) {
                    composeMediaInput.value = '';
                }
                composeMedia = [];
                renderComposeMediaPreview();
                await loadPosts();
                await refreshNotificationBadge();
            } else if (response.status === 401) {
                alert('Sesion expirada. Inicia sesion nuevamente.');
                localStorage.clear();
        location.href = runtime ? runtime.appUrl('login.html') : 'http://localhost:3000/login.html';
            } else {
                alert('No se pudo publicar en este momento.');
            }
        } catch (error) {
            alert('Error de conexion con el Tablon (:5002)');
        } finally {
            publishButton.innerHTML = '<span class="material-icons-round text-lg">send</span> Publicar';
            publishButton.disabled = false;
        }
    };

    window.editarPost = async function editarPost(postId) {
        const response = await fetch(POSTS_API, {
            headers: { Authorization: `Token ${token}` },
        });
        if (!response.ok) {
            alert('No se pudo cargar la publicacion para editar.');
            return;
        }

        const posts = await response.json();
        const post = Array.isArray(posts) ? posts.find((item) => item.id === postId) : null;
        if (!post) {
            alert('No se encontro la publicacion.');
            return;
        }

        const nuevoTitulo = prompt('Editar titulo', post.titulo || '');
        if (nuevoTitulo === null) return;
        const nuevoContenido = prompt('Editar contenido', post.contenido || '');
        if (nuevoContenido === null) return;

        const updateResponse = await fetch(`${POSTS_API}/${postId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Token ${token}`,
            },
            body: JSON.stringify({
                titulo: nuevoTitulo,
                contenido: nuevoContenido,
                media: post.media || [],
            }),
        });

        if (!updateResponse.ok) {
            alert('No se pudo actualizar la publicacion.');
            return;
        }

        await loadPosts();
        await refreshNotificationBadge();
    };

    window.eliminarPost = async function eliminarPost(postId) {
        if (!confirm('Eliminar esta publicacion?')) {
            return;
        }

        await fetch(`${POSTS_API}/${postId}`, {
            method: 'DELETE',
            headers: { Authorization: `Token ${token}` },
        });
        await loadPosts();
        await refreshNotificationBadge();
    };

    if (composeMediaInput) {
        composeMediaInput.addEventListener('change', async (event) => {
            try {
                await filesToMedia(event.target.files);
                event.target.value = '';
            } catch (error) {
                alert('No se pudieron cargar los archivos seleccionados');
            }
        });
    }

    loadPosts();
    refreshNotificationBadge();
})();
