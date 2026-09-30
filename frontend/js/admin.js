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

// ---------- Navegación ----------
document.querySelectorAll('.nav-item').forEach(boton => {
  boton.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('activo'));
    boton.classList.add('activo');

    const idSeccion = boton.dataset.seccion;
    document.querySelectorAll('.seccion').forEach(s => s.classList.add('oculto'));
    document.getElementById(`seccion-${idSeccion}`).classList.remove('oculto');

    if (idSeccion === 'especialidades') cargarEspecialidades();
    if (idSeccion === 'servicios') cargarServicios();
    if (idSeccion === 'horarios') cargarDoctoresParaHorario();
    if (idSeccion === 'gestionar') cargarUsuarios();
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

// ---------- Especialidades ----------
async function cargarEspecialidades() {
  const contenedor = document.getElementById('listaEspecialidades');
  contenedor.textContent = 'Cargando...';

  try {
    const respuesta = await fetch(`${API}/api/admin/especialidades`);
    const especialidades = await respuesta.json();

    contenedor.innerHTML = especialidades.map(e => `
      <div class="tarjeta" style="max-width:500px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong>${e.nombre}</strong><br>
            <span style="font-size:0.8rem; color:#5f5e5a;">${e.descripcion || ''}</span>
          </div>
          <div>
            <span class="estado-badge">${e.estado}</span>
          </div>
        </div>
        <div style="margin-top:8px; display:flex; gap:8px;">
          ${e.estado === 'activa'
            ? `<button class="btn-desactivar" data-id="${e.id_especialidad}" style="background:#fff; color:#b91c1c; border:1px solid #d3d1c7;">Desactivar</button>`
            : `<button class="btn-activar" data-id="${e.id_especialidad}">Activar</button>`}
          <button class="btn-ver-doctores" data-id="${e.id_especialidad}" style="background:#fff; color:#185fa5; border:1px solid #185fa5;">Ver doctores</button>
        </div>
        <div id="doctoresEsp-${e.id_especialidad}"></div>
      </div>
    `).join('');

    document.querySelectorAll('.btn-desactivar').forEach(boton => {
      boton.addEventListener('click', () => cambiarEstadoEspecialidad(boton.dataset.id, 'inactiva'));
    });
    document.querySelectorAll('.btn-activar').forEach(boton => {
      boton.addEventListener('click', () => cambiarEstadoEspecialidad(boton.dataset.id, 'activa'));
    });
    document.querySelectorAll('.btn-ver-doctores').forEach(boton => {
      boton.addEventListener('click', () => verDoctoresDeEspecialidad(boton.dataset.id));
    });

  } catch (error) {
    contenedor.textContent = 'No se pudieron cargar las especialidades.';
    console.error(error);
  }
}

async function cambiarEstadoEspecialidad(id, nuevoEstado) {
  try {
    await fetch(`${API}/api/admin/especialidades/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: nuevoEstado })
    });
    cargarEspecialidades();
  } catch (error) {
    alert('No se pudo actualizar la especialidad.');
    console.error(error);
  }
}

async function verDoctoresDeEspecialidad(id) {
  const contenedor = document.getElementById(`doctoresEsp-${id}`);
  contenedor.textContent = 'Cargando...';

  try {
    const respuesta = await fetch(`${API}/api/citas/doctores/${id}`);
    const doctores = await respuesta.json();

    contenedor.innerHTML = doctores.length
      ? doctores.map(d => `<div style="font-size:0.85rem; padding:4px 0;">• Dr(a). ${d.nombres} ${d.apellidos} — ${d.tarjeta_profesional}</div>`).join('')
      : '<p style="font-size:0.85rem;">Ningún doctor tiene esta especialidad asignada todavía.</p>';

  } catch (error) {
    contenedor.textContent = 'No se pudieron cargar los doctores.';
    console.error(error);
  }
}

document.getElementById('btnCrearEspecialidad').addEventListener('click', async () => {
  const mensaje = document.getElementById('mensajeEspecialidad');
  const nombre = document.getElementById('espNombre').value;
  const descripcion = document.getElementById('espDescripcion').value;
  mensaje.textContent = '';

  if (!nombre) {
    mensaje.textContent = 'El nombre es obligatorio.';
    return;
  }

  try {
    const respuesta = await fetch(`${API}/api/admin/especialidades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, descripcion })
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      mensaje.textContent = datos.mensaje;
      return;
    }

    document.getElementById('espNombre').value = '';
    document.getElementById('espDescripcion').value = '';
    cargarEspecialidades();

  } catch (error) {
    mensaje.textContent = 'No se pudo crear la especialidad.';
    console.error(error);
  }
});

