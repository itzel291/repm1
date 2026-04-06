(function () {
  const runtime = window.CentinelaRuntime;
  const API = runtime ? runtime.serviceUrl(5004) : 'http://localhost:5004';
  const MIN_OPCIONES = 2;
  const ADMIN_EMAIL = 'carolinaserranotoom@gmail.com';
  let chartsAdmin = [];
  let consultaSeleccionadaId = null;

  function parseXml(text) {
    return new DOMParser().parseFromString(text, 'application/xml');
  }

  function text(node, selector) {
    return node.querySelector(selector)?.textContent?.trim() || '';
  }

  function esc(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function clearAdminCharts() {
    chartsAdmin.forEach((chart) => chart.destroy());
    chartsAdmin = [];
  }

  function totalConsultaVotos(consulta) {
    return consulta.preguntas.reduce((total, pregunta) => (
      total + pregunta.opciones.reduce((sum, opcion) => sum + opcion.votos, 0)
    ), 0);
  }

  function chartPalette(index) {
    const colors = [
      'rgba(13, 242, 204, 0.88)',
      'rgba(59, 130, 246, 0.88)',
      'rgba(250, 204, 21, 0.88)',
      'rgba(244, 114, 182, 0.88)',
      'rgba(167, 139, 250, 0.88)',
      'rgba(52, 211, 153, 0.88)',
    ];
    return colors[index % colors.length];
  }

  function currentUser() {
    return {
      nombre: localStorage.getItem('usuarioActual') || 'Vecino',
      userId: localStorage.getItem('userId') || localStorage.getItem('usuarioActual') || 'vecino',
      viviendaId: localStorage.getItem('numeroCasa') || localStorage.getItem('viviendaId') || 'sin-casa',
      rol: (localStorage.getItem('rolActual') || 'usuario').toLowerCase(),
    };
  }

  function isAdminUser() {
    const user = currentUser();
    const adminEmail = (sessionStorage.getItem('adminEmail') || localStorage.getItem('adminEmail') || '').toLowerCase();
    return user.rol === 'admin'
      || sessionStorage.getItem('centinela_admin') === '1'
      || adminEmail === ADMIN_EMAIL;
  }

  async function fetchXml(url, options) {
    const res = await fetch(url, options);
    const body = await res.text();
    if (!res.ok) {
      throw new Error(body || `Error ${res.status}`);
    }
    return parseXml(body);
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  async function loadConsultas() {
    const xml = await fetchXml(`${API}/consultas/`);
    return Array.from(xml.querySelectorAll('consulta')).map((consultaNode) => ({
      id: text(consultaNode, 'id'),
      titulo: text(consultaNode, 'titulo'),
      estado: text(consultaNode, 'estado') || 'abierta',
      createdAt: text(consultaNode, 'created_at'),
      preguntas: Array.from(consultaNode.querySelectorAll(':scope > pregunta')).map((preguntaNode) => ({
        id: text(preguntaNode, 'id'),
        texto: text(preguntaNode, 'texto'),
        opciones: Array.from(preguntaNode.querySelectorAll(':scope > opcion')).map((opcionNode) => ({
          id: text(opcionNode, 'id'),
          texto: text(opcionNode, 'texto'),
          votos: Number(text(opcionNode, 'votos') || '0'),
        })),
      })),
    }));
  }

  async function verificarEstadoVoto(preguntaId) {
    const user = currentUser();
    const xml = await fetchXml(`${API}/votos/verificar/${preguntaId}`, {
      headers: { 'X-Vivienda-ID': user.viviendaId },
    });
    return text(xml, 'estado');
  }

  async function votar(preguntaId, opcionId) {
    const user = currentUser();
    const body = `<voto><pregunta_id>${preguntaId}</pregunta_id><opcion_id>${opcionId}</opcion_id></voto>`;
    await fetchXml(`${API}/votos/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml',
        'X-User-ID': user.userId,
        'X-Vivienda-ID': user.viviendaId,
      },
      body,
    });
  }

  async function fetchResultados(consultaId) {
    const xml = await fetchXml(`${API}/consultas/${consultaId}/resultados`);
    return {
      id: text(xml, 'consulta_id'),
      titulo: text(xml, 'titulo'),
      estado: text(xml, 'estado'),
      totalVotos: Number(text(xml, 'total_votos') || '0'),
      preguntas: Array.from(xml.documentElement.children)
        .filter((node) => node.tagName === 'pregunta')
        .map((preguntaNode) => ({
          id: text(preguntaNode, 'id'),
          texto: text(preguntaNode, 'texto'),
          totalVotos: Number(text(preguntaNode, 'total_votos') || '0'),
          opciones: Array.from(preguntaNode.querySelectorAll(':scope > opcion')).map((opcionNode) => ({
            id: text(opcionNode, 'id'),
            texto: text(opcionNode, 'texto'),
            votos: Number(text(opcionNode, 'votos') || '0'),
            porcentaje: Number(text(opcionNode, 'porcentaje') || '0'),
          })),
        })),
    };
  }

  async function cargarVistaVecino() {
    const container = document.getElementById('encuestas-lista');
    if (!container) return;
    container.innerHTML = '<p class="text-text-muted">Cargando encuestas...</p>';

    try {
      const consultas = await loadConsultas();
      const consultasConPreguntas = consultas.filter((consulta) => consulta.preguntas.length);
      if (!consultasConPreguntas.length) {
        container.innerHTML = '<div class="rounded-2xl border border-border-dark bg-surface-dark p-6 text-text-muted">No hay encuestas disponibles por ahora.</div>';
        return;
      }

      const states = {};
      for (const consulta of consultasConPreguntas) {
        for (const pregunta of consulta.preguntas) {
          states[pregunta.id] = await verificarEstadoVoto(pregunta.id);
        }
      }

      container.innerHTML = consultasConPreguntas.map((consulta) => {
        const abierta = consulta.estado === 'abierta';
        return `
          <article class="rounded-3xl border border-border-dark bg-surface-dark p-6 space-y-5">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-xs uppercase tracking-[0.25em] text-text-muted">Encuesta comunitaria</p>
                <h3 class="text-xl font-bold text-white mt-1">${esc(consulta.titulo)}</h3>
                <p class="text-xs text-text-muted mt-2">${formatDate(consulta.createdAt)}</p>
              </div>
              <span class="px-3 py-1 rounded-full text-xs font-semibold ${abierta ? 'bg-primary/15 text-primary border border-primary/20' : 'bg-sos/10 text-sos border border-sos/20'}">${abierta ? 'Abierta' : 'Cerrada'}</span>
            </div>
            ${consulta.preguntas.map((pregunta) => {
              const estado = states[pregunta.id] || 'no_voto';
              const bloqueada = estado === 'ya_voto' || estado === 'cerrada';
              return `
                <section class="rounded-2xl border border-border-dark bg-surface-darker p-5 space-y-4">
                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <h4 class="text-base font-semibold text-white">${esc(pregunta.texto)}</h4>
                    <span class="text-xs ${estado === 'ya_voto' ? 'text-primary' : 'text-text-muted'}">
                      ${estado === 'ya_voto' ? 'Ya respondida' : estado === 'cerrada' ? 'Consulta cerrada' : 'Pendiente por responder'}
                    </span>
                  </div>
                  <div class="grid gap-3">
                    ${pregunta.opciones.map((opcion) => `
                      <button
                        type="button"
                        ${bloqueada ? 'disabled' : ''}
                        onclick="CentinelaDecisiones.votar('${pregunta.id}','${opcion.id}')"
                        class="w-full rounded-2xl border px-4 py-3 text-left text-sm transition-colors ${bloqueada ? 'border-border-dark bg-surface-dark text-text-muted cursor-not-allowed opacity-70' : 'border-border-dark bg-surface-dark hover:border-primary/40 hover:text-primary'}"
                      >${esc(opcion.texto)}</button>
                    `).join('')}
                  </div>
                </section>
              `;
            }).join('')}
          </article>
        `;
      }).join('');
    } catch (error) {
      container.innerHTML = '<div class="rounded-2xl border border-sos/20 bg-sos/10 p-6 text-sos">No se pudieron cargar las encuestas. Verifica que el servicio de decisiones correcto este activo en :5004.</div>';
    }
  }

  function renderAdminList(consultas) {
    const list = document.getElementById('admin-encuestas-lista');
    if (!list) return;

    list.innerHTML = consultas.map((consulta) => `
      <article class="rounded-3xl border p-5 space-y-4 transition-all ${consulta.id === consultaSeleccionadaId ? 'border-primary/45 bg-surface-dark shadow-[0_0_0_1px_rgba(13,242,204,0.18),0_18px_42px_rgba(0,0,0,0.18)]' : 'border-border-dark bg-surface-dark hover:border-primary/20'}">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 class="text-lg font-bold text-white">${esc(consulta.titulo)}</h3>
            <p class="text-xs text-text-muted mt-1">${formatDate(consulta.createdAt)}</p>
            <p class="text-xs text-text-muted mt-2">${consulta.preguntas.length} pregunta(s) | ${totalConsultaVotos(consulta)} voto(s)</p>
          </div>
          <span class="px-3 py-1 rounded-full text-xs font-semibold ${consulta.estado === 'abierta' ? 'bg-primary/15 text-primary border border-primary/20' : 'bg-sos/10 text-sos border border-sos/20'}">${consulta.estado === 'abierta' ? 'Abierta' : 'Cerrada'}</span>
        </div>
        <div class="flex flex-wrap gap-3">
          <button type="button" onclick="CentinelaDecisiones.verResultados('${consulta.id}')" class="rounded-xl bg-surface-darker border border-border-dark px-4 py-2 text-sm hover:border-primary/40 hover:text-primary transition-colors">Ver resultados</button>
          ${consulta.estado === 'abierta'
            ? `<button type="button" onclick="CentinelaDecisiones.cerrarConsulta('${consulta.id}')" class="rounded-xl bg-sos/10 border border-sos/20 px-4 py-2 text-sm text-sos hover:bg-sos/20 transition-colors">Cerrar encuesta</button>`
            : `<button type="button" onclick="CentinelaDecisiones.abrirConsulta('${consulta.id}')" class="rounded-xl bg-primary/10 border border-primary/20 px-4 py-2 text-sm text-primary hover:bg-primary/20 transition-colors">Volver a abrir</button>`}
        </div>
      </article>
    `).join('');
  }

  async function cargarVistaAdmin() {
    const list = document.getElementById('admin-encuestas-lista');
    const resultados = document.getElementById('admin-resultados');
    if (!list || !resultados) return;

    if (!isAdminUser()) {
      document.body.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0D1C19;color:#fff;font-family:Outfit,sans-serif;padding:24px;"><div style="max-width:520px;border:1px solid rgba(239,68,68,.25);background:rgba(239,68,68,.08);border-radius:24px;padding:28px;"><h1 style="font-size:28px;margin-bottom:12px;">Acceso restringido</h1><p style="color:#fca5a5;line-height:1.6;">Este panel es solo para administracion. Inicia sesion como administrador para crear, cerrar o reabrir encuestas.</p></div></div>';
      return;
    }

    list.innerHTML = '<p class="text-text-muted col-span-full">Cargando encuestas...</p>';
    resultados.innerHTML = '<div class="rounded-3xl border border-border-dark bg-surface-dark p-6 text-text-muted">Selecciona una encuesta para ver resultados.</div>';

    try {
      const consultas = await loadConsultas();
      if (!consultas.length) {
        list.innerHTML = '<div class="rounded-2xl border border-border-dark bg-surface-dark p-6 text-text-muted col-span-full">Todavia no hay encuestas creadas.</div>';
        clearAdminCharts();
        return;
      }

      if (!consultaSeleccionadaId || !consultas.some((consulta) => consulta.id === consultaSeleccionadaId)) {
        consultaSeleccionadaId = consultas[0].id;
      }

      renderAdminList(consultas);
      await renderResultados(consultaSeleccionadaId);
    } catch (error) {
      list.innerHTML = '<div class="rounded-2xl border border-sos/20 bg-sos/10 p-6 text-sos col-span-full">No se pudieron cargar las encuestas del administrador.</div>';
    }
  }

  async function renderResultados(consultaId) {
    const resultados = document.getElementById('admin-resultados');
    if (!resultados) return;

    consultaSeleccionadaId = consultaId;
    clearAdminCharts();
    resultados.innerHTML = '<div class="rounded-3xl border border-border-dark bg-surface-dark p-6 text-text-muted">Cargando resultados...</div>';

    try {
      const data = await fetchResultados(consultaId);
      const preguntasTotales = data.preguntas.length;
      const promedio = preguntasTotales ? (data.totalVotos / preguntasTotales).toFixed(1) : '0.0';

      resultados.innerHTML = `
        <div class="space-y-6">
          <section class="rounded-3xl border border-border-dark bg-surface-dark p-6 space-y-5">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-xs uppercase tracking-[0.25em] text-text-muted">Resultados</p>
                <h3 class="text-2xl font-bold text-white mt-1">${esc(data.titulo)}</h3>
                <p class="text-sm text-text-muted mt-2">Resumen visual tipo formulario con distribucion por opcion.</p>
              </div>
              <span class="px-3 py-1 rounded-full text-xs font-semibold ${data.estado === 'abierta' ? 'bg-primary/15 text-primary border border-primary/20' : 'bg-sos/10 text-sos border border-sos/20'}">${esc(data.estado || 'sin estado')}</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <article class="rounded-2xl border border-border-dark bg-surface-darker p-4">
                <p class="text-xs uppercase tracking-[0.2em] text-text-muted">Total votos</p>
                <p class="text-3xl font-bold text-white mt-3">${data.totalVotos}</p>
              </article>
              <article class="rounded-2xl border border-border-dark bg-surface-darker p-4">
                <p class="text-xs uppercase tracking-[0.2em] text-text-muted">Preguntas</p>
                <p class="text-3xl font-bold text-white mt-3">${preguntasTotales}</p>
              </article>
              <article class="rounded-2xl border border-border-dark bg-surface-darker p-4">
                <p class="text-xs uppercase tracking-[0.2em] text-text-muted">Promedio por pregunta</p>
                <p class="text-3xl font-bold text-white mt-3">${promedio}</p>
              </article>
            </div>
          </section>
          ${data.preguntas.map((pregunta, index) => `
            <section class="rounded-3xl border border-border-dark bg-surface-dark p-6 space-y-5">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p class="text-xs uppercase tracking-[0.22em] text-text-muted">Pregunta ${index + 1}</p>
                  <h4 class="text-xl font-bold text-white mt-2">${esc(pregunta.texto)}</h4>
                </div>
                <div class="text-right">
                  <p class="text-sm text-text-muted">Respuestas</p>
                  <p class="text-2xl font-bold text-primary">${pregunta.totalVotos}</p>
                </div>
              </div>
              <div class="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.1fr)_340px] gap-6 items-start">
                <div class="rounded-2xl border border-border-dark bg-surface-darker p-4">
                  <div class="h-[300px]">
                    <canvas data-chart-id="chart-${pregunta.id}"></canvas>
                  </div>
                </div>
                <div class="space-y-3">
                  ${pregunta.opciones.map((opcion) => `
                    <article class="rounded-2xl border border-border-dark bg-surface-darker p-4 space-y-3">
                      <div class="flex items-start justify-between gap-3">
                        <div>
                          <p class="text-base font-semibold text-white">${esc(opcion.texto)}</p>
                          <p class="text-xs text-text-muted mt-1">${opcion.votos} voto(s)</p>
                        </div>
                        <p class="text-xl font-bold text-primary">${opcion.porcentaje.toFixed(1)}%</p>
                      </div>
                      <div class="h-3 rounded-full bg-surface-dark overflow-hidden">
                        <div class="h-full rounded-full bg-primary" style="width:${Math.min(opcion.porcentaje, 100)}%"></div>
                      </div>
                    </article>
                  `).join('')}
                </div>
              </div>
            </section>
          `).join('')}
        </div>
      `;

      data.preguntas.forEach((pregunta) => {
        const canvas = resultados.querySelector(`[data-chart-id="chart-${pregunta.id}"]`);
        if (!canvas || typeof Chart === 'undefined') return;

        const labels = pregunta.opciones.map((opcion) => opcion.texto);
        const values = pregunta.opciones.map((opcion) => opcion.porcentaje);
        const votes = pregunta.opciones.map((opcion) => opcion.votos);

        chartsAdmin.push(new Chart(canvas, {
          type: 'doughnut',
          data: {
            labels,
            datasets: [{
              data: values,
              backgroundColor: labels.map((_, idx) => chartPalette(idx)),
              borderColor: '#152321',
              borderWidth: 4,
              hoverOffset: 8,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  color: '#ffffff',
                  usePointStyle: true,
                  boxWidth: 10,
                  padding: 18,
                  font: {
                    family: 'Outfit',
                    size: 12,
                  },
                },
              },
              tooltip: {
                callbacks: {
                  label(context) {
                    const idx = context.dataIndex;
                    return `${labels[idx]}: ${values[idx].toFixed(1)}% (${votes[idx]} voto(s))`;
                  },
                },
              },
            },
          },
        }));
      });

      const consultas = await loadConsultas();
      renderAdminList(consultas);
    } catch (error) {
      clearAdminCharts();
      resultados.innerHTML = '<div class="rounded-2xl border border-sos/20 bg-sos/10 p-6 text-sos">No se pudieron cargar los resultados.</div>';
    }
  }

  function renderOptionField(index, value = '') {
    return `
      <div class="flex items-center gap-3" data-opcion-row="true">
        <input data-opcion-input="true" type="text" placeholder="Opcion ${index}" value="${esc(value)}" class="w-full rounded-2xl border border-border-dark bg-surface-darker px-4 py-3 text-white placeholder-text-muted outline-none focus:border-primary/40"/>
        ${index > MIN_OPCIONES ? '<button type="button" data-remove-option="true" class="rounded-xl border border-sos/20 bg-sos/10 px-3 py-3 text-sos hover:bg-sos/20 transition-colors">Quitar</button>' : ''}
      </div>
    `;
  }

  function attachOptionHandlers() {
    document.querySelectorAll('[data-remove-option="true"]').forEach((button) => {
      button.onclick = () => {
        button.closest('[data-opcion-row="true"]')?.remove();
        refreshOptionPlaceholders();
      };
    });
  }

  function refreshOptionPlaceholders() {
    document.querySelectorAll('[data-opcion-input="true"]').forEach((input, idx) => {
      input.placeholder = `Opcion ${idx + 1}`;
    });
  }

  function initDynamicOptions(reset = false) {
    const container = document.getElementById('consulta-opciones');
    const trigger = document.getElementById('agregar-opcion');
    if (!container || !trigger) return;

    if (reset || !container.children.length) {
      container.innerHTML = renderOptionField(1) + renderOptionField(2);
    }

    trigger.onclick = () => {
      const count = container.querySelectorAll('[data-opcion-input="true"]').length + 1;
      container.insertAdjacentHTML('beforeend', renderOptionField(count));
      attachOptionHandlers();
      refreshOptionPlaceholders();
    };

    attachOptionHandlers();
    refreshOptionPlaceholders();
  }

  async function crearConsultaDesdeFormulario() {
    const titulo = document.getElementById('consulta-titulo')?.value.trim();
    const pregunta = document.getElementById('consulta-pregunta')?.value.trim();
    const opciones = Array.from(document.querySelectorAll('[data-opcion-input="true"]'))
      .map((input) => input.value.trim())
      .filter(Boolean);

    if (!titulo || !pregunta || opciones.length < MIN_OPCIONES) {
      alert('Completa el titulo, la pregunta y al menos dos opciones.');
      return;
    }

    const xml = `
      <consulta>
        <titulo>${esc(titulo)}</titulo>
        <pregunta>
          <texto>${esc(pregunta)}</texto>
          ${opciones.map((opcion) => `<opcion>${esc(opcion)}</opcion>`).join('')}
        </pregunta>
      </consulta>
    `;

    try {
      await fetchXml(`${API}/admin/crear-consulta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: xml,
      });
      const titleField = document.getElementById('consulta-titulo');
      const questionField = document.getElementById('consulta-pregunta');
      if (titleField) titleField.value = '';
      if (questionField) questionField.value = '';
      initDynamicOptions(true);
      await cargarVistaAdmin();
    } catch (error) {
      alert('No se pudo crear la encuesta.');
    }
  }

  async function cerrarConsulta(consultaId) {
    try {
      await fetchXml(`${API}/admin/consultas/${consultaId}/cerrar`, { method: 'POST' });
      await cargarVistaAdmin();
    } catch (error) {
      alert('No se pudo cerrar la encuesta.');
    }
  }

  async function abrirConsulta(consultaId) {
    try {
      await fetchXml(`${API}/admin/consultas/${consultaId}/abrir`, { method: 'POST' });
      await cargarVistaAdmin();
    } catch (error) {
      alert('No se pudo reabrir la encuesta.');
    }
  }

  async function init() {
    const page = document.body.dataset.page;
    if (page === 'encuestas') {
      await cargarVistaVecino();
    }
    if (page === 'admin-encuestas') {
      initDynamicOptions();
      await cargarVistaAdmin();
    }
  }

  window.CentinelaDecisiones = {
    votar: async (preguntaId, opcionId) => {
      try {
        await votar(preguntaId, opcionId);
        await cargarVistaVecino();
      } catch (error) {
        alert('No se pudo registrar tu voto.');
      }
    },
    verResultados: renderResultados,
    crearConsulta: crearConsultaDesdeFormulario,
    cerrarConsulta,
    abrirConsulta,
  };

  document.addEventListener('DOMContentLoaded', init);
})();
