// ============================================================
// Exportación de informes a Excel (.xlsx)
// GET /api/admin/informes/:tipo/excel?desde=&hasta=&doctor=&especialidad=
// ============================================================
const ExcelJS = require('exceljs');
const pool = require('../config/conexion');
const { INFORMES, leerFiltros } = require('./informeController');

const TITULOS = {
  resumen: 'Resumen ejecutivo',
  citas: 'Citas y asistencia',
  financiero: 'Informe financiero',
  doctores: 'Doctores y especialidades',
  morbilidad: 'Morbilidad y diagnósticos (CIE-10)',
  pacientes: 'Pacientes',
  consultas: 'Consultas atendidas',
  diagnosticos: 'Diagnósticos',
  especialidades: 'Especialidades'
};

const NOMBRE_ESTADO = {
  programada: 'Programada', confirmada: 'Confirmada', en_espera: 'En espera', en_atencion: 'Atendiendo',
  atendida: 'Atendida', cancelada: 'Cancelada', no_asistida: 'No asistida'
};
const ESTADO_FACTURA = { pagada: 'Pagada', pendiente: 'Pendiente' };

// ---------- Formatos de columna ----------
const FMT_ENTERO = '#,##0';
const FMT_DINERO = '"$"#,##0';
const FMT_PORC = '0.0';

const txt = (h, w = 22) => ({ h, w });
const ent = (h, w = 14) => ({ h, w, fmt: FMT_ENTERO });
const din = (h, w = 16) => ({ h, w, fmt: FMT_DINERO });
const por = (h, w = 14) => ({ h, w, fmt: FMT_PORC });

const dr = (nombre) => `Dr(a). ${nombre}`;

