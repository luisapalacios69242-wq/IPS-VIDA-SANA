const PDFDocument = require('pdfkit');
const path = require('path');
const pool = require('../config/conexion');

const IPS = {
  nombre: 'Consultorio Vida Sana',
  eslogan: 'Institución Prestadora de Servicios de Salud (IPS privada)',
  direccion: 'Cra 78 B # 100 -13, Apartadó, Antioquia',
  telefono: '302 382 0480',
  correo: 'ipsvidasanamejoratusalud@gmail.com'
};

const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logo-icono.png');

const encabezado = (doc) => {
  const startY = doc.y;
  const textX = 100;

  try {
    doc.image(LOGO_PATH, 50, startY, { width: 40 });
  } catch (e) {
    // si el logo no está disponible, sigue sin romper el PDF
  }

  doc.fontSize(17).fillColor('#000000').font('Helvetica-Bold').text(IPS.nombre, textX, startY);
  doc.font('Helvetica').fontSize(9).fillColor('#333333').text(IPS.eslogan, textX);
  doc.fontSize(8.5).fillColor('#333333')
    .text(`${IPS.direccion}   ·   Tel: ${IPS.telefono}   ·   ${IPS.correo}`, textX);

  doc.y = Math.max(doc.y, startY + 42) + 10;
  doc.strokeColor('#000000').lineWidth(1)
    .moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
  doc.moveDown(1);
};

const categoriaIMC = (imc) => {
  if (imc < 18.5) return 'Bajo peso';
  if (imc < 25) return 'Normal';
  if (imc < 30) return 'Sobrepeso';
  if (imc < 35) return 'Obesidad grado I';
  if (imc < 40) return 'Obesidad grado II';
  return 'Obesidad grado III';
};

// Tabla en blanco y negro, con bordes tipo formato clínico (sin rellenos de color).
const dibujarTabla = (doc, { titulo, columnas, filas, mostrarCabecera = true }) => {
  const anchoTotal = doc.page.width - 100;
  const startX = doc.page.margins.left;
  const anchos = columnas.map(c => c.ancho || anchoTotal / columnas.length);
  const anchoReal = anchos.reduce((a, b) => a + b, 0);
  const padY = 6;
  const fsCabecera = 9.5;
  const fsFila = 9;
  const colorBorde = '#4b5563';
  const colorTexto = '#000000';

  if (titulo) {
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#000000').text(titulo);
    doc.font('Helvetica');
    doc.moveDown(0.3);
  }

  const lineasVerticales = (y, alto) => {
    let x = startX;
    doc.strokeColor(colorBorde).lineWidth(0.6);
    columnas.forEach((col, i) => {
      doc.moveTo(x, y).lineTo(x, y + alto).stroke();
      x += anchos[i];
    });
    doc.moveTo(x, y).lineTo(x, y + alto).stroke();
  };

  const dibujarCabecera = () => {
    const y = doc.y;
    const alto = 22;
    let x = startX;
    doc.font('Helvetica-Bold').fillColor('#000000').fontSize(fsCabecera);
    columnas.forEach((col, i) => {
      doc.text(col.titulo, x + 6, y + 6, { width: anchos[i] - 12 });
      x += anchos[i];
    });
    doc.font('Helvetica');
    doc.strokeColor(colorBorde).lineWidth(0.9);
    doc.moveTo(startX, y).lineTo(startX + anchoReal, y).stroke();
    doc.moveTo(startX, y + alto).lineTo(startX + anchoReal, y + alto).stroke();
    lineasVerticales(y, alto);
    doc.y = y + alto;
  };

  if (mostrarCabecera) dibujarCabecera();

  filas.forEach((fila) => {
    const alturas = columnas.map((col, i) =>
      doc.heightOfString(String(fila[i] ?? ''), { width: anchos[i] - 12, fontSize: fsFila })
    );
    const alturaFila = Math.max(...alturas) + padY * 2;

    if (doc.y + alturaFila > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      if (mostrarCabecera) dibujarCabecera();
    }

    const y = doc.y;
    let x = startX;
    doc.fillColor(colorTexto).fontSize(fsFila);
    columnas.forEach((col, i) => {
      doc.text(String(fila[i] ?? ''), x + 6, y + padY, { width: anchos[i] - 12 });
      x += anchos[i];
    });

    doc.strokeColor(colorBorde).lineWidth(0.6);
    doc.moveTo(startX, y + alturaFila).lineTo(startX + anchoReal, y + alturaFila).stroke();
    lineasVerticales(y, alturaFila);

    doc.y = y + alturaFila;
  });

  doc.moveDown(1);
};

