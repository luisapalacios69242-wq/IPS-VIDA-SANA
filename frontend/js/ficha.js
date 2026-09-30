// Formulario de datos del paciente, compartido por el panel de secretaría y el de doctor.
// Usa la constante API que define cada panel.

const GENEROS = ['Masculino', 'Femenino', 'Otro'];
const ESTADOS_CIVILES = ['Soltero(a)', 'Casado(a)', 'Unión libre', 'Divorciado(a)', 'Viudo(a)'];

function esc(texto) {
    return String(texto ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

function opcionesSelect(lista, actual, textoVacio) {
    const valores = actual && !lista.includes(actual) ? [...lista, actual] : lista;
    return `<option value="">${textoVacio}</option>` +
        valores.map(v => `<option value="${esc(v)}" ${v === actual ? 'selected' : ''}>${esc(v)}</option>`).join('');
}

function fichaHtml(prefijo, p, identidadEditable) {
    const ro = identidadEditable ? '' : 'readonly';
    const desactivado = identidadEditable ? '' : 'disabled';
    const obl = (texto) => (identidadEditable ? `${texto} *` : texto);

    return `
    <div class="grid-2">
      <div class="campo">
        <label>${obl('Nombres')}</label>
        <input type="text" id="${prefijo}-nombres" value="${esc(p.nombres)}" ${ro}>
      </div>
      <div class="campo">
        <label>${obl('Apellidos')}</label>
        <input type="text" id="${prefijo}-apellidos" value="${esc(p.apellidos)}" ${ro}>
      </div>

      <div class="campo">
        <label>Tipo de documento</label>
        <input type="text" value="${esc(p.tipo_documento)}" readonly>
      </div>
      <div class="campo">
        <label>Número de documento</label>
        <input type="text" value="${esc(p.numero_documento)}" readonly>
      </div>

      <div class="campo">
        <label>${obl('Fecha de nacimiento')}</label>
        <input type="date" id="${prefijo}-fecha" value="${esc(p.fecha_nacimiento)}" ${ro}>
      </div>
      <div class="campo">
        <label>${obl('Género')}</label>
        <select id="${prefijo}-genero" ${desactivado}>${opcionesSelect(GENEROS, p.genero, 'Selecciona...')}</select>
      </div>

      <div class="campo">
        <label>Estado civil</label>
        <select id="${prefijo}-estado-civil">${opcionesSelect(ESTADOS_CIVILES, p.estado_civil, 'Selecciona...')}</select>
      </div>
      <div class="campo">
        <label>${obl('Teléfono')}</label>
        <input type="text" id="${prefijo}-telefono" value="${esc(p.telefono)}">
      </div>

      <div class="campo">
        <label>${obl('Ciudad')}</label>
        <input type="text" id="${prefijo}-ciudad" value="${esc(p.ciudad)}">
      </div>
      <div class="campo">
        <label>${obl('Correo electrónico')}</label>
        <input type="email" id="${prefijo}-correo" value="${esc(p.correo)}">
      </div>

      <div class="campo campo-full">
        <label>${obl('Dirección')}</label>
        <input type="text" id="${prefijo}-direccion" value="${esc(p.direccion)}">
      </div>

      <div class="campo">
        <label>${obl('Contacto de emergencia (nombre)')}</label>
        <input type="text" id="${prefijo}-contacto-nombre" value="${esc(p.contacto_emergencia_nombre)}">
      </div>
      <div class="campo">
        <label>${obl('Contacto de emergencia (teléfono)')}</label>
        <input type="text" id="${prefijo}-contacto-telefono" value="${esc(p.contacto_emergencia_telefono)}">
      </div>

      <div class="campo campo-full">
        <label>EPS</label>
        <input type="text" id="${prefijo}-eps" value="${esc(p.eps)}" placeholder="Ej. Sura. Si es particular, escribe: Particular">
      </div>
    </div>`;
}

function leerFicha(prefijo, identidadEditable) {
    const valor = (campo) => document.getElementById(`${prefijo}-${campo}`).value.trim();

    const datos = {
        estado_civil: valor('estado-civil'),
        direccion: valor('direccion'),
        ciudad: valor('ciudad'),
        telefono: valor('telefono'),
        correo: valor('correo'),
        contacto_emergencia_nombre: valor('contacto-nombre'),
        contacto_emergencia_telefono: valor('contacto-telefono'),
        eps: valor('eps')
    };

    if (identidadEditable) {
        datos.nombres = valor('nombres');
        datos.apellidos = valor('apellidos');
        datos.fecha_nacimiento = valor('fecha');
        datos.genero = valor('genero');
    }

    return datos;
}

function validarFicha(datos) {
    const obligatorios = [
        ['nombres', 'los nombres'],
        ['apellidos', 'los apellidos'],
        ['fecha_nacimiento', 'la fecha de nacimiento'],
        ['genero', 'el género'],
        ['direccion', 'la dirección'],
        ['ciudad', 'la ciudad'],
        ['telefono', 'el teléfono'],
        ['correo', 'el correo electrónico'],
        ['contacto_emergencia_nombre', 'el nombre del contacto de emergencia'],
        ['contacto_emergencia_telefono', 'el teléfono del contacto de emergencia']
    ];

    const falta = obligatorios.find(([campo]) => !datos[campo]);
    if (falta) return `Falta ${falta[1]}.`;

    if (!/^\S+@\S+\.\S+$/.test(datos.correo)) return 'El correo electrónico no es válido.';

    return '';
}

async function guardarFicha(id_paciente, datos) {
    const respuesta = await fetch(`${API}/api/pacientes/${id_paciente}/ficha`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos)
    });
    const resultado = await respuesta.json();
    return { ok: respuesta.ok, mensaje: resultado.mensaje };
}