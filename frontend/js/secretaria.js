const API = 'https://ips-vida-sana-production.up.railway.app';

const usuario = JSON.parse(localStorage.getItem('usuario') || 'null');

if (!usuario || usuario.rol !== 'secretaria') {
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

const formatearEstado = (estado) => {
    const mapa = {
        en_espera: 'En espera', en_atencion: 'Atendiendo',
        atendida: 'Atendida', cancelada: 'Cancelada', no_asistida: 'No asistida'
    };
    return mapa[estado] || estado;
};

function fechaLocalHoy() {
    const h = new Date();
    return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
}

// ---------- Turnos del día ----------
async function cargarTurnos() {
    const contenedor = document.getElementById('listaTurnos');
    const fecha = document.getElementById('inputFechaTurnos').value;
    contenedor.textContent = 'Cargando...';

    try {
        const respuesta = await fetch(`${API}/api/secretaria/citas-del-dia?fecha=${fecha}`);
        const turnos = await respuesta.json();

        if (!respuesta.ok) {
            contenedor.textContent = turnos.mensaje;
            return;
        }

        if (turnos.length === 0) {
            contenedor.textContent = 'No hay turnos para esta fecha.';
            return;
        }

        contenedor.innerHTML = turnos.map(t => `
          <div class="tarjeta" style="max-width:680px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <strong>${t.hora.slice(0, 5)} · ${t.paciente_nombres} ${t.paciente_apellidos}</strong><br>
                <span style="font-size:0.8rem; color:#5f5e5a;">${t.tipo} — Dr(a). ${t.doctor_nombres} ${t.doctor_apellidos}</span>
              </div>
              <div>
                <span class="estado-badge">${formatearEstado(t.estado)}</span>
                ${['programada', 'confirmada'].includes(t.estado)
                    ? `<button class="btn-confirmar" style="width:auto; margin-top:6px;" data-cita="${t.id_cita}" data-paciente="${t.paciente_id}">Confirmar llegada</button>`
                    : ''}
              </div>
            </div>
            <div id="ficha-${t.id_cita}"></div>
          </div>
        `).join('');

        document.querySelectorAll('.btn-confirmar').forEach(boton => {
            boton.addEventListener('click', () => abrirFicha(boton.dataset.cita, boton.dataset.paciente));
        });

    } catch (error) {
        contenedor.textContent = 'No se pudieron cargar los turnos.';
        console.error(error);
    }
}

async function abrirFicha(id_cita, id_paciente) {
    const zona = document.getElementById(`ficha-${id_cita}`);

    if (zona.innerHTML.trim()) {
        zona.innerHTML = '';
        return;
    }

    zona.textContent = 'Cargando datos del paciente...';

    try {
        const respuesta = await fetch(`${API}/api/pacientes/${id_paciente}/ficha`);
        const datos = await respuesta.json();

        if (!respuesta.ok) {
            zona.textContent = datos.mensaje;
            return;
        }

        zona.innerHTML = `
          <div style="border-top:1px solid #e5e3da; margin-top:12px; padding-top:12px;">
            <p style="font-size:0.85rem; color:#5f5e5a; margin-top:0;">
              Verifica y completa los datos del paciente antes de confirmar su llegada. Los campos con * son obligatorios.
            </p>
            ${fichaHtml(`sec-${id_cita}`, datos.paciente, true)}
            <button onclick="guardarYConfirmar(${id_cita}, ${id_paciente})">Guardar datos y confirmar llegada</button>
            <button type="button" onclick="document.getElementById('ficha-${id_cita}').innerHTML = ''" style="background:#fff; color:#5f5e5a; border:1px solid #d3d1c7;">Cancelar</button>
            <p id="ficha-mensaje-${id_cita}" class="error"></p>
          </div>
        `;

    } catch (error) {
        zona.textContent = 'No se pudieron cargar los datos del paciente.';
        console.error(error);
    }
}

async function guardarYConfirmar(id_cita, id_paciente) {
    const mensaje = document.getElementById(`ficha-mensaje-${id_cita}`);
    mensaje.textContent = '';

    const datos = leerFicha(`sec-${id_cita}`, true);
    const errorValidacion = validarFicha(datos);

    if (errorValidacion) {
        mensaje.textContent = errorValidacion;
        return;
    }

    try {
        const guardado = await guardarFicha(id_paciente, datos);

        if (!guardado.ok) {
            mensaje.textContent = guardado.mensaje;
            return;
        }

        const respuesta = await fetch(`${API}/api/secretaria/citas/${id_cita}/confirmar-llegada`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secretaria_id: usuario.id_secretaria })
        });

        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            mensaje.textContent = resultado.mensaje;
            return;
        }

        cargarTurnos();

    } catch (error) {
        mensaje.textContent = 'No se pudo conectar con el servidor.';
        console.error(error);
    }
}

