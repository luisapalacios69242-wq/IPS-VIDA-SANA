const pool = require('../config/conexion');

const FECHA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

const obtenerInformes = async (req, res) => {
  const { desde, hasta } = req.query;

  if (!FECHA_VALIDA.test(desde || '') || !FECHA_VALIDA.test(hasta || '')) {
    return res.status(400).json({ mensaje: 'Indica un rango de fechas válido (desde y hasta, formato YYYY-MM-DD).' });
  }

  if (hasta < desde) {
    return res.status(400).json({ mensaje: 'La fecha final no puede ser anterior a la inicial.' });
  }

  try {
    const [porEstado] = await pool.query(
      `SELECT estado, COUNT(*) AS total FROM cita WHERE fecha BETWEEN ? AND ? GROUP BY estado`,
      [desde, hasta]
    );

    const [porDoctor] = await pool.query(
      `SELECT u.nombres, u.apellidos, COUNT(*) AS total
       FROM cita c
       JOIN doctor d ON d.id_doctor = c.doctor_id
       JOIN usuario u ON u.id_usuario = d.usuario_id
       WHERE c.fecha BETWEEN ? AND ?
       GROUP BY d.id_doctor, u.nombres, u.apellidos
       ORDER BY total DESC`,
      [desde, hasta]
    );

    // Nota: si un doctor tiene varias especialidades, sus citas se cuentan en cada una.
    const [porEspecialidad] = await pool.query(
      `SELECT e.nombre, COUNT(*) AS total
       FROM cita c
       JOIN doctor_especialidad de ON de.doctor_id = c.doctor_id
       JOIN especialidad e ON e.id_especialidad = de.especialidad_id
       WHERE c.fecha BETWEEN ? AND ?
       GROUP BY e.nombre
       ORDER BY total DESC`,
      [desde, hasta]
    );

    const [examenes] = await pool.query(
      `SELECT te.nombre, COUNT(*) AS total
       FROM detalle_orden_examen dox
       JOIN orden_examen oe ON oe.id_orden = dox.orden_id
       JOIN consulta co ON co.id_consulta = oe.consulta_id
       JOIN cita c ON c.id_cita = co.cita_id
       JOIN tipo_examen te ON te.id_tipo_examen = dox.tipo_examen_id
       WHERE c.fecha BETWEEN ? AND ?
       GROUP BY te.nombre
       ORDER BY total DESC
       LIMIT 10`,
      [desde, hasta]
    );

    const [medicamentos] = await pool.query(
      `SELECT m.nombre, COUNT(*) AS total
       FROM detalle_formula df
       JOIN formula_medica f ON f.id_formula = df.formula_id
       JOIN consulta co ON co.id_consulta = f.consulta_id
       JOIN cita c ON c.id_cita = co.cita_id
       JOIN medicamento m ON m.id_medicamento = df.medicamento_id
       WHERE c.fecha BETWEEN ? AND ?
       GROUP BY m.nombre
       ORDER BY total DESC
       LIMIT 10`,
      [desde, hasta]
    );

    const [pacientesNuevosRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM paciente p
       JOIN usuario u ON u.id_usuario = p.usuario_id
       WHERE DATE(u.fecha_registro) BETWEEN ? AND ?`,
      [desde, hasta]
    );

    return res.json({
      porEstado, porDoctor, porEspecialidad, examenes, medicamentos,
      pacientesNuevos: pacientesNuevosRows[0].total
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al generar los informes.' });
  }
};

module.exports = { obtenerInformes };