// ---------- Servicios ----------
async function cargarServicios() {
  const contenedor = document.getElementById('listaServicios');
  contenedor.textContent = 'Cargando...';

  try {
    const respuesta = await fetch(`${API}/api/admin/servicios`);
    const servicios = await respuesta.json();

    contenedor.innerHTML = servicios.map(s => `
      <div class="tarjeta" style="max-width:500px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong>${s.nombre}</strong> — $${Number(s.precio).toLocaleString('es-CO')}<br>
            <span style="font-size:0.8rem; color:#5f5e5a;">${s.descripcion || ''}</span>
          </div>
          <span class="estado-badge">${s.estado}</span>
        </div>
        <div style="margin-top:8px; display:flex; gap:8px;">
          ${s.estado === 'activo'
            ? `<button class="btn-desactivar-servicio" data-id="${s.id_servicio}" style="background:#fff; color:#b91c1c; border:1px solid #d3d1c7;">Desactivar</button>`
            : `<button class="btn-activar-servicio" data-id="${s.id_servicio}">Activar</button>`}
          <button class="btn-editar-precio" data-id="${s.id_servicio}" data-precio="${s.precio}" style="background:#fff; color:#185fa5; border:1px solid #185fa5;">Cambiar precio</button>
        </div>
        <div id="editarServicio-${s.id_servicio}"></div>
      </div>
    `).join('');

    document.querySelectorAll('.btn-desactivar-servicio').forEach(boton => {
      boton.addEventListener('click', () => cambiarEstadoServicio(boton.dataset.id, 'inactivo'));
    });
    document.querySelectorAll('.btn-activar-servicio').forEach(boton => {
      boton.addEventListener('click', () => cambiarEstadoServicio(boton.dataset.id, 'activo'));
    });
    document.querySelectorAll('.btn-editar-precio').forEach(boton => {
      boton.addEventListener('click', () => mostrarEdicionPrecio(boton.dataset.id, boton.dataset.precio));
    });

  } catch (error) {
    contenedor.textContent = 'No se pudieron cargar los servicios.';
    console.error(error);
  }
}

async function cambiarEstadoServicio(id, nuevoEstado) {
  try {
    await fetch(`${API}/api/admin/servicios/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: nuevoEstado })
    });
    cargarServicios();
  } catch (error) {
    alert('No se pudo actualizar el servicio.');
    console.error(error);
  }
}

function mostrarEdicionPrecio(id, precioActual) {
  const contenedor = document.getElementById(`editarServicio-${id}`);

  if (contenedor.innerHTML.trim()) {
    contenedor.innerHTML = '';
    return;
  }

  contenedor.innerHTML = `
    <div style="border-top:1px solid #e5e3da; margin-top:8px; padding-top:8px;">
      <label>Nuevo precio</label>
      <input type="number" id="nuevoPrecio-${id}" value="${precioActual}">
      <button onclick="guardarPrecio(${id})">Guardar</button>
      <p id="mensajePrecio-${id}" class="error"></p>
    </div>
  `;
}

async function guardarPrecio(id) {
  const mensaje = document.getElementById(`mensajePrecio-${id}`);
  const precio = document.getElementById(`nuevoPrecio-${id}`).value;

  try {
    const respuesta = await fetch(`${API}/api/admin/servicios/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ precio })
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      mensaje.textContent = datos.mensaje;
      return;
    }

    cargarServicios();
  } catch (error) {
    mensaje.textContent = 'No se pudo actualizar el precio.';
    console.error(error);
  }
}