// ---------- Agendar cita para un paciente (buscar o registrar) ----------
let pacienteParaAgendar = null;

const zonaAgendador = document.getElementById('agendadorSecretaria');
const zonaCitasPaciente = document.getElementById('citasDelPaciente');
const bloqueRegistro = document.getElementById('bloqueRegistro');
const mensajeBusquedaAgendar = document.getElementById('mensajeAgendarBusqueda');

const citasDelPaciente = Agendador.listarCitas({
    contenedor: document.getElementById('listaCitasPaciente'),
    pacienteId: () => (pacienteParaAgendar ? pacienteParaAgendar.id_paciente : null),
    secretariaId: usuario.id_secretaria,
    alCambiar: () => cargarTurnos()
});

const agendadorSecretaria = Agendador.montar({
    contenedor: zonaAgendador,
    pacienteId: () => (pacienteParaAgendar ? pacienteParaAgendar.id_paciente : null),
    secretariaId: usuario.id_secretaria,
    alTerminar: () => {
        cargarTurnos();
        citasDelPaciente.recargar();
    }
});

const CAMPOS_REGISTRO = [
    'rn-documento', 'rn-nombres', 'rn-apellidos', 'rn-fecha', 'rn-genero', 'rn-estado-civil',
    'rn-telefono', 'rn-ciudad', 'rn-correo', 'rn-direccion',
    'rn-contacto-nombre', 'rn-contacto-telefono', 'rn-eps'
];

function limpiarRegistro() {
    CAMPOS_REGISTRO.forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('rn-tipo-doc').value = 'CC';
    document.getElementById('mensajeRegistro').textContent = '';
}

function reiniciarAgendar() {
    pacienteParaAgendar = null;
    document.getElementById('pacienteParaAgendar').innerHTML = '';
    zonaAgendador.classList.add('oculto');
    zonaCitasPaciente.classList.add('oculto');
    agendadorSecretaria.limpiar();
}

async function buscarPacientePorDocumento(documento) {
    const respuesta = await fetch(`${API}/api/pacientes/buscar?documento=${encodeURIComponent(documento)}`);
    const datos = await respuesta.json();
    return { ok: respuesta.ok, datos };
}

function mostrarPacienteParaAgendar(paciente) {
    pacienteParaAgendar = paciente;

    document.getElementById('pacienteParaAgendar').innerHTML = `
      <div class="tarjeta" style="max-width:520px;">
        <strong>${paciente.nombres} ${paciente.apellidos}</strong><br>
        <span style="font-size:0.8rem; color:#5f5e5a;">Documento ${paciente.numero_documento}</span>
      </div>
    `;

    zonaAgendador.classList.remove('oculto');
    zonaCitasPaciente.classList.remove('oculto');
    citasDelPaciente.recargar();
}

document.getElementById('btnBuscarParaAgendar').addEventListener('click', async () => {
    const documento = document.getElementById('inputDocumentoAgendar').value.trim();

    mensajeBusquedaAgendar.textContent = '';
    mensajeBusquedaAgendar.style.color = '';
    bloqueRegistro.classList.add('oculto');
    reiniciarAgendar();

    if (!documento) {
        mensajeBusquedaAgendar.textContent = 'Ingresa un número de documento.';
        return;
    }

    try {
        const { ok, datos } = await buscarPacientePorDocumento(documento);

        if (!ok) {
            mensajeBusquedaAgendar.textContent =
                `${datos.mensaje} Si es la primera vez que viene, pulsa "Registrar paciente nuevo".`;
            return;
        }

        mostrarPacienteParaAgendar(datos);

    } catch (error) {
        mensajeBusquedaAgendar.textContent = 'No se pudo conectar con el servidor.';
        console.error(error);
    }
});

