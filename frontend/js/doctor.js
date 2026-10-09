const API = 'https://ips-vida-sana-production.up.railway.app';

const usuario = JSON.parse(localStorage.getItem('usuario') || 'null');

if (!usuario || usuario.rol !== 'doctor') {
    window.location.href = 'index.html';
}

document.getElementById('nombreUsuario').textContent = `Dr(a). ${usuario.nombres} ${usuario.apellidos}`;

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

const formatearEstado = (estado) => {
    const mapa = {
        programada: 'Programada', confirmada: 'Confirmada', en_espera: 'En espera', en_atencion: 'Atendiendo', cancelada: 'Cancelada', no_asistida: 'No asistida'
    };
    return mapa[estado] || estado;
};

const medicamentosPorConsulta = {};
const tiposExamenPorConsulta = {};
const contextoCita = {};

// ---------- Historia clínica (RH, alergias, antecedentes) ----------
const RH_OPCIONES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];

function historiaHtml(prefijo, h, esPrimera) {
    const v = h || {};

    return `
      ${esPrimera ? '<p style="font-size:0.85rem; color:#185fa5; margin-top:0;">Primera consulta: completa la historia clínica del paciente.</p>' : ''}
      <div class="grid-2">
        <div class="campo campo-full">
          <label>Grupo sanguíneo (RH)</label>
          <select id="${prefijo}-rh">${opcionesSelect(RH_OPCIONES, v.grupo_sanguineo, 'Sin dato')}</select>
        </div>
        <div class="campo campo-full">
          <label>Alergias ${esPrimera ? '*' : ''}</label>
          <textarea id="${prefijo}-alergias" rows="2" placeholder="Medicamentos, alimentos u otras. Si no tiene: Ninguna conocida">${esc(v.alergias)}</textarea>
        </div>
        <div class="campo campo-full">
          <label>Antecedentes personales</label>
          <textarea id="${prefijo}-ant-personales" rows="2" placeholder="Enfermedades, cirugías previas...">${esc(v.antecedentes_personales)}</textarea>
        </div>
        <div class="campo campo-full">
          <label>Antecedentes familiares</label>
          <textarea id="${prefijo}-ant-familiares" rows="2" placeholder="Enfermedades en la familia...">${esc(v.antecedentes_familiares)}</textarea>
        </div>
      </div>`;
}

function leerHistoria(prefijo) {
    const valor = (campo) => document.getElementById(`${prefijo}-${campo}`).value.trim();

    return {
        grupo_sanguineo: valor('rh') || null,
        alergias: valor('alergias') || null,
        antecedentes_personales: valor('ant-personales') || null,
        antecedentes_familiares: valor('ant-familiares') || null
    };
}

// ---------- Navegación ----------
document.querySelectorAll('.nav-item').forEach(boton => {
    boton.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('activo'));
        boton.classList.add('activo');

        const idSeccion = boton.dataset.seccion;
        document.querySelectorAll('.seccion').forEach(s => s.classList.add('oculto'));
        document.getElementById(`seccion-${idSeccion}`).classList.remove('oculto');

        if (idSeccion === 'horario') cargarMiHorario();
    });
});

