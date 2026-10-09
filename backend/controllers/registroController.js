const bcrypt = require('bcrypt');
const pool = require('../config/conexion');

// Roles que cada panel puede ver/gestionar
const ROLES_ADMIN = ['paciente', 'doctor', 'secretaria'];
const ROLES_SECRETARIA = ['paciente'];

// Fábrica: devuelve los 3 handlers limitados a los roles permitidos
const crearControlador = (rolesPermitidos) => {

  // GET ?q=texto&rol=paciente
  const listar = async (req, res) => {
    const { q = '', rol = '' } = req.query;
    const roles = rol && rolesPermitidos.includes(rol) ? [rol] : rolesPermitidos;
    const like = `%${q.trim()}%`;

    try {
      const [rows] = await pool.query(
        `SELECT u.id_usuario, r.nombre AS rol, u.tipo_documento, u.numero_documento,
                u.nombres, u.apellidos, u.correo, u.telefono, u.estado,
                u.contrasena_temporal, u.fecha_registro
         FROM usuario u
         JOIN rol r ON r.id_rol = u.rol_id
         WHERE r.nombre IN (?)
           AND (? = '%%' OR u.numero_documento LIKE ? OR u.nombres LIKE ?
                OR u.apellidos LIKE ? OR u.correo LIKE ?
                OR CONCAT(u.nombres, ' ', u.apellidos) LIKE ?)
         ORDER BY u.fecha_registro DESC, u.id_usuario DESC
         LIMIT 100`,
        [roles, like, like, like, like, like, like]
      );
      res.json(rows);
    } catch (error) {
      console.error('Error al listar registros:', error);
      res.status(500).json({ mensaje: 'Error del servidor al listar los registros.' });
    }
  };

  // PUT /:id_usuario/restablecer-contrasena
  // La contraseña vuelve a ser el número de documento y se obliga a cambiarla al entrar.
  const restablecerContrasena = async (req, res) => {
    const { id_usuario } = req.params;

    try {
      const [rows] = await pool.query(
        `SELECT u.id_usuario, u.numero_documento, r.nombre AS rol
         FROM usuario u JOIN rol r ON r.id_rol = u.rol_id
         WHERE u.id_usuario = ?`,
        [id_usuario]
      );

      if (rows.length === 0) {
        return res.status(404).json({ mensaje: 'Usuario no encontrado.' });
      }
      if (!rolesPermitidos.includes(rows[0].rol)) {
        return res.status(403).json({ mensaje: 'No tienes permiso para gestionar este tipo de usuario.' });
      }

      const hash = await bcrypt.hash(rows[0].numero_documento, 10);
      await pool.query(
        'UPDATE usuario SET contrasena = ?, contrasena_temporal = TRUE WHERE id_usuario = ?',
        [hash, id_usuario]
      );

      res.json({ mensaje: 'Contraseña restablecida. Ahora es el número de documento y deberá cambiarla al iniciar sesión.' });
    } catch (error) {
      console.error('Error al restablecer contraseña:', error);
      res.status(500).json({ mensaje: 'Error del servidor al restablecer la contraseña.' });
    }
  };

  // PUT /:id_usuario/documento   body: { tipo_documento, numero_documento }
  const corregirDocumento = async (req, res) => {
    const { id_usuario } = req.params;
    const tipo_documento = (req.body.tipo_documento || '').trim();
    const numero_documento = (req.body.numero_documento || '').trim();

    if (!['CC', 'TI', 'CE', 'PA'].includes(tipo_documento) || !numero_documento) {
      return res.status(400).json({ mensaje: 'Indica un tipo y un número de documento válidos.' });
    }
    if (!/^[A-Za-z0-9]{4,20}$/.test(numero_documento)) {
      return res.status(400).json({ mensaje: 'El documento solo puede tener letras y números (4 a 20 caracteres).' });
    }

    try {
      const [rows] = await pool.query(
        `SELECT u.id_usuario, u.contrasena_temporal, r.nombre AS rol
         FROM usuario u JOIN rol r ON r.id_rol = u.rol_id
         WHERE u.id_usuario = ?`,
        [id_usuario]
      );

      if (rows.length === 0) {
        return res.status(404).json({ mensaje: 'Usuario no encontrado.' });
      }
      if (!rolesPermitidos.includes(rows[0].rol)) {
        return res.status(403).json({ mensaje: 'No tienes permiso para gestionar este tipo de usuario.' });
      }

      // Si todavía usa la contraseña inicial (su documento), se actualiza junto con el documento
      if (rows[0].contrasena_temporal) {
        const hash = await bcrypt.hash(numero_documento, 10);
        await pool.query(
          'UPDATE usuario SET tipo_documento = ?, numero_documento = ?, contrasena = ? WHERE id_usuario = ?',
          [tipo_documento, numero_documento, hash, id_usuario]
        );
      } else {
        await pool.query(
          'UPDATE usuario SET tipo_documento = ?, numero_documento = ? WHERE id_usuario = ?',
          [tipo_documento, numero_documento, id_usuario]
        );
      }

      res.json({
        mensaje: rows[0].contrasena_temporal
          ? 'Documento corregido. Su contraseña inicial ahora es el nuevo documento.'
          : 'Documento corregido. Su contraseña no cambió (ya la había personalizado).'
      });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ mensaje: 'Ya existe otro usuario con ese número de documento.' });
      }
      console.error('Error al corregir documento:', error);
      res.status(500).json({ mensaje: 'Error del servidor al corregir el documento.' });
    }
  };

  return { listar, restablecerContrasena, corregirDocumento };
};

module.exports = {
  admin: crearControlador(ROLES_ADMIN),
  secretaria: crearControlador(ROLES_SECRETARIA)
};