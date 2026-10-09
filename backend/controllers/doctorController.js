const pool = require('../config/conexion');

const agendaDelDoctor = async (req, res) => {
  const { id_doctor } = req.params;
  const { fecha } = req.query;

  if (!fecha) {
    return res.status(400).json({ mensaje: 'Debes indicar la fecha (YYYY-MM-DD).' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT c.id_cita, c.paciente_id, c.hora, c.tipo, c.estado,
              up.nombres AS paciente_nombres, up.apellidos AS paciente_apellidos
       FROM cita c
       JOIN paciente p ON p.id_paciente = c.paciente_id
       JOIN usuario up ON up.id_usuario = p.usuario_id
       WHERE c.doctor_id = ? AND c.fecha = ?
       ORDER BY c.hora`,
      [id_doctor, fecha]
    );
    return res.json(rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al consultar la agenda.' });
  }
};

const atenderConsulta = async (req, res) => {
  const { id_cita } = req.params;
  const {
    diagnostico, observaciones,
    peso, talla, presion_arterial, temperatura,
    frecuencia_cardiaca, frecuencia_respiratoria, examen_fisico
  } = req.body;

  if (!diagnostico) {
    return res.status(400).json({ mensaje: 'El diagnóstico es obligatorio.' });
  }

  const conexion = await pool.getConnection();

  try {
    const [citaRows] = await conexion.query(
      'SELECT paciente_id, estado FROM cita WHERE id_cita = ?',
      [id_cita]
    );

    if (citaRows.length === 0) {
      conexion.release();
      return res.status(404).json({ mensaje: 'La cita no existe.' });
    }

    if (!['en_espera', 'en_atencion'].includes(citaRows[0].estado)) {
      conexion.release();
      return res.status(409).json({
        mensaje: `La cita está en estado '${citaRows[0].estado}'. Solo se puede atender una cita que esté en espera o en atención.`
      });
    }

    const [historiaRows] = await conexion.query(
      'SELECT id_historia FROM historia_clinica WHERE paciente_id = ?',
      [citaRows[0].paciente_id]
    );

    if (historiaRows.length === 0) {
      conexion.release();
      return res.status(409).json({ mensaje: 'El paciente aún no tiene historia clínica registrada. Regístrala antes de atender la consulta.' });
    }

    await conexion.beginTransaction();

    const [resultadoConsulta] = await conexion.query(
      `INSERT INTO consulta
        (cita_id, historia_clinica_id, diagnostico, observaciones,
         peso, talla, presion_arterial, temperatura,
         frecuencia_cardiaca, frecuencia_respiratoria, examen_fisico)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id_cita, historiaRows[0].id_historia, diagnostico, observaciones || null,
        peso || null, talla || null, presion_arterial || null, temperatura || null,
        frecuencia_cardiaca || null, frecuencia_respiratoria || null, examen_fisico || null]
    );

    await conexion.query(
      `UPDATE cita SET estado = 'atendida' WHERE id_cita = ?`,
      [id_cita]
    );

    await conexion.commit();
    conexion.release();

    return res.status(201).json({
      mensaje: 'Consulta registrada correctamente. La cita quedó marcada como atendida.',
      id_consulta: resultadoConsulta.insertId
    });

  } catch (error) {
    await conexion.rollback();
    conexion.release();
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al registrar la consulta.' });
  }
};

const iniciarAtencion = async (req, res) => {
  const { id_cita } = req.params;

  try {
    const [resultado] = await pool.query(
      `UPDATE cita SET estado = 'en_atencion'
       WHERE id_cita = ? AND estado = 'en_espera'`,
      [id_cita]
    );

    if (resultado.affectedRows === 0) {
      return res.status(409).json({ mensaje: 'Solo se puede iniciar la atención de una cita en espera.' });
    }

    return res.json({ mensaje: 'Atención iniciada.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al iniciar la atención.' });
  }
};

const marcarNoAsistio = async (req, res) => {
  const { id_cita } = req.params;

  try {
    const [resultado] = await pool.query(
      `UPDATE cita SET estado = 'no_asistida'
       WHERE id_cita = ? AND estado IN ('programada','confirmada','en_espera','en_atencion')`,
      [id_cita]
    );

    if (resultado.affectedRows === 0) {
      return res.status(409).json({ mensaje: 'No se pudo marcar como no asistida (revisa el estado actual de la cita).' });
    }

    return res.json({ mensaje: 'Cita marcada como no asistida.' });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor.' });
  }
};

const listarMedicamentos = async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id_medicamento, nombre FROM medicamento WHERE estado = 'activo'"
    );
    return res.json(rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al listar medicamentos.' });
  }
};

const listarTiposExamen = async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id_tipo_examen, nombre FROM tipo_examen WHERE estado = 'activo'"
    );
    return res.json(rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al listar tipos de examen.' });
  }
};

