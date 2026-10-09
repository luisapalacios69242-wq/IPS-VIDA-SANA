const bcrypt = require('bcrypt');
const pool = require('../config/conexion');

// ---------- CU1.1: Registro de Usuario (doctor o secretaria) ----------
const registrarUsuario = async (req, res) => {
  const {
    nombres, apellidos, tipo_documento, numero_documento,
    fecha_nacimiento, genero, estado_civil, direccion, ciudad, telefono, correo,
    rol,
    tarjeta_profesional, especialidad_ids,
    cargo
  } = req.body;

  if (!nombres || !apellidos || !tipo_documento || !numero_documento ||
      !fecha_nacimiento || !genero || !correo || !rol) {
    return res.status(400).json({ mensaje: 'Faltan campos obligatorios.' });
  }

  if (!['doctor', 'secretaria'].includes(rol)) {
    return res.status(400).json({ mensaje: "El rol debe ser 'doctor' o 'secretaria'." });
  }

  if (rol === 'doctor' && (!tarjeta_profesional || !Array.isArray(especialidad_ids) || especialidad_ids.length === 0)) {
    return res.status(400).json({ mensaje: 'El doctor necesita tarjeta profesional y al menos una especialidad.' });
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

    const [rolRows] = await conexion.query(
      'SELECT id_rol FROM rol WHERE nombre = ?',
      [rol]
    );

    if (rolRows.length === 0) {
      conexion.release();
      return res.status(500).json({ mensaje: `El rol '${rol}' no está configurado en la base de datos.` });
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
       contrasenaHash, rolRows[0].id_rol]
    );

    const nuevoUsuarioId = resultadoUsuario.insertId;

    if (rol === 'doctor') {
      const [resultadoDoctor] = await conexion.query(
        `INSERT INTO doctor (usuario_id, tarjeta_profesional) VALUES (?, ?)`,
        [nuevoUsuarioId, tarjeta_profesional]
      );
      const nuevoDoctorId = resultadoDoctor.insertId;

      for (const idEsp of especialidad_ids) {
        await conexion.query(
          `INSERT INTO doctor_especialidad (doctor_id, especialidad_id) VALUES (?, ?)`,
          [nuevoDoctorId, idEsp]
        );
      }
    } else {
      await conexion.query(
        `INSERT INTO secretaria (usuario_id, cargo) VALUES (?, ?)`,
        [nuevoUsuarioId, cargo || null]
      );
    }

    await conexion.commit();
    conexion.release();

    return res.status(201).json({
      mensaje: `${rol === 'doctor' ? 'Doctor' : 'Secretaria'} registrado correctamente.`,
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
      return res.status(409).json({ mensaje: 'La tarjeta profesional ya está registrada.' });
    }
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al registrar el usuario.' });
  }
};