document.getElementById('btnNuevoPaciente').addEventListener('click', () => {
    const documento = document.getElementById('inputDocumentoAgendar').value.trim();

    reiniciarAgendar();
    limpiarRegistro();
    mensajeBusquedaAgendar.textContent = '';
    document.getElementById('rn-documento').value = documento;
    bloqueRegistro.classList.remove('oculto');
    bloqueRegistro.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

document.getElementById('btnCancelarRegistro').addEventListener('click', () => {
    bloqueRegistro.classList.add('oculto');
    limpiarRegistro();
});

document.getElementById('btnRegistrarPaciente').addEventListener('click', async () => {
    const mensaje = document.getElementById('mensajeRegistro');
    mensaje.textContent = '';
    mensaje.style.color = '';

    const valor = (id) => document.getElementById(id).value.trim();

    const datos = {
        tipo_documento: valor('rn-tipo-doc'),
        numero_documento: valor('rn-documento'),
        nombres: valor('rn-nombres'),
        apellidos: valor('rn-apellidos'),
        fecha_nacimiento: valor('rn-fecha'),
        genero: valor('rn-genero'),
        estado_civil: valor('rn-estado-civil') || null,
        telefono: valor('rn-telefono'),
        ciudad: valor('rn-ciudad'),
        direccion: valor('rn-direccion'),
        correo: valor('rn-correo'),
        contacto_emergencia_nombre: valor('rn-contacto-nombre'),
        contacto_emergencia_telefono: valor('rn-contacto-telefono'),
        eps: valor('rn-eps') || null
    };

    if (!/^[A-Za-z0-9]{4,20}$/.test(datos.numero_documento)) {
        mensaje.textContent = 'El número de documento debe tener entre 4 y 20 letras o números, sin espacios ni puntos.';
        return;
    }

    const errorValidacion = validarFicha(datos);

    if (errorValidacion) {
        mensaje.textContent = errorValidacion;
        return;
    }

    if (datos.fecha_nacimiento > fechaLocalHoy()) {
        mensaje.textContent = 'La fecha de nacimiento no puede ser futura.';
        return;
    }

    const boton = document.getElementById('btnRegistrarPaciente');
    boton.disabled = true;

    try {
        const respuesta = await fetch(`${API}/api/pacientes/registro`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });

        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            mensaje.textContent = resultado.mensaje;
            return;
        }

        const { ok, datos: paciente } = await buscarPacientePorDocumento(datos.numero_documento);

        if (!ok) {
            mensaje.textContent = 'El paciente se registró, pero no se pudo cargar. Búscalo por su documento.';
            return;
        }

        bloqueRegistro.classList.add('oculto');
        limpiarRegistro();
        document.getElementById('inputDocumentoAgendar').value = paciente.numero_documento;

        mensajeBusquedaAgendar.style.color = '#15803d';
        mensajeBusquedaAgendar.textContent =
            'Paciente registrado. Para entrar a la plataforma usará su número de documento como contraseña inicial y ' +
            'creará una nueva la primera vez. Ya puedes agendarle su cita.';

        mostrarPacienteParaAgendar(paciente);

    } catch (error) {
        mensaje.textContent = 'No se pudo conectar con el servidor.';
        console.error(error);
    } finally {
        boton.disabled = false;
    }
});

// ---------- Buscar paciente: resumen de historia clínica + documentos ----------
async function verHistoria(id_paciente) {
    const contenedor = document.getElementById('detallePaciente');
    contenedor.textContent = 'Cargando...';

    try {
        const respuesta = await fetch(`${API}/api/pacientes/${id_paciente}/historia-clinica/resumen`);
        const datos = await respuesta.json();

        if (!respuesta.ok) {
            contenedor.textContent = datos.mensaje;
            return;
        }

        contenedor.innerHTML = `
          <div class="tarjeta">
            <p><strong>Grupo sanguíneo:</strong> ${datos.grupo_sanguineo || 'No registrado'}</p>
            <p><strong>Alergias:</strong> ${datos.alergias || 'No registradas'}</p>
            <p><strong>Antecedentes:</strong> ${datos.antecedentes_personales || 'No registrados'}</p>
          </div>
          <button type="button" id="btnVerHistoriaCompleta" style="background:#fff; color:#185fa5; border:1px solid #185fa5;">Ver historia clínica completa</button>
          <div id="historiaCompleta"></div>
        `;

        document.getElementById('btnVerHistoriaCompleta').addEventListener('click', () => verHistoriaCompleta(id_paciente));

    } catch (error) {
        contenedor.textContent = 'No se pudo cargar la historia clínica.';
        console.error(error);
    }
}

