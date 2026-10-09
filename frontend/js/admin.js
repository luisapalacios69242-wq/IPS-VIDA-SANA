const API = 'https://ips-vida-sana-production.up.railway.app';

const usuario = JSON.parse(localStorage.getItem('usuario') || 'null');

if (!usuario || usuario.rol !== 'administrador') {
  window.location.href = 'index.html';
}

document.getElementById('nombreUsuario').textContent = `${usuario.nombres} ${usuario.apellidos}`;

document.getElementById('btnCerrarSesion').addEventListener('click', () => {
  localStorage.removeItem('usuario');
  window.location.href = 'index.html';
});

// Si vuelves con el botón "Atrás" del navegador después de cerrar sesión, el navegador
// puede mostrar esta página desde su caché sin volver a ejecutar el chequeo de arriba.
// Forzamos una recarga para que se vuelva a validar la sesión.
window.addEventListener('pageshow', (evento) => {
  if (evento.persisted) {
    window.location.reload();
  }
});


const registrosAdmin = Registros.montar({
  contenedor: document.getElementById('contenedorRegistros'),
  base: '/api/admin/registros',
  conRol: true
});
// ---------- Navegación ----------
document.querySelectorAll('.nav-item').forEach(boton => {
  boton.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('activo'));
    boton.classList.add('activo');

    const idSeccion = boton.dataset.seccion;
    document.querySelectorAll('.seccion').forEach(s => s.classList.add('oculto'));
    document.getElementById(`seccion-${idSeccion}`).classList.remove('oculto');

    if (idSeccion === 'catalogo') cargarCatalogo();
    if (idSeccion === 'horarios') cargarDoctoresParaHorario();
    if (idSeccion === 'gestionar') cargarUsuarios();
    if (idSeccion === 'registros') registrosAdmin.recargar();
  });
});

// ---------- Registrar usuario ----------
document.getElementById('selRol').addEventListener('change', (e) => {
  const esDoctor = e.target.value === 'doctor';
  document.getElementById('camposDoctor').classList.toggle('oculto', !esDoctor);
  document.getElementById('camposSecretaria').classList.toggle('oculto', esDoctor);
});

async function cargarChecksEspecialidades() {
  const contenedor = document.getElementById('checksEspecialidades');
  try {
    const respuesta = await fetch(`${API}/api/admin/especialidades`);
    const especialidades = await respuesta.json();
    contenedor.innerHTML = especialidades
      .filter(e => e.estado === 'activa')
      .map(e => `
        <label style="display:flex; align-items:center; gap:6px; font-weight:normal;">
          <input type="checkbox" class="chk-especialidad" value="${e.id_especialidad}">
          ${e.nombre}
        </label>
      `).join('');
  } catch (error) {
    console.error(error);
  }
}

document.getElementById('btnRegistrarUsuario').addEventListener('click', async () => {
  const mensaje = document.getElementById('mensajeUsuario');
  mensaje.textContent = '';
  mensaje.style.color = '';

  const rol = document.getElementById('selRol').value;

  const datos = {
    nombres: document.getElementById('uNombres').value,
    apellidos: document.getElementById('uApellidos').value,
    tipo_documento: document.getElementById('uTipoDocumento').value,
    numero_documento: document.getElementById('uDocumento').value,
    fecha_nacimiento: document.getElementById('uFechaNacimiento').value,
    genero: document.getElementById('uGenero').value,
    estado_civil: document.getElementById('uEstadoCivil').value,
    direccion: document.getElementById('uDireccion').value,
    ciudad: document.getElementById('uCiudad').value,
    telefono: document.getElementById('uTelefono').value,
    correo: document.getElementById('uCorreo').value,
    rol
  };

  if (rol === 'doctor') {
    datos.tarjeta_profesional = document.getElementById('uTarjeta').value;
    datos.especialidad_ids = Array.from(document.querySelectorAll('.chk-especialidad:checked')).map(c => c.value);
  } else {
    datos.cargo = document.getElementById('uCargo').value;
  }

  try {
    const respuesta = await fetch(`${API}/api/admin/usuarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos)
    });

    const resultado = await respuesta.json();

    if (!respuesta.ok) {
      mensaje.textContent = resultado.mensaje;
      return;
    }

    mensaje.style.color = '#15803d';
    mensaje.textContent = `Registrado correctamente. Contraseña temporal: ${resultado.contrasenaTemporal}`;

  } catch (error) {
    mensaje.textContent = 'No se pudo conectar con el servidor.';
    console.error(error);
  }
});

// ---------- Especialidades y servicios (catálogo unificado) ----------
const POR_PAGINA_CAT = 8;

const cat = {
  especialidades: [], servicios: [], doctores: [],
  seleccion: null, pagina: 1,
  editandoEsp: false, editandoServicio: null, agregandoServicio: false,
  mensaje: '', mensajeOk: false
};

const formatoPrecio = (v) => `$${Number(v).toLocaleString('es-CO')}`;
const valorCampo = (id) => document.getElementById(id).value.trim();

function cerrarFormulariosCat() {
  cat.editandoEsp = false;
  cat.editandoServicio = null;
  cat.agregandoServicio = false;
  cat.mensaje = '';
}

function avisarCat(texto, ok = false) {
  cat.mensaje = texto;
  cat.mensajeOk = ok;
  const el = document.getElementById('catMensaje');
  if (!el) return;
  el.textContent = texto;
  el.className = `cat-aviso ${ok ? 'exito' : 'error'}`;
  if (texto) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function catEnviar(url, metodo, cuerpo) {
  try {
    const respuesta = await fetch(`${API}${url}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo)
    });
    const datos = await respuesta.json();
    return { ok: respuesta.ok, datos };
  } catch (error) {
    console.error(error);
    return { ok: false, datos: { mensaje: 'No se pudo conectar con el servidor.' } };
  }
}

function especialidadesFiltradas() {
  const texto = normalizarTexto(document.getElementById('catBuscar').value.trim());
  if (!texto) return cat.especialidades;
  return cat.especialidades.filter(e => {
    if (normalizarTexto(e.nombre).includes(texto)) return true;
    return cat.servicios.some(s =>
      String(s.especialidad_id) === String(e.id_especialidad) && normalizarTexto(s.nombre).includes(texto)
    );
  });
}

function irAPaginaDeSeleccion() {
  const indice = especialidadesFiltradas().findIndex(e => String(e.id_especialidad) === cat.seleccion);
  if (indice >= 0) cat.pagina = Math.floor(indice / POR_PAGINA_CAT) + 1;
}

function seleccionarCat(valor) {
  cat.seleccion = String(valor);
  cerrarFormulariosCat();
  dibujarListaCat();
  dibujarDetalleCat();
}