const listarUsuarios = async (req, res) => {
  try {
    const [doctores] = await pool.query(
      `SELECT u.id_usuario, u.nombres, u.apellidos, u.tipo_documento, u.numero_documento,
              u.fecha_nacimiento, u.genero, u.estado_civil, u.direccion, u.ciudad, u.telefono, u.correo, u.estado,
              'doctor' AS rol, d.id_doctor, d.tarjeta_profesional,
              GROUP_CONCAT(de.especialidad_id) AS especialidad_ids
       FROM usuario u
       JOIN doctor d ON d.usuario_id = u.id_usuario
       LEFT JOIN doctor_especialidad de ON de.doctor_id = d.id_doctor
       GROUP BY u.id_usuario, d.id_doctor, d.tarjeta_profesional`
    );

    const [secretarias] = await pool.query(
      `SELECT u.id_usuario, u.nombres, u.apellidos, u.tipo_documento, u.numero_documento,
              u.fecha_nacimiento, u.genero, u.estado_civil, u.direccion, u.ciudad, u.telefono, u.correo, u.estado,
              'secretaria' AS rol, s.id_secretaria, s.cargo
       FROM usuario u
       JOIN secretaria s ON s.usuario_id = u.id_usuario`
    );

    return res.json([...doctores, ...secretarias]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al listar los usuarios.' });
  }
};

const actualizarUsuario = async (req, res) => {
  const { id_usuario } = req.params;
  const {
    nombres, apellidos, fecha_nacimiento, genero, estado_civil,
    direccion, ciudad, telefono, correo, estado,
    tarjeta_profesional, especialidad_ids, cargo
  } = req.body;

  const conexion = await pool.getConnection();

  try {
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
        correo = COALESCE(?, correo),
        estado = COALESCE(?, estado)
       WHERE id_usuario = ?`,
      [nombres, apellidos, fecha_nacimiento, genero, estado_civil,
       direccion, ciudad, telefono, correo, estado, id_usuario]
    );

    if (tarjeta_profesional !== undefined || Array.isArray(especialidad_ids)) {
      const [doctorRows] = await conexion.query(
        'SELECT id_doctor FROM doctor WHERE usuario_id = ?', [id_usuario]
      );

      if (doctorRows.length > 0) {
        const idDoctor = doctorRows[0].id_doctor;

        if (tarjeta_profesional) {
          await conexion.query(
            'UPDATE doctor SET tarjeta_profesional = ? WHERE id_doctor = ?',
            [tarjeta_profesional, idDoctor]
          );
        }

        if (Array.isArray(especialidad_ids)) {
          await conexion.query('DELETE FROM doctor_especialidad WHERE doctor_id = ?', [idDoctor]);
          for (const idEsp of especialidad_ids) {
            await conexion.query(
              'INSERT INTO doctor_especialidad (doctor_id, especialidad_id) VALUES (?, ?)',
              [idDoctor, idEsp]
            );
          }
        }
      }
    }

    if (cargo !== undefined) {
      await conexion.query('UPDATE secretaria SET cargo = ? WHERE usuario_id = ?', [cargo, id_usuario]);
    }

    await conexion.commit();
    conexion.release();

    return res.json({ mensaje: 'Usuario actualizado correctamente.' });

  } catch (error) {
    await conexion.rollback();
    conexion.release();

    if (error.code === 'ER_DUP_ENTRY') {
      const detalle = error.sqlMessage || '';
      if (detalle.includes('correo')) {
        return res.status(409).json({ mensaje: 'Ese correo ya está registrado en otro usuario.' });
      }
      if (detalle.includes('tarjeta')) {
        return res.status(409).json({ mensaje: 'Esa tarjeta profesional ya está registrada en otro doctor.' });
      }
      return res.status(409).json({ mensaje: 'Ya existe un registro con esos datos.' });
    }

    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al actualizar el usuario.' });
  }
};

const listarDoctores = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT d.id_doctor, u.nombres, u.apellidos, d.tarjeta_profesional
       FROM doctor d
       JOIN usuario u ON u.id_usuario = d.usuario_id
       ORDER BY u.nombres`
    );
    return res.json(rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al listar los doctores.' });
  }
};

// ---------- CU1.2: Gestión de Especialidades ----------
const listarEspecialidadesAdmin = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM especialidad ORDER BY nombre');
    return res.json(rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor.' });
  }
};

const crearEspecialidad = async (req, res) => {
  const { nombre, descripcion } = req.body;

  if (!nombre) {
    return res.status(400).json({ mensaje: 'El nombre de la especialidad es obligatorio.' });
  }

  try {
    const [resultado] = await pool.query(
      'INSERT INTO especialidad (nombre, descripcion) VALUES (?, ?)',
      [nombre, descripcion || null]
    );
    return res.status(201).json({ mensaje: 'Especialidad creada.', id_especialidad: resultado.insertId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Esa especialidad ya existe.' });
    }
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor.' });
  }
};

const actualizarEspecialidad = async (req, res) => {
  const { id_especialidad } = req.params;
  const { nombre, descripcion, estado } = req.body;

  try {
    const [resultado] = await pool.query(
      `UPDATE especialidad SET
        nombre = COALESCE(?, nombre),
        descripcion = COALESCE(?, descripcion),
        estado = COALESCE(?, estado)
       WHERE id_especialidad = ?`,
      [nombre, descripcion, estado, id_especialidad]
    );

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ mensaje: 'Especialidad no encontrada.' });
    }

    return res.json({ mensaje: 'Especialidad actualizada.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor.' });
  }
};

const eliminarEspecialidad = async (req, res) => {
  const { id_especialidad } = req.params;

  try {
    const [resultado] = await pool.query(
      `UPDATE especialidad SET estado = 'inactiva' WHERE id_especialidad = ?`,
      [id_especialidad]
    );

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ mensaje: 'Especialidad no encontrada.' });
    }

    return res.json({ mensaje: 'Especialidad desactivada.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor.' });
  }
};

