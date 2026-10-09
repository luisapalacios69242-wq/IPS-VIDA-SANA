// Pantalla "Registros de usuarios": búsqueda, paginación, restablecer contraseña y corregir documento.
// Uso: Registros.montar({ contenedor, base: '/api/admin/registros', conRol: true })
const Registros = (() => {
  const API_BASE = 'https://ips-vida-sana-production.up.railway.app';
  const POR_PAGINA = 10;

  const ETIQUETA_ROL = { paciente: 'Paciente', doctor: 'Doctor', secretaria: 'Secretaria' };

  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const formatearFecha = (f) => (f ? String(f).slice(0, 10) : '—');

  const iniciales = (nombres, apellidos) =>
    (((nombres || '').trim()[0] || '') + ((apellidos || '').trim()[0] || '')).toUpperCase() || '?';

  // Genera la lista de páginas a mostrar: 1 ... 4 5 6 ... 12
  function numerosPagina(actual, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const set = new Set([1, total, actual - 1, actual, actual + 1]);
    const nums = [...set].filter(n => n >= 1 && n <= total).sort((a, b) => a - b);
    const resultado = [];
    nums.forEach((n, i) => {
      if (i > 0 && n - nums[i - 1] > 1) resultado.push('...');
      resultado.push(n);
    });
    return resultado;
  }

  function montar({ contenedor, base, conRol }) {
    contenedor.innerHTML = `
      <div class="tarjeta registros-filtros">
        <div class="registros-fila">
          <input type="text" class="reg-buscar" placeholder="Buscar por documento, nombre o correo">
          ${conRol ? `
          <select class="reg-rol">
            <option value="">Todos los roles</option>
            <option value="paciente">Pacientes</option>
            <option value="doctor">Doctores</option>
            <option value="secretaria">Secretarias</option>
          </select>` : ''}
          <button type="button" class="reg-btn-buscar">Buscar</button>
        </div>
        <p class="reg-mensaje error"></p>
      </div>
      <div class="reg-lista"></div>
    `;

    const inputBuscar = contenedor.querySelector('.reg-buscar');
    const selRol = contenedor.querySelector('.reg-rol');
    const mensaje = contenedor.querySelector('.reg-mensaje');
    const lista = contenedor.querySelector('.reg-lista');

    let todos = [];
    let pagina = 1;

    const avisar = (texto, ok = false) => {
      mensaje.textContent = texto || '';
      mensaje.className = `reg-mensaje ${ok ? 'exito' : 'error'}`;
    };

    function dibujar() {
      if (todos.length === 0) {
        lista.innerHTML = '<p class="reg-vacio">No se encontraron usuarios.</p>';
        return;
      }

      const total = todos.length;
      const paginas = Math.ceil(total / POR_PAGINA);
      if (pagina > paginas) pagina = paginas;
      const inicio = (pagina - 1) * POR_PAGINA;
      const visibles = todos.slice(inicio, inicio + POR_PAGINA);

      const itemsHtml = visibles.map(u => `
        <article class="reg-item" data-id="${u.id_usuario}" data-tipo="${esc(u.tipo_documento)}" data-doc="${esc(u.numero_documento)}" data-nombre="${esc(u.nombres + ' ' + u.apellidos)}">
          <div class="reg-avatar reg-av-${esc(u.rol)}">${esc(iniciales(u.nombres, u.apellidos))}</div>

          <div class="reg-info">
            <div class="reg-nombre">
              ${esc(u.nombres)} ${esc(u.apellidos)}
              ${conRol ? `<span class="reg-rol-chip reg-rol-${esc(u.rol)}">${esc(ETIQUETA_ROL[u.rol] || u.rol)}</span>` : ''}
              ${u.estado && u.estado !== 'activo' ? `<span class="reg-rol-chip reg-inactivo">${esc(u.estado)}</span>` : ''}
            </div>
            <div class="reg-datos">
              <span><b>Documento</b> ${esc(u.tipo_documento)} ${esc(u.numero_documento)}</span>
              <span><b>Correo</b> ${esc(u.correo) || '—'}</span>
              <span><b>Teléfono</b> ${esc(u.telefono) || '—'}</span>
            </div>
            <div class="reg-meta">
              Registrado el ${formatearFecha(u.fecha_registro)}
              ${u.contrasena_temporal
                ? '<span class="reg-etiqueta reg-pendiente">Contraseña inicial (sin cambiar)</span>'
                : '<span class="reg-etiqueta reg-ok">Contraseña personalizada</span>'}
            </div>
          </div>

          <div class="reg-acciones">
            <button type="button" class="reg-btn-doc">Corregir documento</button>
            <button type="button" class="reg-btn-reset">Restablecer contraseña</button>
          </div>
        </article>
      `).join('');

      let paginacionHtml = '';
      if (paginas > 1) {
        const numeros = numerosPagina(pagina, paginas).map(n =>
          n === '...'
            ? '<span class="reg-pag-puntos">…</span>'
            : `<button type="button" class="reg-pag-btn ${n === pagina ? 'activa' : ''}" data-pagina="${n}">${n}</button>`
        ).join('');

        paginacionHtml = `
          <nav class="reg-paginacion">
            <button type="button" class="reg-pag-btn" data-pagina="${pagina - 1}" ${pagina === 1 ? 'disabled' : ''}>‹ Anterior</button>
            ${numeros}
            <button type="button" class="reg-pag-btn" data-pagina="${pagina + 1}" ${pagina === paginas ? 'disabled' : ''}>Siguiente ›</button>
          </nav>
        `;
      }

      lista.innerHTML = `
        <p class="reg-contador">
          Mostrando ${inicio + 1}–${inicio + visibles.length} de ${total} usuario(s)
          ${total === 100 ? '<br><small>(se muestran como máximo los 100 más recientes; afina la búsqueda)</small>' : ''}
        </p>
        <div class="reg-lista-items">${itemsHtml}</div>
        ${paginacionHtml}
      `;
    }

    async function cargar(conservarPagina = false) {
      if (!conservarPagina) pagina = 1;
      lista.innerHTML = '<p class="reg-vacio">Cargando...</p>';
      const params = new URLSearchParams({ q: inputBuscar.value });
      if (selRol && selRol.value) params.set('rol', selRol.value);

      try {
        const respuesta = await fetch(`${API_BASE}${base}?${params}`);
        const datos = await respuesta.json();

        if (!respuesta.ok) {
          lista.innerHTML = `<p class="reg-vacio">${esc(datos.mensaje || 'No se pudieron cargar los registros.')}</p>`;
          return;
        }
        todos = datos;
        dibujar();
      } catch (error) {
        console.error(error);
        lista.innerHTML = '<p class="reg-vacio">No se pudo conectar con el servidor.</p>';
      }
    }

    async function enviar(url, cuerpo) {
      const respuesta = await fetch(`${API_BASE}${url}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo || {})
      });
      const datos = await respuesta.json();
      return { ok: respuesta.ok, mensaje: datos.mensaje };
    }

    lista.addEventListener('click', async (evento) => {
      // Paginación
      const botonPagina = evento.target.closest('.reg-pag-btn');
      if (botonPagina && !botonPagina.disabled) {
        pagina = Number(botonPagina.dataset.pagina);
        dibujar();
        contenedor.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      // Acciones por usuario
      const fila = evento.target.closest('.reg-item');
      if (!fila) return;
      const id = fila.dataset.id;
      const nombre = fila.dataset.nombre;

      if (evento.target.classList.contains('reg-btn-reset')) {
        const seguro = confirm(
          `¿Restablecer la contraseña de ${nombre}?\n\n` +
          `Quedará igual a su número de documento (${fila.dataset.doc}) y tendrá que cambiarla al iniciar sesión.`
        );
        if (!seguro) return;
        try {
          const r = await enviar(`${base}/${id}/restablecer-contrasena`);
          avisar(r.mensaje, r.ok);
          if (r.ok) cargar(true);
        } catch (error) {
          avisar('No se pudo conectar con el servidor.');
        }
      }

      if (evento.target.classList.contains('reg-btn-doc')) {
        const nuevo = prompt(`Nuevo número de documento para ${nombre}:`, fila.dataset.doc);
        if (nuevo === null) return;
        const tipo = prompt('Tipo de documento (CC, TI, CE o PA):', fila.dataset.tipo);
        if (tipo === null) return;
        try {
          const r = await enviar(`${base}/${id}/documento`, {
            tipo_documento: tipo.trim().toUpperCase(),
            numero_documento: nuevo.trim()
          });
          avisar(r.mensaje, r.ok);
          if (r.ok) cargar(true);
        } catch (error) {
          avisar('No se pudo conectar con el servidor.');
        }
      }
    });

    contenedor.querySelector('.reg-btn-buscar').addEventListener('click', () => cargar());
    inputBuscar.addEventListener('keydown', (e) => { if (e.key === 'Enter') cargar(); });
    if (selRol) selRol.addEventListener('change', () => cargar());

    return { recargar: () => cargar() };
  }

  return { montar };
})();