function prepararCatalogo() {
  if (document.getElementById('catLista')) return;

  const contenedor = document.getElementById('contenedorCatalogo');
  contenedor.innerHTML = `
    <div class="cat-layout">
      <aside class="cat-panel-izq">
        <div class="tarjeta cat-buscador">
          <input type="text" id="catBuscar" placeholder="Buscar especialidad o servicio">
          <button type="button" data-accion="nueva">+ Nueva especialidad</button>
        </div>
        <div id="catLista"></div>
      </aside>
      <section id="catDetalle" class="cat-panel-der"></section>
    </div>
  `;

  document.getElementById('catBuscar').addEventListener('input', () => {
    cat.pagina = 1;
    dibujarListaCat();
  });

  contenedor.addEventListener('click', manejarClickCatalogo);
}

function dibujarListaCat() {
  const zona = document.getElementById('catLista');
  const filtradas = especialidadesFiltradas();
  const total = filtradas.length;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA_CAT));
  if (cat.pagina > paginas) cat.pagina = paginas;
  const inicio = (cat.pagina - 1) * POR_PAGINA_CAT;
  const visibles = filtradas.slice(inicio, inicio + POR_PAGINA_CAT);

  const sinEspecialidad = cat.servicios.filter(s => !s.especialidad_id).length;

  const itemGeneral = `
    <button type="button" class="cat-item cat-item-general ${cat.seleccion === 'general' ? 'activo' : ''}" data-accion="seleccionar" data-id="general">
      <span class="cat-item-nombre">Servicios generales</span>
      <span class="cat-item-meta">${sinEspecialidad} servicio(s) sin especialidad</span>
    </button>
  `;

  const items = visibles.map(e => {
    const id = String(e.id_especialidad);
    const nServicios = cat.servicios.filter(s => String(s.especialidad_id) === id).length;
    const nDoctores = cat.doctores.filter(d => (d.especialidad_ids || '').split(',').includes(id)).length;
    return `
      <button type="button" class="cat-item ${cat.seleccion === id ? 'activo' : ''}" data-accion="seleccionar" data-id="${id}">
        <span class="cat-item-nombre">${escUsr(e.nombre)}</span>
        <span class="cat-item-meta">${nServicios} servicio(s) · ${nDoctores} doctor(es)</span>
        ${e.estado !== 'activa' ? '<span class="reg-etiqueta reg-inactivo">inactiva</span>' : ''}
      </button>
    `;
  }).join('');

  let paginacion = '';
  if (paginas > 1) {
    const numeros = numerosPaginaGestion(cat.pagina, paginas).map(n =>
      n === '...'
        ? '<span class="reg-pag-puntos">…</span>'
        : `<button type="button" class="reg-pag-btn ${n === cat.pagina ? 'activa' : ''}" data-accion="pagina" data-pagina="${n}">${n}</button>`
    ).join('');

    paginacion = `
      <nav class="reg-paginacion">
        <button type="button" class="reg-pag-btn" data-accion="pagina" data-pagina="${cat.pagina - 1}" ${cat.pagina === 1 ? 'disabled' : ''}>‹</button>
        ${numeros}
        <button type="button" class="reg-pag-btn" data-accion="pagina" data-pagina="${cat.pagina + 1}" ${cat.pagina === paginas ? 'disabled' : ''}>›</button>
      </nav>
    `;
  }

  zona.innerHTML = `
    ${itemGeneral}
    <p class="reg-contador">${total} especialidad(es)</p>
    ${items || '<p class="reg-vacio">Sin resultados.</p>'}
    ${paginacion}
  `;
}

function filaServicioHtml(s) {
  const id = String(s.id_servicio);

  if (cat.editandoServicio === id) {
    const opciones = cat.especialidades.map(e => `
      <option value="${e.id_especialidad}" ${String(s.especialidad_id) === String(e.id_especialidad) ? 'selected' : ''}>${escUsr(e.nombre)}</option>
    `).join('');

    return `
      <div class="cat-serv cat-serv-edicion">
        <div class="gest-grid">
          <div class="gest-campo">
            <label>Nombre</label>
            <input type="text" id="catServNombre" value="${escUsr(s.nombre)}">
          </div>
          <div class="gest-campo">
            <label>Precio</label>
            <input type="number" min="0" id="catServPrecio" value="${escUsr(s.precio)}">
          </div>
          <div class="gest-campo gest-full">
            <label>Descripción</label>
            <input type="text" id="catServDesc" value="${escUsr(s.descripcion)}">
          </div>
          <div class="gest-campo gest-full">
            <label>Especialidad</label>
            <select id="catServEsp">
              <option value="">Sin especialidad (servicio general)</option>
              ${opciones}
            </select>
          </div>
        </div>
        <div class="gest-pie">
          <button type="button" class="gest-btn-cancelar" data-accion="cancelar-serv">Cancelar</button>
          <button type="button" data-accion="guardar-serv" data-id="${id}">Guardar cambios</button>
        </div>
      </div>
    `;
  }

  const activo = s.estado === 'activo';
  return `
    <div class="cat-serv ${activo ? '' : 'cat-serv-off'}">
      <div>
        <span class="cat-serv-nombre">${escUsr(s.nombre)}</span>
        <span class="cat-serv-desc">${escUsr(s.descripcion) || 'Sin descripción'}</span>
      </div>
      <div class="cat-serv-precio">${formatoPrecio(s.precio)}</div>
      <span class="reg-etiqueta ${activo ? 'reg-ok' : 'reg-inactivo'}">${escUsr(s.estado)}</span>
      <div class="cat-serv-acc">
        <button type="button" class="reg-btn-doc" data-accion="editar-serv" data-id="${id}">Editar</button>
        <button type="button" class="${activo ? 'esp-btn-peligro' : ''}" data-accion="toggle-serv" data-id="${id}" data-estado="${activo ? 'inactivo' : 'activo'}">${activo ? 'Desactivar' : 'Activar'}</button>
      </div>
    </div>
  `;
}

