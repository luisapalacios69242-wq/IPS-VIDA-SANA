// Pantalla "Registros de usuarios": búsqueda, restablecer contraseña y corregir documento.
// Uso: Registros.montar({ contenedor, base: '/api/admin/registros', conRol: true })
const Registros = (() => {
  const API_BASE = 'https://ips-vida-sana-production.up.railway.app';

  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const formatearFecha = (f) => (f ? String(f).slice(0, 10) : '—');

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

    const avisar = (texto, ok = false) => {
      mensaje.textContent = texto || '';
      mensaje.className = `reg-mensaje ${ok ? 'exito' : 'error'}`;
    };

    async function cargar() {
      lista.textContent = 'Cargando...';
      const params = new URLSearchParams({ q: inputBuscar.value });
      if (selRol && selRol.value) params.set('rol', selRol.value);

      try {
        const respuesta = await fetch(`${API_BASE}${base}?${params}`);
        const datos = await respuesta.json();

        if (!respuesta.ok) {
          lista.textContent = datos.mensaje || 'No se pudieron cargar los registros.';
          return;
        }
        if (datos.length === 0) {
          lista.textContent = 'No se encontraron usuarios.';
          return;
        }

        lista.innerHTML = `
          <p class="reg-contador">${datos.length} resultado(s)${datos.length === 100 ? ' (se muestran los 100 más recientes; afina la búsqueda)' : ''}</p>
          <div class="reg-tabla-envoltura">
          <table class="reg-tabla">
            <thead>
              <tr>
                ${conRol ? '<th>Rol</th>' : ''}
                <th>Documento</th><th>Nombre</th><th>Correo</th><th>Teléfono</th>
                <th>Registro</th><th>Contraseña</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${datos.map(u => `
                <tr data-id="${u.id_usuario}" data-tipo="${esc(u.tipo_documento)}" data-doc="${esc(u.numero_documento)}" data-nombre="${esc(u.nombres + ' ' + u.apellidos)}">
                  ${conRol ? `<td>${esc(u.rol)}</td>` : ''}
                  <td>${esc(u.tipo_documento)} ${esc(u.numero_documento)}</td>
                  <td>${esc(u.nombres)} ${esc(u.apellidos)}${u.estado && u.estado !== 'activo' ? ` <em>(${esc(u.estado)})</em>` : ''}</td>
                  <td>${esc(u.correo)}</td>
                  <td>${esc(u.telefono) || '—'}</td>
                  <td>${formatearFecha(u.fecha_registro)}</td>
                  <td>${u.contrasena_temporal
                    ? '<span class="reg-etiqueta reg-pendiente">Inicial (sin cambiar)</span>'
                    : '<span class="reg-etiqueta reg-ok">Personalizada</span>'}</td>
                  <td class="reg-acciones">
                    <button type="button" class="reg-btn-doc">Corregir documento</button>
                    <button type="button" class="reg-btn-reset">Restablecer contraseña</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          </div>
        `;
      } catch (error) {
        console.error(error);
        lista.textContent = 'No se pudo conectar con el servidor.';
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
      const fila = evento.target.closest('tr[data-id]');
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
          if (r.ok) cargar();
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
          if (r.ok) cargar();
        } catch (error) {
          avisar('No se pudo conectar con el servidor.');
        }
      }
    });

    contenedor.querySelector('.reg-btn-buscar').addEventListener('click', cargar);
    inputBuscar.addEventListener('keydown', (e) => { if (e.key === 'Enter') cargar(); });
    if (selRol) selRol.addEventListener('change', cargar);

    return { recargar: cargar };
  }

  return { montar };
})();