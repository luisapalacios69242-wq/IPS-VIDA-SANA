// ============================================================
// Informes detallados: consultas atendidas, diagnósticos y especialidades
// (se registran en informeController.js dentro del mapa INFORMES)
// ============================================================
const pool = require('../config/conexion');

const LIMITE_FILAS = 50000;   // tope de seguridad al leer consultas
const LIMITE_DETALLE = 500;   // filas que se envían a pantalla (el Excel lleva todas)

const n = (v) => Number(v) || 0;
const porcentaje = (parte, total) => (total > 0 ? Math.round((parte / total) * 1000) / 10 : null);
const dia = (v) => String(v || '').slice(0, 10);

// ---------- Filtros (mismo criterio que el resto de informes) ----------
function dondeCita(f, alias = 'c') {
  const w = [`${alias}.fecha BETWEEN ? AND ?`];
  const p = [f.desde, f.hasta];
  if (f.doctor) { w.push(`${alias}.doctor_id = ?`); p.push(f.doctor); }
  if (f.especialidad) {
    w.push(`EXISTS (SELECT 1 FROM doctor_especialidad fe WHERE fe.doctor_id = ${alias}.doctor_id AND fe.especialidad_id = ?)`);
    p.push(f.especialidad);
  }
  return { sql: w.join(' AND '), params: p };
}

// ---------- Capítulos de la CIE-10 ----------
function capituloCie10(codigo) {
  if (!codigo) return 'Sin código CIE-10';
  const letra = String(codigo)[0].toUpperCase();
  const num = parseInt(String(codigo).slice(1, 3), 10) || 0;
  if (letra === 'A' || letra === 'B') return 'Enfermedades infecciosas y parasitarias';
  if (letra === 'C' || (letra === 'D' && num <= 48)) return 'Tumores (neoplasias)';
  if (letra === 'D') return 'Enfermedades de la sangre e inmunidad';
  if (letra === 'E') return 'Enfermedades endocrinas, nutricionales y metabólicas';
  if (letra === 'F') return 'Trastornos mentales y del comportamiento';
  if (letra === 'G') return 'Enfermedades del sistema nervioso';
  if (letra === 'H') return num <= 59 ? 'Enfermedades del ojo y sus anexos' : 'Enfermedades del oído';
  if (letra === 'I') return 'Enfermedades del sistema circulatorio';
  if (letra === 'J') return 'Enfermedades del sistema respiratorio';
  if (letra === 'K') return 'Enfermedades del sistema digestivo (incluye dental)';
  if (letra === 'L') return 'Enfermedades de la piel';
  if (letra === 'M') return 'Enfermedades osteomusculares y del tejido conectivo';
  if (letra === 'N') return 'Enfermedades del sistema genitourinario';
  if (letra === 'O') return 'Embarazo, parto y puerperio';
  if (letra === 'P') return 'Afecciones originadas en el periodo perinatal';
  if (letra === 'Q') return 'Malformaciones congénitas';
  if (letra === 'R') return 'Síntomas y signos no clasificados';
  if (letra === 'S' || letra === 'T') return 'Traumatismos y envenenamientos';
  if (['V', 'W', 'X', 'Y'].includes(letra)) return 'Causas externas de morbilidad';
  if (letra === 'Z') return 'Factores que influyen en el estado de salud';
  return 'Otros códigos';
}

