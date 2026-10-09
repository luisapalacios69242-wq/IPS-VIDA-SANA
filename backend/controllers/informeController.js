const pool = require('../config/conexion');

const FECHA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;
const DURACION_CITA_MIN = 30;
const MAX_DIAS_RANGO = 3660;
const DIAS_INACTIVIDAD = 90;
const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];

// ---------- Utilidades de fechas (en UTC para evitar corrimientos de zona horaria) ----------
const aDate = (t) => new Date(`${t}T00:00:00Z`);
const aTexto = (d) => d.toISOString().slice(0, 10);
const sumarDias = (t, n) => { const d = aDate(t); d.setUTCDate(d.getUTCDate() + n); return aTexto(d); };
const diasEntre = (a, b) => Math.round((aDate(b) - aDate(a)) / 86400000);
const aMinutos = (hora) => { const [h, m] = String(hora).split(':').map(Number); return h * 60 + m; };
const n = (v) => Number(v) || 0;
const porcentaje = (parte, total) => (total > 0 ? Math.round((parte / total) * 1000) / 10 : null);

// ---------- Filtros ----------
function leerFiltros(req) {
  const { desde, hasta, doctor, especialidad } = req.query;

  if (!FECHA_VALIDA.test(desde || '') || !FECHA_VALIDA.test(hasta || '')) {
    return { error: 'Indica un rango de fechas válido (desde y hasta, formato YYYY-MM-DD).' };
  }
  if (hasta < desde) return { error: 'La fecha final no puede ser anterior a la inicial.' };
  if (diasEntre(desde, hasta) > MAX_DIAS_RANGO) return { error: 'El rango de fechas es demasiado grande (máximo 10 años).' };

  const idDoctor = Number(doctor) > 0 ? Number(doctor) : null;
  const idEspecialidad = Number(especialidad) > 0 ? Number(especialidad) : null;
  return { filtros: { desde, hasta, doctor: idDoctor, especialidad: idEspecialidad } };
}

// Periodo inmediatamente anterior, de la misma duración (para comparar).
function periodoAnterior(f) {
  const dias = diasEntre(f.desde, f.hasta) + 1;
  const hasta = sumarDias(f.desde, -1);
  const desde = sumarDias(hasta, -(dias - 1));
  return { ...f, desde, hasta };
}

// Cláusula WHERE reutilizable. `fechaExpr` es la columna/expresión de fecha a filtrar; `alias` es el alias de cita.
function dondeCita(f, { fechaExpr = 'c.fecha', alias = 'c', conFecha = true } = {}) {
  const w = [];
  const p = [];
  if (conFecha) { w.push(`${fechaExpr} BETWEEN ? AND ?`); p.push(f.desde, f.hasta); }
  if (f.doctor) { w.push(`${alias}.doctor_id = ?`); p.push(f.doctor); }
  if (f.especialidad) {
    w.push(`EXISTS (SELECT 1 FROM doctor_especialidad fe WHERE fe.doctor_id = ${alias}.doctor_id AND fe.especialidad_id = ?)`);
    p.push(f.especialidad);
  }
  return { sql: w.length ? w.join(' AND ') : '1=1', params: p };
}

// ---------- Series de tiempo (por día si el rango es corto, por mes si es largo) ----------
const granularidad = (f) => (diasEntre(f.desde, f.hasta) + 1 <= 62 ? 'dia' : 'mes');
const exprPeriodo = (gran, col) => (gran === 'dia' ? `DATE(${col})` : `DATE_FORMAT(${col}, '%Y-%m')`);

function periodosDelRango(f, gran) {
  const lista = [];
  if (gran === 'dia') {
    for (let t = f.desde; t <= f.hasta; t = sumarDias(t, 1)) lista.push(t);
  } else {
    let [a, m] = f.desde.slice(0, 7).split('-').map(Number);
    const [af, mf] = f.hasta.slice(0, 7).split('-').map(Number);
    while (a < af || (a === af && m <= mf)) {
      lista.push(`${a}-${String(m).padStart(2, '0')}`);
      m += 1;
      if (m > 12) { m = 1; a += 1; }
    }
  }
  return lista;
}

function completarSerie(f, gran, filas, campos) {
  const mapa = new Map(filas.map((r) => [String(r.periodo), r]));
  return periodosDelRango(f, gran).map((periodo) => {
    const fila = mapa.get(periodo) || {};
    const salida = { periodo };
    campos.forEach((c) => { salida[c] = n(fila[c]); });
    return salida;
  });
}

