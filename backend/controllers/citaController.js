const pool = require('../config/conexion');
const {
  crearNotificacion, usuarioIdDePaciente, usuarioIdDeDoctor, usuariosIdSecretariasActivas
} = require('../utils/notificar');

const DURACION_CITA_MIN = 30;
const MAX_DIAS_CONSULTA = 62;
const NOMBRES_DIA_SQL = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
const FECHA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

const aMinutos = (hora) => {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
};

const aHoraTexto = (minutos) =>
  `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;

const fechaATexto = (fecha) => {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
};

const textoAFecha = (texto) => {
  const [anio, mes, dia] = texto.split('-').map(Number);
  return new Date(anio, mes - 1, dia);
};

const hoyTexto = () => fechaATexto(new Date());

async function calcularDisponibilidad(doctor_id, desde, hasta, excluirCitaId = null) {
  const [horarios] = await pool.query(
    'SELECT dia_semana, hora_inicio, hora_fin FROM horario WHERE doctor_id = ?',
    [doctor_id]
  );

  if (horarios.length === 0) return {};

  const [bloqueos] = await pool.query(
    'SELECT fecha, hora_inicio, hora_fin FROM bloqueo_horario WHERE doctor_id = ? AND fecha BETWEEN ? AND ?',
    [doctor_id, desde, hasta]
  );

  const [citas] = await pool.query(
    'SELECT id_cita, fecha, hora, estado FROM cita WHERE doctor_id = ? AND fecha BETWEEN ? AND ?',
    [doctor_id, desde, hasta]
  );

  const ahora = new Date();
  const hoy = fechaATexto(ahora);
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();

  const dias = {};
  const cursor = textoAFecha(desde);
  const fin = textoAFecha(hasta);

  while (cursor <= fin) {
    const texto = fechaATexto(cursor);

    if (texto >= hoy) {
      const nombreDia = NOMBRES_DIA_SQL[cursor.getDay()];

      const bloqueosDia = bloqueos
        .filter(b => b.fecha === texto)
        .map(b => [aMinutos(b.hora_inicio), aMinutos(b.hora_fin)]);

      const citasActivas = citas
        .filter(c => c.fecha === texto && c.estado !== 'cancelada' && c.id_cita !== excluirCitaId)
        .map(c => aMinutos(c.hora));

      const horas = new Set();

      horarios
        .filter(h => h.dia_semana === nombreDia)
        .forEach(h => {
          const inicio = aMinutos(h.hora_inicio);
          const finJornada = aMinutos(h.hora_fin);

          for (let t = inicio; t + DURACION_CITA_MIN <= finJornada; t += DURACION_CITA_MIN) {
            if (texto === hoy && t <= minutosAhora) continue;

            const enBloqueo = bloqueosDia.some(([bi, bf]) => t < bf && t + DURACION_CITA_MIN > bi);
            if (enBloqueo) continue;

            const ocupada = citasActivas.some(c => t < c + DURACION_CITA_MIN && t + DURACION_CITA_MIN > c);
            if (ocupada) continue;

            horas.add(t);
          }
        });

      if (horas.size > 0) {
        dias[texto] = Array.from(horas).sort((a, b) => a - b).map(aHoraTexto);
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return dias;
}

const listarEspecialidades = async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id_especialidad, nombre FROM especialidad WHERE estado = 'activa'"
    );
    return res.json(rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al listar especialidades.' });
  }
};

const listarDoctoresPorEspecialidad = async (req, res) => {
  const { especialidad_id } = req.params;

  try {
    const [rows] = await pool.query(
      `SELECT d.id_doctor, u.nombres, u.apellidos, d.tarjeta_profesional
       FROM doctor d
       JOIN usuario u ON u.id_usuario = d.usuario_id
       JOIN doctor_especialidad de ON de.doctor_id = d.id_doctor
       WHERE de.especialidad_id = ? AND u.estado = 'activo'`,
      [especialidad_id]
    );
    return res.json(rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al listar doctores.' });
  }
};

const disponibilidadDoctor = async (req, res) => {
  const { doctor_id } = req.params;
  const { desde, hasta } = req.query;
  const excluir = Number(req.query.excluir) || null;

  if (!FECHA_VALIDA.test(desde || '') || !FECHA_VALIDA.test(hasta || '')) {
    return res.status(400).json({ mensaje: 'Indica las fechas desde y hasta (YYYY-MM-DD).' });
  }

  if (hasta < desde) {
    return res.status(400).json({ mensaje: 'La fecha final no puede ser anterior a la inicial.' });
  }

  const diasDelRango = (textoAFecha(hasta) - textoAFecha(desde)) / 86400000;
  if (diasDelRango > MAX_DIAS_CONSULTA) {
    return res.status(400).json({ mensaje: `El rango no puede pasar de ${MAX_DIAS_CONSULTA} días.` });
  }

  try {
    const dias = await calcularDisponibilidad(doctor_id, desde, hasta, excluir);
    return res.json({ duracion_minutos: DURACION_CITA_MIN, dias });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al consultar la disponibilidad.' });
  }
};

const listarCitasDePaciente = async (req, res) => {
  const { id_paciente } = req.params;

  try {
    const [rows] = await pool.query(
      `SELECT c.id_cita, c.doctor_id, c.fecha, c.hora, c.tipo, c.estado,
              ud.nombres AS doctor_nombres, ud.apellidos AS doctor_apellidos,
              (SELECT GROUP_CONCAT(e.nombre ORDER BY e.nombre SEPARATOR ', ')
                 FROM doctor_especialidad de
                 JOIN especialidad e ON e.id_especialidad = de.especialidad_id
                WHERE de.doctor_id = c.doctor_id) AS especialidad
       FROM cita c
       JOIN doctor d ON d.id_doctor = c.doctor_id
       JOIN usuario ud ON ud.id_usuario = d.usuario_id
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

