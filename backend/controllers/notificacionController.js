const pool = require('../config/conexion');
const { crearNotificacion } = require('../utils/notificar');

// El recordatorio no depende de que alguien haga una acción: hay que "descubrirlo" solo.
// Como no tenemos un cron corriendo aparte, se genera aquí mismo cada vez que alguien
// consulta sus notificaciones (es barato y no genera duplicados, porque revisa que no exista ya).
const generarRecordatoriosPendientes = async () => {
  try {
    const [citas] = await pool.query(
      `SELECT c.id_cita, c.hora, p.usuario_id AS paciente_usuario_id,
              ud.nombres AS doctor_nombres, ud.apellidos AS doctor_apellidos
       FROM cita c
       JOIN paciente p ON p.id_paciente = c.paciente_id
       JOIN doctor d ON d.id_doctor = c.doctor_id
       JOIN usuario ud ON ud.id_usuario = d.usuario_id
       WHERE c.fecha = DATE_ADD(CURDATE(), INTERVAL 1 DAY)
         AND c.estado IN ('programada','confirmada')
         AND NOT EXISTS (
           SELECT 1 FROM notificacion n
           WHERE n.cita_id = c.id_cita AND n.tipo = 'recordatorio_paciente'
         )`
    );

    for (const c of citas) {
      await crearNotificacion({
        usuario_id: c.paciente_usuario_id,
        cita_id: c.id_cita,
        tipo: 'recordatorio_paciente',
        mensaje: `Recordatorio: mañana tienes una cita a las ${c.hora.slice(0, 5)} con Dr(a). ${c.doctor_nombres} ${c.doctor_apellidos}.`
      });
    }
  } catch (error) {
    console.error('Error generando recordatorios:', error.message);
  }
};

const listarNotificaciones = async (req, res) => {
  const { id_usuario } = req.params;

  await generarRecordatoriosPendientes();

  try {
    const [rows] = await pool.query(
      `SELECT id_notificacion, cita_id, tipo, mensaje, fecha_creacion, leida
       FROM notificacion
       WHERE usuario_id = ?
       ORDER BY fecha_creacion DESC
       LIMIT 30`,
      [id_usuario]
    );
    return res.json(rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al listar las notificaciones.' });
  }
};

const contarNoLeidas = async (req, res) => {
  const { id_usuario } = req.params;
  try {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS total FROM notificacion WHERE usuario_id = ? AND leida = FALSE',
      [id_usuario]
    );
    return res.json({ total: rows[0].total });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor.' });
  }
};

const marcarLeida = async (req, res) => {
  const { id_notificacion } = req.params;
  try {
    await pool.query('UPDATE notificacion SET leida = TRUE WHERE id_notificacion = ?', [id_notificacion]);
    return res.json({ mensaje: 'Notificación marcada como leída.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor.' });
  }
};

const marcarTodasLeidas = async (req, res) => {
  const { id_usuario } = req.params;
  try {
    await pool.query('UPDATE notificacion SET leida = TRUE WHERE usuario_id = ? AND leida = FALSE', [id_usuario]);
    return res.json({ mensaje: 'Notificaciones marcadas como leídas.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor.' });
  }
};

module.exports = { listarNotificaciones, contarNoLeidas, marcarLeida, marcarTodasLeidas };