const generarPdfHistoriaClinica = async (req, res) => {
  const { id_paciente } = req.params;

  try {
    const [pacienteRows] = await pool.query(
      `SELECT u.nombres, u.apellidos, u.numero_documento
       FROM paciente p JOIN usuario u ON u.id_usuario = p.usuario_id
       WHERE p.id_paciente = ?`,
      [id_paciente]
    );

    if (pacienteRows.length === 0) {
      return res.status(404).json({ mensaje: 'Paciente no encontrado.' });
    }

    const [historiaRows] = await pool.query(
      'SELECT * FROM historia_clinica WHERE paciente_id = ?',
      [id_paciente]
    );

    if (historiaRows.length === 0) {
      return res.status(404).json({ mensaje: 'Este paciente aún no tiene historia clínica registrada.' });
    }

    const [consultas] = await pool.query(
      `SELECT co.fecha_consulta, co.diagnostico, co.observaciones,
              ud.nombres AS doctor_nombres, ud.apellidos AS doctor_apellidos
       FROM consulta co
       JOIN cita c ON c.id_cita = co.cita_id
       JOIN doctor d ON d.id_doctor = c.doctor_id
       JOIN usuario ud ON ud.id_usuario = d.usuario_id
       WHERE co.historia_clinica_id = ?
       ORDER BY co.fecha_consulta DESC`,
      [historiaRows[0].id_historia]
    );

    const paciente = pacienteRows[0];
    const historia = historiaRows[0];

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=historia-clinica-${paciente.numero_documento}.pdf`);
    doc.pipe(res);

    encabezado(doc);
    doc.fontSize(15).fillColor('#000').text('Historia Clínica');
    doc.moveDown(0.6);

    dibujarTabla(doc, {
      titulo: 'Datos del paciente',
      columnas: [{ titulo: 'Campo', ancho: 160 }, { titulo: 'Detalle' }],
      filas: [
        ['Paciente', `${paciente.nombres} ${paciente.apellidos}`],
        ['Documento', paciente.numero_documento]
      ]
    });

    dibujarTabla(doc, {
      titulo: 'Datos base',
      columnas: [{ titulo: 'Campo', ancho: 160 }, { titulo: 'Detalle' }],
      filas: [
        ['Grupo sanguíneo', historia.grupo_sanguineo || 'No registrado'],
        ['Alergias', historia.alergias || 'No registradas'],
        ['Antecedentes personales', historia.antecedentes_personales || 'No registrados'],
        ['Antecedentes familiares', historia.antecedentes_familiares || 'No registrados']
      ]
    });

    doc.fontSize(12).fillColor('#185fa5').text('Consultas', { continued: false });
    doc.moveDown(0.3);

    if (consultas.length === 0) {
      doc.fontSize(11).fillColor('#000').text('Sin consultas registradas.');
    } else {
      dibujarTabla(doc, {
        columnas: [
          { titulo: 'Fecha', ancho: 90 },
          { titulo: 'Doctor(a)', ancho: 130 },
          { titulo: 'Diagnóstico', ancho: 140 },
          { titulo: 'Observaciones' }
        ],
        filas: consultas.map(c => [
          new Date(c.fecha_consulta).toLocaleString('es-CO'),
          `Dr(a). ${c.doctor_nombres} ${c.doctor_apellidos}`,
          c.diagnostico,
          c.observaciones || '—'
        ])
      });
    }

    doc.end();

  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({ mensaje: 'Error del servidor al generar el PDF.' });
    }
  }
};

const generarPdfOrdenExamen = async (req, res) => {
  const { id_orden } = req.params;

  try {
    const [ordenRows] = await pool.query(
      `SELECT oe.fecha,
              up.nombres AS paciente_nombres, up.apellidos AS paciente_apellidos, up.numero_documento,
              ud.nombres AS doctor_nombres, ud.apellidos AS doctor_apellidos
       FROM orden_examen oe
       JOIN consulta co ON co.id_consulta = oe.consulta_id
       JOIN cita c ON c.id_cita = co.cita_id
       JOIN paciente p ON p.id_paciente = c.paciente_id
       JOIN usuario up ON up.id_usuario = p.usuario_id
       JOIN doctor d ON d.id_doctor = c.doctor_id
       JOIN usuario ud ON ud.id_usuario = d.usuario_id
       WHERE oe.id_orden = ?`,
      [id_orden]
    );

    if (ordenRows.length === 0) {
      return res.status(404).json({ mensaje: 'Orden de examen no encontrada.' });
    }

    const [detalles] = await pool.query(
      `SELECT te.nombre AS tipo_examen, do.observaciones
       FROM detalle_orden_examen do
       JOIN tipo_examen te ON te.id_tipo_examen = do.tipo_examen_id
       WHERE do.orden_id = ?`,
      [id_orden]
    );

    const o = ordenRows[0];

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=orden-examen-${id_orden}.pdf`);
    doc.pipe(res);

    encabezado(doc);
    doc.fontSize(15).fillColor('#000').text('Orden de Examen');
    doc.moveDown(0.5);
    doc.fontSize(11);
    doc.text(`Paciente: ${o.paciente_nombres} ${o.paciente_apellidos}`);
    doc.text(`Documento: ${o.numero_documento}`);
    doc.text(`Fecha: ${o.fecha}`);
    doc.text(`Doctor: ${o.doctor_nombres} ${o.doctor_apellidos}`);
    doc.moveDown();
    doc.fontSize(12).text('Exámenes solicitados', { underline: true });
    doc.moveDown(0.3);

    detalles.forEach(d => {
      doc.fontSize(11).fillColor('#185fa5').text(d.tipo_examen);
      if (d.observaciones) doc.fillColor('#000').text(`Observaciones: ${d.observaciones}`);
      doc.moveDown(0.4);
    });

    doc.end();

  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({ mensaje: 'Error del servidor al generar el PDF.' });
    }
  }
};

