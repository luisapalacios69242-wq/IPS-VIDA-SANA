const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const pool = require('../config/conexion');

const login = async (req, res) => {
  const { numero_documento, contrasena } = req.body;

  if (!numero_documento || !contrasena) {
    return res.status(400).json({ mensaje: 'Documento y contraseña son obligatorios.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT u.id_usuario, u.nombres, u.apellidos, u.contrasena,
          u.contrasena_temporal, u.estado, r.nombre AS rol,
          p.id_paciente, d.id_doctor, s.id_secretaria
   FROM usuario u
   JOIN rol r ON r.id_rol = u.rol_id
   LEFT JOIN paciente p ON p.usuario_id = u.id_usuario
   LEFT JOIN doctor d ON d.usuario_id = u.id_usuario
   LEFT JOIN secretaria s ON s.usuario_id = u.id_usuario
   WHERE u.numero_documento = ?`,
      [numero_documento]
    );

    if (rows.length === 0) {
      return res.status(401).json({ mensaje: 'Documento o contraseña incorrectos.' });
    }

    const usuario = rows[0];

    if (usuario.estado === 'inactivo') {
      return res.status(403).json({ mensaje: 'Este usuario está inactivo.' });
    }

    const coincide = await bcrypt.compare(contrasena, usuario.contrasena);
    if (!coincide) {
      return res.status(401).json({ mensaje: 'Documento o contraseña incorrectos.' });
    }

    delete usuario.contrasena;

    return res.json({
      mensaje: 'Inicio de sesión exitoso.',
      usuario,
      debeCambiarContrasena: !!usuario.contrasena_temporal
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor.' });
  }
};

const cambiarContrasena = async (req, res) => {
  const { id_usuario, contrasena_actual, contrasena_nueva } = req.body;

  if (!id_usuario || !contrasena_actual || !contrasena_nueva) {
    return res.status(400).json({ mensaje: 'Faltan campos obligatorios.' });
  }

  if (contrasena_nueva.length < 6) {
    return res.status(400).json({ mensaje: 'La nueva contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT contrasena FROM usuario WHERE id_usuario = ?',
      [id_usuario]
    );

    if (rows.length === 0) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado.' });
    }

    const coincide = await bcrypt.compare(contrasena_actual, rows[0].contrasena);
    if (!coincide) {
      return res.status(401).json({ mensaje: 'La contraseña actual no es correcta.' });
    }

    const nuevaHash = await bcrypt.hash(contrasena_nueva, 10);

    await pool.query(
      `UPDATE usuario
       SET contrasena = ?, contrasena_temporal = FALSE
       WHERE id_usuario = ?`,
      [nuevaHash, id_usuario]
    );

    return res.json({ mensaje: 'Contraseña actualizada correctamente.' });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al cambiar la contraseña.' });
  }
};

const solicitarRecuperacion = async (req, res) => {
  const { numero_documento_o_correo } = req.body;

  if (!numero_documento_o_correo) {
    return res.status(400).json({ mensaje: 'Debes indicar tu documento o correo.' });
  }

  try {
    const [usuarioRows] = await pool.query(
      'SELECT id_usuario, nombres, correo FROM usuario WHERE numero_documento = ? OR correo = ?',
      [numero_documento_o_correo, numero_documento_o_correo]
    );

    const respuestaGenerica = { mensaje: 'Si el documento o correo existe en el sistema, se envió un enlace de restablecimiento.' };

    if (usuarioRows.length === 0) {
      return res.json(respuestaGenerica);
    }

    const usuario = usuarioRows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expiracion = new Date(Date.now() + 30 * 60 * 1000);

    await pool.query(
      'INSERT INTO password_reset_token (usuario_id, token, fecha_expiracion) VALUES (?, ?, ?)',
      [usuario.id_usuario, token, expiracion]
    );

    const enlace = `${process.env.FRONTEND_URL}/restablecer.html?token=${token}`;

    const transportador = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transportador.sendMail({
      from: `"Consultorio Vida Sana" <${process.env.EMAIL_USER}>`,
      to: usuario.correo,
      subject: 'Restablecimiento de contraseña',
      html: `
        <p>Hola ${usuario.nombres},</p>
        <p>Recibimos una solicitud para restablecer tu contraseña. Este enlace es válido por 30 minutos:</p>
        <p><a href="${enlace}">Restablecer mi contraseña</a></p>
        <p>Si el botón no abre, copia este enlace en tu navegador:<br>${enlace}</p>
        <p>Si no solicitaste esto, ignora este correo.</p>
      `
    });

    return res.json(respuestaGenerica);

  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al procesar la solicitud.' });
  }
};

const restablecerContrasena = async (req, res) => {
  const { token, contrasena_nueva } = req.body;

  if (!token || !contrasena_nueva) {
    return res.status(400).json({ mensaje: 'Faltan campos obligatorios.' });
  }

  if (contrasena_nueva.length < 6) {
    return res.status(400).json({ mensaje: 'La nueva contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    const [tokenRows] = await pool.query(
      'SELECT id_token, usuario_id, fecha_expiracion, usado FROM password_reset_token WHERE token = ?',
      [token]
    );

    if (tokenRows.length === 0) {
      return res.status(404).json({ mensaje: 'El enlace no es válido.' });
    }

    const registroToken = tokenRows[0];

    if (registroToken.usado) {
      return res.status(409).json({ mensaje: 'Este enlace ya fue utilizado.' });
    }

    if (new Date(registroToken.fecha_expiracion) < new Date()) {
      return res.status(409).json({ mensaje: 'El enlace ha expirado. Solicita uno nuevo.' });
    }

    const nuevaHash = await bcrypt.hash(contrasena_nueva, 10);

    await pool.query(
      'UPDATE usuario SET contrasena = ?, contrasena_temporal = FALSE WHERE id_usuario = ?',
      [nuevaHash, registroToken.usuario_id]
    );

    await pool.query(
      'UPDATE password_reset_token SET usado = TRUE WHERE id_token = ?',
      [registroToken.id_token]
    );

    return res.json({ mensaje: 'Contraseña restablecida correctamente. Ya puedes iniciar sesión.' });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al restablecer la contraseña.' });
  }
};

module.exports = { login, cambiarContrasena, solicitarRecuperacion, restablecerContrasena };