// ---------- Ocupación de agenda: citas agendadas vs. cupos que ofrece el horario ----------
async function ocupacionPorDoctor(f) {
  const w = [];
  const p = [];
  if (f.doctor) { w.push('d.id_doctor = ?'); p.push(f.doctor); }
  if (f.especialidad) {
    w.push('EXISTS (SELECT 1 FROM doctor_especialidad fe WHERE fe.doctor_id = d.id_doctor AND fe.especialidad_id = ?)');
    p.push(f.especialidad);
  }

  const [doctores] = await pool.query(
    `SELECT d.id_doctor, u.nombres, u.apellidos
     FROM doctor d JOIN usuario u ON u.id_usuario = d.usuario_id
     ${w.length ? 'WHERE ' + w.join(' AND ') : ''}
     ORDER BY u.nombres`,
    p
  );
  if (doctores.length === 0) return [];

  const ids = doctores.map((d) => d.id_doctor);

  const [horarios] = await pool.query(
    'SELECT doctor_id, dia_semana, hora_inicio, hora_fin FROM horario WHERE doctor_id IN (?)', [ids]
  );
  const [bloqueos] = await pool.query(
    'SELECT doctor_id, fecha, hora_inicio, hora_fin FROM bloqueo_horario WHERE doctor_id IN (?) AND fecha BETWEEN ? AND ?',
    [ids, f.desde, f.hasta]
  );
  const [agendadas] = await pool.query(
    `SELECT doctor_id, COUNT(*) AS total FROM cita
     WHERE doctor_id IN (?) AND estado <> 'cancelada' AND fecha BETWEEN ? AND ?
     GROUP BY doctor_id`,
    [ids, f.desde, f.hasta]
  );
  const mapaAgendadas = new Map(agendadas.map((a) => [a.doctor_id, n(a.total)]));

  return doctores.map((d) => {
    const hs = horarios.filter((h) => h.doctor_id === d.id_doctor);
    const bs = bloqueos.filter((b) => b.doctor_id === d.id_doctor);
    let capacidad = 0;

    for (let t = f.desde; t <= f.hasta; t = sumarDias(t, 1)) {
      const nombreDia = NOMBRES_DIA[aDate(t).getUTCDay()];
      const bloqDia = bs.filter((b) => b.fecha === t).map((b) => [aMinutos(b.hora_inicio), aMinutos(b.hora_fin)]);

      hs.filter((h) => h.dia_semana === nombreDia).forEach((h) => {
        const fin = aMinutos(h.hora_fin);
        for (let m = aMinutos(h.hora_inicio); m + DURACION_CITA_MIN <= fin; m += DURACION_CITA_MIN) {
          const bloqueado = bloqDia.some(([bi, bf]) => m < bf && m + DURACION_CITA_MIN > bi);
          if (!bloqueado) capacidad += 1;
        }
      });
    }

    const agendadasDoc = mapaAgendadas.get(d.id_doctor) || 0;
    return {
      id_doctor: d.id_doctor,
      doctor: `${d.nombres} ${d.apellidos}`,
      capacidad,
      agendadas: agendadasDoc,
      ocupacion: capacidad > 0 ? Math.min(100, porcentaje(agendadasDoc, capacidad)) : null
    };
  });
}