async function verHistoriaCompleta(id_paciente) {
    const contenedor = document.getElementById('historiaCompleta');

    if (contenedor.innerHTML.trim()) {
        contenedor.innerHTML = '';
        return;
    }

    contenedor.textContent = 'Cargando historial completo...';

    try {
        const respuesta = await fetch(`${API}/api/pacientes/${id_paciente}/historia-clinica`);
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
            <strong>Diagnóstico:</strong> ${c.diagnostico}
          </div>
        `).join('')
            : '<p>Sin consultas registradas.</p>';

        contenedor.innerHTML = `
          <h3>Historial de consultas</h3>
          <a href="https://ips-vida-sana-production.up.railway.app/api/documentos/historia-clinica/${id_paciente}/pdf" target="_blank">
            <button style="width:100%;">Descargar historia clínica completa (PDF)</button>
          </a>
          ${consultasHtml}
        `;
    } catch (error) {
        contenedor.textContent = 'No se pudo cargar el historial completo.';
        console.error(error);
    }
}

async function verDocumentos(id_paciente) {
    const contenedor = document.getElementById('detallePaciente');
    contenedor.textContent = 'Cargando...';

    try {
        const respuesta = await fetch(`${API}/api/pacientes/${id_paciente}/documentos`);
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
            : '<p>No tiene resúmenes de atención.</p>';

        const formulasHtml = datos.formulas.length
            ? datos.formulas.map(f => `
          <div class="fila-cita">
            <div>Fórmula médica — ${f.fecha}</div>
            <a href="https://ips-vida-sana-production.up.railway.app/api/documentos/formula/${f.id_formula}/pdf" target="_blank">
              <button>Descargar PDF</button>
            </a>
          </div>
        `).join('')
            : '<p>No tiene fórmulas médicas.</p>';

        const ordenesHtml = datos.ordenes.length
            ? datos.ordenes.map(o => `
          <div class="fila-cita">
            <div>${o.examenes} — ${o.fecha}</div>
            <a href="https://ips-vida-sana-production.up.railway.app/api/documentos/orden/${o.id_orden}/pdf" target="_blank">
              <button>Descargar PDF</button>
            </a>
          </div>
        `).join('')
            : '<p>No tiene órdenes de examen.</p>';

        contenedor.innerHTML = `
          <h3>Resúmenes de atención</h3>
          ${atencionesHtml}
          <h3>Fórmulas</h3>
          ${formulasHtml}
          <h3>Órdenes de examen</h3>
          ${ordenesHtml}
        `;
    } catch (error) {
        contenedor.textContent = 'No se pudieron cargar los documentos.';
        console.error(error);
    }
}

document.getElementById('btnBuscarPaciente').addEventListener('click', async () => {
    const mensaje = document.getElementById('mensajeBusqueda');
    const resultado = document.getElementById('resultadoPaciente');
    const documento = document.getElementById('inputBuscarDocumento').value;
    mensaje.textContent = '';
    resultado.innerHTML = '';

    if (!documento) {
        mensaje.textContent = 'Ingresa un número de documento.';
        return;
    }

    try {
        const respuesta = await fetch(`${API}/api/pacientes/buscar?documento=${encodeURIComponent(documento)}`);
        const paciente = await respuesta.json();

        if (!respuesta.ok) {
            mensaje.textContent = paciente.mensaje;
            return;
        }

        resultado.innerHTML = `
      <div class="tarjeta">
        <h3>${paciente.nombres} ${paciente.apellidos}</h3>
        <p>Documento: ${paciente.numero_documento}</p>
        <p>Teléfono: ${paciente.telefono || 'No registrado'}</p>
        <button id="btnVerHistoria">Ver historia clínica</button>
        <button id="btnVerDocumentos" style="margin-top:8px;">Ver documentos</button>
      </div>
      <div id="detallePaciente"></div>
    `;

        document.getElementById('btnVerHistoria').addEventListener('click', () => verHistoria(paciente.id_paciente));
        document.getElementById('btnVerDocumentos').addEventListener('click', () => verDocumentos(paciente.id_paciente));

    } catch (error) {
        mensaje.textContent = 'No se pudo conectar con el servidor.';
        console.error(error);
    }
});

// ---------- Facturación ----------
let serviciosFacturacion = [];

async function cargarServiciosFacturacion() {
    try {
        const respuesta = await fetch(`${API}/api/facturas/servicios`);
        serviciosFacturacion = await respuesta.json();
    } catch (error) {
        console.error(error);
    }
}

function formatearMoneda(valor) {
    return `$${Number(valor).toLocaleString('es-CO')}`;
}

async function cargarConsultasPorFacturar() {
    const contenedor = document.getElementById('listaConsultasFacturar');
    const fecha = document.getElementById('inputFechaFacturacion').value;
    contenedor.textContent = 'Cargando...';

    try {
        const respuesta = await fetch(`${API}/api/facturas/consultas-pendientes?fecha=${fecha}`);
        const consultas = await respuesta.json();

        if (!respuesta.ok) {
            contenedor.textContent = consultas.mensaje;
            return;
        }

        contenedor.innerHTML = consultas.length
            ? consultas.map(c => `
                <div class="tarjeta" style="max-width:680px;">
                  <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                      <strong>${c.hora.slice(0, 5)} · ${c.paciente_nombres} ${c.paciente_apellidos}</strong><br>
                      <span style="font-size:0.8rem; color:#5f5e5a;">Dr(a). ${c.doctor_nombres} ${c.doctor_apellidos}</span>
                    </div>
                    <button class="btn-generar-factura" data-consulta="${c.id_consulta}" style="width:auto;">Generar factura</button>
                  </div>
                  <div id="factura-form-${c.id_consulta}"></div>
                </div>
              `).join('')
            : '<p>No hay consultas atendidas sin facturar en esta fecha.</p>';

        document.querySelectorAll('.btn-generar-factura').forEach(boton => {
            boton.addEventListener('click', () => abrirFormularioFactura(boton.dataset.consulta));
        });

    } catch (error) {
        contenedor.textContent = 'No se pudieron cargar las consultas.';
        console.error(error);
    }
}

async function abrirFormularioFactura(id_consulta) {
    const zona = document.getElementById(`factura-form-${id_consulta}`);

    if (zona.innerHTML.trim()) {
        zona.innerHTML = '';
        return;
    }

    if (serviciosFacturacion.length === 0) {
        await cargarServiciosFacturacion();
    }

    const opcionesServicios = serviciosFacturacion.map(s =>
        `<option value="${s.id_servicio}" data-precio="${s.precio}">${s.nombre} — ${formatearMoneda(s.precio)}</option>`
    ).join('');

    zona.innerHTML = `
      <div style="border-top:1px solid #e5e3da; margin-top:12px; padding-top:12px;">
        <label>Servicio</label>
        <select id="fact-servicio-${id_consulta}">
          <option value="">Selecciona...</option>
          ${opcionesServicios}
        </select>

        <label>Valor</label>
        <input type="number" id="fact-valor-${id_consulta}" placeholder="Se llena al elegir el servicio">

        <label>Estado</label>
        <select id="fact-estado-${id_consulta}">
          <option value="pendiente">Pendiente de pago</option>
          <option value="pagada">Pagada en este momento</option>
        </select>

        <div id="fact-pago-${id_consulta}" class="oculto">
          <label>Forma de pago</label>
          <select id="fact-forma-pago-${id_consulta}">
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="transferencia">Transferencia</option>
          </select>
        </div>

        <button onclick="generarFactura(${id_consulta})">Generar factura</button>
        <button type="button" onclick="document.getElementById('factura-form-${id_consulta}').innerHTML = ''" style="background:#fff; color:#5f5e5a; border:1px solid #d3d1c7;">Cancelar</button>
        <p id="fact-mensaje-${id_consulta}" class="error"></p>
      </div>
    `;

    const selectServicio = document.getElementById(`fact-servicio-${id_consulta}`);
    selectServicio.addEventListener('change', () => {
        const opcion = selectServicio.selectedOptions[0];
        document.getElementById(`fact-valor-${id_consulta}`).value = opcion?.dataset.precio || '';
    });

    document.getElementById(`fact-estado-${id_consulta}`).addEventListener('change', (e) => {
        document.getElementById(`fact-pago-${id_consulta}`).classList.toggle('oculto', e.target.value !== 'pagada');
    });
}

async function generarFactura(id_consulta) {
    const mensaje = document.getElementById(`fact-mensaje-${id_consulta}`);
    mensaje.textContent = '';

    const servicio_id = document.getElementById(`fact-servicio-${id_consulta}`).value;
    const valor = document.getElementById(`fact-valor-${id_consulta}`).value;
    const estado = document.getElementById(`fact-estado-${id_consulta}`).value;
    const forma_pago = estado === 'pagada'
        ? document.getElementById(`fact-forma-pago-${id_consulta}`).value
        : null;

    if (!servicio_id || valor === '') {
        mensaje.textContent = 'Elige un servicio y verifica el valor.';
        return;
    }

    try {
        const respuesta = await fetch(`${API}/api/facturas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                consulta_id: id_consulta,
                secretaria_id: usuario.id_secretaria,
                servicio_id, valor, forma_pago, estado
            })
        });

        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            mensaje.textContent = resultado.mensaje;
            return;
        }

        cargarConsultasPorFacturar();
        cargarFacturasDelDia();

    } catch (error) {
        mensaje.textContent = 'No se pudo conectar con el servidor.';
        console.error(error);
    }
}