function dibujarDetalleCat() {
  const zona = document.getElementById('catDetalle');
  const aviso = `<p id="catMensaje" class="cat-aviso ${cat.mensajeOk ? 'exito' : 'error'}">${escUsr(cat.mensaje)}</p>`;

  // ----- Formulario de nueva especialidad -----
  if (cat.seleccion === 'nueva') {
    zona.innerHTML = `
      ${aviso}
      <div class="cat-tarjeta">
        <h3 class="cat-titulo">Nueva especialidad</h3>
        <p class="cat-desc">Cuando la crees podrás agregarle sus servicios.</p>
        <div class="gest-grid" style="margin-top:16px;">
          <div class="gest-campo">
            <label>Nombre</label>
            <input type="text" id="catNuevaNombre" placeholder="Ej. Cardiología">
          </div>
          <div class="gest-campo">
            <label>Descripción</label>
            <input type="text" id="catNuevaDesc" placeholder="Opcional">
          </div>
        </div>
        <div class="gest-pie">
          <button type="button" class="gest-btn-cancelar" data-accion="cancelar-nueva">Cancelar</button>
          <button type="button" data-accion="crear-esp">Crear especialidad</button>
        </div>
      </div>
    `;
    return;
  }

  const esGeneral = cat.seleccion === 'general';
  const esp = esGeneral ? null : cat.especialidades.find(e => String(e.id_especialidad) === cat.seleccion);

  if (!esGeneral && !esp) {
    zona.innerHTML = '<div class="cat-tarjeta"><p class="reg-vacio">Selecciona una especialidad de la lista.</p></div>';
    return;
  }

  const servicios = cat.servicios.filter(s =>
    esGeneral ? !s.especialidad_id : String(s.especialidad_id) === cat.seleccion
  );

  // ----- Cabecera -----
  let cabeceraHtml;
  if (esGeneral) {
    cabeceraHtml = `
      <div class="cat-cabecera">
        <div>
          <h3 class="cat-titulo">Servicios generales</h3>
          <p class="cat-desc">Servicios que no pertenecen a una especialidad en particular, como procedimientos.</p>
        </div>
      </div>
    `;
  } else if (cat.editandoEsp) {
    cabeceraHtml = `
      <h3 class="cat-titulo">Editar especialidad</h3>
      <div class="gest-grid" style="margin-top:14px;">
        <div class="gest-campo">
          <label>Nombre</label>
          <input type="text" id="catEspNombre" value="${escUsr(esp.nombre)}">
        </div>
        <div class="gest-campo">
          <label>Descripción</label>
          <input type="text" id="catEspDesc" value="${escUsr(esp.descripcion)}">
        </div>
      </div>
      <div class="gest-pie">
        <button type="button" class="gest-btn-cancelar" data-accion="cancelar-esp">Cancelar</button>
        <button type="button" data-accion="guardar-esp">Guardar cambios</button>
      </div>
    `;
  } else {
    const activa = esp.estado === 'activa';
    cabeceraHtml = `
      <div class="cat-cabecera">
        <div>
          <h3 class="cat-titulo">${escUsr(esp.nombre)}</h3>
          <p class="cat-desc">${escUsr(esp.descripcion) || 'Sin descripción'}</p>
        </div>
        <div class="cat-cab-acc">
          <span class="reg-etiqueta ${activa ? 'reg-ok' : 'reg-inactivo'}">${escUsr(esp.estado)}</span>
          <button type="button" class="reg-btn-doc" data-accion="editar-esp">Editar</button>
          <button type="button" class="${activa ? 'esp-btn-peligro' : ''}" data-accion="toggle-esp">${activa ? 'Desactivar' : 'Activar'}</button>
        </div>
      </div>
    `;
  }

  // ----- Servicios -----
  const formNuevoServicio = cat.agregandoServicio ? `
    <div class="cat-serv cat-serv-edicion">
      <div class="gest-grid">
        <div class="gest-campo">
          <label>Nombre</label>
          <input type="text" id="catServNombre" placeholder="Ej. Consulta de control">
        </div>
        <div class="gest-campo">
          <label>Precio</label>
          <input type="number" min="0" id="catServPrecio" placeholder="Ej. 50000">
        </div>
        <div class="gest-campo gest-full">
          <label>Descripción</label>
          <input type="text" id="catServDesc" placeholder="Opcional">
        </div>
      </div>
      <div class="gest-pie">
        <button type="button" class="gest-btn-cancelar" data-accion="cancelar-serv">Cancelar</button>
        <button type="button" data-accion="guardar-nuevo-serv">Crear servicio</button>
      </div>
    </div>
  ` : '';

  const serviciosHtml = `
    <div class="cat-seccion-cab">
      <h4 class="gest-titulo">Servicios (${servicios.length})</h4>
      <button type="button" class="reg-btn-doc cat-btn-chico" data-accion="agregar-serv">+ Agregar servicio</button>
    </div>
    ${formNuevoServicio}
    ${servicios.length
      ? servicios.map(filaServicioHtml).join('')
      : (cat.agregandoServicio ? '' : '<p class="reg-vacio" style="text-align:left; padding:6px 0;">Aún no hay servicios aquí.</p>')}
  `;

  // ----- Doctores (solo en especialidades) -----
  let doctoresHtml = '';
  if (!esGeneral) {
    const doctores = cat.doctores.filter(d => (d.especialidad_ids || '').split(',').includes(cat.seleccion));
    doctoresHtml = `
      <div class="cat-seccion-cab">
        <h4 class="gest-titulo">Doctores (${doctores.length})</h4>
      </div>
      ${doctores.length
        ? `<div class="cat-docs">${doctores.map(d => `
            <span class="cat-doc">Dr(a). ${escUsr(d.nombres)} ${escUsr(d.apellidos)}<small>${escUsr(d.tarjeta_profesional)}</small></span>
          `).join('')}</div>`
        : '<p class="reg-vacio" style="text-align:left; padding:6px 0;">Ningún doctor tiene esta especialidad todavía. Asígnala desde Gestionar Usuarios.</p>'}
    `;
  }

  zona.innerHTML = `
    ${aviso}
    <div class="cat-tarjeta">
      ${cabeceraHtml}
      ${serviciosHtml}
      ${doctoresHtml}
    </div>
  `;
}