// ---------- Agenda del día ----------
async function cargarAgenda() {
    const contenedor = document.getElementById('listaAgenda');
    const fecha = document.getElementById('inputFechaAgenda').value;
    contenedor.textContent = 'Cargando...';

    try {
        const respuesta = await fetch(`${API}/api/doctor/${usuario.id_doctor}/agenda?fecha=${fecha}`);
        const citas = await respuesta.json();

        if (!respuesta.ok) {
            contenedor.textContent = citas.mensaje;
            return;
        }

        if (citas.length === 0) {
            contenedor.textContent = 'No tienes citas para esta fecha.';
            return;
        }

        contenedor.innerHTML = citas.map(c => `
      <div class="tarjeta" style="max-width:700px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong>${c.hora.slice(0, 5)} · ${c.paciente_nombres} ${c.paciente_apellidos}</strong><br>
            <span style="font-size:0.8rem; color:#5f5e5a;">${c.tipo}</span>
          </div>
          <span class="estado-badge estado-${c.estado}" id="badge-${c.id_cita}">${formatearEstado(c.estado)}</span>
        </div>

        ${c.estado === 'en_espera' ? `
          <div style="margin-top:12px;">
            <button onclick="iniciarAtencion(${c.id_cita})">Iniciar atención</button>
            <button onclick="marcarNoAsistio(${c.id_cita})" style="background:#fff; color:#b91c1c; border:1px solid #d3d1c7; margin-left:6px;">Marcar no asistió</button>
          </div>
        ` : ''}

        ${c.estado === 'en_atencion' ? `
          <div id="atender-${c.id_cita}" style="margin-top:12px;">
            <details open>
              <summary>Datos del paciente</summary>
              <div id="zona-ficha-${c.id_cita}">Cargando datos del paciente...</div>
            </details>

            <details open>
              <summary>Historia clínica</summary>
              <div id="zona-historia-${c.id_cita}"></div>
            </details>

            <details open>
              <summary>Signos vitales y examen físico</summary>
              <div class="grid-2">
                <div class="campo">
                  <label>Peso (kg)</label>
                  <input type="number" step="0.1" id="peso-${c.id_cita}" placeholder="Ej. 70.5">
                </div>
                <div class="campo">
                  <label>Talla (cm)</label>
                  <input type="number" step="0.1" id="talla-${c.id_cita}" placeholder="Ej. 170">
                </div>
                <div class="campo">
                  <label>Presión arterial</label>
                  <input type="text" id="presion-${c.id_cita}" placeholder="Ej. 120/80">
                </div>
                <div class="campo">
                  <label>Temperatura (°C)</label>
                  <input type="number" step="0.1" id="temperatura-${c.id_cita}" placeholder="Ej. 36.5">
                </div>
                <div class="campo">
                  <label>Frecuencia cardíaca (lpm)</label>
                  <input type="number" id="fc-${c.id_cita}" placeholder="Ej. 75">
                </div>
                <div class="campo">
                  <label>Frecuencia respiratoria (rpm)</label>
                  <input type="number" id="fr-${c.id_cita}" placeholder="Ej. 16">
                </div>
                <div class="campo campo-full">
                  <label>Examen físico</label>
                  <textarea id="examen-fisico-${c.id_cita}" rows="2" placeholder="Palpaciones, auscultación, hallazgos..."></textarea>
                </div>
              </div>
            </details>

            <details open>
              <summary>Diagnóstico</summary>
              <label>Diagnóstico</label>
              <textarea id="diagnostico-${c.id_cita}" rows="2" placeholder="Diagnóstico de la consulta"></textarea>
              <label>Observaciones</label>
              <textarea id="observaciones-${c.id_cita}" rows="2" placeholder="Observaciones (opcional)"></textarea>
              <button onclick="atenderConsulta(${c.id_cita})">Guardar atención</button>
              <button onclick="marcarNoAsistio(${c.id_cita})" style="background:#fff; color:#b91c1c; border:1px solid #d3d1c7; margin-top:6px;">Marcar no asistió</button>
            </details>
          </div>
        ` : ''}

        <div id="postAtencion-${c.id_cita}"></div>
      </div>
    `).join('');

        citas
            .filter(c => c.estado === 'en_atencion')
            .forEach(c => cargarDatosDelPaciente(c.id_cita, c.paciente_id));

    } catch (error) {
        contenedor.textContent = 'No se pudo cargar la agenda.';
        console.error(error);
    }
}

async function cargarDatosDelPaciente(id_cita, id_paciente) {
    const zonaFicha = document.getElementById(`zona-ficha-${id_cita}`);
    const zonaHistoria = document.getElementById(`zona-historia-${id_cita}`);

    try {
        const respuesta = await fetch(`${API}/api/pacientes/${id_paciente}/ficha`);
        const datos = await respuesta.json();

        if (!respuesta.ok) {
            zonaFicha.textContent = datos.mensaje;
            return;
        }

        const esPrimera = datos.historia === null;
        contextoCita[id_cita] = { id_paciente, esPrimera };

        zonaFicha.innerHTML = fichaHtml(`doc-${id_cita}`, datos.paciente, false);
        zonaHistoria.innerHTML = historiaHtml(`doc-${id_cita}`, datos.historia, esPrimera);

    } catch (error) {
        zonaFicha.textContent = 'No se pudieron cargar los datos del paciente.';
        console.error(error);
    }
}