// ---------- CU9: Gestión de Servicios (catálogo para facturación) ----------
const listarServiciosAdmin = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.*, e.nombre AS especialidad_nombre
       FROM servicio s
       LEFT JOIN especialidad e ON e.id_especialidad = s.especialidad_id
       ORDER BY s.nombre`
    );
    return res.json(rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor.' });
  }
};

const crearServicio = async (req, res) => {
  const { nombre, descripcion, precio, especialidad_id } = req.body;

  if (!nombre || precio === undefined || precio === null || precio === '') {
    return res.status(400).json({ mensaje: 'El nombre y el precio son obligatorios.' });
  }

  if (Number(precio) < 0) {
    return res.status(400).json({ mensaje: 'El precio no puede ser negativo.' });
  }

  try {
    const [resultado] = await pool.query(
      'INSERT INTO servicio (nombre, descripcion, precio, especialidad_id) VALUES (?, ?, ?, ?)',
      [nombre, descripcion || null, precio, especialidad_id || null]
    );
    return res.status(201).json({ mensaje: 'Servicio creado.', id_servicio: resultado.insertId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Ese servicio ya existe.' });
    }
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ mensaje: 'La especialidad indicada no existe.' });
    }
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor.' });
  }
};

const actualizarServicio = async (req, res) => {
  const { id_servicio } = req.params;
  const { nombre, descripcion, precio, estado } = req.body;

  // La especialidad puede quedar en blanco a propósito (servicio general),
  // por eso se detecta si vino en el cuerpo en lugar de usar COALESCE.
  const cambiaEspecialidad = Object.prototype.hasOwnProperty.call(req.body, 'especialidad_id');
  const especialidadId = cambiaEspecialidad ? (req.body.especialidad_id || null) : null;

  if (precio !== undefined && precio !== null && precio !== '' && Number(precio) < 0) {
    return res.status(400).json({ mensaje: 'El precio no puede ser negativo.' });
  }

  try {
    const [resultado] = await pool.query(
      `UPDATE servicio SET
        nombre = COALESCE(?, nombre),
        descripcion = COALESCE(?, descripcion),
        precio = COALESCE(?, precio),
        estado = COALESCE(?, estado),
        especialidad_id = IF(?, ?, especialidad_id)
       WHERE id_servicio = ?`,
      [nombre, descripcion, precio, estado, cambiaEspecialidad ? 1 : 0, especialidadId, id_servicio]
    );

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ mensaje: 'Servicio no encontrado.' });
    }

    return res.json({ mensaje: 'Servicio actualizado.' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Ya existe un servicio con ese nombre.' });
    }
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ mensaje: 'La especialidad indicada no existe.' });
    }
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor.' });
  }
};

// ---------- CU1.3: Horarios y bloqueos ----------
const DIA_A_WEEKDAY = { Lunes: 0, Martes: 1, Miercoles: 2, Jueves: 3, Viernes: 4, Sabado: 5, Domingo: 6 };

const asignarHorario = async (req, res) => {
  const { doctor_id, dia_semana, hora_inicio, hora_fin } = req.body;

  if (!doctor_id || !dia_semana || !hora_inicio || !hora_fin) {
    return res.status(400).json({ mensaje: 'Faltan campos obligatorios.' });
  }

  if (hora_fin <= hora_inicio) {
    return res.status(400).json({ mensaje: 'La hora de fin debe ser mayor que la de inicio.' });
  }

  try {
    const [cruzados] = await pool.query(
      `SELECT id_horario FROM horario
       WHERE doctor_id = ? AND dia_semana = ?
         AND ? < hora_fin AND ? > hora_inicio`,
      [doctor_id, dia_semana, hora_inicio, hora_fin]
    );

    if (cruzados.length > 0) {
      return res.status(409).json({ mensaje: 'Ese horario se cruza con otro que el doctor ya tiene ese día.' });
    }

    const [resultado] = await pool.query(
      `INSERT INTO horario (doctor_id, dia_semana, hora_inicio, hora_fin)
       VALUES (?, ?, ?, ?)`,
      [doctor_id, dia_semana, hora_inicio, hora_fin]
    );
    return res.status(201).json({ mensaje: 'Horario asignado correctamente.', id_horario: resultado.insertId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Ese horario ya está registrado para el doctor.' });
    }
    if (error.errno === 3819) {
      return res.status(400).json({ mensaje: 'La hora de fin debe ser mayor que la de inicio.' });
    }
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al asignar el horario.' });
  }
};

const eliminarHorario = async (req, res) => {
  const { id_horario } = req.params;
  const forzar = req.query.forzar === '1';

  try {
    const [rows] = await pool.query('SELECT * FROM horario WHERE id_horario = ?', [id_horario]);

    if (rows.length === 0) {
      return res.status(404).json({ mensaje: 'El horario no existe.' });
    }

    const h = rows[0];

    if (!forzar) {
      const [citas] = await pool.query(
        `SELECT id_cita, fecha, hora FROM cita
         WHERE doctor_id = ? AND fecha >= CURDATE() AND WEEKDAY(fecha) = ?
           AND hora >= ? AND hora < ?
           AND estado IN ('programada','confirmada','en_espera')`,
        [h.doctor_id, DIA_A_WEEKDAY[h.dia_semana], h.hora_inicio, h.hora_fin]
      );

      if (citas.length > 0) {
        return res.status(409).json({
          requiereConfirmacion: true,
          mensaje: `Hay ${citas.length} cita(s) futuras dentro de ese horario.`,
          citas
        });
      }
    }

    await pool.query('DELETE FROM horario WHERE id_horario = ?', [id_horario]);
    return res.json({ mensaje: 'Horario eliminado.' });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al eliminar el horario.' });
  }
};

const crearBloqueoHorario = async (req, res) => {
  const { doctor_id, fecha, hora_inicio, hora_fin, motivo, cancelar_citas } = req.body;

  if (!doctor_id || !fecha || !hora_inicio || !hora_fin || !motivo) {
    return res.status(400).json({ mensaje: 'Faltan campos obligatorios.' });
  }

  if (hora_fin <= hora_inicio) {
    return res.status(400).json({ mensaje: 'La hora de fin debe ser mayor que la de inicio.' });
  }

  const conexion = await pool.getConnection();

  try {
    const [citas] = await conexion.query(
      `SELECT c.id_cita, c.hora, c.estado, u.nombres, u.apellidos
       FROM cita c
       JOIN paciente p ON p.id_paciente = c.paciente_id
       JOIN usuario u ON u.id_usuario = p.usuario_id
       WHERE c.doctor_id = ? AND c.fecha = ?
         AND c.hora >= ? AND c.hora < ?
         AND c.estado IN ('programada','confirmada','en_espera')
       ORDER BY c.hora`,
      [doctor_id, fecha, hora_inicio, hora_fin]
    );

    if (citas.length > 0 && cancelar_citas !== true) {
      conexion.release();
      return res.status(409).json({
        requiereConfirmacion: true,
        mensaje: `Hay ${citas.length} cita(s) agendadas en ese horario.`,
        citas
      });
    }

    await conexion.beginTransaction();

    if (citas.length > 0) {
      const ids = citas.map(c => c.id_cita);
      await conexion.query(
        `UPDATE cita SET estado = 'cancelada' WHERE id_cita IN (?)`,
        [ids]
      );
    }

    const [resultado] = await conexion.query(
      `INSERT INTO bloqueo_horario (doctor_id, fecha, hora_inicio, hora_fin, motivo)
       VALUES (?, ?, ?, ?, ?)`,
      [doctor_id, fecha, hora_inicio, hora_fin, motivo]
    );

    await conexion.commit();
    conexion.release();

    return res.status(201).json({
      mensaje: 'Bloqueo de horario registrado.',
      id_bloqueo: resultado.insertId,
      citas_canceladas: citas.length
    });

  } catch (error) {
    await conexion.rollback();
    conexion.release();
    if (error.errno === 3819) {
      return res.status(400).json({ mensaje: 'La hora de fin debe ser mayor que la de inicio.' });
    }
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al crear el bloqueo.' });
  }
};

const eliminarBloqueo = async (req, res) => {
  const { id_bloqueo } = req.params;

  try {
    const [resultado] = await pool.query(
      'DELETE FROM bloqueo_horario WHERE id_bloqueo = ?',
      [id_bloqueo]
    );

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ mensaje: 'El bloqueo no existe.' });
    }

    return res.json({ mensaje: 'Bloqueo eliminado.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al eliminar el bloqueo.' });
  }
};

const listarHorariosDoctor = async (req, res) => {
  const { id_doctor } = req.params;
  const incluirPasados = req.query.todos === '1';

  try {
    const [horarios] = await pool.query(
      'SELECT * FROM horario WHERE doctor_id = ? ORDER BY FIELD(dia_semana, "Lunes","Martes","Miercoles","Jueves","Viernes","Sabado","Domingo"), hora_inicio',
      [id_doctor]
    );
    const [bloqueos] = await pool.query(
      incluirPasados
        ? 'SELECT * FROM bloqueo_horario WHERE doctor_id = ? ORDER BY fecha'
        : 'SELECT * FROM bloqueo_horario WHERE doctor_id = ? AND fecha >= CURDATE() ORDER BY fecha',
      [id_doctor]
    );
    return res.json({ horarios, bloqueos });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor.' });
  }
};

module.exports = {
  registrarUsuario, listarUsuarios, actualizarUsuario, listarDoctores,
  listarEspecialidadesAdmin, crearEspecialidad, actualizarEspecialidad, eliminarEspecialidad,
  asignarHorario, eliminarHorario, crearBloqueoHorario, eliminarBloqueo, listarHorariosDoctor,
  listarServiciosAdmin, crearServicio, actualizarServicio
};