async function manejarClickCatalogo(evento) {
  const boton = evento.target.closest('[data-accion]');
  if (!boton || boton.disabled) return;

  const accion = boton.dataset.accion;
  const id = boton.dataset.id;
  const esp = cat.especialidades.find(e => String(e.id_especialidad) === cat.seleccion);

  // ----- Navegación de la lista -----
  if (accion === 'pagina') {
    cat.pagina = Number(boton.dataset.pagina);
    dibujarListaCat();
    return;
  }
  if (accion === 'seleccionar') { seleccionarCat(id); return; }
  if (accion === 'nueva') {
    seleccionarCat('nueva');
    const campo = document.getElementById('catNuevaNombre');
    if (campo) campo.focus();
    return;
  }
  if (accion === 'cancelar-nueva') {
    seleccionarCat(cat.especialidades.length ? String(cat.especialidades[0].id_especialidad) : 'general');
    return;
  }

  // ----- Abrir / cerrar formularios -----
  if (accion === 'editar-esp') { cerrarFormulariosCat(); cat.editandoEsp = true; dibujarDetalleCat(); return; }
  if (accion === 'cancelar-esp' || accion === 'cancelar-serv') { cerrarFormulariosCat(); dibujarDetalleCat(); return; }
  if (accion === 'agregar-serv') {
    cerrarFormulariosCat();
    cat.agregandoServicio = true;
    dibujarDetalleCat();
    document.getElementById('catServNombre').focus();
    return;
  }
  if (accion === 'editar-serv') { cerrarFormulariosCat(); cat.editandoServicio = id; dibujarDetalleCat(); return; }

  // ----- Crear especialidad -----
  if (accion === 'crear-esp') {
    const nombre = valorCampo('catNuevaNombre');
    if (!nombre) { avisarCat('El nombre de la especialidad es obligatorio.'); return; }

    const r = await catEnviar('/api/admin/especialidades', 'POST', { nombre, descripcion: valorCampo('catNuevaDesc') });
    if (!r.ok) { avisarCat(r.datos.mensaje || 'No se pudo crear la especialidad.'); return; }

    cerrarFormulariosCat();
    document.getElementById('catBuscar').value = '';
    cat.seleccion = String(r.datos.id_especialidad);
    cat.mensaje = 'Especialidad creada. Ahora puedes agregarle servicios.';
    cat.mensajeOk = true;
    await recargarCatalogo();
    irAPaginaDeSeleccion();
    dibujarListaCat();
    cargarChecksEspecialidades();
    return;
  }

  // ----- Editar especialidad -----
  if (accion === 'guardar-esp') {
    const nombre = valorCampo('catEspNombre');
    if (!nombre) { avisarCat('El nombre es obligatorio.'); return; }

    const r = await catEnviar(`/api/admin/especialidades/${cat.seleccion}`, 'PUT', {
      nombre, descripcion: valorCampo('catEspDesc')
    });
    if (!r.ok) { avisarCat(r.datos.mensaje || 'No se pudo guardar.'); return; }

    cerrarFormulariosCat();
    cat.mensaje = 'Especialidad actualizada.';
    cat.mensajeOk = true;
    await recargarCatalogo();
    cargarChecksEspecialidades();
    return;
  }

  // ----- Activar / desactivar especialidad -----
  if (accion === 'toggle-esp') {
    const nuevoEstado = esp.estado === 'activa' ? 'inactiva' : 'activa';
    if (nuevoEstado === 'inactiva' &&
      !confirm(`¿Desactivar la especialidad "${esp.nombre}"?\n\nSus servicios y doctores no se modifican. Podrás reactivarla cuando quieras.`)) {
      return;
    }

    const r = await catEnviar(`/api/admin/especialidades/${cat.seleccion}`, 'PUT', { estado: nuevoEstado });
    if (!r.ok) { avisarCat(r.datos.mensaje || 'No se pudo actualizar.'); return; }

    cerrarFormulariosCat();
    cat.mensaje = nuevoEstado === 'activa' ? 'Especialidad activada.' : 'Especialidad desactivada.';
    cat.mensajeOk = true;
    await recargarCatalogo();
    cargarChecksEspecialidades();
    return;
  }

  // ----- Crear servicio -----
  if (accion === 'guardar-nuevo-serv') {
    const nombre = valorCampo('catServNombre');
    const precio = valorCampo('catServPrecio');
    if (!nombre || precio === '') { avisarCat('El nombre y el precio son obligatorios.'); return; }
    if (Number(precio) < 0) { avisarCat('El precio no puede ser negativo.'); return; }

    const r = await catEnviar('/api/admin/servicios', 'POST', {
      nombre, precio,
      descripcion: valorCampo('catServDesc'),
      especialidad_id: cat.seleccion === 'general' ? null : Number(cat.seleccion)
    });
    if (!r.ok) { avisarCat(r.datos.mensaje || 'No se pudo crear el servicio.'); return; }

    cerrarFormulariosCat();
    cat.mensaje = 'Servicio creado.';
    cat.mensajeOk = true;
    await recargarCatalogo();
    return;
  }

  // ----- Editar servicio -----
  if (accion === 'guardar-serv') {
    const nombre = valorCampo('catServNombre');
    const precio = valorCampo('catServPrecio');
    if (!nombre || precio === '') { avisarCat('El nombre y el precio son obligatorios.'); return; }
    if (Number(precio) < 0) { avisarCat('El precio no puede ser negativo.'); return; }

    const espElegida = document.getElementById('catServEsp').value;
    const r = await catEnviar(`/api/admin/servicios/${id}`, 'PUT', {
      nombre, precio,
      descripcion: valorCampo('catServDesc'),
      especialidad_id: espElegida === '' ? null : Number(espElegida)
    });
    if (!r.ok) { avisarCat(r.datos.mensaje || 'No se pudo guardar el servicio.'); return; }

    cerrarFormulariosCat();
    cat.mensaje = 'Servicio actualizado.';
    cat.mensajeOk = true;
    await recargarCatalogo();
    return;
  }

  // ----- Activar / desactivar servicio -----
  if (accion === 'toggle-serv') {
    const r = await catEnviar(`/api/admin/servicios/${id}`, 'PUT', { estado: boton.dataset.estado });
    if (!r.ok) { avisarCat(r.datos.mensaje || 'No se pudo actualizar el servicio.'); return; }

    cerrarFormulariosCat();
    cat.mensaje = boton.dataset.estado === 'activo' ? 'Servicio activado.' : 'Servicio desactivado.';
    cat.mensajeOk = true;
    await recargarCatalogo();
  }
}

async function recargarCatalogo() {
  const [especialidades, servicios, usuarios] = await Promise.all([
    fetch(`${API}/api/admin/especialidades`).then(r => r.json()),
    fetch(`${API}/api/admin/servicios`).then(r => r.json()),
    fetch(`${API}/api/admin/usuarios`).then(r => r.json())
  ]);

  cat.especialidades = Array.isArray(especialidades) ? especialidades : [];
  cat.servicios = Array.isArray(servicios) ? servicios : [];
  cat.doctores = (Array.isArray(usuarios) ? usuarios : []).filter(u => u.rol === 'doctor');

  const seleccionValida = cat.seleccion === 'general' || cat.seleccion === 'nueva' ||
    cat.especialidades.some(e => String(e.id_especialidad) === cat.seleccion);

  if (!seleccionValida) {
    cat.seleccion = cat.especialidades.length ? String(cat.especialidades[0].id_especialidad) : 'general';
  }

  dibujarListaCat();
  dibujarDetalleCat();
}

async function cargarCatalogo() {
  prepararCatalogo();
  try {
    await recargarCatalogo();
  } catch (error) {
    document.getElementById('catDetalle').innerHTML = '<p class="reg-vacio">No se pudo cargar el catálogo.</p>';
    console.error(error);
  }
}

// ---------- Horarios ----------
const ORDEN_DIAS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];
const DIA_BONITO = { Miercoles: 'Miércoles', Sabado: 'Sábado' };
const diaBonito = (d) => DIA_BONITO[d] || d;

