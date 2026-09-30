const API = 'https://ips-vida-sana-production.up.railway.app';

const usuario = JSON.parse(localStorage.getItem('usuario') || 'null');

if (!usuario || usuario.rol !== 'paciente') {
  window.location.href = 'index.html';
}

document.getElementById('nombreUsuario').textContent = `${usuario.nombres} ${usuario.apellidos}`;

document.getElementById('btnCerrarSesion').addEventListener('click', () => {
  localStorage.removeItem('usuario');
  window.location.href = 'index.html';
});

// ---------- Formato de estado ----------
const formatearEstado = (estado) => {
  const mapa = {
    programada: 'Programada',
    confirmada: 'Confirmada',
    en_espera: 'En espera',
    atendida: 'Atendida',
    cancelada: 'Cancelada',
    no_asistida: 'No asistida'
  };
  return mapa[estado] || estado;
};

// ---------- Sección Inicio: próxima cita ----------
const cargarProximaCita = async () => {
  const contenedor = document.getElementById('proximaCita');
  try {
    const respuesta = await fetch(`${API}/api/pacientes/${usuario.id_paciente}/citas`);
    const citas = await respuesta.json();
    const ahora = new Date();

    const proxima = citas
      .filter(c => ['programada', 'confirmada', 'en_espera'].includes(c.estado))
      .filter(c => new Date(`${c.fecha}T${c.hora}`) >= ahora)
      .sort((a, b) => new Date(`${a.fecha}T${a.hora}`) - new Date(`${b.fecha}T${b.hora}`))[0];

    if (!proxima) {
      contenedor.textContent = 'No tienes citas próximas. Agenda una desde la sección "Citas".';
      return;
    }

    contenedor.innerHTML = `
      <strong>Tu próxima cita</strong><br>
      ${proxima.fecha} · ${proxima.hora.slice(0, 5)} — ${proxima.especialidad || ''}<br>
      Dr(a). ${proxima.doctor_nombres} ${proxima.doctor_apellidos} — ${formatearEstado(proxima.estado)}
    `;
  } catch (error) {
    contenedor.textContent = 'No se pudo cargar tu próxima cita.';
    console.error(error);
  }
};

// ---------- Sección Citas: agendar y lista con reprogramar / cancelar ----------
const listaCitas = Agendador.listarCitas({
  contenedor: document.getElementById('listaCitas'),
  pacienteId: () => usuario.id_paciente,
  alCambiar: () => cargarProximaCita()
});

Agendador.montar({
  contenedor: document.getElementById('agendadorPaciente'),
  pacienteId: () => usuario.id_paciente,
  alTerminar: () => {
    listaCitas.recargar();
    cargarProximaCita();
  }
});

// ---------- Sección Historia Clínica: solo el resumen por defecto ----------
const cargarHistoriaClinica = async () => {
  const contenedor = document.getElementById('contenidoHistoria');
  contenedor.textContent = 'Cargando...';

  try {
    const respuesta = await fetch(`${API}/api/pacientes/${usuario.id_paciente}/historia-clinica/resumen`);
    const datos = await respuesta.json();

    if (!respuesta.ok) {
      contenedor.textContent = datos.mensaje;
      return;
    }

    contenedor.innerHTML = `
      <div class="tarjeta">
        <p><strong>Grupo sanguíneo:</strong> ${datos.grupo_sanguineo || 'No registrado'}</p>
        <p><strong>Alergias:</strong> ${datos.alergias || 'No registradas'}</p>
        <p><strong>Antecedentes personales:</strong> ${datos.antecedentes_personales || 'No registrados'}</p>
        <p><strong>Antecedentes familiares:</strong> ${datos.antecedentes_familiares || 'No registrados'}</p>
      </div>
      <p style="font-size:0.85rem; color:#5f5e5a;">
        Aquí solo se muestran tus datos base. Tu historial de consultas no se ve por defecto,
        igual que en la vida real solo te entregan lo de cada consulta a menos que pidas tu historia completa.
      </p>
      <button type="button" id="btnVerHistoriaCompleta" style="background:#fff; color:#185fa5; border:1px solid #185fa5;">Ver historia clínica completa</button>
      <div id="historiaCompleta"></div>
    `;

    document.getElementById('btnVerHistoriaCompleta').addEventListener('click', cargarHistoriaCompleta);

  } catch (error) {
    contenedor.textContent = 'No se pudo cargar la historia clínica.';
    console.error(error);
  }
};