document.getElementById('btnCrearServicio').addEventListener('click', async () => {
  const mensaje = document.getElementById('mensajeServicio');
  const nombre = document.getElementById('servNombre').value;
  const descripcion = document.getElementById('servDescripcion').value;
  const precio = document.getElementById('servPrecio').value;
  mensaje.textContent = '';

  if (!nombre || !precio) {
    mensaje.textContent = 'El nombre y el precio son obligatorios.';
    return;
  }

  try {
    const respuesta = await fetch(`${API}/api/admin/servicios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, descripcion, precio })
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      mensaje.textContent = datos.mensaje;
      return;
    }

    document.getElementById('servNombre').value = '';
    document.getElementById('servDescripcion').value = '';
    document.getElementById('servPrecio').value = '';
    cargarServicios();

  } catch (error) {
    mensaje.textContent = 'No se pudo crear el servicio.';
    console.error(error);
  }
});

// ---------- Horarios ----------
const ORDEN_DIAS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
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
    c.checked = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes'].includes(c.value);
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

async function cargarUsuarios() {
  const contenedor = document.getElementById('listaUsuarios');
  contenedor.textContent = 'Cargando...';

  try {
    const [usuarios, especialidades] = await Promise.all([
      fetch(`${API}/api/admin/usuarios`).then(r => r.json()),
      fetch(`${API}/api/admin/especialidades`).then(r => r.json())
    ]);

    especialidadesDisponibles = especialidades.filter(e => e.estado === 'activa');

    contenedor.innerHTML = usuarios.map(u => `
      <div class="tarjeta" style="max-width:600px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong>${u.nombres} ${u.apellidos}</strong> — ${u.rol === 'doctor' ? 'Doctor' : 'Secretaria'}<br>
            <span style="font-size:0.8rem; color:#5f5e5a;">${u.numero_documento} · ${u.correo}</span>
          </div>
          <span class="estado-badge">${u.estado}</span>
        </div>
        <button class="btn-editar-usuario" data-id="${u.id_usuario}" style="margin-top:8px; background:#fff; color:#185fa5; border:1px solid #185fa5;">Editar</button>
        <div id="edicion-${u.id_usuario}"></div>
      </div>
    `).join('');

    document.querySelectorAll('.btn-editar-usuario').forEach(boton => {
      const usuarioData = usuarios.find(u => u.id_usuario == boton.dataset.id);
      boton.addEventListener('click', () => mostrarFormularioEdicion(usuarioData));
    });

  } catch (error) {
    contenedor.textContent = 'No se pudieron cargar los usuarios.';
    console.error(error);
  }
}

function mostrarFormularioEdicion(u) {
  const contenedor = document.getElementById(`edicion-${u.id_usuario}`);

  const idsActuales = u.especialidad_ids ? u.especialidad_ids.split(',').map(String) : [];
  const checksHtml = especialidadesDisponibles.map(e => `
    <label style="display:flex; align-items:center; gap:6px; font-weight:normal;">
      <input type="checkbox" class="edit-chk-especialidad" value="${e.id_especialidad}" ${idsActuales.includes(String(e.id_especialidad)) ? 'checked' : ''}>
      ${e.nombre}
    </label>
  `).join('');

  contenedor.innerHTML = `
    <div style="border-top:1px solid #e5e3da; margin-top:10px; padding-top:10px;">
      <label>Nombres</label>
      <input type="text" id="edit-nombres-${u.id_usuario}" value="${u.nombres}">
      <label>Apellidos</label>
      <input type="text" id="edit-apellidos-${u.id_usuario}" value="${u.apellidos}">
      <label>Teléfono</label>
      <input type="text" id="edit-telefono-${u.id_usuario}" value="${u.telefono || ''}">
      <label>Correo</label>
      <input type="email" id="edit-correo-${u.id_usuario}" value="${u.correo}">
      <label>Ciudad</label>
      <input type="text" id="edit-ciudad-${u.id_usuario}" value="${u.ciudad || ''}">
      <label>Dirección</label>
      <input type="text" id="edit-direccion-${u.id_usuario}" value="${u.direccion || ''}">
      <label>Estado</label>
      <select id="edit-estado-${u.id_usuario}">
        <option value="activo" ${u.estado === 'activo' ? 'selected' : ''}>Activo</option>
        <option value="inactivo" ${u.estado === 'inactivo' ? 'selected' : ''}>Inactivo</option>
      </select>

      ${u.rol === 'doctor' ? `
        <label>Tarjeta profesional</label>
        <input type="text" id="edit-tarjeta-${u.id_usuario}" value="${u.tarjeta_profesional || ''}">
        <label>Especialidades</label>
        <div>${checksHtml}</div>
      ` : `
        <label>Cargo</label>
        <input type="text" id="edit-cargo-${u.id_usuario}" value="${u.cargo || ''}">
      `}

      <button onclick="guardarEdicionUsuario(${u.id_usuario}, '${u.rol}')">Guardar cambios</button>
      <p id="edit-mensaje-${u.id_usuario}" class="error"></p>
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
  programada: 'Programada', confirmada: 'Confirmada', en_espera: 'En espera',
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