async function atenderConsulta(id_cita) {
    const contexto = contextoCita[id_cita];

    if (!contexto) {
        alert('Espera a que carguen los datos del paciente.');
        return;
    }

    const prefijo = `doc-${id_cita}`;
    const valor = (id) => document.getElementById(id).value.trim();

    const diagnostico = valor(`diagnostico-${id_cita}`);
    const observaciones = valor(`observaciones-${id_cita}`);
    const historia = leerHistoria(prefijo);

    if (contexto.esPrimera && !historia.alergias) {
        alert('Indica las alergias del paciente. Si no tiene, escribe "Ninguna conocida".');
        return;
    }

    if (!diagnostico) {
        alert('El diagnóstico es obligatorio.');
        return;
    }

    const datosConsulta = {
        diagnostico,
        observaciones,
        peso: valor(`peso-${id_cita}`) || null,
        talla: valor(`talla-${id_cita}`) || null,
        presion_arterial: valor(`presion-${id_cita}`) || null,
        temperatura: valor(`temperatura-${id_cita}`) || null,
        frecuencia_cardiaca: valor(`fc-${id_cita}`) || null,
        frecuencia_respiratoria: valor(`fr-${id_cita}`) || null,
        examen_fisico: valor(`examen-fisico-${id_cita}`) || null
    };

    try {
        // Los cambios que el doctor haga a los datos del paciente (no la identidad) se guardan primero.
        const ficha = await guardarFicha(contexto.id_paciente, leerFicha(prefijo, false));

        if (!ficha.ok) {
            alert(ficha.mensaje);
            return;
        }

        const respHistoria = await fetch(`${API}/api/pacientes/${contexto.id_paciente}/historia-clinica`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(historia)
        });
        const datosHistoria = await respHistoria.json();

        if (!respHistoria.ok) {
            alert(datosHistoria.mensaje);
            return;
        }

        const respuesta = await fetch(`${API}/api/doctor/citas/${id_cita}/atender`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datosConsulta)
        });

        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            alert(resultado.mensaje);
            return;
        }

        mostrarAccionesPostAtencion(id_cita, resultado.id_consulta);

    } catch (error) {
        alert('No se pudo registrar la atención.');
        console.error(error);
    }
}

async function iniciarAtencion(id_cita) {
    try {
        const respuesta = await fetch(`${API}/api/doctor/citas/${id_cita}/iniciar`, { method: 'PUT' });
        const datos = await respuesta.json();

        if (!respuesta.ok) {
            alert(datos.mensaje);
            return;
        }

        cargarAgenda();
    } catch (error) {
        alert('No se pudo iniciar la atención.');
        console.error(error);
    }
}

async function marcarNoAsistio(id_cita) {
    try {
        const respuesta = await fetch(`${API}/api/doctor/citas/${id_cita}/no-asistio`, { method: 'PUT' });
        const datos = await respuesta.json();

        if (!respuesta.ok) {
            alert(datos.mensaje);
            return;
        }

        cargarAgenda();
    } catch (error) {
        alert('No se pudo marcar como no asistida.');
        console.error(error);
    }
}