// ---------- Indicadores base (reutilizados por el resumen y para comparar periodos) ----------
async function calcularKpis(f) {
  const wc = dondeCita(f);
  const [citas] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(c.estado = 'atendida') AS atendidas,
            SUM(c.estado = 'no_asistida') AS no_asistidas,
            SUM(c.estado = 'cancelada') AS canceladas,
            COUNT(DISTINCT CASE WHEN c.estado = 'atendida' THEN c.paciente_id END) AS pacientes_atendidos
     FROM cita c WHERE ${wc.sql}`,
    wc.params
  );

  const [nuevos] = await pool.query(
    `SELECT COUNT(*) AS total FROM paciente p
     JOIN usuario u ON u.id_usuario = p.usuario_id
     WHERE DATE(u.fecha_registro) BETWEEN ? AND ?`,
    [f.desde, f.hasta]
  );

  const wf = dondeCita(f, { fechaExpr: 'DATE(f.fecha)' });
  const [fin] = await pool.query(
    `SELECT SUM(CASE WHEN f.estado = 'pagada' THEN f.valor ELSE 0 END) AS recaudado,
            SUM(CASE WHEN f.estado = 'pendiente' THEN f.valor ELSE 0 END) AS pendiente,
            SUM(f.estado = 'pagada') AS facturas_pagadas
     FROM factura f
     JOIN consulta co ON co.id_consulta = f.consulta_id
     JOIN cita c ON c.id_cita = co.cita_id
     WHERE ${wf.sql}`,
    wf.params
  );

  const c = citas[0];
  const total = n(c.total);
  const atendidas = n(c.atendidas);
  const noAsistidas = n(c.no_asistidas);
  const canceladas = n(c.canceladas);
  const recaudado = n(fin[0].recaudado);
  const facturasPagadas = n(fin[0].facturas_pagadas);

  return {
    citas: total,
    atendidas,
    noAsistidas,
    canceladas,
    tasaAsistencia: porcentaje(atendidas, atendidas + noAsistidas),
    tasaInasistencia: porcentaje(noAsistidas, atendidas + noAsistidas),
    tasaCancelacion: porcentaje(canceladas, total),
    pacientesAtendidos: n(c.pacientes_atendidos),
    pacientesNuevos: n(nuevos[0].total),
    recaudado,
    cartera: n(fin[0].pendiente),
    ticketPromedio: facturasPagadas > 0 ? Math.round(recaudado / facturasPagadas) : null
  };
}

// ============================================================
// 1. RESUMEN EJECUTIVO
// ============================================================
async function informeResumen(f) {
  const anterior = periodoAnterior(f);
  const [actual, previo] = await Promise.all([calcularKpis(f), calcularKpis(anterior)]);

  const gran = granularidad(f);
  const wc = dondeCita(f);
  const [filas] = await pool.query(
    `SELECT ${exprPeriodo(gran, 'c.fecha')} AS periodo,
            COUNT(*) AS total,
            SUM(c.estado = 'atendida') AS atendidas,
            SUM(c.estado = 'no_asistida') AS no_asistidas,
            SUM(c.estado = 'cancelada') AS canceladas
     FROM cita c WHERE ${wc.sql}
     GROUP BY periodo ORDER BY periodo`,
    wc.params
  );

  const wf = dondeCita(f, { fechaExpr: 'DATE(f.fecha)' });
  const [ing] = await pool.query(
    `SELECT ${exprPeriodo(gran, 'f.fecha')} AS periodo,
            SUM(CASE WHEN f.estado = 'pagada' THEN f.valor ELSE 0 END) AS ingresos
     FROM factura f
     JOIN consulta co ON co.id_consulta = f.consulta_id
     JOIN cita c ON c.id_cita = co.cita_id
     WHERE ${wf.sql}
     GROUP BY periodo ORDER BY periodo`,
    wf.params
  );

  const tendencia = completarSerie(f, gran, filas, ['total', 'atendidas', 'no_asistidas', 'canceladas']);
  const mapaIng = new Map(ing.map((r) => [String(r.periodo), n(r.ingresos)]));
  tendencia.forEach((t) => { t.ingresos = mapaIng.get(t.periodo) || 0; });

  const ocupacion = await ocupacionPorDoctor(f);
  const capacidad = ocupacion.reduce((s, o) => s + o.capacidad, 0);
  const agendadas = ocupacion.reduce((s, o) => s + o.agendadas, 0);

  return {
    periodo: { desde: f.desde, hasta: f.hasta },
    periodoAnterior: { desde: anterior.desde, hasta: anterior.hasta },
    actual: { ...actual, ocupacion: capacidad > 0 ? Math.min(100, porcentaje(agendadas, capacidad)) : null },
    anterior: previo,
    granularidad: gran,
    tendencia
  };
}

// ============================================================
// 2. CITAS Y ASISTENCIA
// ============================================================
async function informeCitas(f) {
  const wc = dondeCita(f);

  const [porEstado] = await pool.query(
    `SELECT c.estado, COUNT(*) AS total FROM cita c WHERE ${wc.sql} GROUP BY c.estado ORDER BY total DESC`, wc.params
  );

  const [porTipo] = await pool.query(
    `SELECT COALESCE(NULLIF(c.tipo, ''), 'Sin tipo') AS tipo_cita, COUNT(*) AS total
     FROM cita c WHERE ${wc.sql} GROUP BY tipo_cita ORDER BY total DESC`, wc.params
  );

  const [matriz] = await pool.query(
    `SELECT DAYOFWEEK(c.fecha) AS dia_sem, HOUR(c.hora) AS hora_dia,
            COUNT(*) AS total, SUM(c.estado = 'no_asistida') AS no_asistidas
     FROM cita c WHERE ${wc.sql} AND c.estado <> 'cancelada'
     GROUP BY dia_sem, hora_dia`, wc.params
  );

  // DAYOFWEEK: 1 = domingo ... 7 = sábado
  const dias = NOMBRES_DIA.map((nombre, i) => {
    const filas = matriz.filter((m) => m.dia_sem === i + 1);
    return {
      dia: nombre === 'Miercoles' ? 'Miércoles' : nombre === 'Sabado' ? 'Sábado' : nombre,
      total: filas.reduce((s, m) => s + n(m.total), 0),
      noAsistidas: filas.reduce((s, m) => s + n(m.no_asistidas), 0)
    };
  });
  // Lunes primero
  const diasOrdenados = [...dias.slice(1), dias[0]];

  const horasSet = new Set(matriz.map((m) => m.hora_dia));
  const horas = [...horasSet].sort((a, b) => a - b);
  const porHora = horas.map((h) => ({
    hora: h,
    total: matriz.filter((m) => m.hora_dia === h).reduce((s, m) => s + n(m.total), 0),
    noAsistidas: matriz.filter((m) => m.hora_dia === h).reduce((s, m) => s + n(m.no_asistidas), 0)
  }));

  const mapa = horas.length
    ? {
        horas,
        dias: diasOrdenados.map((d) => d.dia),
        valores: [1, 2, 3, 4, 5, 6, 0].map((idx) =>
          horas.map((h) => n((matriz.find((m) => m.dia_sem === idx + 1 && m.hora_dia === h) || {}).total))
        )
      }
    : null;

  const ocupacion = await ocupacionPorDoctor(f);

  const total = porEstado.reduce((s, e) => s + n(e.total), 0);
  const get = (e) => n((porEstado.find((x) => x.estado === e) || {}).total);

  return {
    total,
    atendidas: get('atendida'),
    canceladas: get('cancelada'),
    noAsistidas: get('no_asistida'),
    tasaAsistencia: porcentaje(get('atendida'), get('atendida') + get('no_asistida')),
    tasaInasistencia: porcentaje(get('no_asistida'), get('atendida') + get('no_asistida')),
    tasaCancelacion: porcentaje(get('cancelada'), total),
    porEstado: porEstado.map((e) => ({ estado: e.estado, total: n(e.total) })),
    porTipo: porTipo.map((t) => ({ tipo: t.tipo_cita, total: n(t.total) })),
    porDia: diasOrdenados,
    porHora,
    mapaCalor: mapa,
    ocupacion
  };
}

// ============================================================
// 3. FINANCIERO
// ============================================================
async function informeFinanciero(f) {
  const wf = dondeCita(f, { fechaExpr: 'DATE(f.fecha)' });
  const base = `FROM factura f
     JOIN consulta co ON co.id_consulta = f.consulta_id
     JOIN cita c ON c.id_cita = co.cita_id`;
  const pagada = "CASE WHEN f.estado = 'pagada' THEN f.valor ELSE 0 END";
  const pendiente = "CASE WHEN f.estado = 'pendiente' THEN f.valor ELSE 0 END";

  const [tot] = await pool.query(
    `SELECT COUNT(*) AS facturas, SUM(f.estado = 'pagada') AS pagadas, SUM(f.estado = 'pendiente') AS pendientes,
            SUM(${pagada}) AS recaudado, SUM(${pendiente}) AS por_cobrar, SUM(f.valor) AS facturado
     ${base} WHERE ${wf.sql}`, wf.params
  );

  const gran = granularidad(f);
  const [serie] = await pool.query(
    `SELECT ${exprPeriodo(gran, 'f.fecha')} AS periodo, SUM(${pagada}) AS recaudado, SUM(${pendiente}) AS pendiente
     ${base} WHERE ${wf.sql} GROUP BY periodo ORDER BY periodo`, wf.params
  );

  const [porServicio] = await pool.query(
    `SELECT s.nombre AS etiqueta, COUNT(*) AS cantidad, SUM(f.valor) AS facturado, SUM(${pagada}) AS recaudado
     ${base} JOIN servicio s ON s.id_servicio = f.servicio_id
     WHERE ${wf.sql} GROUP BY s.id_servicio, s.nombre ORDER BY recaudado DESC, facturado DESC`, wf.params
  );

  const [porEspecialidad] = await pool.query(
    `SELECT COALESCE(e.nombre, 'Sin especialidad') AS etiqueta, COUNT(*) AS cantidad, SUM(f.valor) AS facturado, SUM(${pagada}) AS recaudado
     ${base} JOIN servicio s ON s.id_servicio = f.servicio_id
     LEFT JOIN especialidad e ON e.id_especialidad = s.especialidad_id
     WHERE ${wf.sql} GROUP BY etiqueta ORDER BY recaudado DESC, facturado DESC`, wf.params
  );

  const [porDoctor] = await pool.query(
    `SELECT CONCAT(u.nombres, ' ', u.apellidos) AS etiqueta, COUNT(*) AS cantidad, SUM(f.valor) AS facturado, SUM(${pagada}) AS recaudado
     ${base} JOIN doctor d ON d.id_doctor = c.doctor_id JOIN usuario u ON u.id_usuario = d.usuario_id
     WHERE ${wf.sql} GROUP BY d.id_doctor, etiqueta ORDER BY recaudado DESC, facturado DESC`, wf.params
  );

  const [porFormaPago] = await pool.query(
    `SELECT COALESCE(NULLIF(f.forma_pago, ''), 'Sin dato') AS forma, COUNT(*) AS cantidad, SUM(f.valor) AS total
     ${base} WHERE ${wf.sql} AND f.estado = 'pagada' GROUP BY forma ORDER BY total DESC`, wf.params
  );

  // Cartera: todo lo pendiente a hoy (no depende del rango de fechas), con antigüedad.
  const wcar = dondeCita(f, { conFecha: false });
  const [cartera] = await pool.query(
    `SELECT f.numero_factura, f.valor, DATE(f.fecha) AS fecha, DATEDIFF(CURDATE(), DATE(f.fecha)) AS dias,
            CONCAT(up.nombres, ' ', up.apellidos) AS paciente
     ${base}
     JOIN paciente p ON p.id_paciente = c.paciente_id JOIN usuario up ON up.id_usuario = p.usuario_id
     WHERE ${wcar.sql} AND f.estado = 'pendiente'
     ORDER BY f.fecha ASC`, wcar.params
  );
  const tramos = [
    { tramo: '0 a 7 días', min: 0, max: 7 },
    { tramo: '8 a 30 días', min: 8, max: 30 },
    { tramo: '31 a 60 días', min: 31, max: 60 },
    { tramo: 'Más de 60 días', min: 61, max: Infinity }
  ].map((t) => {
    const filas = cartera.filter((c) => n(c.dias) >= t.min && n(c.dias) <= t.max);
    return { tramo: t.tramo, facturas: filas.length, valor: filas.reduce((s, c) => s + n(c.valor), 0) };
  });

  // Atenciones del rango que todavía no se han facturado (plata que se está dejando de cobrar).
  const wsf = dondeCita(f);
  const [sinFacturar] = await pool.query(
    `SELECT c.fecha, c.hora, CONCAT(up.nombres, ' ', up.apellidos) AS paciente, CONCAT(ud.nombres, ' ', ud.apellidos) AS doctor
     FROM consulta co
     JOIN cita c ON c.id_cita = co.cita_id
     JOIN paciente p ON p.id_paciente = c.paciente_id JOIN usuario up ON up.id_usuario = p.usuario_id
     JOIN doctor d ON d.id_doctor = c.doctor_id JOIN usuario ud ON ud.id_usuario = d.usuario_id
     LEFT JOIN factura f ON f.consulta_id = co.id_consulta
     WHERE ${wsf.sql} AND c.estado = 'atendida' AND f.id_factura IS NULL
     ORDER BY c.fecha DESC, c.hora DESC`, wsf.params
  );

  const t = tot[0];
  const pagadas = n(t.pagadas);
  const recaudado = n(t.recaudado);
  const mapaSerie = serie.map((s) => ({ ...s, recaudado: n(s.recaudado), pendiente: n(s.pendiente) }));

  const mapearFilas = (filas) => filas.map((r) => ({
    nombre: r.etiqueta, cantidad: n(r.cantidad), facturado: n(r.facturado), recaudado: n(r.recaudado)
  }));

  return {
    totales: {
      facturas: n(t.facturas), pagadas, pendientes: n(t.pendientes),
      facturado: n(t.facturado), recaudado, porCobrar: n(t.por_cobrar),
      ticketPromedio: pagadas > 0 ? Math.round(recaudado / pagadas) : null,
      tasaRecaudo: porcentaje(recaudado, n(t.facturado))
    },
    granularidad: gran,
    serie: completarSerie(f, gran, mapaSerie, ['recaudado', 'pendiente']),
    porServicio: mapearFilas(porServicio),
    porEspecialidad: mapearFilas(porEspecialidad),
    porDoctor: mapearFilas(porDoctor),
    porFormaPago: porFormaPago.map((r) => ({ forma: r.forma, cantidad: n(r.cantidad), total: n(r.total) })),
    cartera: {
      total: cartera.reduce((s, c) => s + n(c.valor), 0),
      facturas: cartera.length,
      tramos,
      masAntiguas: cartera.slice(0, 15).map((c) => ({
        numero: c.numero_factura, paciente: c.paciente, fecha: c.fecha, dias: n(c.dias), valor: n(c.valor)
      }))
    },
    sinFacturar: {
      total: sinFacturar.length,
      detalle: sinFacturar.slice(0, 15).map((s) => ({
        fecha: s.fecha, hora: String(s.hora).slice(0, 5), paciente: s.paciente, doctor: s.doctor
      }))
    }
  };
}

// ============================================================
// 4. DOCTORES Y ESPECIALIDADES
// ============================================================
async function informeDoctores(f) {
  const w = [];
  const pd = [];
  if (f.doctor) { w.push('d.id_doctor = ?'); pd.push(f.doctor); }
  if (f.especialidad) {
    w.push('EXISTS (SELECT 1 FROM doctor_especialidad fe WHERE fe.doctor_id = d.id_doctor AND fe.especialidad_id = ?)');
    pd.push(f.especialidad);
  }

  const [doctores] = await pool.query(
    `SELECT d.id_doctor, CONCAT(u.nombres, ' ', u.apellidos) AS nombre,
            (SELECT GROUP_CONCAT(e.nombre ORDER BY e.nombre SEPARATOR ', ')
               FROM doctor_especialidad de JOIN especialidad e ON e.id_especialidad = de.especialidad_id
              WHERE de.doctor_id = d.id_doctor) AS especialidades,
            COUNT(c.id_cita) AS citas,
            COALESCE(SUM(c.estado = 'atendida'), 0) AS atendidas,
            COALESCE(SUM(c.estado = 'no_asistida'), 0) AS no_asistidas,
            COALESCE(SUM(c.estado = 'cancelada'), 0) AS canceladas,
            COUNT(DISTINCT CASE WHEN c.estado = 'atendida' THEN c.paciente_id END) AS pacientes
     FROM doctor d
     JOIN usuario u ON u.id_usuario = d.usuario_id
     LEFT JOIN cita c ON c.doctor_id = d.id_doctor AND c.fecha BETWEEN ? AND ?
     ${w.length ? 'WHERE ' + w.join(' AND ') : ''}
     GROUP BY d.id_doctor, nombre
     ORDER BY atendidas DESC, nombre`,
    [f.desde, f.hasta, ...pd]
  );

  const wf = dondeCita(f, { fechaExpr: 'DATE(f.fecha)' });
  const [ingresos] = await pool.query(
    `SELECT c.doctor_id, SUM(CASE WHEN f.estado = 'pagada' THEN f.valor ELSE 0 END) AS recaudado
     FROM factura f JOIN consulta co ON co.id_consulta = f.consulta_id JOIN cita c ON c.id_cita = co.cita_id
     WHERE ${wf.sql} GROUP BY c.doctor_id`, wf.params
  );
  const mapaIng = new Map(ingresos.map((i) => [i.doctor_id, n(i.recaudado)]));

  const ocupacion = await ocupacionPorDoctor(f);
  const mapaOcu = new Map(ocupacion.map((o) => [o.id_doctor, o]));

  const listaDoctores = doctores.map((d) => {
    const atendidas = n(d.atendidas);
    const noAsistidas = n(d.no_asistidas);
    const ocu = mapaOcu.get(d.id_doctor) || {};
    return {
      id_doctor: d.id_doctor,
      nombre: d.nombre,
      especialidades: d.especialidades || 'Sin especialidad',
      citas: n(d.citas),
      atendidas,
      noAsistidas,
      canceladas: n(d.canceladas),
      pacientes: n(d.pacientes),
      tasaAsistencia: porcentaje(atendidas, atendidas + noAsistidas),
      ingresos: mapaIng.get(d.id_doctor) || 0,
      ocupacion: ocu.ocupacion === undefined ? null : ocu.ocupacion,
      capacidad: ocu.capacidad || 0
    };
  });

  // Por especialidad (si un doctor tiene varias, sus citas cuentan en cada una).
  const we = dondeCita(f);
  const [esp] = await pool.query(
    `SELECT e.nombre, COUNT(*) AS citas, SUM(c.estado = 'atendida') AS atendidas, SUM(c.estado = 'no_asistida') AS no_asistidas,
            COUNT(DISTINCT CASE WHEN c.estado = 'atendida' THEN c.paciente_id END) AS pacientes
     FROM cita c
     JOIN doctor_especialidad de ON de.doctor_id = c.doctor_id
     JOIN especialidad e ON e.id_especialidad = de.especialidad_id
     WHERE ${we.sql} ${f.especialidad ? 'AND e.id_especialidad = ?' : ''}
     GROUP BY e.id_especialidad, e.nombre ORDER BY atendidas DESC`,
    f.especialidad ? [...we.params, f.especialidad] : we.params
  );

  const [espIng] = await pool.query(
    `SELECT COALESCE(e.nombre, 'Sin especialidad') AS etiqueta, SUM(CASE WHEN f.estado = 'pagada' THEN f.valor ELSE 0 END) AS recaudado
     FROM factura f JOIN consulta co ON co.id_consulta = f.consulta_id JOIN cita c ON c.id_cita = co.cita_id
     JOIN servicio s ON s.id_servicio = f.servicio_id LEFT JOIN especialidad e ON e.id_especialidad = s.especialidad_id
     WHERE ${wf.sql} GROUP BY etiqueta`, wf.params
  );
  const mapaEspIng = new Map(espIng.map((e) => [e.etiqueta, n(e.recaudado)]));

  return {
    doctores: listaDoctores,
    especialidades: esp.map((e) => ({
      nombre: e.nombre,
      citas: n(e.citas),
      atendidas: n(e.atendidas),
      noAsistidas: n(e.no_asistidas),
      pacientes: n(e.pacientes),
      tasaAsistencia: porcentaje(n(e.atendidas), n(e.atendidas) + n(e.no_asistidas)),
      ingresos: mapaEspIng.get(e.nombre) || 0
    }))
  };
}

// ============================================================
// 5. MORBILIDAD (CIE-10)
// ============================================================
const GRUPOS_EDAD = ['0 a 5 años', '6 a 11 años', '12 a 17 años', '18 a 28 años', '29 a 59 años', '60 años o más', 'Sin dato'];

function grupoDeEdad(fechaNacimiento, fechaRef) {
  if (!fechaNacimiento || !FECHA_VALIDA.test(String(fechaNacimiento).slice(0, 10))) return 'Sin dato';
  const nac = aDate(String(fechaNacimiento).slice(0, 10));
  const ref = aDate(String(fechaRef).slice(0, 10));
  let edad = ref.getUTCFullYear() - nac.getUTCFullYear();
  const antes = ref.getUTCMonth() < nac.getUTCMonth() ||
    (ref.getUTCMonth() === nac.getUTCMonth() && ref.getUTCDate() < nac.getUTCDate());
  if (antes) edad -= 1;
  if (edad < 0) return 'Sin dato';
  if (edad <= 5) return GRUPOS_EDAD[0];
  if (edad <= 11) return GRUPOS_EDAD[1];
  if (edad <= 17) return GRUPOS_EDAD[2];
  if (edad <= 28) return GRUPOS_EDAD[3];
  if (edad <= 59) return GRUPOS_EDAD[4];
  return GRUPOS_EDAD[5];
}

const normalizarGenero = (g) => (['Masculino', 'Femenino'].includes(g) ? g : 'Otro / sin dato');

async function informeMorbilidad(f) {
  const wc = dondeCita(f);
  const claveDx = 'COALESCE(NULLIF(co.diagnostico_codigo, \'\'), co.diagnostico)';
  const base = `FROM consulta co
     JOIN cita c ON c.id_cita = co.cita_id
     LEFT JOIN diagnostico_cie10 dx ON dx.codigo = co.diagnostico_codigo`;

  const [totales] = await pool.query(
    `SELECT COUNT(*) AS consultas, COUNT(DISTINCT c.paciente_id) AS pacientes ${base} WHERE ${wc.sql}`, wc.params
  );

  const [top] = await pool.query(
    `SELECT ${claveDx} AS clave, MAX(dx.codigo) AS codigo,
            COALESCE(MAX(dx.descripcion), MAX(co.diagnostico)) AS descripcion,
            COUNT(*) AS casos, COUNT(DISTINCT c.paciente_id) AS pacientes
     ${base} WHERE ${wc.sql}
     GROUP BY clave ORDER BY casos DESC, descripcion LIMIT 15`, wc.params
  );

  // Edad y género de cada consulta (se agrupa en JS para usar la edad real en la fecha de la consulta).
  const [personas] = await pool.query(
    `SELECT c.fecha, u.fecha_nacimiento, u.genero, ${claveDx} AS clave,
            COALESCE(dx.descripcion, co.diagnostico) AS descripcion, dx.codigo AS codigo
     ${base}
     JOIN paciente p ON p.id_paciente = c.paciente_id JOIN usuario u ON u.id_usuario = p.usuario_id
     WHERE ${wc.sql}`, wc.params
  );

  const generos = ['Femenino', 'Masculino', 'Otro / sin dato'];
  const edadGenero = GRUPOS_EDAD.map((grupo) => {
    const fila = { grupo, total: 0 };
    generos.forEach((g) => { fila[g] = 0; });
    return fila;
  });
  const topPorGrupo = new Map();

  personas.forEach((r) => {
    const grupo = grupoDeEdad(r.fecha_nacimiento, r.fecha);
    const genero = normalizarGenero(r.genero);
    const fila = edadGenero.find((e) => e.grupo === grupo);
    fila[genero] += 1;
    fila.total += 1;

    if (!topPorGrupo.has(grupo)) topPorGrupo.set(grupo, new Map());
    const m = topPorGrupo.get(grupo);
    const actual = m.get(r.clave) || { codigo: r.codigo, descripcion: r.descripcion, casos: 0 };
    actual.casos += 1;
    m.set(r.clave, actual);
  });

  const diagnosticosPorEdad = GRUPOS_EDAD
    .filter((g) => topPorGrupo.has(g))
    .map((g) => ({
      grupo: g,
      top: [...topPorGrupo.get(g).values()].sort((a, b) => b.casos - a.casos).slice(0, 3)
    }));

  // Diagnósticos más frecuentes por especialidad (top 3 de cada una).
  const [porEsp] = await pool.query(
    `SELECT e.nombre AS especialidad, ${claveDx} AS clave, MAX(dx.codigo) AS codigo,
            COALESCE(MAX(dx.descripcion), MAX(co.diagnostico)) AS descripcion, COUNT(*) AS casos
     ${base}
     JOIN doctor_especialidad de ON de.doctor_id = c.doctor_id
     JOIN especialidad e ON e.id_especialidad = de.especialidad_id
     WHERE ${wc.sql}
     GROUP BY e.id_especialidad, e.nombre, clave
     ORDER BY e.nombre, casos DESC`, wc.params
  );
  const mapaEsp = new Map();
  porEsp.forEach((r) => {
    if (!mapaEsp.has(r.especialidad)) mapaEsp.set(r.especialidad, []);
    const lista = mapaEsp.get(r.especialidad);
    if (lista.length < 3) lista.push({ codigo: r.codigo, descripcion: r.descripcion, casos: n(r.casos) });
  });

  // Incapacidades
  const [inc] = await pool.query(
    `SELECT COUNT(*) AS emitidas, COALESCE(SUM(im.dias_incapacidad), 0) AS dias, COALESCE(AVG(im.dias_incapacidad), 0) AS promedio
     FROM incapacidad_medica im
     JOIN consulta co ON co.id_consulta = im.consulta_id
     JOIN cita c ON c.id_cita = co.cita_id
     LEFT JOIN diagnostico_cie10 dx ON dx.codigo = co.diagnostico_codigo
     WHERE ${wc.sql}`, wc.params
  );
  const [incPorDx] = await pool.query(
    `SELECT ${claveDx} AS clave, MAX(dx.codigo) AS codigo, COALESCE(MAX(dx.descripcion), MAX(co.diagnostico)) AS descripcion,
            COUNT(*) AS emitidas, SUM(im.dias_incapacidad) AS dias
     FROM incapacidad_medica im
     JOIN consulta co ON co.id_consulta = im.consulta_id
     JOIN cita c ON c.id_cita = co.cita_id
     LEFT JOIN diagnostico_cie10 dx ON dx.codigo = co.diagnostico_codigo
     WHERE ${wc.sql}
     GROUP BY clave ORDER BY dias DESC LIMIT 5`, wc.params
  );

  const [examenes] = await pool.query(
    `SELECT te.nombre, COUNT(*) AS total
     FROM detalle_orden_examen dox
     JOIN orden_examen oe ON oe.id_orden = dox.orden_id
     JOIN consulta co ON co.id_consulta = oe.consulta_id
     JOIN cita c ON c.id_cita = co.cita_id
     JOIN tipo_examen te ON te.id_tipo_examen = dox.tipo_examen_id
     WHERE ${wc.sql} GROUP BY te.id_tipo_examen, te.nombre ORDER BY total DESC LIMIT 10`, wc.params
  );

  const [medicamentos] = await pool.query(
    `SELECT m.nombre, COUNT(*) AS total
     FROM detalle_formula df
     JOIN formula_medica fm ON fm.id_formula = df.formula_id
     JOIN consulta co ON co.id_consulta = fm.consulta_id
     JOIN cita c ON c.id_cita = co.cita_id
     JOIN medicamento m ON m.id_medicamento = df.medicamento_id
     WHERE ${wc.sql} GROUP BY m.id_medicamento, m.nombre ORDER BY total DESC LIMIT 10`, wc.params
  );

  return {
    consultas: n(totales[0].consultas),
    pacientes: n(totales[0].pacientes),
    topDiagnosticos: top.map((t) => ({
      codigo: t.codigo, descripcion: t.descripcion, casos: n(t.casos), pacientes: n(t.pacientes)
    })),
    edadGenero,
    diagnosticosPorEdad,
    porEspecialidad: [...mapaEsp.entries()].map(([especialidad, top3]) => ({ especialidad, top: top3 })),
    incapacidades: {
      emitidas: n(inc[0].emitidas),
      dias: n(inc[0].dias),
      promedio: Math.round(n(inc[0].promedio) * 10) / 10,
      porDiagnostico: incPorDx.map((i) => ({
        codigo: i.codigo, descripcion: i.descripcion, emitidas: n(i.emitidas), dias: n(i.dias)
      }))
    },
    examenes: examenes.map((e) => ({ nombre: e.nombre, total: n(e.total) })),
    medicamentos: medicamentos.map((m) => ({ nombre: m.nombre, total: n(m.total) }))
  };
}

// ============================================================
// 6. PACIENTES
// ============================================================
function contar(lista, extraer, maximo) {
  const mapa = new Map();
  lista.forEach((x) => {
    const clave = extraer(x) || 'Sin dato';
    mapa.set(clave, (mapa.get(clave) || 0) + 1);
  });
  let filas = [...mapa.entries()].map(([nombre, total]) => ({ nombre, total })).sort((a, b) => b.total - a.total);
  if (maximo && filas.length > maximo) {
    const resto = filas.slice(maximo).reduce((s, x) => s + x.total, 0);
    filas = [...filas.slice(0, maximo), { nombre: 'Otros', total: resto }];
  }
  return filas;
}

async function informePacientes(f) {
  const wc = dondeCita(f);

  const [atendidos] = await pool.query(
    `SELECT p.id_paciente, p.eps, u.genero, u.ciudad, u.fecha_nacimiento,
            (SELECT COUNT(*) FROM cita x WHERE x.paciente_id = p.id_paciente AND x.estado = 'atendida' AND x.fecha < ?) AS previas
     FROM cita c
     JOIN paciente p ON p.id_paciente = c.paciente_id
     JOIN usuario u ON u.id_usuario = p.usuario_id
     WHERE ${wc.sql} AND c.estado = 'atendida'
     GROUP BY p.id_paciente, p.eps, u.genero, u.ciudad, u.fecha_nacimiento`,
    [f.desde, ...wc.params]
  );

  const nuevos = atendidos.filter((a) => n(a.previas) === 0).length;

  const grupos = GRUPOS_EDAD.map((g) => ({ nombre: g, total: 0 }));
  atendidos.forEach((a) => { grupos.find((g) => g.nombre === grupoDeEdad(a.fecha_nacimiento, f.hasta)).total += 1; });

  const [registrados] = await pool.query(
    `SELECT COUNT(*) AS total FROM paciente p JOIN usuario u ON u.id_usuario = p.usuario_id
     WHERE DATE(u.fecha_registro) BETWEEN ? AND ?`, [f.desde, f.hasta]
  );
  const [totalPacientes] = await pool.query('SELECT COUNT(*) AS total FROM paciente');

  const [frecuentes] = await pool.query(
    `SELECT CONCAT(u.nombres, ' ', u.apellidos) AS nombre, COUNT(*) AS visitas, MAX(c.fecha) AS ultima
     FROM cita c
     JOIN paciente p ON p.id_paciente = c.paciente_id
     JOIN usuario u ON u.id_usuario = p.usuario_id
     WHERE ${wc.sql} AND c.estado = 'atendida'
     GROUP BY p.id_paciente, nombre ORDER BY visitas DESC, ultima DESC LIMIT 10`, wc.params
  );

  // Pacientes inactivos: ya se atendieron alguna vez, llevan 90 días o más sin venir y no tienen cita futura.
  const wi = dondeCita(f, { conFecha: false });
  const [inactivos] = await pool.query(
    `SELECT p.id_paciente, CONCAT(u.nombres, ' ', u.apellidos) AS nombre, u.telefono,
            MAX(c.fecha) AS ultima, COUNT(*) AS visitas, DATEDIFF(CURDATE(), MAX(c.fecha)) AS dias
     FROM cita c
     JOIN paciente p ON p.id_paciente = c.paciente_id
     JOIN usuario u ON u.id_usuario = p.usuario_id
     WHERE ${wi.sql} AND c.estado = 'atendida'
       AND NOT EXISTS (SELECT 1 FROM cita fut WHERE fut.paciente_id = p.id_paciente
                         AND fut.fecha >= CURDATE() AND fut.estado IN ('programada','confirmada','en_espera','en_atencion'))
     GROUP BY p.id_paciente, nombre, u.telefono
     HAVING ultima < DATE_SUB(CURDATE(), INTERVAL ${DIAS_INACTIVIDAD} DAY)
     ORDER BY ultima DESC`,
    wi.params
  );

  return {
    atendidos: atendidos.length,
    nuevos,
    recurrentes: atendidos.length - nuevos,
    registrados: n(registrados[0].total),
    totalPacientes: n(totalPacientes[0].total),
    porEdad: grupos.filter((g) => g.total > 0),
    porGenero: contar(atendidos, (a) => normalizarGenero(a.genero)),
    porCiudad: contar(atendidos, (a) => a.ciudad, 8),
    porEps: contar(atendidos, (a) => a.eps, 8),
    frecuentes: frecuentes.map((r) => ({ nombre: r.nombre, visitas: n(r.visitas), ultima: r.ultima })),
    inactivos: {
      diasUmbral: DIAS_INACTIVIDAD,
      total: inactivos.length,
      detalle: inactivos.slice(0, 20).map((i) => ({
        nombre: i.nombre, telefono: i.telefono, ultima: i.ultima, visitas: n(i.visitas), dias: n(i.dias)
      }))
    }
  };
}

// ============================================================
const INFORMES = {
  resumen: informeResumen,
  citas: informeCitas,
  financiero: informeFinanciero,
  doctores: informeDoctores,
  morbilidad: informeMorbilidad,
  pacientes: informePacientes
};

const obtenerInforme = async (req, res) => {
  const generador = INFORMES[req.params.tipo];
  if (!generador) return res.status(404).json({ mensaje: 'Ese informe no existe.' });

  const { filtros, error } = leerFiltros(req);
  if (error) return res.status(400).json({ mensaje: error });

  try {
    const datos = await generador(filtros);
    return res.json({ filtros, ...datos });
  } catch (err) {
    console.error(`Error en informe "${req.params.tipo}":`, err);
    return res.status(500).json({ mensaje: 'Error del servidor al generar el informe.' });
  }
};

module.exports = { obtenerInforme };