function textoDias(dias) {
  const idx = dias.map(d => ORDEN_DIAS.indexOf(d)).sort((a, b) => a - b);
  const tramos = [];
  let inicio = idx[0];
  let previo = idx[0];

  for (let i = 1; i <= idx.length; i++) {
    if (idx[i] === previo + 1) {
      previo = idx[i];
      continue;
    }
    if (inicio === previo) {
      tramos.push(diaBonito(ORDEN_DIAS[inicio]));
    } else if (previo - inicio === 1) {
      tramos.push(`${diaBonito(ORDEN_DIAS[inicio])} y ${diaBonito(ORDEN_DIAS[previo])}`);
    } else {
      tramos.push(`${diaBonito(ORDEN_DIAS[inicio])} a ${diaBonito(ORDEN_DIAS[previo])}`);
    }
    inicio = idx[i];
    previo = idx[i];
  }
  return tramos.join(', ');
}

function agruparHorarios(horarios) {
  const grupos = {};
  horarios.forEach(h => {
    const clave = `${h.hora_inicio}-${h.hora_fin}`;
    if (!grupos[clave]) grupos[clave] = { inicio: h.hora_inicio, fin: h.hora_fin, items: [] };
    grupos[clave].items.push({ id: h.id_horario, dia: h.dia_semana });
  });
  return Object.values(grupos).map(g => ({
    texto: `${textoDias(g.items.map(i => i.dia))} · ${g.inicio.slice(0, 5)} a ${g.fin.slice(0, 5)}`,
    items: g.items
  }));
}

async function cargarDoctoresParaHorario() {
  const select = document.getElementById('selDoctorHorario');
  try {
    const respuesta = await fetch(`${API}/api/admin/doctores`);
    const doctores = await respuesta.json();
    select.innerHTML = doctores.map(d => `<option value="${d.id_doctor}">${d.nombres} ${d.apellidos}</option>`).join('');
    if (doctores.length > 0) cargarHorariosDoctor();
  } catch (error) {
    console.error(error);
  }
}

document.getElementById('selDoctorHorario').addEventListener('change', cargarHorariosDoctor);

async function cargarHorariosDoctor() {
  const idDoctor = document.getElementById('selDoctorHorario').value;
  const contenedor = document.getElementById('listaHorarios');
  if (!idDoctor) return;

  contenedor.textContent = 'Cargando...';

  try {
    const respuesta = await fetch(`${API}/api/admin/doctores/${idDoctor}/horarios`);
    const datos = await respuesta.json();

    const horariosHtml = datos.horarios.length
      ? agruparHorarios(datos.horarios).map(g => `
          <div class="grupo-horario">
            <strong>${g.texto}</strong>
            <div class="chips-dias">
              ${g.items.map(i => `
                <span class="chip-dia">${diaBonito(i.dia)}
                  <button type="button" class="btn-borrar-horario" data-id="${i.id}" data-dia="${diaBonito(i.dia)}" title="Borrar este día">✕</button>
                </span>
              `).join('')}
            </div>
            <button type="button" class="btn-borrar-grupo" data-ids="${g.items.map(i => i.id).join(',')}" data-texto="${g.texto}">Borrar todo este horario</button>
          </div>
        `).join('')
      : '<p>Sin horarios asignados.</p>';

    const bloqueosHtml = datos.bloqueos.length
      ? datos.bloqueos.map(b => `
          <div class="fila-cita">
            <div>${b.fecha} · ${b.hora_inicio.slice(0, 5)} - ${b.hora_fin.slice(0, 5)} — ${b.motivo}</div>
            <button type="button" class="btn-borrar-bloqueo" data-id="${b.id_bloqueo}" data-texto="${b.fecha} de ${b.hora_inicio.slice(0, 5)} a ${b.hora_fin.slice(0, 5)}">Borrar</button>
          </div>
        `).join('')
      : '<p>Sin bloqueos próximos.</p>';

    contenedor.innerHTML = `<h3>Horarios regulares</h3>${horariosHtml}<h3>Bloqueos próximos</h3>${bloqueosHtml}`;

  } catch (error) {
    contenedor.textContent = 'No se pudieron cargar los horarios.';
    console.error(error);
  }
}

async function borrarHorarios(ids, descripcion) {
  if (!confirm(`¿Borrar ${descripcion}?`)) return;

  const pendientes = [];
  let totalCitas = 0;
  const errores = [];

  try {
    for (const id of ids) {
      const respuesta = await fetch(`${API}/api/admin/horarios/${id}`, { method: 'DELETE' });
      const datos = await respuesta.json();

      if (respuesta.ok) continue;

      if (respuesta.status === 409 && datos.requiereConfirmacion) {
        pendientes.push(id);
        totalCitas += datos.citas.length;
      } else {
        errores.push(datos.mensaje);
      }
    }

    if (pendientes.length > 0) {
      const seguir = confirm(
        `Hay ${totalCitas} cita(s) futuras dentro de ese horario.\n\n` +
        'Borrar el horario NO cancela esas citas: los pacientes seguirían con su cita agendada.\n\n' +
        '¿Borrarlo de todas formas?'
      );

      if (seguir) {
        for (const id of pendientes) {
          await fetch(`${API}/api/admin/horarios/${id}?forzar=1`, { method: 'DELETE' });
        }
      }
    }

    if (errores.length > 0) alert(errores.join('\n'));

  } catch (error) {
    alert('No se pudo borrar el horario.');
    console.error(error);
  }

  cargarHorariosDoctor();
}

document.getElementById('listaHorarios').addEventListener('click', async (e) => {
  const btnDia = e.target.closest('.btn-borrar-horario');
  if (btnDia) {
    borrarHorarios([btnDia.dataset.id], `el horario del ${btnDia.dataset.dia}`);
    return;
  }

  const btnGrupo = e.target.closest('.btn-borrar-grupo');
  if (btnGrupo) {
    borrarHorarios(btnGrupo.dataset.ids.split(','), `todo este horario (${btnGrupo.dataset.texto})`);
    return;
  }

  const btnBloqueo = e.target.closest('.btn-borrar-bloqueo');
  if (btnBloqueo) {
    if (!confirm(`¿Borrar el bloqueo del ${btnBloqueo.dataset.texto}?\n\nLas citas que se cancelaron al crearlo NO se restauran.`)) return;

    try {
      const respuesta = await fetch(`${API}/api/admin/bloqueos/${btnBloqueo.dataset.id}`, { method: 'DELETE' });
      const datos = await respuesta.json();
      if (!respuesta.ok) alert(datos.mensaje);
    } catch (error) {
      alert('No se pudo borrar el bloqueo.');
      console.error(error);
    }

    cargarHorariosDoctor();
  }
});
document.getElementById('btnLunesViernes').addEventListener('click', () => {
  document.querySelectorAll('.chk-dia').forEach(c => {
    c.checked = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'].includes(c.value);
  });
});