const cargarHistoriaCompleta = async () => {
  const contenedor = document.getElementById('historiaCompleta');

  if (contenedor.innerHTML.trim()) {
    contenedor.innerHTML = '';
    return;
  }

  contenedor.textContent = 'Cargando historial completo...';

  try {
    const respuesta = await fetch(`${API}/api/pacientes/${usuario.id_paciente}/historia-clinica`);
    const datos = await respuesta.json();

    if (!respuesta.ok) {
      contenedor.textContent = datos.mensaje;
      return;
    }

    const consultasHtml = datos.consultas.length
      ? datos.consultas.map(c => `
          <div class="consulta-item">
            <strong>${c.fecha_consulta}</strong><br>
            Dr(a). ${c.doctor_nombres} ${c.doctor_apellidos}<br>
            <strong>Diagnóstico:</strong> ${c.diagnostico}<br>
            ${c.observaciones ? `<strong>Observaciones:</strong> ${c.observaciones}` : ''}
          </div>
        `).join('')
      : '<p>Aún no tienes consultas registradas.</p>';

    contenedor.innerHTML = `
      <h3>Historial de consultas</h3>
      <a href="https://ips-vida-sana-production.up.railway.app/api/documentos/historia-clinica/${usuario.id_paciente}/pdf" target="_blank">
        <button style="width:100%;">Descargar historia clínica completa (PDF)</button>
      </a>
      ${consultasHtml}
    `;
  } catch (error) {
    contenedor.textContent = 'No se pudo cargar el historial completo.';
    console.error(error);
  }
};

// ---------- Sección Mis documentos: resúmenes de atención, fórmulas, órdenes e incapacidades ----------
const cargarDocumentos = async () => {
  const contenedor = document.getElementById('contenidoDocumentos');
  contenedor.textContent = 'Cargando...';

  try {
    const respuesta = await fetch(`${API}/api/pacientes/${usuario.id_paciente}/documentos`);
    const datos = await respuesta.json();

    const atencionesHtml = datos.atenciones.length
      ? datos.atenciones.map(a => `
          <div class="fila-cita">
            <div>${a.fecha} — Dr(a). ${a.doctor_nombres} ${a.doctor_apellidos}</div>
            <a href="https://ips-vida-sana-production.up.railway.app/api/documentos/atencion/${a.id_consulta}/pdf" target="_blank">
              <button>Descargar PDF</button>
            </a>
          </div>
        `).join('')
      : '<p>Aún no tienes resúmenes de atención.</p>';

    const formulasHtml = datos.formulas.length
      ? datos.formulas.map(f => `
          <div class="fila-cita">
            <div>Fórmula médica — ${f.fecha}</div>
            <a href="https://ips-vida-sana-production.up.railway.app/api/documentos/formula/${f.id_formula}/pdf" target="_blank">
              <button>Descargar PDF</button>
            </a>
          </div>
        `).join('')
      : '<p>No tienes fórmulas médicas.</p>';

    const ordenesHtml = datos.ordenes.length
      ? datos.ordenes.map(o => `
          <div class="fila-cita">
            <div>${o.examenes} — ${o.fecha}</div>
            <a href="https://ips-vida-sana-production.up.railway.app/api/documentos/orden/${o.id_orden}/pdf" target="_blank">
              <button>Descargar PDF</button>
            </a>
          </div>
        `).join('')
      : '<p>No tienes órdenes de examen.</p>';

    const incapacidadesHtml = datos.incapacidades.length
      ? datos.incapacidades.map(i => `
          <div class="fila-cita">
            <div>Del ${i.fecha_inicio} al ${i.fecha_fin} — ${i.dias_incapacidad} día(s)</div>
            <a href="https://ips-vida-sana-production.up.railway.app/api/documentos/incapacidad/${i.id_incapacidad}/pdf" target="_blank">
              <button>Descargar PDF</button>
            </a>
          </div>
        `).join('')
      : '<p>No tienes incapacidades médicas.</p>';

    contenedor.innerHTML = `
      <h3>Resúmenes de atención</h3>
      ${atencionesHtml}
      <h3>Fórmulas médicas</h3>
      ${formulasHtml}
      <h3>Órdenes de examen</h3>
      ${ordenesHtml}
      <h3>Incapacidades médicas</h3>
      ${incapacidadesHtml}
    `;
  } catch (error) {
    contenedor.textContent = 'No se pudieron cargar los documentos.';
    console.error(error);
  }
};

// ---------- Navegación entre secciones ----------
const botonesNav = document.querySelectorAll('.nav-item');
const secciones = document.querySelectorAll('.seccion');

botonesNav.forEach(boton => {
  boton.addEventListener('click', () => {
    botonesNav.forEach(b => b.classList.remove('activo'));
    boton.classList.add('activo');

    const idSeccion = boton.dataset.seccion;
    secciones.forEach(s => s.classList.add('oculto'));
    document.getElementById(`seccion-${idSeccion}`).classList.remove('oculto');

    if (idSeccion === 'citas') listaCitas.recargar();
    if (idSeccion === 'historia') cargarHistoriaClinica();
    if (idSeccion === 'documentos') cargarDocumentos();
  });
});

// ---------- Inicialización ----------
Notificaciones.montar({
  contenedor: document.getElementById('zonaCampana'),
  usuarioId: usuario.id_usuario
});
cargarProximaCita();