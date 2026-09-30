const pool = require('../config/conexion');
const { crearNotificacion, usuarioIdDeDoctor } = require('../utils/notificar');

const citasDelDia = async (req, res) => {
  const { fecha } = req.query;

  if (!fecha) {
    return res.status(400).json({ mensaje: 'Debes indicar la fecha (YYYY-MM-DD).' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT c.id_cita, c.paciente_id, c.hora, c.tipo, c.estado,
              up.nombres AS paciente_nombres, up.apellidos AS paciente_apellidos,
              ud.nombres AS doctor_nombres, ud.apellidos AS doctor_apellidos
       FROM cita c
       JOIN paciente p ON p.id_paciente = c.paciente_id
       JOIN usuario up ON up.id_usuario = p.usuario_id
       JOIN doctor d ON d.id_doctor = c.doctor_id
       JOIN usuario ud ON ud.id_usuario = d.usuario_id
       WHERE c.fecha = ?
       ORDER BY c.hora`,
      [fecha]
    );
    return res.json(rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al listar los turnos del día.' });
  }
};

const confirmarLlegada = async (req, res) => {
  const { id_cita } = req.params;
  const { secretaria_id } = req.body;

  try {
    const [citaRows] = await pool.query(
      `SELECT c.estado, c.doctor_id, c.hora, up.nombres, up.apellidos
       FROM cita c
       JOIN paciente p ON p.id_paciente = c.paciente_id
       JOIN usuario up ON up.id_usuario = p.usuario_id
       WHERE c.id_cita = ?`,
      [id_cita]
    );

    if (citaRows.length === 0) {
      return res.status(404).json({ mensaje: 'La cita no existe.' });
    }

    const cita = citaRows[0];

    if (cita.estado !== 'programada' && cita.estado !== 'confirmada') {
      return res.status(409).json({ mensaje: `La cita ya está en estado '${cita.estado}', no se puede confirmar llegada.` });
    }

    await pool.query(
      `UPDATE cita SET estado = 'en_espera', secretaria_id = ? WHERE id_cita = ?`,
      [secretaria_id || null, id_cita]
    );

    const usuarioDoctor = await usuarioIdDeDoctor(cita.doctor_id);
    if (usuarioDoctor) {
      await crearNotificacion({
        usuario_id: usuarioDoctor,
        cita_id: Number(id_cita),
        tipo: 'cambio_agenda_doctor',
        mensaje: `${cita.nombres} ${cita.apellidos} llegó para su cita de las ${cita.hora.slice(0, 5)}. Ya puedes atenderlo.`
      });
    }

    return res.json({ mensaje: 'Llegada del paciente confirmada. La cita queda en espera para el doctor.' });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al confirmar la llegada.' });
  }
};

module.exports = { citasDelDia, confirmarLlegada };