document.getElementById('btnLimpiarDias').addEventListener('click', () => {
  document.querySelectorAll('.chk-dia').forEach(c => { c.checked = false; });
});

document.getElementById('btnAsignarHorario').addEventListener('click', async () => {
  const mensaje = document.getElementById('mensajeHorario');
  const doctor_id = document.getElementById('selDoctorHorario').value;
  const dias = Array.from(document.querySelectorAll('.chk-dia:checked')).map(c => c.value);
  const hora_inicio = document.getElementById('horInicio').value;
  const hora_fin = document.getElementById('horFin').value;
  mensaje.textContent = '';
  mensaje.style.color = '';

  if (!doctor_id || dias.length === 0 || !hora_inicio || !hora_fin) {
    mensaje.textContent = 'Elige al menos un día y completa las horas.';
    return;
  }

  let creados = 0;
  const errores = [];

  for (const dia_semana of dias) {
    try {
      const respuesta = await fetch(`${API}/api/admin/horarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctor_id, dia_semana, hora_inicio: `${hora_inicio}:00`, hora_fin: `${hora_fin}:00` })
      });
      const datos = await respuesta.json();

      if (respuesta.ok) {
        creados++;
      } else {
        errores.push(`${diaBonito(dia_semana)}: ${datos.mensaje}`);
      }
    } catch (error) {
      errores.push(`${diaBonito(dia_semana)}: no se pudo conectar con el servidor`);
      console.error(error);
    }
  }

  if (errores.length === 0) {
    mensaje.style.color = '#15803d';
    mensaje.textContent = `Horario asignado en ${creados} día(s).`;
  } else {
    mensaje.textContent = `Asignados: ${creados}. Con problema: ${errores.join(' | ')}`;
  }

  cargarHorariosDoctor();
});

async function enviarBloqueo(cuerpo) {
  const respuesta = await fetch(`${API}/api/admin/bloqueos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo)
  });
  const datos = await respuesta.json();
  return { ok: respuesta.ok, status: respuesta.status, datos };
}

document.getElementById('btnCrearBloqueo').addEventListener('click', async () => {
  const mensaje = document.getElementById('mensajeBloqueo');
  const doctor_id = document.getElementById('selDoctorHorario').value;
  const fecha = document.getElementById('bloqFecha').value;
  const hora_inicio = document.getElementById('bloqInicio').value;
  const hora_fin = document.getElementById('bloqFin').value;
  const motivo = document.getElementById('bloqMotivo').value;
  mensaje.textContent = '';
  mensaje.style.color = '';

  if (!doctor_id || !fecha || !hora_inicio || !hora_fin || !motivo) {
    mensaje.textContent = 'Completa todos los campos.';
    return;
  }

  const cuerpo = {
    doctor_id, fecha, motivo,
    hora_inicio: `${hora_inicio}:00`,
    hora_fin: `${hora_fin}:00`
  };

  try {
    let resultado = await enviarBloqueo(cuerpo);

    if (resultado.status === 409 && resultado.datos.requiereConfirmacion) {
      const citas = resultado.datos.citas;
      const lista = citas
        .map(c => `• ${c.hora.slice(0, 5)} — ${c.nombres} ${c.apellidos}`)
        .join('\n');

      const continuar = confirm(
        `Hay ${citas.length} cita(s) agendadas en ese horario:\n\n${lista}\n\n` +
        'Si continúas, el bloqueo se crea y esas citas quedan CANCELADAS. ' +
        'Los pacientes no reciben aviso automático, tendrías que avisarles tú.\n\n' +
        '¿Continuar?'
      );

      if (!continuar) {
        mensaje.textContent = 'No se creó el bloqueo. Las citas siguen agendadas.';
        return;
      }

      resultado = await enviarBloqueo({ ...cuerpo, cancelar_citas: true });
    }

    if (!resultado.ok) {
      mensaje.textContent = resultado.datos.mensaje;
      return;
    }

    mensaje.style.color = '#15803d';
    mensaje.textContent = resultado.datos.citas_canceladas > 0
      ? `Bloqueo creado. Se cancelaron ${resultado.datos.citas_canceladas} cita(s).`
      : 'Bloqueo creado correctamente.';
    cargarHorariosDoctor();

  } catch (error) {
    mensaje.textContent = 'No se pudo crear el bloqueo.';
    console.error(error);
  }
});

// ---------- Gestionar usuarios ----------
let especialidadesDisponibles = [];
let usuariosGestion = [];
let paginaGestion = 1;
const POR_PAGINA_GESTION = 10;

const escUsr = (t) => String(t ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// Para buscar sin importar mayúsculas ni tildes
const normalizarTexto = (t) =>
  String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function numerosPaginaGestion(actual, total) {
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

function prepararFiltrosGestion(contenedor) {
  if (document.getElementById('gestLista')) return;

  contenedor.innerHTML = `
    <div class="tarjeta registros-filtros">
      <div class="registros-fila">
        <input type="text" id="gestBuscar" placeholder="Buscar por nombre, documento o correo">
        <select id="gestRol">
          <option value="">Doctores y secretarias</option>
          <option value="doctor">Solo doctores</option>
          <option value="secretaria">Solo secretarias</option>
        </select>
        <button type="button" id="gestBtnBuscar">Buscar</button>
      </div>
    </div>
    <div id="gestLista"></div>
  `;

  const aplicarFiltros = () => {
    paginaGestion = 1;
    dibujarUsuarios();
  };

  document.getElementById('gestBuscar').addEventListener('input', aplicarFiltros);
  document.getElementById('gestRol').addEventListener('change', aplicarFiltros);
  document.getElementById('gestBtnBuscar').addEventListener('click', aplicarFiltros);

  document.getElementById('gestLista').addEventListener('click', (evento) => {
    const botonPagina = evento.target.closest('.reg-pag-btn');
    if (botonPagina && !botonPagina.disabled) {
      paginaGestion = Number(botonPagina.dataset.pagina);
      dibujarUsuarios();
      contenedor.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const botonEditar = evento.target.closest('.btn-editar-usuario');
    if (botonEditar) {
      const usuarioData = usuariosGestion.find(u => u.id_usuario == botonEditar.dataset.id);
      if (usuarioData) mostrarFormularioEdicion(usuarioData);
    }
  });
}

function dibujarUsuarios() {
  const lista = document.getElementById('gestLista');
  const texto = normalizarTexto(document.getElementById('gestBuscar').value.trim());
  const rol = document.getElementById('gestRol').value;

  const filtrados = usuariosGestion.filter(u => {
    if (rol && u.rol !== rol) return false;
    if (!texto) return true;
    const pajar = normalizarTexto(`${u.nombres} ${u.apellidos} ${u.numero_documento} ${u.correo}`);
    return pajar.includes(texto);
  });

  if (filtrados.length === 0) {
    lista.innerHTML = '<p class="reg-vacio">No se encontraron usuarios.</p>';
    return;
  }

  const total = filtrados.length;
  const paginas = Math.ceil(total / POR_PAGINA_GESTION);
  if (paginaGestion > paginas) paginaGestion = paginas;
  const inicio = (paginaGestion - 1) * POR_PAGINA_GESTION;
  const visibles = filtrados.slice(inicio, inicio + POR_PAGINA_GESTION);

  const iniciales = (u) =>
    (((u.nombres || '').trim()[0] || '') + ((u.apellidos || '').trim()[0] || '')).toUpperCase() || '?';

  const itemsHtml = visibles.map(u => `
    <article class="reg-item gest-item">
      <div class="reg-avatar reg-av-${escUsr(u.rol)}">${escUsr(iniciales(u))}</div>

      <div class="reg-info">
        <div class="reg-nombre">
          ${escUsr(u.nombres)} ${escUsr(u.apellidos)}
          <span class="reg-rol-chip reg-rol-${escUsr(u.rol)}">${u.rol === 'doctor' ? 'Doctor' : 'Secretaria'}</span>
          <span class="reg-etiqueta ${u.estado === 'activo' ? 'reg-ok' : 'reg-inactivo'}">${escUsr(u.estado)}</span>
        </div>
        <div class="reg-datos">
          <span><b>Documento</b> ${escUsr(u.numero_documento)}</span>
          <span><b>Correo</b> ${escUsr(u.correo) || '—'}</span>
          <span><b>Teléfono</b> ${escUsr(u.telefono) || '—'}</span>
        </div>
      </div>

      <div class="reg-acciones">
        <button type="button" class="btn-editar-usuario reg-btn-doc" data-id="${u.id_usuario}">Editar</button>
      </div>

      <div id="edicion-${u.id_usuario}" class="gest-edicion"></div>
    </article>
  `).join('');

  let paginacionHtml = '';
  if (paginas > 1) {
    const numeros = numerosPaginaGestion(paginaGestion, paginas).map(n =>
      n === '...'
        ? '<span class="reg-pag-puntos">…</span>'
        : `<button type="button" class="reg-pag-btn ${n === paginaGestion ? 'activa' : ''}" data-pagina="${n}">${n}</button>`
    ).join('');

    paginacionHtml = `
      <nav class="reg-paginacion">
        <button type="button" class="reg-pag-btn" data-pagina="${paginaGestion - 1}" ${paginaGestion === 1 ? 'disabled' : ''}>‹ Anterior</button>
        ${numeros}
        <button type="button" class="reg-pag-btn" data-pagina="${paginaGestion + 1}" ${paginaGestion === paginas ? 'disabled' : ''}>Siguiente ›</button>
      </nav>
    `;
  }

  lista.innerHTML = `
    <p class="reg-contador">Mostrando ${inicio + 1}–${inicio + visibles.length} de ${total} usuario(s)</p>
    <div class="reg-lista-items">${itemsHtml}</div>
    ${paginacionHtml}
  `;
}

async function cargarUsuarios() {
  const contenedor = document.getElementById('listaUsuarios');
  prepararFiltrosGestion(contenedor);
  const lista = document.getElementById('gestLista');

  if (usuariosGestion.length === 0) lista.innerHTML = '<p class="reg-vacio">Cargando...</p>';

  try {
    const [usuarios, especialidades] = await Promise.all([
      fetch(`${API}/api/admin/usuarios`).then(r => r.json()),
      fetch(`${API}/api/admin/especialidades`).then(r => r.json())
    ]);

    especialidadesDisponibles = especialidades.filter(e => e.estado === 'activa');
    usuariosGestion = Array.isArray(usuarios) ? usuarios : [];
    dibujarUsuarios();

  } catch (error) {
    lista.innerHTML = '<p class="reg-vacio">No se pudieron cargar los usuarios.</p>';
    console.error(error);
  }
}

function mostrarFormularioEdicion(u) {
  const contenedor = document.getElementById(`edicion-${u.id_usuario}`);

  // Si ya está abierto, se cierra
  if (contenedor.innerHTML.trim()) {
    contenedor.innerHTML = '';
    return;
  }

  const idsActuales = u.especialidad_ids ? u.especialidad_ids.split(',').map(String) : [];
  const checksHtml = especialidadesDisponibles.map(e => `
    <label class="gest-check">
      <input type="checkbox" class="edit-chk-especialidad" value="${e.id_especialidad}" ${idsActuales.includes(String(e.id_especialidad)) ? 'checked' : ''}>
      <span>${escUsr(e.nombre)}</span>
    </label>
  `).join('');

  const bloqueProfesional = u.rol === 'doctor' ? `
      <h4 class="gest-titulo">Información profesional</h4>
      <div class="gest-grid">
        <div class="gest-campo">
          <label>Tarjeta profesional</label>
          <input type="text" id="edit-tarjeta-${u.id_usuario}" value="${escUsr(u.tarjeta_profesional)}">
        </div>
        <div class="gest-campo gest-full">
          <label>Especialidades</label>
          <div class="gest-checks">${checksHtml || '<span class="reg-vacio" style="padding:0;">No hay especialidades activas.</span>'}</div>
        </div>
      </div>
  ` : `
      <h4 class="gest-titulo">Información laboral</h4>
      <div class="gest-grid">
        <div class="gest-campo">
          <label>Cargo</label>
          <input type="text" id="edit-cargo-${u.id_usuario}" value="${escUsr(u.cargo)}">
        </div>
      </div>
  `;

  contenedor.innerHTML = `
    <div class="gest-form">
      <h4 class="gest-titulo">Datos personales</h4>
      <div class="gest-grid">
        <div class="gest-campo">
          <label>Nombres</label>
          <input type="text" id="edit-nombres-${u.id_usuario}" value="${escUsr(u.nombres)}">
        </div>
        <div class="gest-campo">
          <label>Apellidos</label>
          <input type="text" id="edit-apellidos-${u.id_usuario}" value="${escUsr(u.apellidos)}">
        </div>
        <div class="gest-campo">
          <label>Estado</label>
          <select id="edit-estado-${u.id_usuario}">
            <option value="activo" ${u.estado === 'activo' ? 'selected' : ''}>Activo</option>
            <option value="inactivo" ${u.estado === 'inactivo' ? 'selected' : ''}>Inactivo</option>
          </select>
        </div>
      </div>

      <h4 class="gest-titulo">Contacto</h4>
      <div class="gest-grid">
        <div class="gest-campo">
          <label>Teléfono</label>
          <input type="text" id="edit-telefono-${u.id_usuario}" value="${escUsr(u.telefono)}">
        </div>
        <div class="gest-campo">
          <label>Correo</label>
          <input type="email" id="edit-correo-${u.id_usuario}" value="${escUsr(u.correo)}">
        </div>
        <div class="gest-campo">
          <label>Ciudad</label>
          <input type="text" id="edit-ciudad-${u.id_usuario}" value="${escUsr(u.ciudad)}">
        </div>
        <div class="gest-campo">
          <label>Dirección</label>
          <input type="text" id="edit-direccion-${u.id_usuario}" value="${escUsr(u.direccion)}">
        </div>
      </div>

      ${bloqueProfesional}

      <div class="gest-pie">
        <p id="edit-mensaje-${u.id_usuario}" class="error"></p>
        <button type="button" class="gest-btn-cancelar" onclick="document.getElementById('edicion-${u.id_usuario}').innerHTML = ''">Cancelar</button>
        <button type="button" onclick="guardarEdicionUsuario(${u.id_usuario}, '${u.rol}')">Guardar cambios</button>
      </div>
    </div>
  `;
}

async function guardarEdicionUsuario(id_usuario, rol) {
  const mensaje = document.getElementById(`edit-mensaje-${id_usuario}`);

  const datos = {
    nombres: document.getElementById(`edit-nombres-${id_usuario}`).value,
    apellidos: document.getElementById(`edit-apellidos-${id_usuario}`).value,
    telefono: document.getElementById(`edit-telefono-${id_usuario}`).value,
    correo: document.getElementById(`edit-correo-${id_usuario}`).value,
    ciudad: document.getElementById(`edit-ciudad-${id_usuario}`).value,
    direccion: document.getElementById(`edit-direccion-${id_usuario}`).value,
    estado: document.getElementById(`edit-estado-${id_usuario}`).value
  };

  if (rol === 'doctor') {
    datos.tarjeta_profesional = document.getElementById(`edit-tarjeta-${id_usuario}`).value;
    datos.especialidad_ids = Array.from(
      document.querySelectorAll(`#edicion-${id_usuario} .edit-chk-especialidad:checked`)
    ).map(c => c.value);
  } else {
    datos.cargo = document.getElementById(`edit-cargo-${id_usuario}`).value;
  }

  try {
    const respuesta = await fetch(`${API}/api/admin/usuarios/${id_usuario}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos)
    });

    const resultado = await respuesta.json();

    if (!respuesta.ok) {
      mensaje.textContent = resultado.mensaje;
      return;
    }

    cargarUsuarios();

  } catch (error) {
    mensaje.textContent = 'No se pudo actualizar el usuario.';
    console.error(error);
  }
}

// ---------- Informes ----------
const NOMBRE_ESTADO = {
  en_espera: 'En espera', en_atencion: 'Atendiendo',
  atendida: 'Atendida', cancelada: 'Cancelada', no_asistida: 'No asistida'
};

function fechaLocalHoyAdmin() {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
}

function primerDiaDelMes() {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-01`;
}

document.getElementById('infDesde').value = primerDiaDelMes();
document.getElementById('infHasta').value = fechaLocalHoyAdmin();

function filaInforme(nombre, total) {
  return `<div class="fila-informe"><span>${nombre}</span><strong>${total}</strong></div>`;
}

document.getElementById('btnGenerarInforme').addEventListener('click', async () => {
  const mensaje = document.getElementById('mensajeInforme');
  const contenedor = document.getElementById('resultadoInformes');
  const desde = document.getElementById('infDesde').value;
  const hasta = document.getElementById('infHasta').value;

  mensaje.textContent = '';
  contenedor.innerHTML = '';

  if (!desde || !hasta) {
    mensaje.textContent = 'Elige las dos fechas.';
    return;
  }

  if (hasta < desde) {
    mensaje.textContent = 'La fecha final no puede ser anterior a la inicial.';
    return;
  }

  try {
    const respuesta = await fetch(`${API}/api/admin/informes?desde=${desde}&hasta=${hasta}`);
    const datos = await respuesta.json();

    if (!respuesta.ok) {
      mensaje.textContent = datos.mensaje;
      return;
    }

    const totalCitas = datos.porEstado.reduce((suma, e) => suma + e.total, 0);

    const estadoHtml = datos.porEstado.length
      ? datos.porEstado.map(e => filaInforme(NOMBRE_ESTADO[e.estado] || e.estado, e.total)).join('')
      : '<p style="font-size:0.85rem; color:#5f5e5a;">Sin citas en este rango.</p>';

    const doctorHtml = datos.porDoctor.length
      ? datos.porDoctor.map(d => filaInforme(`Dr(a). ${d.nombres} ${d.apellidos}`, d.total)).join('')
      : '<p style="font-size:0.85rem; color:#5f5e5a;">Sin datos.</p>';

    const especialidadHtml = datos.porEspecialidad.length
      ? datos.porEspecialidad.map(e => filaInforme(e.nombre, e.total)).join('')
      : '<p style="font-size:0.85rem; color:#5f5e5a;">Sin datos.</p>';

    const examenesHtml = datos.examenes.length
      ? datos.examenes.map(e => filaInforme(e.nombre, e.total)).join('')
      : '<p style="font-size:0.85rem; color:#5f5e5a;">No se ordenaron exámenes en este rango.</p>';

    const medicamentosHtml = datos.medicamentos.length
      ? datos.medicamentos.map(m => filaInforme(m.nombre, m.total)).join('')
      : '<p style="font-size:0.85rem; color:#5f5e5a;">No se formularon medicamentos en este rango.</p>';

    contenedor.innerHTML = `
      <div class="grid-informes">
        <div class="tarjeta-informe">
          <h3>Resumen del periodo</h3>
          <p class="numero-grande">${totalCitas}</p>
          <p style="font-size:0.85rem; color:#5f5e5a; margin-top:0;">Citas totales</p>
          <p class="numero-grande">${datos.pacientesNuevos}</p>
          <p style="font-size:0.85rem; color:#5f5e5a; margin-top:0;">Pacientes nuevos registrados</p>
        </div>

        <div class="tarjeta-informe">
          <h3>Citas por estado</h3>
          ${estadoHtml}
        </div>

        <div class="tarjeta-informe">
          <h3>Citas por doctor</h3>
          ${doctorHtml}
        </div>

        <div class="tarjeta-informe">
          <h3>Citas por especialidad</h3>
          ${especialidadHtml}
        </div>

        <div class="tarjeta-informe">
          <h3>Exámenes más ordenados</h3>
          ${examenesHtml}
        </div>

        <div class="tarjeta-informe">
          <h3>Medicamentos más formulados</h3>
          ${medicamentosHtml}
        </div>
      </div>
    `;

  } catch (error) {
    mensaje.textContent = 'No se pudo conectar con el servidor.';
    console.error(error);
  }
});

// ---------- Inicialización ----------
cargarChecksEspecialidades();