async function mostrarAccionesPostAtencion(id_cita, id_consulta) {
    document.getElementById(`atender-${id_cita}`).remove();

        const badge = document.getElementById(`badge-${id_cita}`);
    if (badge) {
        badge.textContent = 'Atendida';
        badge.className = 'estado-badge estado-atendida';
    }

    const [medicamentos, tiposExamen] = await Promise.all([
        fetch(`${API}/api/doctor/medicamentos`).then(r => r.json()),
        fetch(`${API}/api/doctor/tipos-examen`).then(r => r.json())
    ]);

    medicamentosPorConsulta[id_consulta] = medicamentos;
    tiposExamenPorConsulta[id_consulta] = tiposExamen;

    const opcionesMedicamentos = medicamentos.map(m => `<option value="${m.id_medicamento}">${m.nombre}</option>`).join('');
    const opcionesExamenes = tiposExamen.map(t => `<option value="${t.id_tipo_examen}">${t.nombre}</option>`).join('');

    const contenedor = document.getElementById(`postAtencion-${id_cita}`);
    contenedor.innerHTML = `
    <p style="color:#15803d; font-weight:600;">Consulta atendida correctamente.</p>

    <a href="https://ips-vida-sana-production.up.railway.app/api/documentos/atencion/${id_consulta}/pdf" target="_blank">
      <button style="background:#fff; color:#185fa5; border:1px solid #185fa5;">Descargar resumen de esta atención (PDF)</button>
    </a>

    <details open style="margin-top:8px;">
      <summary>Generar fórmula médica</summary>
      <div id="filasMedicamentos-${id_consulta}">
        <div class="fila-medicamento">
          <label>Medicamento</label>
          <select class="sel-medicamento">${opcionesMedicamentos}</select>
          <label>Dosis</label>
          <input type="text" class="inp-dosis" placeholder="Ej. 500mg">
          <label>Frecuencia</label>
          <input type="text" class="inp-frecuencia" placeholder="Ej. cada 8 horas">
          <label>Duración</label>
          <input type="text" class="inp-duracion" placeholder="Ej. 5 días">
        </div>
      </div>
      <button type="button" onclick="agregarFilaMedicamento(${id_consulta})" style="background:#fff; color:#185fa5; border:1px solid #185fa5;">+ Agregar otro medicamento</button>
      <button onclick="generarFormula(${id_consulta})">Generar fórmula (con todos los medicamentos)</button>
      <p id="mensajeFormula-${id_consulta}" class="error"></p>
    </details>

    <details style="margin-top:8px;">
      <summary>Generar orden de examen</summary>
      <div id="filasExamenes-${id_consulta}">
        <div class="fila-examen">
          <label>Tipo de examen</label>
          <select class="sel-examen">${opcionesExamenes}</select>
          <label>Observaciones</label>
          <textarea class="inp-obs-examen" rows="2" placeholder="Observaciones (opcional)"></textarea>
        </div>
      </div>
      <button type="button" onclick="agregarFilaExamen(${id_consulta})" style="background:#fff; color:#185fa5; border:1px solid #185fa5;">+ Agregar otro examen</button>
      <button onclick="generarOrden(${id_consulta})">Generar orden (con todos los exámenes)</button>
      <p id="mensajeOrden-${id_consulta}" class="error"></p>
    </details>

    <details style="margin-top:8px;">
      <summary>Generar incapacidad médica</summary>
      <label>Fecha de inicio</label>
      <input type="date" id="incFechaInicio-${id_consulta}">
      <label>Días de incapacidad</label>
      <input type="number" id="incDias-${id_consulta}" min="1" placeholder="Ej. 3">
      <label>Motivo</label>
      <textarea id="incMotivo-${id_consulta}" rows="2" placeholder="Diagnóstico o motivo de la incapacidad"></textarea>
      <button onclick="generarIncapacidad(${id_consulta})">Generar incapacidad</button>
      <p id="mensajeIncapacidad-${id_consulta}" class="error"></p>
    </details>
  `;
}

function agregarFilaMedicamento(id_consulta) {
    const opcionesMedicamentos = medicamentosPorConsulta[id_consulta]
        .map(m => `<option value="${m.id_medicamento}">${m.nombre}</option>`).join('');

    const contenedor = document.getElementById(`filasMedicamentos-${id_consulta}`);
    const nuevaFila = document.createElement('div');
    nuevaFila.className = 'fila-medicamento';
    nuevaFila.style.borderTop = '1px solid #e5e3da';
    nuevaFila.style.marginTop = '10px';
    nuevaFila.style.paddingTop = '10px';
    nuevaFila.innerHTML = `
    <label>Medicamento</label>
    <select class="sel-medicamento">${opcionesMedicamentos}</select>
    <label>Dosis</label>
    <input type="text" class="inp-dosis" placeholder="Ej. 500mg">
    <label>Frecuencia</label>
    <input type="text" class="inp-frecuencia" placeholder="Ej. cada 8 horas">
    <label>Duración</label>
    <input type="text" class="inp-duracion" placeholder="Ej. 5 días">
  `;

    const btnQuitar = document.createElement('button');
    btnQuitar.type = 'button';
    btnQuitar.textContent = 'Quitar';
    btnQuitar.style.background = '#fff';
    btnQuitar.style.color = '#b91c1c';
    btnQuitar.style.border = '1px solid #d3d1c7';
    btnQuitar.addEventListener('click', () => nuevaFila.remove());

    nuevaFila.appendChild(btnQuitar);
    contenedor.appendChild(nuevaFila);
}

