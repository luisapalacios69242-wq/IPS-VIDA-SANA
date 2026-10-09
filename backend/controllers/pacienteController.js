const bcrypt = require('bcrypt');
const pool = require('../config/conexion');

const registrarPaciente = async (req, res) => {
  const {
    nombres, apellidos, tipo_documento, numero_documento,
    fecha_nacimiento, genero, estado_civil, direccion, ciudad, telefono, correo,
    ocupacion, numero_hijos, contacto_emergencia_nombre, contacto_emergencia_telefono,
    eps, tipo_afiliacion
  } = req.body;

  if (!nombres || !apellidos || !tipo_documento || !numero_documento ||
    !fecha_nacimiento || !genero || !correo) {
    return res.status(400).json({ mensaje: 'Faltan campos obligatorios.' });
  }

  const conexion = await pool.getConnection();

  try {
    const [existente] = await conexion.query(
      'SELECT id_usuario FROM usuario WHERE numero_documento = ?',
      [numero_documento]
    );

    if (existente.length > 0) {
      conexion.release();
      return res.status(409).json({ mensaje: 'Ya existe un usuario con ese número de documento.' });
    }

    const [rolPaciente] = await conexion.query(
      "SELECT id_rol FROM rol WHERE nombre = 'paciente'"
    );

    if (rolPaciente.length === 0) {
      conexion.release();
      return res.status(500).json({ mensaje: "El rol 'paciente' no está configurado en la base de datos." });
    }

    const contrasenaHash = await bcrypt.hash(numero_documento, 10);

    await conexion.beginTransaction();

    const [resultadoUsuario] = await conexion.query(
      `INSERT INTO usuario
        (nombres, apellidos, tipo_documento, numero_documento, fecha_nacimiento,
         genero, estado_civil, direccion, ciudad, telefono, correo,
         contrasena, contrasena_temporal, rol_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)`,
      [nombres, apellidos, tipo_documento, numero_documento, fecha_nacimiento,
        genero, estado_civil, direccion, ciudad, telefono, correo,
        contrasenaHash, rolPaciente[0].id_rol]
    );

    const nuevoUsuarioId = resultadoUsuario.insertId;

    await conexion.query(
      `INSERT INTO paciente
        (usuario_id, ocupacion, numero_hijos, contacto_emergencia_nombre,
         contacto_emergencia_telefono, eps, tipo_afiliacion)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [nuevoUsuarioId, ocupacion, numero_hijos || 0,
        contacto_emergencia_nombre, contacto_emergencia_telefono, eps, tipo_afiliacion]
    );

    await conexion.commit();
    conexion.release();

    return res.status(201).json({
      mensaje: 'Paciente registrado correctamente.',
      usuario_id: nuevoUsuarioId,
      contrasenaTemporal: numero_documento
    });

  } catch (error) {
    await conexion.rollback();
    conexion.release();

    if (error.code === 'ER_DUP_ENTRY') {
      const detalle = error.sqlMessage || '';
      if (detalle.includes('correo')) {
        return res.status(409).json({ mensaje: 'Ese correo ya está registrado en otro usuario.' });
      }
      return res.status(409).json({ mensaje: 'Ya existe un usuario con ese documento.' });
    }

    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al registrar el paciente.' });
  }
};

const buscarPacientePorDocumento = async (req, res) => {
  const { documento } = req.query;

  if (!documento) {
    return res.status(400).json({ mensaje: 'Debes indicar el número de documento a buscar.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT p.id_paciente, u.nombres, u.apellidos, u.numero_documento, u.telefono, u.correo
       FROM paciente p
       JOIN usuario u ON u.id_usuario = p.usuario_id
       WHERE u.numero_documento = ?`,
      [documento]
    );

    if (rows.length === 0) {
      return res.status(404).json({ mensaje: 'No se encontró ningún paciente con ese documento.' });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al buscar el paciente.' });
  }
};

const listarCitasPaciente = async (req, res) => {
  const { id_paciente } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT c.id_cita, c.fecha, c.hora, c.tipo, c.estado,
              ud.nombres AS doctor_nombres, ud.apellidos AS doctor_apellidos,
              e.nombre AS especialidad
       FROM cita c
       JOIN doctor d ON d.id_doctor = c.doctor_id
       JOIN usuario ud ON ud.id_usuario = d.usuario_id
       LEFT JOIN doctor_especialidad de ON de.doctor_id = d.id_doctor
       LEFT JOIN especialidad e ON e.id_especialidad = de.especialidad_id
       WHERE c.paciente_id = ?
       ORDER BY c.fecha DESC, c.hora DESC`,
      [id_paciente]
    );
    return res.json(rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al listar las citas.' });
  }
};

const registrarHistoriaClinica = async (req, res) => {
  const { id_paciente } = req.params;
  const { grupo_sanguineo, alergias, antecedentes_personales, antecedentes_familiares } = req.body;

  try {
    const [pacienteRows] = await pool.query(
      'SELECT id_paciente FROM paciente WHERE id_paciente = ?',
      [id_paciente]
    );

    if (pacienteRows.length === 0) {
      return res.status(404).json({ mensaje: 'El paciente no existe.' });
    }

    await pool.query(
      `INSERT INTO historia_clinica
        (paciente_id, grupo_sanguineo, alergias, antecedentes_personales, antecedentes_familiares)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        grupo_sanguineo = VALUES(grupo_sanguineo),
        alergias = VALUES(alergias),
        antecedentes_personales = VALUES(antecedentes_personales),
        antecedentes_familiares = VALUES(antecedentes_familiares)`,
      [id_paciente, grupo_sanguineo, alergias, antecedentes_personales, antecedentes_familiares]
    );

    return res.status(201).json({ mensaje: 'Historia clínica registrada correctamente.' });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al registrar la historia clínica.' });
  }
};

// Solo los datos base: grupo sanguíneo, alergias, antecedentes. Sin el listado de consultas.
// Es lo que se muestra por defecto, tal como en la vida real solo te dan lo de la consulta,
// no tu historia completa, a menos que la pidas.
const obtenerResumenHistoriaClinica = async (req, res) => {
  const { id_paciente } = req.params;

  try {
    const [historia] = await pool.query(
      'SELECT grupo_sanguineo, alergias, antecedentes_personales, antecedentes_familiares FROM historia_clinica WHERE paciente_id = ?',
      [id_paciente]
    );

    if (historia.length === 0) {
      return res.status(404).json({ mensaje: 'Este paciente aún no tiene historia clínica registrada.' });
    }

    return res.json(historia[0]);

  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al consultar la historia clínica.' });
  }
};

// Historia completa con TODAS las consultas. Se llama solo cuando alguien la pide explícitamente.
const obtenerHistoriaClinica = async (req, res) => {
  const { id_paciente } = req.params;

  try {
    const [historia] = await pool.query(
      'SELECT * FROM historia_clinica WHERE paciente_id = ?',
      [id_paciente]
    );

    if (historia.length === 0) {
      return res.status(404).json({ mensaje: 'Este paciente aún no tiene historia clínica registrada.' });
    }

    const [consultas] = await pool.query(
      `SELECT co.id_consulta, co.fecha_consulta, co.diagnostico, co.observaciones,
              ud.nombres AS doctor_nombres, ud.apellidos AS doctor_apellidos
       FROM consulta co
       JOIN cita c ON c.id_cita = co.cita_id
       JOIN doctor d ON d.id_doctor = c.doctor_id
       JOIN usuario ud ON ud.id_usuario = d.usuario_id
       WHERE co.historia_clinica_id = ?
       ORDER BY co.fecha_consulta DESC`,
      [historia[0].id_historia]
    );

    return res.json({ ...historia[0], consultas });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al consultar la historia clínica.' });
  }
};

const obtenerDocumentosPaciente = async (req, res) => {
  const { id_paciente } = req.params;

  try {
    const [atenciones] = await pool.query(
      `SELECT co.id_consulta, co.fecha_consulta AS fecha, co.diagnostico,
              ud.nombres AS doctor_nombres, ud.apellidos AS doctor_apellidos
       FROM consulta co
       JOIN cita c ON c.id_cita = co.cita_id
       JOIN doctor d ON d.id_doctor = c.doctor_id
       JOIN usuario ud ON ud.id_usuario = d.usuario_id
       WHERE c.paciente_id = ?
       ORDER BY co.fecha_consulta DESC`,
      [id_paciente]
    );

    const [formulas] = await pool.query(
      `SELECT f.id_formula, f.consulta_id, f.fecha, f.documento_pdf
       FROM formula_medica f
       JOIN consulta co ON co.id_consulta = f.consulta_id
       JOIN cita c ON c.id_cita = co.cita_id
       WHERE c.paciente_id = ?
       ORDER BY f.fecha DESC`,
      [id_paciente]
    );

    const [ordenes] = await pool.query(
      `SELECT oe.id_orden, oe.consulta_id, oe.fecha,
              GROUP_CONCAT(te.nombre SEPARATOR ', ') AS examenes
       FROM orden_examen oe
       JOIN detalle_orden_examen do ON do.orden_id = oe.id_orden
       JOIN tipo_examen te ON te.id_tipo_examen = do.tipo_examen_id
       JOIN consulta co ON co.id_consulta = oe.consulta_id
       JOIN cita c ON c.id_cita = co.cita_id
       WHERE c.paciente_id = ?
       GROUP BY oe.id_orden, oe.consulta_id, oe.fecha
       ORDER BY oe.fecha DESC`,
      [id_paciente]
    );

    const [incapacidades] = await pool.query(
      `SELECT im.id_incapacidad, im.consulta_id, im.fecha_inicio, im.fecha_fin, im.dias_incapacidad
       FROM incapacidad_medica im
       JOIN consulta co ON co.id_consulta = im.consulta_id
       JOIN cita c ON c.id_cita = co.cita_id
       WHERE c.paciente_id = ?
       ORDER BY im.fecha_inicio DESC`,
      [id_paciente]
    );

    return res.json({ atenciones, formulas, ordenes, incapacidades });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al consultar los documentos.' });
  }
};

const valorONulo = (x) => (x === undefined || x === null || String(x).trim() === '' ? null : x);

const obtenerFichaPaciente = async (req, res) => {
  const { id_paciente } = req.params;

  try {
    const [pacienteRows] = await pool.query(
      `SELECT p.id_paciente, u.nombres, u.apellidos, u.tipo_documento, u.numero_documento,
              u.fecha_nacimiento, u.genero, u.estado_civil, u.direccion, u.ciudad,
              u.telefono, u.correo,
              p.contacto_emergencia_nombre, p.contacto_emergencia_telefono, p.eps
       FROM paciente p
       JOIN usuario u ON u.id_usuario = p.usuario_id
       WHERE p.id_paciente = ?`,
      [id_paciente]
    );

    if (pacienteRows.length === 0) {
      return res.status(404).json({ mensaje: 'El paciente no existe.' });
    }

    const [historiaRows] = await pool.query(
      `SELECT grupo_sanguineo, alergias, antecedentes_personales, antecedentes_familiares
       FROM historia_clinica WHERE paciente_id = ?`,
      [id_paciente]
    );

    return res.json({ paciente: pacienteRows[0], historia: historiaRows[0] || null });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al consultar los datos del paciente.' });
  }
};

const actualizarFichaPaciente = async (req, res) => {
  const { id_paciente } = req.params;
  const b = req.body;

  const conexion = await pool.getConnection();

  try {
    const [rows] = await conexion.query(
      'SELECT usuario_id FROM paciente WHERE id_paciente = ?',
      [id_paciente]
    );

    if (rows.length === 0) {
      conexion.release();
      return res.status(404).json({ mensaje: 'El paciente no existe.' });
    }

    await conexion.beginTransaction();

    await conexion.query(
      `UPDATE usuario SET
        nombres = COALESCE(?, nombres),
        apellidos = COALESCE(?, apellidos),
        fecha_nacimiento = COALESCE(?, fecha_nacimiento),
        genero = COALESCE(?, genero),
        estado_civil = COALESCE(?, estado_civil),
        direccion = COALESCE(?, direccion),
        ciudad = COALESCE(?, ciudad),
        telefono = COALESCE(?, telefono),
        correo = COALESCE(?, correo)
       WHERE id_usuario = ?`,
      [valorONulo(b.nombres), valorONulo(b.apellidos), valorONulo(b.fecha_nacimiento),
      valorONulo(b.genero), valorONulo(b.estado_civil), valorONulo(b.direccion),
      valorONulo(b.ciudad), valorONulo(b.telefono), valorONulo(b.correo),
      rows[0].usuario_id]
    );

    await conexion.query(
      `UPDATE paciente SET
        contacto_emergencia_nombre = COALESCE(?, contacto_emergencia_nombre),
        contacto_emergencia_telefono = COALESCE(?, contacto_emergencia_telefono),
        eps = COALESCE(?, eps)
       WHERE id_paciente = ?`,
      [valorONulo(b.contacto_emergencia_nombre), valorONulo(b.contacto_emergencia_telefono),
      valorONulo(b.eps), id_paciente]
    );

    await conexion.commit();
    conexion.release();

    return res.json({ mensaje: 'Datos del paciente actualizados.' });

  } catch (error) {
    await conexion.rollback();
    conexion.release();

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Ese correo ya está registrado en otro usuario.' });
    }

    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al actualizar los datos del paciente.' });
  }
};

module.exports = {
  registrarPaciente, registrarHistoriaClinica, obtenerHistoriaClinica, obtenerResumenHistoriaClinica,
  obtenerDocumentosPaciente, listarCitasPaciente, buscarPacientePorDocumento,
  obtenerFichaPaciente, actualizarFichaPaciente
};