const generarFormula = async (req, res) => {
  const { id_consulta } = req.params;
  const { medicamentos } = req.body;

  if (!Array.isArray(medicamentos) || medicamentos.length === 0) {
    return res.status(400).json({ mensaje: 'Debes incluir al menos un medicamento.' });
  }

  const conexion = await pool.getConnection();

  try {
    const [consultaRows] = await conexion.query(
      'SELECT id_consulta FROM consulta WHERE id_consulta = ?',
      [id_consulta]
    );

    if (consultaRows.length === 0) {
      conexion.release();
      return res.status(404).json({ mensaje: 'La consulta no existe.' });
    }

    await conexion.beginTransaction();

    const [resultadoFormula] = await conexion.query(
      'INSERT INTO formula_medica (consulta_id) VALUES (?)',
      [id_consulta]
    );

    const idFormula = resultadoFormula.insertId;

    for (const med of medicamentos) {
      await conexion.query(
        `INSERT INTO detalle_formula
          (formula_id, medicamento_id, dosis, frecuencia, duracion, indicaciones)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [idFormula, med.medicamento_id, med.dosis, med.frecuencia || null,
          med.duracion || null, med.indicaciones || null]
      );
    }

    await conexion.commit();
    conexion.release();

    return res.status(201).json({ mensaje: 'Fórmula médica generada correctamente.', id_formula: idFormula });

  } catch (error) {
    await conexion.rollback();
    conexion.release();
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Esta consulta ya tiene una fórmula médica generada.' });
    }
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al generar la fórmula médica.' });
  }
};

const generarOrdenExamen = async (req, res) => {
  const { id_consulta } = req.params;
  const { examenes } = req.body;

  if (!Array.isArray(examenes) || examenes.length === 0) {
    return res.status(400).json({ mensaje: 'Debes incluir al menos un examen.' });
  }

  const conexion = await pool.getConnection();

  try {
    const [consultaRows] = await conexion.query(
      'SELECT id_consulta FROM consulta WHERE id_consulta = ?',
      [id_consulta]
    );

    if (consultaRows.length === 0) {
      conexion.release();
      return res.status(404).json({ mensaje: 'La consulta no existe.' });
    }

    await conexion.beginTransaction();

    const [resultadoOrden] = await conexion.query(
      'INSERT INTO orden_examen (consulta_id) VALUES (?)',
      [id_consulta]
    );

    const idOrden = resultadoOrden.insertId;

    for (const ex of examenes) {
      await conexion.query(
        `INSERT INTO detalle_orden_examen (orden_id, tipo_examen_id, observaciones)
         VALUES (?, ?, ?)`,
        [idOrden, ex.tipo_examen_id, ex.observaciones || null]
      );
    }

    await conexion.commit();
    conexion.release();

    return res.status(201).json({ mensaje: 'Orden de examen generada correctamente.', id_orden: idOrden });

  } catch (error) {
    await conexion.rollback();
    conexion.release();
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Esta consulta ya tiene una orden de examen generada.' });
    }
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al generar la orden de examen.' });
  }
};

const generarIncapacidad = async (req, res) => {
  const { id_consulta } = req.params;
  const { fecha_inicio, dias_incapacidad, motivo } = req.body;

  if (!fecha_inicio || !dias_incapacidad || !motivo) {
    return res.status(400).json({ mensaje: 'Faltan campos obligatorios.' });
  }

  const dias = parseInt(dias_incapacidad, 10);

  if (!Number.isInteger(dias) || dias < 1) {
    return res.status(400).json({ mensaje: 'Los días de incapacidad deben ser un número entero mayor a 0.' });
  }

  try {
    const [consultaRows] = await pool.query(
      'SELECT id_consulta FROM consulta WHERE id_consulta = ?',
      [id_consulta]
    );

    if (consultaRows.length === 0) {
      return res.status(404).json({ mensaje: 'La consulta no existe.' });
    }

    const inicio = new Date(`${fecha_inicio}T00:00:00`);
    const fin = new Date(inicio);
    fin.setDate(fin.getDate() + (dias - 1));
    const fecha_fin = fin.toISOString().slice(0, 10);

    const [resultado] = await pool.query(
      `INSERT INTO incapacidad_medica (consulta_id, fecha_inicio, fecha_fin, dias_incapacidad, motivo)
       VALUES (?, ?, ?, ?, ?)`,
      [id_consulta, fecha_inicio, fecha_fin, dias, motivo]
    );

    return res.status(201).json({
      mensaje: 'Incapacidad médica generada correctamente.',
      id_incapacidad: resultado.insertId,
      fecha_fin
    });

  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Esta consulta ya tiene una incapacidad médica generada.' });
    }
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al generar la incapacidad médica.' });
  }
};



module.exports = {
  agendaDelDoctor, atenderConsulta, iniciarAtencion, marcarNoAsistio,
  listarMedicamentos, listarTiposExamen, generarFormula, generarOrdenExamen, generarIncapacidad
};