async function cargarFacturasDelDia() {
    const contenedor = document.getElementById('listaFacturasDia');
    const fecha = document.getElementById('inputFechaFacturacion').value;
    contenedor.textContent = 'Cargando...';

    try {
        const respuesta = await fetch(`${API}/api/facturas/dia?fecha=${fecha}`);
        const facturas = await respuesta.json();

        if (!respuesta.ok) {
            contenedor.textContent = facturas.mensaje;
            return;
        }

        contenedor.innerHTML = facturas.length
            ? facturas.map(f => `
                <div class="fila-cita">
                  <div>
                    <strong>${f.numero_factura}</strong> — ${f.paciente_nombres} ${f.paciente_apellidos}<br>
                    <span style="font-size:0.8rem; color:#5f5e5a;">${f.servicio_nombre} · ${formatearMoneda(f.valor)}</span>
                  </div>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span class="estado-badge">${f.estado === 'pagada' ? 'Pagada' : 'Pendiente'}</span>
                    ${f.estado === 'pendiente'
                        ? `<button class="btn-marcar-pagada" data-id="${f.id_factura}" style="width:auto;">Marcar pagada</button>`
                        : ''}
                    <a href="https://ips-vida-sana-production.up.railway.app/api/documentos/factura/${f.id_factura}/pdf" target="_blank">
                      <button style="width:auto;">PDF</button>
                    </a>
                  </div>
                </div>
              `).join('')
            : '<p>No hay facturas generadas en esta fecha.</p>';

        document.querySelectorAll('.btn-marcar-pagada').forEach(boton => {
            boton.addEventListener('click', () => marcarPagada(boton.dataset.id));
        });

    } catch (error) {
        contenedor.textContent = 'No se pudieron cargar las facturas.';
        console.error(error);
    }
}