function agregarFilaExamen(id_consulta) {
    const opcionesExamenes = tiposExamenPorConsulta[id_consulta]
        .map(t => `<option value="${t.id_tipo_examen}">${t.nombre}</option>`).join('');

    const contenedor = document.getElementById(`filasExamenes-${id_consulta}`);
    const nuevaFila = document.createElement('div');
    nuevaFila.className = 'fila-examen';
    nuevaFila.style.borderTop = '1px solid #e5e3da';
    nuevaFila.style.marginTop = '10px';
    nuevaFila.style.paddingTop = '10px';
    nuevaFila.innerHTML = `
    <label>Tipo de examen</label>
    <select class="sel-examen">${opcionesExamenes}</select>
    <label>Observaciones</label>
    <textarea class="inp-obs-examen" rows="2" placeholder="Observaciones (opcional)"></textarea>
  `;

    const btnQuitar = document.createElement('button');
    btnQuitar.type = 'button';
    btnQuitar.textContent = 'Quitar';
    btnQuitar.style.background = '#fff';
    btnQuitar.style.color = '#b91c1c';
    btnQuitar.style.border = '1px solid #d3d1c7';
    btnQuitar.addEventListener('click', () => nuevaFila.remove());

    nuevaFila.appendChild(btnQuitar);
    contenedor.appendChild(nuevaFila);
}

async function generarFormula(id_consulta) {
    const mensaje = document.getElementById(`mensajeFormula-${id_consulta}`);
    const filas = document.querySelectorAll(`#filasMedicamentos-${id_consulta} .fila-medicamento`);

    const medicamentos = Array.from(filas).map(fila => ({
        medicamento_id: fila.querySelector('.sel-medicamento').value,
        dosis: fila.querySelector('.inp-dosis').value,
        frecuencia: fila.querySelector('.inp-frecuencia').value,
        duracion: fila.querySelector('.inp-duracion').value
    }));

    if (medicamentos.some(m => !m.dosis)) {
        mensaje.textContent = 'Todos los medicamentos necesitan su dosis.';
        return;
    }

    try {
        const respuesta = await fetch(`${API}/api/doctor/consultas/${id_consulta}/formula`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ medicamentos })
        });

        const datos = await respuesta.json();

        if (!respuesta.ok) {
            mensaje.textContent = datos.mensaje;
            return;
        }

        mensaje.style.color = '#15803d';
        mensaje.textContent = `Fórmula generada correctamente con ${medicamentos.length} medicamento(s).`;
    } catch (error) {
        mensaje.textContent = 'No se pudo generar la fórmula.';
        console.error(error);
    }
}

async function generarOrden(id_consulta) {
    const mensaje = document.getElementById(`mensajeOrden-${id_consulta}`);
    const filas = document.querySelectorAll(`#filasExamenes-${id_consulta} .fila-examen`);

    const examenes = Array.from(filas).map(fila => ({
        tipo_examen_id: fila.querySelector('.sel-examen').value,
        observaciones: fila.querySelector('.inp-obs-examen').value
    }));

    try {
        const respuesta = await fetch(`${API}/api/doctor/consultas/${id_consulta}/orden-examen`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ examenes })
        });

        const datos = await respuesta.json();

        if (!respuesta.ok) {
            mensaje.textContent = datos.mensaje;
            return;
        }

        mensaje.style.color = '#15803d';
        mensaje.textContent = `Orden generada correctamente con ${examenes.length} examen(es).`;
    } catch (error) {
        mensaje.textContent = 'No se pudo generar la orden.';
        console.error(error);
    }
}

async function generarIncapacidad(id_consulta) {
    const mensaje = document.getElementById(`mensajeIncapacidad-${id_consulta}`);
    const fecha_inicio = document.getElementById(`incFechaInicio-${id_consulta}`).value;
    const dias_incapacidad = document.getElementById(`incDias-${id_consulta}`).value;
    const motivo = document.getElementById(`incMotivo-${id_consulta}`).value.trim();

    mensaje.textContent = '';

    if (!fecha_inicio || !dias_incapacidad || !motivo) {
        mensaje.textContent = 'Completa la fecha de inicio, los días y el motivo.';
        return;
    }

    try {
        const respuesta = await fetch(`${API}/api/doctor/consultas/${id_consulta}/incapacidad`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fecha_inicio, dias_incapacidad, motivo })
        });

        const datos = await respuesta.json();

        if (!respuesta.ok) {
            mensaje.textContent = datos.mensaje;
            return;
        }

        mensaje.style.color = '#15803d';
        mensaje.textContent = `Incapacidad generada: del ${fecha_inicio} al ${datos.fecha_fin} (${dias_incapacidad} día(s)).`;
    } catch (error) {
        mensaje.textContent = 'No se pudo generar la incapacidad.';
        console.error(error);
    }
}