const generarPdfFormula = async (req, res) => {
  const { id_formula } = req.params;

  try {
    const [formulaRows] = await pool.query(
      `SELECT f.fecha, up.nombres AS paciente_nombres, up.apellidos AS paciente_apellidos, up.numero_documento,
              ud.nombres AS doctor_nombres, ud.apellidos AS doctor_apellidos
       FROM formula_medica f
       JOIN consulta co ON co.id_consulta = f.consulta_id
       JOIN cita c ON c.id_cita = co.cita_id
       JOIN paciente p ON p.id_paciente = c.paciente_id
       JOIN usuario up ON up.id_usuario = p.usuario_id
       JOIN doctor d ON d.id_doctor = c.doctor_id
       JOIN usuario ud ON ud.id_usuario = d.usuario_id
       WHERE f.id_formula = ?`,
      [id_formula]
    );

    if (formulaRows.length === 0) {
      return res.status(404).json({ mensaje: 'Fórmula médica no encontrada.' });
    }

    const [detalles] = await pool.query(
      `SELECT m.nombre AS medicamento, df.dosis, df.frecuencia, df.duracion, df.indicaciones
       FROM detalle_formula df
       JOIN medicamento m ON m.id_medicamento = df.medicamento_id
       WHERE df.formula_id = ?`,
      [id_formula]
    );

    const f = formulaRows[0];

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=formula-medica-${id_formula}.pdf`);
    doc.pipe(res);

    encabezado(doc);
    doc.fontSize(15).fillColor('#000').text('Fórmula Médica');
    doc.moveDown(0.5);
    doc.fontSize(11);
    doc.text(`Paciente: ${f.paciente_nombres} ${f.paciente_apellidos}`);
    doc.text(`Documento: ${f.numero_documento}`);
    doc.text(`Fecha: ${f.fecha}`);
    doc.text(`Doctor: ${f.doctor_nombres} ${f.doctor_apellidos}`);
    doc.moveDown();
    doc.fontSize(12).text('Medicamentos formulados', { underline: true });
    doc.moveDown(0.3);

    detalles.forEach(d => {
      doc.fontSize(11).fillColor('#185fa5').text(d.medicamento);
      doc.fillColor('#000').text(`Dosis: ${d.dosis}${d.frecuencia ? ' · ' + d.frecuencia : ''}${d.duracion ? ' · ' + d.duracion : ''}`);
      if (d.indicaciones) doc.text(`Indicaciones: ${d.indicaciones}`);
      doc.moveDown(0.5);
    });

    doc.end();

  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({ mensaje: 'Error del servidor al generar el PDF.' });
    }
  }
};

const generarPdfResumenAtencion = async (req, res) => {
  const { id_consulta } = req.params;

  try {
    const [consultaRows] = await pool.query(
      `SELECT co.fecha_consulta, co.diagnostico, co.observaciones,
              co.peso, co.talla, co.presion_arterial, co.temperatura,
              co.frecuencia_cardiaca, co.frecuencia_respiratoria, co.examen_fisico,
              up.nombres AS paciente_nombres, up.apellidos AS paciente_apellidos, up.numero_documento,
              ud.nombres AS doctor_nombres, ud.apellidos AS doctor_apellidos
       FROM consulta co
       JOIN cita c ON c.id_cita = co.cita_id
       JOIN paciente p ON p.id_paciente = c.paciente_id
       JOIN usuario up ON up.id_usuario = p.usuario_id
       JOIN doctor d ON d.id_doctor = c.doctor_id
       JOIN usuario ud ON ud.id_usuario = d.usuario_id
       WHERE co.id_consulta = ?`,
      [id_consulta]
    );

    if (consultaRows.length === 0) {
      return res.status(404).json({ mensaje: 'Consulta no encontrada.' });
    }

    const co = consultaRows[0];

    const [examenesRows] = await pool.query(
      `SELECT te.nombre AS tipo_examen, do.observaciones
       FROM orden_examen oe
       JOIN detalle_orden_examen do ON do.orden_id = oe.id_orden
       JOIN tipo_examen te ON te.id_tipo_examen = do.tipo_examen_id
       WHERE oe.consulta_id = ?`,
      [id_consulta]
    );

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=resumen-atencion-${id_consulta}.pdf`);
    doc.pipe(res);

    encabezado(doc);
    doc.fontSize(15).fillColor('#000').text('Resumen de Atención');
    doc.moveDown(0.5);
    doc.fontSize(11);
    doc.text(`Paciente: ${co.paciente_nombres} ${co.paciente_apellidos}`);
    doc.text(`Documento: ${co.numero_documento}`);
    doc.text(`Fecha: ${co.fecha_consulta}`);
    doc.text(`Doctor: ${co.doctor_nombres} ${co.doctor_apellidos}`);
    doc.moveDown();

    doc.fontSize(13).fillColor('#185fa5').text('Atención general', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor('#000');

    const peso = co.peso !== null ? Number(co.peso) : null;
    const talla = co.talla !== null ? Number(co.talla) : null;
    let lineaImc = 'No registrado (falta peso o talla)';

    if (peso && talla) {
      const tallaMetros = talla / 100;
      const imc = peso / (tallaMetros * tallaMetros);
      lineaImc = `${imc.toFixed(1)} (${categoriaIMC(imc)})`;
    }

    doc.text(`Peso: ${peso ? peso + ' kg' : 'No registrado'}`);
    doc.text(`Talla: ${talla ? talla + ' cm' : 'No registrada'}`);
    doc.text(`IMC: ${lineaImc}`);
    doc.text(`Presión arterial: ${co.presion_arterial || 'No registrada'}`);
    doc.text(`Temperatura: ${co.temperatura !== null ? co.temperatura + ' °C' : 'No registrada'}`);
    doc.text(`Frecuencia cardíaca: ${co.frecuencia_cardiaca !== null ? co.frecuencia_cardiaca + ' lpm' : 'No registrada'}`);
    doc.text(`Frecuencia respiratoria: ${co.frecuencia_respiratoria !== null ? co.frecuencia_respiratoria + ' rpm' : 'No registrada'}`);
    doc.moveDown(0.4);

    if (co.examen_fisico) {
      doc.text('Examen físico:');
      doc.text(co.examen_fisico);
      doc.moveDown(0.4);
    }

    doc.text(`Diagnóstico: ${co.diagnostico}`);
    if (co.observaciones) doc.text(`Observaciones: ${co.observaciones}`);
    doc.moveDown();

    doc.fontSize(13).fillColor('#185fa5').text('Ayudas diagnósticas', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor('#000');

    if (examenesRows.length === 0) {
      doc.text('No se ordenaron exámenes en esta consulta.');
    } else {
      examenesRows.forEach(e => {
        doc.fillColor('#185fa5').text(e.tipo_examen);
        if (e.observaciones) doc.fillColor('#000').text(`Observaciones: ${e.observaciones}`);
        doc.moveDown(0.3);
      });
    }

    doc.end();

  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({ mensaje: 'Error del servidor al generar el PDF.' });
    }
  }
};