async function marcarPagada(id_factura) {
    const forma_pago = prompt('Forma de pago (efectivo, tarjeta o transferencia):', 'efectivo');
    if (!forma_pago) return;

    try {
        const respuesta = await fetch(`${API}/api/facturas/${id_factura}/pagar`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ forma_pago })
        });

        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            alert(resultado.mensaje);
            return;
        }

        cargarFacturasDelDia();

    } catch (error) {
        alert('No se pudo actualizar la factura.');
        console.error(error);
    }
}

const registrosSecretaria = Registros.montar({
    contenedor: document.getElementById('contenedorRegistros'),
    base: '/api/secretaria/registros',
    conRol: false
});

// ---------- Navegación ----------
document.querySelectorAll('.nav-item').forEach(boton => {
    boton.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('activo'));
        boton.classList.add('activo');

        const idSeccion = boton.dataset.seccion;
        document.querySelectorAll('.seccion').forEach(s => s.classList.add('oculto'));
        document.getElementById(`seccion-${idSeccion}`).classList.remove('oculto');

        if (idSeccion === 'facturacion') {
            cargarConsultasPorFacturar();
            cargarFacturasDelDia();
        }
        if (idSeccion === 'registros') registrosSecretaria.recargar();
    });
});

// ---------- Inicialización ----------
const inputFecha = document.getElementById('inputFechaTurnos');
inputFecha.value = fechaLocalHoy();
inputFecha.addEventListener('change', cargarTurnos);

cargarTurnos();

const inputFechaFacturacion = document.getElementById('inputFechaFacturacion');
inputFechaFacturacion.value = fechaLocalHoy();
inputFechaFacturacion.addEventListener('change', () => {
    cargarConsultasPorFacturar();
    cargarFacturasDelDia();
});

Notificaciones.montar({
  contenedor: document.getElementById('zonaCampana'),
  usuarioId: usuario.id_usuario
});