// ---------- Lectura base: una fila por consulta ----------
async function cargarFilas(f, limite = LIMITE_FILAS) {
  const w = dondeCita(f);
  const [filas] = await pool.query(
    `SELECT co.id_consulta, c.fecha, c.hora, c.doctor_id, c.paciente_id,
            CONCAT(ud.nombres, ' ', ud.apellidos) AS doctor,
            COALESCE(es.nombre,
              (SELECT GROUP_CONCAT(e2.nombre ORDER BY e2.nombre SEPARATOR ', ')
                 FROM doctor_especialidad de2 JOIN especialidad e2 ON e2.id_especialidad = de2.especialidad_id
                WHERE de2.doctor_id = c.doctor_id),
              'Sin especialidad') AS especialidad,
            CONCAT(up.nombres, ' ', up.apellidos) AS paciente, up.genero, up.fecha_nacimiento,
            s.nombre AS servicio,
            co.diagnostico_codigo AS codigo, COALESCE(dx.descripcion, co.diagnostico) AS diagnostico,
            f.numero_factura, f.valor, f.estado AS estado_factura, f.forma_pago
     FROM consulta co
     JOIN cita c ON c.id_cita = co.cita_id
     JOIN doctor d ON d.id_doctor = c.doctor_id
     JOIN usuario ud ON ud.id_usuario = d.usuario_id
     JOIN paciente p ON p.id_paciente = c.paciente_id
     JOIN usuario up ON up.id_usuario = p.usuario_id
     LEFT JOIN factura f ON f.consulta_id = co.id_consulta
     LEFT JOIN servicio s ON s.id_servicio = COALESCE(co.servicio_id, f.servicio_id)
     LEFT JOIN especialidad es ON es.id_especialidad = s.especialidad_id
     LEFT JOIN diagnostico_cie10 dx ON dx.codigo = co.diagnostico_codigo
     WHERE ${w.sql}
     ORDER BY c.fecha DESC, c.hora DESC
     LIMIT ${Number(limite) || LIMITE_FILAS}`,
    w.params
  );

  return filas.map((r) => ({
    id_consulta: r.id_consulta,
    fecha: dia(r.fecha),
    hora: String(r.hora || '').slice(0, 5),
    doctor_id: r.doctor_id,
    doctor: r.doctor,
    paciente_id: r.paciente_id,
    paciente: r.paciente,
    genero: r.genero,
    fecha_nacimiento: r.fecha_nacimiento,
    especialidad: r.especialidad,
    servicio: r.servicio || 'Sin servicio',
    codigo: r.codigo || '',
    diagnostico: r.diagnostico || '',
    numero_factura: r.numero_factura || '',
    valor: r.valor === null || r.valor === undefined ? null : n(r.valor),
    estado_factura: r.estado_factura || null,
    forma_pago: r.forma_pago || ''
  }));
}

// ---------- Utilidades de agrupación ----------
function agrupar(filas, clave) {
  const mapa = new Map();
  filas.forEach((r) => {
    const k = clave(r);
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(r);
  });
  return mapa;
}

const claveDx = (r) => r.codigo || r.diagnostico || 'Sin diagnóstico';

function topDiagnosticos(filas, max) {
  const mapa = new Map();
  filas.forEach((r) => {
    const k = claveDx(r);
    const x = mapa.get(k) || { codigo: r.codigo, descripcion: r.diagnostico || 'Sin diagnóstico', casos: 0 };
    x.casos += 1;
    mapa.set(k, x);
  });
  return [...mapa.values()].sort((a, b) => b.casos - a.casos).slice(0, max);
}

const sumaPagada = (filas) => filas.filter((r) => r.estado_factura === 'pagada').reduce((s, r) => s + n(r.valor), 0);
const sumaFacturado = (filas) => filas.reduce((s, r) => s + n(r.valor), 0);
const unicos = (filas, campo) => new Set(filas.map((r) => r[campo])).size;