const generarPdfFactura = async (req, res) => {
  const { id_factura } = req.params;

  try {
    const [rows] = await pool.query(
      `SELECT f.numero_factura, f.fecha, f.valor, f.forma_pago, f.estado,
              s.nombre AS servicio_nombre,
              up.nombres AS paciente_nombres, up.apellidos AS paciente_apellidos, up.numero_documento,
              ud.nombres AS doctor_nombres, ud.apellidos AS doctor_apellidos,
              us.nombres AS secretaria_nombres, us.apellidos AS secretaria_apellidos
       FROM factura f
       JOIN servicio s ON s.id_servicio = f.servicio_id
       JOIN consulta co ON co.id_consulta = f.consulta_id
       JOIN cita c ON c.id_cita = co.cita_id
       JOIN paciente p ON p.id_paciente = c.paciente_id
       JOIN usuario up ON up.id_usuario = p.usuario_id
       JOIN doctor d ON d.id_doctor = c.doctor_id
       JOIN usuario ud ON ud.id_usuario = d.usuario_id
       JOIN secretaria se ON se.id_secretaria = f.secretaria_id
       JOIN usuario us ON us.id_usuario = se.usuario_id
       WHERE f.id_factura = ?`,
      [id_factura]
    );

    if (rows.length === 0) {
      return res.status(404).json({ mensaje: 'Factura no encontrada.' });
    }

    const f = rows[0];

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${f.numero_factura}.pdf`);
    doc.pipe(res);

    encabezado(doc);
    doc.fontSize(15).fillColor('#000').text('Factura de Servicios');
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#5f5e5a').text('Documento sin validez fiscal (no constituye factura electrónica DIAN). Uso interno del consultorio.');
    doc.moveDown(0.7);
    doc.fontSize(11).fillColor('#000');
    doc.text(`Número: ${f.numero_factura}`);
    doc.text(`Fecha: ${f.fecha}`);
    doc.moveDown();
    doc.text(`Paciente: ${f.paciente_nombres} ${f.paciente_apellidos}`);
    doc.text(`Documento: ${f.numero_documento}`);
    doc.text(`Atendido por: Dr(a). ${f.doctor_nombres} ${f.doctor_apellidos}`);
    doc.moveDown();
    doc.fontSize(12).text('Detalle', { underline: true });
    doc.fontSize(11);
    doc.text(`Servicio: ${f.servicio_nombre}`);
    doc.text(`Valor: $${Number(f.valor).toLocaleString('es-CO')}`);
    doc.moveDown();
    doc.text(`Estado: ${f.estado === 'pagada' ? 'Pagada' : 'Pendiente de pago'}`);
    doc.text(`Forma de pago: ${f.forma_pago || 'No registrada'}`);
    doc.moveDown();
    doc.fontSize(9).fillColor('#5f5e5a').text(`Generada por: ${f.secretaria_nombres} ${f.secretaria_apellidos}`);

    doc.end();

  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({ mensaje: 'Error del servidor al generar el PDF.' });
    }
  }
};

const generarPdfIncapacidad = async (req, res) => {
  const { id_incapacidad } = req.params;

  try {
    const [rows] = await pool.query(
      `SELECT im.fecha_inicio, im.fecha_fin, im.dias_incapacidad, im.motivo,
              up.nombres AS paciente_nombres, up.apellidos AS paciente_apellidos, up.numero_documento,
              ud.nombres AS doctor_nombres, ud.apellidos AS doctor_apellidos, d.tarjeta_profesional
       FROM incapacidad_medica im
       JOIN consulta co ON co.id_consulta = im.consulta_id
       JOIN cita c ON c.id_cita = co.cita_id
       JOIN paciente p ON p.id_paciente = c.paciente_id
       JOIN usuario up ON up.id_usuario = p.usuario_id
       JOIN doctor d ON d.id_doctor = c.doctor_id
       JOIN usuario ud ON ud.id_usuario = d.usuario_id
       WHERE im.id_incapacidad = ?`,
      [id_incapacidad]
    );

    if (rows.length === 0) {
      return res.status(404).json({ mensaje: 'Incapacidad médica no encontrada.' });
    }

    const i = rows[0];

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=incapacidad-medica-${id_incapacidad}.pdf`);
    doc.pipe(res);

    encabezado(doc);
    doc.fontSize(15).fillColor('#000').text('Incapacidad Médica');
    doc.moveDown(0.5);
    doc.fontSize(11);
    doc.text(`Paciente: ${i.paciente_nombres} ${i.paciente_apellidos}`);
    doc.text(`Documento: ${i.numero_documento}`);
    doc.moveDown();

    doc.fontSize(12).text('Detalle de la incapacidad', { underline: true });
    doc.fontSize(11);
    doc.text(`Fecha de inicio: ${i.fecha_inicio}`);
    doc.text(`Fecha de finalización: ${i.fecha_fin}`);
    doc.text(`Días de incapacidad: ${i.dias_incapacidad}`);
    doc.moveDown(0.4);
    doc.text('Motivo:');
    doc.text(i.motivo);
    doc.moveDown();

    doc.fontSize(9).fillColor('#5f5e5a')
      .text(`Expedida por: Dr(a). ${i.doctor_nombres} ${i.doctor_apellidos} — T.P. ${i.tarjeta_profesional}`);

    doc.end();

  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({ mensaje: 'Error del servidor al generar el PDF.' });
    }
  }
};

module.exports = {
  generarPdfHistoriaClinica, generarPdfOrdenExamen, generarPdfFormula, generarPdfResumenAtencion,
  generarPdfFactura, generarPdfIncapacidad
};