const agendarCita = async (req, res) => {
  const { paciente_id, doctor_id, secretaria_id, fecha, hora, tipo } = req.body;

  if (!paciente_id || !doctor_id || !fecha || !hora) {
    return res.status(400).json({ mensaje: 'Faltan campos obligatorios.' });
  }

  if (!FECHA_VALIDA.test(fecha)) {
    return res.status(400).json({ mensaje: 'La fecha debe tener el formato YYYY-MM-DD.' });
  }

  try {
    const disponibles = await calcularDisponibilidad(doctor_id, fecha, fecha);

    if (!(disponibles[fecha] || []).includes(String(hora).slice(0, 5))) {
      return res.status(409).json({
        mensaje: 'Ese horario no está disponible. Elige uno de los horarios libres del calendario.'
      });
    }

    const [resultado] = await pool.query(
      `INSERT INTO cita (paciente_id, doctor_id, secretaria_id, fecha, hora, tipo)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [paciente_id, doctor_id, secretaria_id || null, fecha, hora, tipo || 'consulta']
    );

    const [pacienteRows] = await pool.query(
      `SELECT u.nombres, u.apellidos FROM paciente p JOIN usuario u ON u.id_usuario = p.usuario_id WHERE p.id_paciente = ?`,
      [paciente_id]
    );
    const nombrePaciente = pacienteRows.length ? `${pacienteRows[0].nombres} ${pacienteRows[0].apellidos}` : 'Un paciente';

    // Si es para hoy, el doctor necesita enterarse de que cambió su agenda del día.
    if (fecha === hoyTexto()) {
      const usuarioDoctor = await usuarioIdDeDoctor(doctor_id);
      if (usuarioDoctor) {
        await crearNotificacion({
          usuario_id: usuarioDoctor,
          cita_id: resultado.insertId,
          tipo: 'cambio_agenda_doctor',
          mensaje: `Nueva cita hoy a las ${String(hora).slice(0, 5)} con ${nombrePaciente}.`
        });
      }
    }

    // Si el paciente la agendó por su cuenta (sin pasar por recepción), recepción necesita saberlo.
    if (!secretaria_id) {
      const usuariosSecretarias = await usuariosIdSecretariasActivas();
      for (const usuarioSecretaria of usuariosSecretarias) {
        await crearNotificacion({
          usuario_id: usuarioSecretaria,
          cita_id: resultado.insertId,
          tipo: 'cambio_agenda_doctor',
          mensaje: `${nombrePaciente} agendó su propia cita para el ${fecha} a las ${String(hora).slice(0, 5)}.`
        });
      }
    }

    return res.status(201).json({
      mensaje: 'Cita agendada correctamente.',
      id_cita: resultado.insertId
    });

  } catch (error) {
    if (error.sqlState === '45000') {
      return res.status(409).json({ mensaje: error.sqlMessage });
    }
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Ese horario ya fue tomado por otro paciente.' });
    }
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al agendar la cita.' });
  }
};

const POLITICA_HORAS_MINIMAS = 2;

const validarTiempoMinimo = (fecha, hora) => {
  const fechaHoraCita = new Date(`${fecha}T${hora}`);
  const ahora = new Date();
  const diferenciaHoras = (fechaHoraCita - ahora) / (1000 * 60 * 60);
  return diferenciaHoras >= POLITICA_HORAS_MINIMAS;
};

const cancelarCita = async (req, res) => {
  const { id_cita } = req.params;
  const { secretaria_id } = req.body || {};

  try {
    const [citaRows] = await pool.query(
      `SELECT c.doctor_id, c.paciente_id, c.fecha, c.hora, c.estado,
              ud.nombres AS doctor_nombres, ud.apellidos AS doctor_apellidos,
              up.nombres AS paciente_nombres, up.apellidos AS paciente_apellidos
       FROM cita c
       JOIN doctor d ON d.id_doctor = c.doctor_id
       JOIN usuario ud ON ud.id_usuario = d.usuario_id
       JOIN paciente p ON p.id_paciente = c.paciente_id
       JOIN usuario up ON up.id_usuario = p.usuario_id
       WHERE c.id_cita = ?`,
      [id_cita]
    );

    if (citaRows.length === 0) {
      return res.status(404).json({ mensaje: 'La cita no existe.' });
    }

    const cita = citaRows[0];

    if (!['programada', 'confirmada'].includes(cita.estado)) {
      return res.status(409).json({ mensaje: `No se puede cancelar una cita en estado '${cita.estado}'.` });
    }

    if (!validarTiempoMinimo(cita.fecha, cita.hora)) {
      return res.status(409).json({
        mensaje: `No se puede cancelar con menos de ${POLITICA_HORAS_MINIMAS} horas de antelación.`
      });
    }

    await pool.query(`UPDATE cita SET estado = 'cancelada' WHERE id_cita = ?`, [id_cita]);

    const usuarioPaciente = await usuarioIdDePaciente(cita.paciente_id);
    if (usuarioPaciente) {
      await crearNotificacion({
        usuario_id: usuarioPaciente,
        cita_id: Number(id_cita),
        tipo: 'cita_cancelada',
        mensaje: `Tu cita del ${cita.fecha} a las ${cita.hora.slice(0, 5)} con Dr(a). ${cita.doctor_nombres} ${cita.doctor_apellidos} fue cancelada.`
      });
    }

    if (cita.fecha === hoyTexto()) {
      const usuarioDoctor = await usuarioIdDeDoctor(cita.doctor_id);
      if (usuarioDoctor) {
        await crearNotificacion({
          usuario_id: usuarioDoctor,
          cita_id: Number(id_cita),
          tipo: 'cambio_agenda_doctor',
          mensaje: `Se canceló la cita de hoy a las ${cita.hora.slice(0, 5)}.`
        });
      }
    }

    // Si el paciente canceló por su cuenta (nadie de recepción lo hizo), recepción necesita saberlo.
    if (!secretaria_id) {
      const usuariosSecretarias = await usuariosIdSecretariasActivas();
      for (const usuarioSecretaria of usuariosSecretarias) {
        await crearNotificacion({
          usuario_id: usuarioSecretaria,
          cita_id: Number(id_cita),
          tipo: 'cita_cancelada',
          mensaje: `${cita.paciente_nombres} ${cita.paciente_apellidos} canceló su cita del ${cita.fecha} a las ${cita.hora.slice(0, 5)} con Dr(a). ${cita.doctor_nombres} ${cita.doctor_apellidos}.`
        });
      }
    }

    return res.json({ mensaje: 'Cita cancelada correctamente.' });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al cancelar la cita.' });
  }
};

const reprogramarCita = async (req, res) => {
  const { id_cita } = req.params;
  const { nueva_fecha, nueva_hora, secretaria_id } = req.body;

  if (!nueva_fecha || !nueva_hora) {
    return res.status(400).json({ mensaje: 'Debes indicar la nueva fecha y hora.' });
  }

  if (!FECHA_VALIDA.test(nueva_fecha)) {
    return res.status(400).json({ mensaje: 'La fecha debe tener el formato YYYY-MM-DD.' });
  }

  try {
    const [citaRows] = await pool.query(
      `SELECT c.doctor_id, c.paciente_id, c.fecha, c.hora, c.estado,
              ud.nombres AS doctor_nombres, ud.apellidos AS doctor_apellidos,
              up.nombres AS paciente_nombres, up.apellidos AS paciente_apellidos
       FROM cita c
       JOIN doctor d ON d.id_doctor = c.doctor_id
       JOIN usuario ud ON ud.id_usuario = d.usuario_id
       JOIN paciente p ON p.id_paciente = c.paciente_id
       JOIN usuario up ON up.id_usuario = p.usuario_id
       WHERE c.id_cita = ?`,
      [id_cita]
    );

    if (citaRows.length === 0) {
      return res.status(404).json({ mensaje: 'La cita no existe.' });
    }

    const cita = citaRows[0];

    if (!['programada', 'confirmada'].includes(cita.estado)) {
      return res.status(409).json({ mensaje: `No se puede reprogramar una cita en estado '${cita.estado}'.` });
    }

    if (!validarTiempoMinimo(cita.fecha, cita.hora)) {
      return res.status(409).json({
        mensaje: `No se puede reprogramar con menos de ${POLITICA_HORAS_MINIMAS} horas de antelación.`
      });
    }

    const horaTexto = String(nueva_hora).slice(0, 5);

    if (nueva_fecha === cita.fecha && horaTexto === cita.hora.slice(0, 5)) {
      return res.status(400).json({ mensaje: 'Elige un horario distinto al actual.' });
    }

    const disponibles = await calcularDisponibilidad(cita.doctor_id, nueva_fecha, nueva_fecha, Number(id_cita));

    if (!(disponibles[nueva_fecha] || []).includes(horaTexto)) {
      return res.status(409).json({
        mensaje: 'Ese horario no está disponible. Elige uno de los horarios libres del calendario.'
      });
    }

    const fechaAnterior = cita.fecha;
    const horaAnterior = cita.hora.slice(0, 5);

    await pool.query(
      `UPDATE cita SET fecha = ?, hora = ?, estado = 'programada' WHERE id_cita = ?`,
      [nueva_fecha, nueva_hora, id_cita]
    );

    const usuarioPaciente = await usuarioIdDePaciente(cita.paciente_id);
    if (usuarioPaciente) {
      await crearNotificacion({
        usuario_id: usuarioPaciente,
        cita_id: Number(id_cita),
        tipo: 'cita_reprogramada',
        mensaje: `Tu cita con Dr(a). ${cita.doctor_nombres} ${cita.doctor_apellidos} se movió al ${nueva_fecha} a las ${horaTexto}.`
      });
    }

    if (fechaAnterior === hoyTexto() || nueva_fecha === hoyTexto()) {
      const usuarioDoctor = await usuarioIdDeDoctor(cita.doctor_id);
      if (usuarioDoctor) {
        await crearNotificacion({
          usuario_id: usuarioDoctor,
          cita_id: Number(id_cita),
          tipo: 'cambio_agenda_doctor',
          mensaje: fechaAnterior === hoyTexto()
            ? `La cita de hoy a las ${horaAnterior} se movió al ${nueva_fecha} a las ${horaTexto}.`
            : `Se movió una cita para hoy a las ${horaTexto}.`
        });
      }
    }

    // Si el paciente reprogramó por su cuenta, recepción necesita saberlo.
    if (!secretaria_id) {
      const usuariosSecretarias = await usuariosIdSecretariasActivas();
      for (const usuarioSecretaria of usuariosSecretarias) {
        await crearNotificacion({
          usuario_id: usuarioSecretaria,
          cita_id: Number(id_cita),
          tipo: 'cita_reprogramada',
          mensaje: `${cita.paciente_nombres} ${cita.paciente_apellidos} movió su cita del ${fechaAnterior} a las ${horaAnterior}, al ${nueva_fecha} a las ${horaTexto}.`
        });
      }
    }

    return res.json({ mensaje: 'Cita reprogramada correctamente.' });

  } catch (error) {
    if (error.sqlState === '45000') {
      return res.status(409).json({ mensaje: error.sqlMessage });
    }
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Ese nuevo horario ya fue tomado por otro paciente.' });
    }
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al reprogramar la cita.' });
  }
};

module.exports = {
  listarEspecialidades, listarDoctoresPorEspecialidad, disponibilidadDoctor,
  listarCitasDePaciente, agendarCita, cancelarCita, reprogramarCita
};