// ---------- Construcción de hojas ----------
function agregarHoja(libro, { nombre, cols, filas }) {
  const hoja = libro.addWorksheet(nombre.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
  hoja.columns = cols.map((c) => ({ header: c.h, width: c.w || 20 }));

  const cabecera = hoja.getRow(1);
  cabecera.height = 22;
  cabecera.eachCell((celda) => {
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF185FA5' } };
    celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  filas.forEach((fila) => {
    const r = hoja.addRow(fila.map((v) => (v && typeof v === 'object' && 'v' in v ? v.v : v)));
    fila.forEach((v, i) => {
      const celda = r.getCell(i + 1);
      const fmt = v && typeof v === 'object' && 'fmt' in v ? v.fmt : cols[i].fmt;
      if (fmt && typeof celda.value === 'number') celda.numFmt = fmt;
      celda.border = { bottom: { style: 'hair', color: { argb: 'FFCBD5E1' } } };
    });
  });

  if (filas.length) hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return hoja;
}

function hojaInformacion(libro, tipo, f, nombres) {
  const hoja = libro.addWorksheet('Información');
  hoja.columns = [{ width: 26 }, { width: 60 }];
  const filas = [
    ['Consultorio Vida Sana', ''],
    ['Informe', TITULOS[tipo]],
    ['Periodo', `${f.desde} a ${f.hasta}`],
    ['Doctor', nombres.doctor || 'Todos los doctores'],
    ['Especialidad', nombres.especialidad || 'Todas las especialidades'],
    ['Generado el', new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })]
  ];
  filas.forEach((fila, i) => {
    const r = hoja.addRow(fila);
    r.getCell(1).font = { bold: true, size: i === 0 ? 14 : 11, color: { argb: 'FF185FA5' } };
  });
  return hoja;
}

async function nombresDeFiltros(f) {
  const salida = {};
  if (f.doctor) {
    const [r] = await pool.query(
      `SELECT CONCAT(u.nombres, ' ', u.apellidos) AS nombre FROM doctor d JOIN usuario u ON u.id_usuario = d.usuario_id WHERE d.id_doctor = ?`, [f.doctor]
    );
    if (r[0]) salida.doctor = dr(r[0].nombre);
  }
  if (f.especialidad) {
    const [r] = await pool.query('SELECT nombre FROM especialidad WHERE id_especialidad = ?', [f.especialidad]);
    if (r[0]) salida.especialidad = r[0].nombre;
  }
  return salida;
}

// ---------- Hojas de cada informe ----------
const CONSTRUCTORES = {
  resumen: (d) => {
    const a = d.actual;
    const p = d.anterior;
    const fila = (nombre, clave, fmt) => [nombre, { v: a[clave], fmt }, { v: p[clave], fmt }];
    return [
      {
        nombre: 'Indicadores',
        cols: [txt('Indicador', 30), txt('Periodo actual', 18), txt('Periodo anterior', 18)],
        filas: [
          ['Periodo', `${d.periodo.desde} a ${d.periodo.hasta}`, `${d.periodoAnterior.desde} a ${d.periodoAnterior.hasta}`],
          fila('Citas', 'citas', FMT_ENTERO),
          fila('Atendidas', 'atendidas', FMT_ENTERO),
          fila('No asistidas', 'noAsistidas', FMT_ENTERO),
          fila('Canceladas', 'canceladas', FMT_ENTERO),
          fila('Tasa de asistencia (%)', 'tasaAsistencia', FMT_PORC),
          fila('Tasa de inasistencia (%)', 'tasaInasistencia', FMT_PORC),
          fila('Tasa de cancelación (%)', 'tasaCancelacion', FMT_PORC),
          fila('Pacientes atendidos', 'pacientesAtendidos', FMT_ENTERO),
          fila('Pacientes nuevos', 'pacientesNuevos', FMT_ENTERO),
          fila('Ingresos recaudados', 'recaudado', FMT_DINERO),
          fila('Cartera pendiente', 'cartera', FMT_DINERO),
          fila('Ticket promedio', 'ticketPromedio', FMT_DINERO),
          ['Ocupación de agenda (%)', { v: a.ocupacion, fmt: FMT_PORC }, '—']
        ]
      },
      {
        nombre: 'Tendencia',
        cols: [txt('Periodo', 14), ent('Citas'), ent('Atendidas'), ent('No asistidas'), ent('Canceladas'), din('Ingresos')],
        filas: d.tendencia.map((t) => [t.periodo, t.total, t.atendidas, t.no_asistidas, t.canceladas, t.ingresos])
      }
    ];
  },

  citas: (d) => [
    {
      nombre: 'Por estado',
      cols: [txt('Estado'), ent('Citas')],
      filas: d.porEstado.map((e) => [NOMBRE_ESTADO[e.estado] || e.estado, e.total])
    },
    { nombre: 'Por tipo', cols: [txt('Tipo de cita', 30), ent('Citas')], filas: d.porTipo.map((t) => [t.tipo, t.total]) },
    { nombre: 'Por día', cols: [txt('Día'), ent('Citas'), ent('No asistidas')], filas: d.porDia.map((x) => [x.dia, x.total, x.noAsistidas]) },
    {
      nombre: 'Por hora',
      cols: [txt('Hora'), ent('Citas'), ent('No asistidas')],
      filas: d.porHora.map((x) => [`${String(x.hora).padStart(2, '0')}:00`, x.total, x.noAsistidas])
    },
    {
      nombre: 'Ocupación de agenda',
      cols: [txt('Doctor', 30), ent('Cupos ofrecidos'), ent('Citas agendadas'), por('Ocupación %')],
      filas: d.ocupacion.map((o) => [dr(o.doctor), o.capacidad, o.agendadas, o.ocupacion])
    }
  ],

  financiero: (d) => {
    const t = d.totales;
    const filasFin = (lista) => lista.map((x) => [x.nombre, x.cantidad, x.facturado, x.recaudado]);
    const colsFin = (primera) => [txt(primera, 30), ent('Cantidad'), din('Facturado'), din('Recaudado')];
    return [
      {
        nombre: 'Totales',
        cols: [txt('Indicador', 30), txt('Valor', 20)],
        filas: [
          ['Facturas emitidas', { v: t.facturas, fmt: FMT_ENTERO }],
          ['Facturas pagadas', { v: t.pagadas, fmt: FMT_ENTERO }],
          ['Facturas pendientes', { v: t.pendientes, fmt: FMT_ENTERO }],
          ['Total facturado', { v: t.facturado, fmt: FMT_DINERO }],
          ['Ingresos recaudados', { v: t.recaudado, fmt: FMT_DINERO }],
          ['Por cobrar (periodo)', { v: t.porCobrar, fmt: FMT_DINERO }],
          ['Tasa de recaudo (%)', { v: t.tasaRecaudo, fmt: FMT_PORC }],
          ['Ticket promedio', { v: t.ticketPromedio, fmt: FMT_DINERO }],
          ['Cartera total a hoy', { v: d.cartera.total, fmt: FMT_DINERO }]
        ]
      },
      {
        nombre: 'Ingresos en el tiempo',
        cols: [txt('Periodo', 14), din('Recaudado'), din('Pendiente')],
        filas: d.serie.map((s) => [s.periodo, s.recaudado, s.pendiente])
      },
      { nombre: 'Por servicio', cols: colsFin('Servicio'), filas: filasFin(d.porServicio) },
      { nombre: 'Por especialidad', cols: colsFin('Especialidad'), filas: filasFin(d.porEspecialidad) },
      { nombre: 'Por doctor', cols: colsFin('Doctor'), filas: filasFin(d.porDoctor.map((x) => ({ ...x, nombre: dr(x.nombre) }))) },
      {
        nombre: 'Forma de pago',
        cols: [txt('Forma de pago', 26), ent('Pagos'), din('Total')],
        filas: d.porFormaPago.map((x) => [x.forma, x.cantidad, x.total])
      },
      {
        nombre: 'Cartera por antigüedad',
        cols: [txt('Tramo', 22), ent('Facturas'), din('Valor')],
        filas: d.cartera.tramos.map((x) => [x.tramo, x.facturas, x.valor])
      },
      {
        nombre: 'Facturas pendientes',
        cols: [txt('Factura', 18), txt('Paciente', 30), txt('Emitida', 14), ent('Días'), din('Valor')],
        filas: d.cartera.masAntiguas.map((c) => [c.numero, c.paciente, c.fecha, c.dias, c.valor])
      },
      {
        nombre: 'Atenciones sin facturar',
        cols: [txt('Fecha', 14), txt('Hora', 10), txt('Paciente', 30), txt('Doctor', 30)],
        filas: d.sinFacturar.detalle.map((s) => [s.fecha, s.hora, s.paciente, dr(s.doctor)])
      }
    ];
  },

  doctores: (d) => [
    {
      nombre: 'Doctores',
      cols: [txt('Doctor', 30), txt('Especialidades', 30), ent('Citas'), ent('Atendidas'), ent('No asistidas'), ent('Canceladas'),
        ent('Pacientes únicos'), por('Asistencia %'), din('Recaudado'), por('Ocupación %')],
      filas: d.doctores.map((x) => [dr(x.nombre), x.especialidades, x.citas, x.atendidas, x.noAsistidas, x.canceladas,
        x.pacientes, x.tasaAsistencia, x.ingresos, x.capacidad ? x.ocupacion : null])
    },
    {
      nombre: 'Especialidades',
      cols: [txt('Especialidad', 28), ent('Citas'), ent('Atendidas'), ent('No asistidas'), ent('Pacientes únicos'), por('Asistencia %'), din('Recaudado')],
      filas: d.especialidades.map((e) => [e.nombre, e.citas, e.atendidas, e.noAsistidas, e.pacientes, e.tasaAsistencia, e.ingresos])
    }
  ],

  morbilidad: (d) => {
    const etiquetaDx = (x) => (x.codigo ? `${x.codigo} · ${x.descripcion}` : x.descripcion || 'Sin diagnóstico');
    const planoPorEsp = [];
    d.porEspecialidad.forEach((g) => g.top.forEach((x, i) => planoPorEsp.push([g.especialidad, i + 1, x.codigo || '—', x.descripcion || '—', x.casos])));
    return [
      {
        nombre: 'Diagnósticos',
        cols: [ent('#', 6), txt('Código', 12), txt('Diagnóstico', 50), ent('Casos'), ent('Pacientes'), por('% de consultas')],
        filas: d.topDiagnosticos.map((x, i) => [i + 1, x.codigo || '—', x.descripcion || 'Sin diagnóstico', x.casos, x.pacientes,
          d.consultas ? Math.round((x.casos / d.consultas) * 1000) / 10 : null])
      },
      {
        nombre: 'Edad y género',
        cols: [txt('Grupo de edad', 22), ent('Femenino'), ent('Masculino'), ent('Otro / sin dato'), ent('Total')],
        filas: d.edadGenero.filter((e) => e.total > 0).map((e) => [e.grupo, e.Femenino, e.Masculino, e['Otro / sin dato'], e.total])
      },
      {
        nombre: 'Dx por especialidad',
        cols: [txt('Especialidad', 26), ent('Posición', 10), txt('Código', 12), txt('Diagnóstico', 50), ent('Casos')],
        filas: planoPorEsp
      },
      {
        nombre: 'Incapacidades',
        cols: [txt('Diagnóstico', 56), ent('Emitidas'), ent('Días')],
        filas: d.incapacidades.porDiagnostico.map((x) => [etiquetaDx(x), x.emitidas, x.dias])
      },
      { nombre: 'Exámenes', cols: [txt('Examen', 40), ent('Órdenes')], filas: d.examenes.map((e) => [e.nombre, e.total]) },
      { nombre: 'Medicamentos', cols: [txt('Medicamento', 40), ent('Veces formulado')], filas: d.medicamentos.map((m) => [m.nombre, m.total]) }
    ];
  },

  pacientes: (d) => {
    const lista = (nombre, titulo, arr) => ({ nombre, cols: [txt(titulo, 30), ent('Pacientes')], filas: arr.map((x) => [x.nombre, x.total]) });
    return [
      {
        nombre: 'Resumen',
        cols: [txt('Indicador', 32), ent('Valor')],
        filas: [
          ['Pacientes atendidos', d.atendidos], ['Primera vez', d.nuevos], ['Recurrentes', d.recurrentes],
          ['Nuevos registros en el periodo', d.registrados], ['Pacientes en la base', d.totalPacientes],
          [`Inactivos (más de ${d.inactivos.diasUmbral} días)`, d.inactivos.total]
        ]
      },
      lista('Por edad', 'Grupo de edad', d.porEdad),
      lista('Por género', 'Género', d.porGenero),
      lista('Por ciudad', 'Ciudad', d.porCiudad),
      lista('Por EPS', 'EPS', d.porEps),
      {
        nombre: 'Más frecuentes',
        cols: [txt('Paciente', 34), ent('Visitas'), txt('Última visita', 16)],
        filas: d.frecuentes.map((p) => [p.nombre, p.visitas, p.ultima])
      },
      {
        nombre: 'Inactivos',
        cols: [txt('Paciente', 34), txt('Teléfono', 16), txt('Última visita', 16), ent('Días sin venir'), ent('Visitas previas')],
        filas: d.inactivos.detalle.map((p) => [p.nombre, p.telefono || '—', p.ultima, p.dias, p.visitas])
      }
    ];
  },

  consultas: (d) => [
    {
      nombre: 'Por doctor',
      cols: [txt('Doctor', 30), txt('Especialidades', 30), ent('Consultas'), ent('Pacientes únicos'), din('Recaudado'), ent('Sin facturar'), txt('Diagnóstico más frecuente', 46)],
      filas: d.porDoctor.map((x) => [dr(x.nombre), x.especialidades, x.consultas, x.pacientes, x.recaudado, x.sinFacturar,
        x.diagnosticoFrecuente ? `${x.diagnosticoFrecuente.codigo ? x.diagnosticoFrecuente.codigo + ' · ' : ''}${x.diagnosticoFrecuente.descripcion} (${x.diagnosticoFrecuente.casos})` : '—'])
    },
    {
      nombre: 'Por especialidad',
      cols: [txt('Especialidad', 28), ent('Consultas'), ent('Pacientes únicos'), ent('Doctores'), din('Recaudado'), txt('Diagnóstico más frecuente', 46)],
      filas: d.porEspecialidad.map((x) => [x.nombre, x.consultas, x.pacientes, x.doctores, x.recaudado,
        x.diagnosticoFrecuente ? `${x.diagnosticoFrecuente.codigo ? x.diagnosticoFrecuente.codigo + ' · ' : ''}${x.diagnosticoFrecuente.descripcion} (${x.diagnosticoFrecuente.casos})` : '—'])
    },
    {
      nombre: 'Detalle de consultas',
      cols: [txt('Fecha', 13), txt('Hora', 8), txt('Doctor', 30), txt('Especialidad', 24), txt('Paciente', 30), txt('Servicio', 28),
        txt('Código CIE-10', 14), txt('Diagnóstico', 44), din('Valor'), txt('Estado factura', 16)],
      filas: d.detalle.map((r) => [r.fecha, r.hora, dr(r.doctor), r.especialidad, r.paciente, r.servicio, r.codigo || '—',
        r.diagnostico || 'Sin diagnóstico', r.valor, ESTADO_FACTURA[r.estado_factura] || 'Sin facturar'])
    }
  ],

  diagnosticos: (d) => [
    {
      nombre: 'Diagnósticos',
      cols: [ent('#', 6), txt('Código', 12), txt('Diagnóstico', 50), txt('Capítulo CIE-10', 44), ent('Casos'), por('% del total'), ent('Pacientes'),
        ent('Doctores'), ent('Femenino'), ent('Masculino'), ent('Otro / sin dato'), txt('Especialidad principal', 24)],
      filas: d.diagnosticos.map((x, i) => [i + 1, x.codigo || '—', x.descripcion, x.capitulo, x.casos, x.porcentaje, x.pacientes,
        x.doctores, x.femenino, x.masculino, x.otro, x.especialidadPrincipal])
    },
    {
      nombre: 'Capítulos CIE-10',
      cols: [txt('Capítulo', 56), ent('Casos'), por('% del total'), ent('Diagnósticos distintos')],
      filas: d.capitulos.map((c) => [c.capitulo, c.casos, c.porcentaje, c.distintos])
    },
    {
      nombre: 'Por especialidad',
      cols: [txt('Especialidad', 26), ent('Consultas'), ent('Dx distintos'), ent('Posición', 10), txt('Código', 12), txt('Diagnóstico', 50), ent('Casos')],
      filas: d.porEspecialidad.flatMap((g) => g.top.map((x, i) => [g.especialidad, g.consultas, g.distintos, i + 1, x.codigo || '—', x.descripcion, x.casos]))
    },
    {
      nombre: 'Por doctor',
      cols: [txt('Doctor', 30), txt('Especialidades', 28), ent('Consultas'), ent('Dx distintos'), ent('Posición', 10), txt('Código', 12), txt('Diagnóstico', 50), ent('Casos')],
      filas: d.porDoctor.flatMap((g) => g.top.map((x, i) => [dr(g.doctor), g.especialidades, g.consultas, g.distintos, i + 1, x.codigo || '—', x.descripcion, x.casos]))
    },
    {
      nombre: 'Tendencia mensual',
      cols: [txt('Mes', 12), ...d.tendencia.series.map((s) => ent(s.nombre.slice(0, 40), 24))],
      filas: d.tendencia.periodos.map((p, i) => [p, ...d.tendencia.series.map((s) => s.datos[i])])
    }
  ],

  especialidades: (d) => [
    {
      nombre: 'Especialidades',
      cols: [txt('Especialidad', 26), ent('Citas'), ent('Atendidas'), ent('No asistidas'), ent('Canceladas'), por('Inasistencia %'),
        ent('Consultas'), ent('Pacientes únicos'), txt('Doctores', 40), din('Facturado'), din('Recaudado'), din('Ticket promedio'), por('% de ingresos')],
      filas: d.especialidades.map((e) => [e.nombre, e.citas, e.atendidas, e.noAsistidas, e.canceladas, e.tasaInasistencia,
        e.consultas, e.pacientes, e.doctores.map(dr).join(', ') || '—', e.facturado, e.recaudado, e.ticketPromedio, e.porcentajeIngresos])
    },
    {
      nombre: 'Diagnósticos',
      cols: [txt('Especialidad', 26), ent('Posición', 10), txt('Código', 12), txt('Diagnóstico', 50), ent('Casos')],
      filas: d.especialidades.flatMap((e) => e.diagnosticos.map((x, i) => [e.nombre, i + 1, x.codigo || '—', x.descripcion, x.casos]))
    },
    {
      nombre: 'Servicios prestados',
      cols: [txt('Especialidad', 26), txt('Servicio', 34), ent('Cantidad'), din('Recaudado')],
      filas: d.especialidades.flatMap((e) => e.servicios.map((s) => [e.nombre, s.nombre, s.cantidad, s.recaudado]))
    }
  ]
};

// ---------- Controlador ----------
const exportarInformeExcel = async (req, res) => {
  const tipo = req.params.tipo;
  const generador = INFORMES[tipo];
  const constructor = CONSTRUCTORES[tipo];
  if (!generador || !constructor) return res.status(404).json({ mensaje: 'Ese informe no existe.' });

  const { filtros, error } = leerFiltros(req);
  if (error) return res.status(400).json({ mensaje: error });

  try {
    const datos = await generador(filtros, { completo: true });
    const nombres = await nombresDeFiltros(filtros);

    const libro = new ExcelJS.Workbook();
    libro.creator = 'Consultorio Vida Sana';
    libro.created = new Date();

    hojaInformacion(libro, tipo, filtros, nombres);
    constructor(datos).forEach((hoja) => agregarHoja(libro, {
      ...hoja,
      filas: hoja.filas.map((fila) => fila.map((v) => (v === undefined ? null : v)))
    }));

    const nombreArchivo = `informe-${tipo}-${filtros.desde}_a_${filtros.hasta}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    await libro.xlsx.write(res);
    return res.end();
  } catch (err) {
    console.error(`Error exportando informe "${tipo}" a Excel:`, err);
    if (!res.headersSent) return res.status(500).json({ mensaje: 'No se pudo generar el archivo de Excel.' });
    return res.end();
  }
};

module.exports = { exportarInformeExcel };