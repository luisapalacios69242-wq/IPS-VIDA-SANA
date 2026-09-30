const pool = require('../config/conexion');

const TIPOS_VALIDOS = [
  'recordatorio_paciente', 'cambio_agenda_doctor',
  'cita_confirmada', 'cita_cancelada', 'cita_reprogramada'
];

async function crearNotificacion({ usuario_id, cita_id = null, tipo, mensaje }) {
  if (!usuario_id || !tipo || !mensaje || !TIPOS_VALIDOS.includes(tipo)) return;

  try {
    await pool.query(
      `INSERT INTO notificacion (usuario_id, cita_id, tipo, mensaje, enviada, fecha_envio)
       VALUES (?, ?, ?, ?, TRUE, NOW())`,
      [usuario_id, cita_id, tipo, mensaje]
    );
  } catch (error) {
    console.error('No se pudo crear la notificación:', error.message);
  }
}

async function usuarioIdDePaciente(paciente_id) {
  const [rows] = await pool.query('SELECT usuario_id FROM paciente WHERE id_paciente = ?', [paciente_id]);
  return rows.length ? rows[0].usuario_id : null;
}

async function usuarioIdDeDoctor(doctor_id) {
  const [rows] = await pool.query('SELECT usuario_id FROM doctor WHERE id_doctor = ?', [doctor_id]);
  return rows.length ? rows[0].usuario_id : null;
}

// Todas las secretarias activas, para avisarles de acciones que el paciente hizo por su cuenta
// (sin pasar por recepción), ya que el sistema no asigna una secretaria fija a cada turno.
async function usuariosIdSecretariasActivas() {
  const [rows] = await pool.query(
    `SELECT s.usuario_id FROM secretaria s
     JOIN usuario u ON u.id_usuario = s.usuario_id
     WHERE u.estado = 'activo'`
  );
  return rows.map(r => r.usuario_id);
}

module.exports = {
  crearNotificacion, usuarioIdDePaciente, usuarioIdDeDoctor, usuariosIdSecretariasActivas
};