function mesesDelRango(f) {
  const lista = [];
  let [a, m] = f.desde.slice(0, 7).split('-').map(Number);
  const [af, mf] = f.hasta.slice(0, 7).split('-').map(Number);
  while (a < af || (a === af && m <= mf)) {
    lista.push(`${a}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; a += 1; }
  }
  return lista;
}

// ============================================================
// CONSULTAS ATENDIDAS (qué doctor atendió qué consulta)
// ============================================================
async function informeConsultas(f, { completo = false } = {}) {
  const filas = await cargarFilas(f);

  // Se listan TODOS los doctores y especialidades (según los filtros), aunque no hayan atendido consultas.
  const wd = [];
  const pd = [];
  if (f.doctor) { wd.push('d.id_doctor = ?'); pd.push(f.doctor); }
  if (f.especialidad) {
    wd.push('EXISTS (SELECT 1 FROM doctor_especialidad fe WHERE fe.doctor_id = d.id_doctor AND fe.especialidad_id = ?)');
    pd.push(f.especialidad);
  }
  const [doctores] = await pool.query(
    `SELECT d.id_doctor, CONCAT(u.nombres, ' ', u.apellidos) AS nombre,
            (SELECT GROUP_CONCAT(e.nombre ORDER BY e.nombre SEPARATOR ', ')
               FROM doctor_especialidad de JOIN especialidad e ON e.id_especialidad = de.especialidad_id
              WHERE de.doctor_id = d.id_doctor) AS especialidades
     FROM doctor d JOIN usuario u ON u.id_usuario = d.usuario_id
     ${wd.length ? 'WHERE ' + wd.join(' AND ') : ''}
     ORDER BY nombre`,
    pd
  );
  const gruposDoctor = agrupar(filas, (r) => r.doctor_id);

  const porDoctor = doctores.map((d) => {
    const g = gruposDoctor.get(d.id_doctor) || [];
    return {
      id_doctor: d.id_doctor,
      nombre: d.nombre,
      especialidades: d.especialidades || 'Sin especialidad',
      consultas: g.length,
      pacientes: unicos(g, 'paciente_id'),
      recaudado: sumaPagada(g),
      sinFacturar: g.filter((r) => !r.estado_factura).length,
      diagnosticoFrecuente: (topDiagnosticos(g, 1)[0] || null)
    };
  }).sort((a, b) => b.consultas - a.consultas || a.nombre.localeCompare(b.nombre));

  const [especialidadesBD] = await pool.query(
    `SELECT nombre FROM especialidad ${f.especialidad ? 'WHERE id_especialidad = ?' : ''} ORDER BY nombre`,
    f.especialidad ? [f.especialidad] : []
  );
  const gruposEsp = agrupar(filas, (r) => r.especialidad);
  const nombresEsp = new Set([...especialidadesBD.map((e) => e.nombre), ...gruposEsp.keys()]);

  const porEspecialidad = [...nombresEsp].map((nombre) => {
    const g = gruposEsp.get(nombre) || [];
    return {
      nombre,
      consultas: g.length,
      pacientes: unicos(g, 'paciente_id'),
      doctores: unicos(g, 'doctor_id'),
      recaudado: sumaPagada(g),
      diagnosticoFrecuente: (topDiagnosticos(g, 1)[0] || null)
    };
  }).sort((a, b) => b.consultas - a.consultas || a.nombre.localeCompare(b.nombre));

  return {
    totales: {
      consultas: filas.length,
      pacientes: unicos(filas, 'paciente_id'),
      doctores: unicos(filas, 'doctor_id'),
      facturado: sumaFacturado(filas),
      recaudado: sumaPagada(filas),
      sinFacturar: filas.filter((r) => !r.estado_factura).length
    },
    porDoctor,
    porEspecialidad,
    detalle: (completo ? filas : filas.slice(0, LIMITE_DETALLE)).map((r) => ({
      id_consulta: r.id_consulta, fecha: r.fecha, hora: r.hora, doctor: r.doctor, doctor_id: r.doctor_id,
      especialidad: r.especialidad, paciente: r.paciente, servicio: r.servicio,
      codigo: r.codigo, diagnostico: r.diagnostico, valor: r.valor, estado_factura: r.estado_factura
    })),
    detalleTotal: filas.length,
    detalleTruncado: filas.length > LIMITE_DETALLE
  };
}

// ============================================================
// DIAGNÓSTICOS (detalle completo)
// ============================================================
async function informeDiagnosticos(f, { completo = false } = {}) {
  const filas = await cargarFilas(f);
  const total = filas.length;
  const sinDx = filas.filter((r) => !r.codigo && !r.diagnostico).length;

  const mapa = agrupar(filas, claveDx);
  const diagnosticos = [...mapa.values()].map((g) => {
    const esp = [...agrupar(g, (r) => r.especialidad).entries()].sort((a, b) => b[1].length - a[1].length)[0];
    const fem = g.filter((r) => r.genero === 'Femenino').length;
    const mas = g.filter((r) => r.genero === 'Masculino').length;
    return {
      codigo: g[0].codigo,
      descripcion: g[0].diagnostico || 'Sin diagnóstico',
      capitulo: capituloCie10(g[0].codigo),
      casos: g.length,
      porcentaje: porcentaje(g.length, total),
      pacientes: unicos(g, 'paciente_id'),
      doctores: unicos(g, 'doctor_id'),
      femenino: fem,
      masculino: mas,
      otro: g.length - fem - mas,
      especialidadPrincipal: esp ? esp[0] : ''
    };
  }).sort((a, b) => b.casos - a.casos || a.descripcion.localeCompare(b.descripcion));

  const capitulos = [...agrupar(filas, (r) => capituloCie10(r.codigo)).entries()]
    .map(([capitulo, g]) => ({ capitulo, casos: g.length, porcentaje: porcentaje(g.length, total), distintos: new Set(g.map(claveDx)).size }))
    .sort((a, b) => b.casos - a.casos);

  // Tendencia mensual de los 5 diagnósticos más frecuentes
  const periodos = mesesDelRango(f);
  const top5 = diagnosticos.slice(0, 5);
  const tendencia = {
    periodos,
    series: top5.map((dx) => {
      const clave = dx.codigo || dx.descripcion;
      const g = mapa.get(clave) || [];
      const porMes = new Map();
      g.forEach((r) => { const m = r.fecha.slice(0, 7); porMes.set(m, (porMes.get(m) || 0) + 1); });
      return { nombre: dx.codigo ? `${dx.codigo} · ${dx.descripcion}` : dx.descripcion, datos: periodos.map((p) => porMes.get(p) || 0) };
    })
  };

  const porEspecialidad = [...agrupar(filas, (r) => r.especialidad).values()].map((g) => ({
    especialidad: g[0].especialidad,
    consultas: g.length,
    distintos: new Set(g.map(claveDx)).size,
    top: topDiagnosticos(g, 5)
  })).sort((a, b) => b.consultas - a.consultas);

  const porDoctor = [...agrupar(filas, (r) => r.doctor_id).values()].map((g) => ({
    doctor: g[0].doctor,
    especialidades: [...new Set(g.map((r) => r.especialidad))].join(', '),
    consultas: g.length,
    distintos: new Set(g.map(claveDx)).size,
    top: topDiagnosticos(g, 3)
  })).sort((a, b) => b.consultas - a.consultas);

  return {
    totales: { consultas: total, conDiagnostico: total - sinDx, sinDiagnostico: sinDx, distintos: mapa.size, pacientes: unicos(filas, 'paciente_id') },
    diagnosticos: completo ? diagnosticos : diagnosticos.slice(0, 60),   // el Excel exporta la lista completa
    totalDiagnosticosDistintos: diagnosticos.length,
    capitulos,
    tendencia,
    porEspecialidad,
    porDoctor
  };
}

// ============================================================
// ESPECIALIDADES (detalle completo)
// ============================================================
async function informeEspecialidades(f) {  // (el segundo parámetro, si llega, se ignora)
  const filas = await cargarFilas(f);

  // Estado de las citas por especialidad (si un doctor tiene varias, sus citas cuentan en cada una)
  const w = dondeCita(f);
  const [citas] = await pool.query(
    `SELECT e.nombre, COUNT(*) AS citas, SUM(c.estado = 'atendida') AS atendidas,
            SUM(c.estado = 'no_asistida') AS no_asistidas, SUM(c.estado = 'cancelada') AS canceladas
     FROM cita c
     JOIN doctor_especialidad de ON de.doctor_id = c.doctor_id
     JOIN especialidad e ON e.id_especialidad = de.especialidad_id
     WHERE ${w.sql} ${f.especialidad ? 'AND e.id_especialidad = ?' : ''}
     GROUP BY e.id_especialidad, e.nombre`,
    f.especialidad ? [...w.params, f.especialidad] : w.params
  );
  const mapaCitas = new Map(citas.map((c) => [c.nombre, c]));
  const mapaFilas = agrupar(filas, (r) => r.especialidad);

  const nombres = new Set([...mapaCitas.keys(), ...mapaFilas.keys()]);
  const totalRecaudado = sumaPagada(filas);

  const especialidades = [...nombres].map((nombre) => {
    const c = mapaCitas.get(nombre) || {};
    const g = mapaFilas.get(nombre) || [];
    const atendidas = n(c.atendidas);
    const noAsistidas = n(c.no_asistidas);
    const pagadas = g.filter((r) => r.estado_factura === 'pagada');
    const recaudado = sumaPagada(g);

    const servicios = [...agrupar(g, (r) => r.servicio).values()].map((s) => ({
      nombre: s[0].servicio, cantidad: s.length, recaudado: sumaPagada(s)
    })).sort((a, b) => b.cantidad - a.cantidad).slice(0, 5);

    return {
      nombre,
      citas: n(c.citas),
      atendidas,
      noAsistidas,
      canceladas: n(c.canceladas),
      tasaInasistencia: porcentaje(noAsistidas, atendidas + noAsistidas),
      consultas: g.length,
      pacientes: unicos(g, 'paciente_id'),
      doctores: [...new Set(g.map((r) => r.doctor))],
      facturado: sumaFacturado(g),
      recaudado,
      ticketPromedio: pagadas.length ? Math.round(recaudado / pagadas.length) : null,
      porcentajeIngresos: porcentaje(recaudado, totalRecaudado),
      diagnosticos: topDiagnosticos(g, 5),
      servicios
    };
  }).sort((a, b) => b.consultas - a.consultas || b.citas - a.citas);

  return {
    totales: {
      especialidades: especialidades.length,
      consultas: filas.length,
      pacientes: unicos(filas, 'paciente_id'),
      recaudado: totalRecaudado,
      ticketPromedio: (() => {
        const pagadas = filas.filter((r) => r.estado_factura === 'pagada');
        return pagadas.length ? Math.round(totalRecaudado / pagadas.length) : null;
      })()
    },
    especialidades
  };
}

module.exports = { informeConsultas, informeDiagnosticos, informeEspecialidades, cargarFilas };