// ---------- Mi Horario ----------
const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
const NOMBRES_DIA_BONITO = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ORDEN_DIAS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];

function nombreBonito(dia) {
    if (dia === 'Miercoles') return 'Miércoles';
    if (dia === 'Sabado') return 'Sábado';
    return dia;
}

function formatearFechaLarga(fecha) {
    return `${NOMBRES_DIA_BONITO[fecha.getDay()]} ${fecha.getDate()} de ${NOMBRES_MES[fecha.getMonth()]} de ${fecha.getFullYear()}`;
}

function textoAFecha(texto) {
    const [anio, mes, dia] = texto.split('-').map(Number);
    return new Date(anio, mes - 1, dia);
}

function fechaATexto(fecha) {
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');
    return `${fecha.getFullYear()}-${mes}-${dia}`;
}

function recortarHora(hora) {
    return hora.slice(0, 5);
}

let horarioDoctor = { horarios: [], bloqueos: [] };
let mesVisible = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let diaSeleccionado = fechaATexto(new Date());

function renderSemana() {
    const contenedor = document.getElementById('semanaHorario');

    if (horarioDoctor.horarios.length === 0) {
        contenedor.innerHTML = '<p>Aún no tienes un horario regular asignado. Contacta al administrador.</p>';
        return;
    }

    contenedor.innerHTML = ORDEN_DIAS.map(dia => {
        const franjas = horarioDoctor.horarios.filter(h => h.dia_semana === dia);
        return `
          <div class="dia-semana ${franjas.length ? 'activo' : ''}">
            <strong>${nombreBonito(dia)}</strong>
            ${franjas.length
                ? franjas.map(h => `<span>${recortarHora(h.hora_inicio)} a ${recortarHora(h.hora_fin)}</span>`).join('')
                : '<span class="sin-atencion">Sin atención</span>'}
          </div>`;
    }).join('');
}

function renderCalendario() {
    const anio = mesVisible.getFullYear();
    const mes = mesVisible.getMonth();
    const nombreMes = NOMBRES_MES[mes];

    document.getElementById('tituloMes').textContent =
        `${nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)} de ${anio}`;

    const desfase = (new Date(anio, mes, 1).getDay() + 6) % 7;
    const diasEnMes = new Date(anio, mes + 1, 0).getDate();
    const hoyTexto = fechaATexto(new Date());

    let celdas = '';
    for (let i = 0; i < desfase; i++) {
        celdas += '<div class="cal-dia vacio"></div>';
    }

    for (let d = 1; d <= diasEnMes; d++) {
        const fecha = new Date(anio, mes, d);
        const texto = fechaATexto(fecha);
        const nombreDia = NOMBRES_DIA[fecha.getDay()];

        const atiende = horarioDoctor.horarios.some(h => h.dia_semana === nombreDia);
        const bloqueado = horarioDoctor.bloqueos.some(b => b.fecha === texto);

        const clases = ['cal-dia'];
        if (atiende) clases.push('laboral');
        if (bloqueado) clases.push('bloqueado');
        if (texto === hoyTexto) clases.push('hoy');
        if (texto === diaSeleccionado) clases.push('seleccionado');

        celdas += `<div class="${clases.join(' ')}" data-fecha="${texto}">${d}</div>`;
    }

    document.getElementById('calendarioDias').innerHTML = celdas;
}

