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

// Si vuelves con el botón "Atrás" del navegador después de cerrar sesión, el navegador
// puede mostrar esta página desde su caché sin volver a ejecutar el chequeo de arriba.
// Forzamos una recarga para que se vuelva a validar la sesión.
window.addEventListener('pageshow', (evento) => {
  if (evento.persisted) {
    window.location.reload();
  }
});

// ---------- Formato de estado ----------
const formatearEstado = (estado) => {
  const mapa = {
    programada: 'Programada',
    confirmada: 'Confirmada',
    en_atencion: 'Atendiendo',
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
      .filter(c => ['programada', 'confirmada', 'en_espera', 'en_atencion'].includes(c.estado))
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
// ---------- Sección Mis documentos: agrupados por consulta, con filtros ----------
const DOC_URL_PDF = 'https://ips-vida-sana-production.up.railway.app/api/documentos';
const DOC_MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DOC_TIPOS = {
  atencion: { etiqueta: 'Atenciones', tag: 'Atención' },
  formula: { etiqueta: 'Fórmulas', tag: 'Fórmula' },
  orden: { etiqueta: 'Órdenes de examen', tag: 'Orden' },
  incapacidad: { etiqueta: 'Incapacidades', tag: 'Incapacidad' }
};
const DOC_POR_PAGINA = 8;
// "todos" guarda una consulta por elemento, con sus documentos dentro.
const docEstado = { todos: [], tipo: 'todos', mes: '', orden: 'recientes', pagina: 1 };

const docEsc = (t) => String(t ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const docFechaBonita = (clave) => {
  const [anio, mes, dia] = String(clave).slice(0, 10).split('-').map(Number);
  return `${dia} ${DOC_MESES[mes - 1].slice(0, 3).toLowerCase()} ${anio}`;
};

const docHora = (clave) => (String(clave).length > 10 ? String(clave).slice(11, 16) : '');

const docTituloMes = (anioMes) => {
  const [anio, mes] = anioMes.split('-').map(Number);
  return `${DOC_MESES[mes - 1]} ${anio}`;
};

function docFiltrados() {
  const lista = [];

  docEstado.todos.forEach(g => {
    if (docEstado.mes && g.clave.slice(0, 7) !== docEstado.mes) return;

    const docs = docEstado.tipo === 'todos'
      ? g.docs
      : g.docs.filter(d => d.tipo === docEstado.tipo);

    if (docs.length) lista.push({ ...g, docs });
  });

  lista.sort((a, b) => (a.clave < b.clave ? -1 : a.clave > b.clave ? 1 : 0));
  if (docEstado.orden === 'recientes') lista.reverse();
  return lista;
}

function dibujarDocumentos() {
  const contenedor = document.getElementById('contenidoDocumentos');
  const lista = docFiltrados();
  const totalPaginas = Math.max(1, Math.ceil(lista.length / DOC_POR_PAGINA));
  if (docEstado.pagina > totalPaginas) docEstado.pagina = totalPaginas;

  const inicio = (docEstado.pagina - 1) * DOC_POR_PAGINA;
  const pagina = lista.slice(inicio, inicio + DOC_POR_PAGINA);

  const todosLosDocs = docEstado.todos.flatMap(g => g.docs);
  const conteo = (tipo) => todosLosDocs.filter(d => d.tipo === tipo).length;

  const chips = [['todos', 'Todos', todosLosDocs.length]]
    .concat(Object.keys(DOC_TIPOS).map(t => [t, DOC_TIPOS[t].etiqueta, conteo(t)]))
    .map(([tipo, etiqueta, n]) => `
      <button type="button" class="doc-chip ${docEstado.tipo === tipo ? 'activo' : ''}" data-doc-tipo="${tipo}">
        ${etiqueta} <span>${n}</span>
      </button>`).join('');

  const meses = [...new Set(docEstado.todos.map(g => g.clave.slice(0, 7)))].sort().reverse();
  const opcionesMes = '<option value="">Todos los meses</option>' + meses.map(m =>
    `<option value="${m}" ${docEstado.mes === m ? 'selected' : ''}>${docTituloMes(m)}</option>`).join('');

  let html = `
    <div class="doc-filtros">
      <div class="doc-chips">${chips}</div>
      <div class="doc-selects">
        <select id="docFiltroMes">${opcionesMes}</select>
        <select id="docFiltroOrden">
          <option value="recientes" ${docEstado.orden === 'recientes' ? 'selected' : ''}>Más recientes primero</option>
          <option value="antiguos" ${docEstado.orden === 'antiguos' ? 'selected' : ''}>Más antiguos primero</option>
        </select>
      </div>
    </div>
    <p class="doc-resumen">${lista.length} consulta(s) con documentos</p>`;

  if (pagina.length === 0) {
    html += '<div class="doc-vacio">No hay documentos para los filtros elegidos.</div>';
  } else {
    let mesActual = '';

    pagina.forEach(g => {
      const mes = g.clave.slice(0, 7);

      if (mes !== mesActual) {
        mesActual = mes;
        html += `<h3 class="doc-mes">${docTituloMes(mes)}</h3>`;
      }

      const hora = docHora(g.clave);

      html += `
        <div class="doc-grupo">
          <div class="doc-grupo-cab">
            <div class="doc-grupo-fecha">
              <strong>${docFechaBonita(g.clave)}</strong>
              ${hora ? `<small>${hora}</small>` : ''}
            </div>
            <div class="doc-grupo-info">
              <strong>${docEsc(g.doctor || 'Consulta')}</strong>
              ${g.diagnostico ? `<small>${docEsc(g.diagnostico)}</small>` : ''}
            </div>
          </div>
          ${g.docs.map(d => `
            <div class="doc-linea">
              <span class="doc-tag doc-tag-${d.tipo}">${DOC_TIPOS[d.tipo].tag}</span>
              <div class="doc-info">
                <strong>${docEsc(d.titulo)}</strong>
                ${d.detalle ? `<small>${docEsc(d.detalle)}</small>` : ''}
              </div>
              <a class="doc-btn" href="${DOC_URL_PDF}/${d.ruta}/${d.id}/pdf" target="_blank">Descargar PDF</a>
            </div>`).join('')}
        </div>`;
    });
  }

  if (totalPaginas > 1) {
    html += `
      <div class="doc-paginacion">
        <button type="button" data-doc-pag="${docEstado.pagina - 1}" ${docEstado.pagina === 1 ? 'disabled' : ''}>‹ Anterior</button>
        <span>Página ${docEstado.pagina} de ${totalPaginas}</span>
        <button type="button" data-doc-pag="${docEstado.pagina + 1}" ${docEstado.pagina === totalPaginas ? 'disabled' : ''}>Siguiente ›</button>
      </div>`;
  }

  contenedor.innerHTML = html;
}

(() => {
  const contenedor = document.getElementById('contenidoDocumentos');

  contenedor.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-doc-tipo]');
    const pag = e.target.closest('[data-doc-pag]');

    if (chip) {
      docEstado.tipo = chip.dataset.docTipo;
      docEstado.pagina = 1;
      dibujarDocumentos();
    } else if (pag && !pag.disabled) {
      docEstado.pagina = Number(pag.dataset.docPag);
      dibujarDocumentos();
      contenedor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  contenedor.addEventListener('change', (e) => {
    if (e.target.id === 'docFiltroMes') docEstado.mes = e.target.value;
    else if (e.target.id === 'docFiltroOrden') docEstado.orden = e.target.value;
    else return;

    docEstado.pagina = 1;
    dibujarDocumentos();
  });
})();

const cargarDocumentos = async () => {
  const contenedor = document.getElementById('contenidoDocumentos');
  contenedor.textContent = 'Cargando...';

  try {
    const respuesta = await fetch(`${API}/api/pacientes/${usuario.id_paciente}/documentos`);
    const datos = await respuesta.json();

    if (!respuesta.ok) {
      contenedor.textContent = datos.mensaje || 'No se pudieron cargar los documentos.';
      return;
    }

    // Se agrupan los documentos por la consulta a la que pertenecen.
    const grupos = new Map();

    const grupoDe = (idConsulta, clave) => {
      if (!grupos.has(idConsulta)) {
        grupos.set(idConsulta, { id: idConsulta, clave: String(clave), doctor: '', diagnostico: '', docs: [] });
      }
      return grupos.get(idConsulta);
    };

    datos.atenciones.forEach(a => {
      const g = grupoDe(a.id_consulta, a.fecha);
      g.clave = String(a.fecha);
      g.doctor = `Dr(a). ${a.doctor_nombres} ${a.doctor_apellidos}`;
      g.diagnostico = a.diagnostico || '';
      g.docs.push({
        tipo: 'atencion', ruta: 'atencion', id: a.id_consulta,
        titulo: 'Resumen de atención', detalle: 'Datos de la consulta y diagnóstico'
      });
    });

    datos.formulas.forEach(f => {
      grupoDe(f.consulta_id, f.fecha).docs.push({
        tipo: 'formula', ruta: 'formula', id: f.id_formula,
        titulo: 'Fórmula médica', detalle: 'Medicamentos formulados'
      });
    });

    datos.ordenes.forEach(o => {
      grupoDe(o.consulta_id, o.fecha).docs.push({
        tipo: 'orden', ruta: 'orden', id: o.id_orden,
        titulo: 'Orden de examen', detalle: o.examenes || ''
      });
    });

    datos.incapacidades.forEach(i => {
      grupoDe(i.consulta_id, i.fecha_inicio).docs.push({
        tipo: 'incapacidad', ruta: 'incapacidad', id: i.id_incapacidad,
        titulo: 'Incapacidad médica',
        detalle: `${i.dias_incapacidad} día(s) · del ${String(i.fecha_inicio).slice(0, 10)} al ${String(i.fecha_fin).slice(0, 10)}`
      });
    });

    docEstado.todos = [...grupos.values()];
    docEstado.tipo = 'todos';
    docEstado.mes = '';
    docEstado.pagina = 1;

    if (docEstado.todos.length === 0) {
      contenedor.innerHTML = '<div class="doc-vacio">Aún no tienes documentos médicos.</div>';
      return;
    }

    dibujarDocumentos();
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