async function mostrarDetalleDia(texto) {
    const contenedor = document.getElementById('detalleDia');
    const fecha = textoAFecha(texto);
    const nombreDia = NOMBRES_DIA[fecha.getDay()];
    const esPasado = texto < fechaATexto(new Date());

    const franjas = horarioDoctor.horarios.filter(h => h.dia_semana === nombreDia);
    const bloqueos = horarioDoctor.bloqueos.filter(b => b.fecha === texto);

    let html = `<h3 style="margin-top:0;">${formatearFechaLarga(fecha)}</h3>`;

    html += franjas.length
        ? `<p><strong>Horario:</strong> ${franjas.map(h => `${recortarHora(h.hora_inicio)} a ${recortarHora(h.hora_fin)}`).join(' y ')}</p>`
        : '<p><strong>Horario:</strong> no atiendes este día de la semana.</p>';

    bloqueos.forEach(b => {
        html += `<p style="color:#b91c1c;"><strong>Bloqueo:</strong> ${recortarHora(b.hora_inicio)} a ${recortarHora(b.hora_fin)} — ${b.motivo}</p>`;
    });

    if (esPasado && franjas.length) {
        html += `<p style="font-size:0.8rem; color:#5f5e5a;">Se muestra tu horario actual. El sistema no guarda el historial de cambios de horario, así que si era distinto en esa fecha no aparecerá aquí. Las citas de abajo sí son las de ese día.</p>`;
    }

    html += '<div id="citasDelDia">Cargando citas...</div>';
    html += `<button type="button" onclick="irAAgenda('${texto}')" style="margin-top:12px;">Abrir este día en la agenda</button>`;

    contenedor.innerHTML = html;

    const zonaCitas = document.getElementById('citasDelDia');

    try {
        const respuesta = await fetch(`${API}/api/doctor/${usuario.id_doctor}/agenda?fecha=${texto}`);
        const citas = await respuesta.json();

        if (!respuesta.ok) {
            zonaCitas.textContent = citas.mensaje;
            return;
        }

        zonaCitas.innerHTML = citas.length
            ? `<p><strong>${esPasado ? 'Citas de ese día' : 'Citas'}:</strong></p>` +
            citas.map(c => `
                <div class="fila-cita">
                  <div>${recortarHora(c.hora)} · ${c.paciente_nombres} ${c.paciente_apellidos}</div>
                  <span class="estado-badge">${formatearEstado(c.estado)}</span>
                </div>`).join('')
            : `<p>${esPasado ? 'No hubo citas ese día.' : 'No hay citas agendadas ese día.'}</p>`;

    } catch (error) {
        zonaCitas.textContent = 'No se pudieron cargar las citas.';
        console.error(error);
    }
}

function seleccionarDia(texto) {
    diaSeleccionado = texto;
    renderCalendario();
    mostrarDetalleDia(texto);
}

function irAAgenda(texto) {
    document.getElementById('inputFechaAgenda').value = texto;
    document.querySelector('.nav-item[data-seccion="agenda"]').click();
    cargarAgenda();
}

document.getElementById('calendarioDias').addEventListener('click', (e) => {
    const celda = e.target.closest('.cal-dia');
    if (!celda || !celda.dataset.fecha) return;
    seleccionarDia(celda.dataset.fecha);
});

document.getElementById('btnMesAnterior').addEventListener('click', () => {
    mesVisible = new Date(mesVisible.getFullYear(), mesVisible.getMonth() - 1, 1);
    renderCalendario();
});

document.getElementById('btnMesSiguiente').addEventListener('click', () => {
    mesVisible = new Date(mesVisible.getFullYear(), mesVisible.getMonth() + 1, 1);
    renderCalendario();
});

document.getElementById('btnHoy').addEventListener('click', () => {
    const hoy = new Date();
    mesVisible = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    seleccionarDia(fechaATexto(hoy));
});

async function cargarMiHorario() {
    const semana = document.getElementById('semanaHorario');
    semana.textContent = 'Cargando...';

    try {
        const respuesta = await fetch(`${API}/api/admin/doctores/${usuario.id_doctor}/horarios?todos=1`);
        const datos = await respuesta.json();

        if (!respuesta.ok) {
            semana.textContent = datos.mensaje;
            return;
        }

        horarioDoctor = datos;
        renderSemana();
        renderCalendario();
        mostrarDetalleDia(diaSeleccionado);

    } catch (error) {
        semana.textContent = 'No se pudo cargar tu horario.';
        console.error(error);
    }
}

// ---------- Inicialización ----------
const inputFecha = document.getElementById('inputFechaAgenda');
inputFecha.value = fechaATexto(new Date());
inputFecha.addEventListener('change', cargarAgenda);

cargarAgenda();

Notificaciones.montar({
    contenedor: document.getElementById('zonaCampana'),
    usuarioId: usuario.id_usuario
});