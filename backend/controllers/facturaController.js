const pool = require('../config/conexion');

const listarServiciosActivos = async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id_servicio, nombre, descripcion, precio FROM servicio WHERE estado = 'activo' ORDER BY nombre"
    );
    return res.json(rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al listar los servicios.' });
  }
};

// Consultas atendidas ese día que todavía no tienen factura generada.
const listarConsultasParaFacturar = async (req, res) => {
  const { fecha } = req.query;
  if (!fecha) return res.status(400).json({ mensaje: 'Debes indicar la fecha (YYYY-MM-DD).' });

  try {
    const [rows] = await pool.query(
      `SELECT co.id_consulta, c.hora,
              up.nombres AS paciente_nombres, up.apellidos AS paciente_apellidos,
              ud.nombres AS doctor_nombres, ud.apellidos AS doctor_apellidos
       FROM consulta co
       JOIN cita c ON c.id_cita = co.cita_id
       JOIN paciente p ON p.id_paciente = c.paciente_id
       JOIN usuario up ON up.id_usuario = p.usuario_id
       JOIN doctor d ON d.id_doctor = c.doctor_id
       JOIN usuario ud ON ud.id_usuario = d.usuario_id
       LEFT JOIN factura f ON f.consulta_id = co.id_consulta
       WHERE c.fecha = ? AND c.estado = 'atendida' AND f.id_factura IS NULL
       ORDER BY c.hora`,
      [fecha]
    );
    return res.json(rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al listar las consultas por facturar.' });
  }
};

const listarFacturasDelDia = async (req, res) => {
  const { fecha } = req.query;
  if (!fecha) return res.status(400).json({ mensaje: 'Debes indicar la fecha (YYYY-MM-DD).' });

  try {
    const [rows] = await pool.query(
      `SELECT f.id_factura, f.numero_factura, f.valor, f.forma_pago, f.estado, f.fecha,
              up.nombres AS paciente_nombres, up.apellidos AS paciente_apellidos,
              s.nombre AS servicio_nombre
       FROM factura f
       JOIN consulta co ON co.id_consulta = f.consulta_id
       JOIN cita c ON c.id_cita = co.cita_id
       JOIN paciente p ON p.id_paciente = c.paciente_id
       JOIN usuario up ON up.id_usuario = p.usuario_id
       JOIN servicio s ON s.id_servicio = f.servicio_id
       WHERE c.fecha = ?
       ORDER BY f.fecha DESC`,
      [fecha]
    );
    return res.json(rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al listar las facturas.' });
  }
};

const crearFactura = async (req, res) => {
  const { consulta_id, secretaria_id, servicio_id, valor, forma_pago, estado } = req.body;

  if (!consulta_id || !secretaria_id || !servicio_id || valor === undefined || valor === null || valor === '') {
    return res.status(400).json({ mensaje: 'Faltan campos obligatorios.' });
  }

  if (Number(valor) < 0) {
    return res.status(400).json({ mensaje: 'El valor no puede ser negativo.' });
  }

  const estadoFinal = estado === 'pagada' ? 'pagada' : 'pendiente';

  if (estadoFinal === 'pagada' && !forma_pago) {
    return res.status(400).json({ mensaje: 'Si la factura queda pagada, debes indicar la forma de pago.' });
  }

  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    // Bloquea la última fila para que dos facturas no puedan sacar el mismo número al tiempo.
    const [ultimas] = await conexion.query(
      'SELECT numero_factura FROM factura ORDER BY id_factura DESC LIMIT 1 FOR UPDATE'
    );

    let siguiente = 1;
    if (ultimas.length > 0) {
      const coincidencia = ultimas[0].numero_factura.match(/(\d+)$/);
      if (coincidencia) siguiente = parseInt(coincidencia[1], 10) + 1;
    }

    const numeroFactura = `FAC-${String(siguiente).padStart(6, '0')}`;

    const [resultado] = await conexion.query(
      `INSERT INTO factura (consulta_id, secretaria_id, servicio_id, numero_factura, valor, forma_pago, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [consulta_id, secretaria_id, servicio_id, numeroFactura, valor, forma_pago || null, estadoFinal]
    );

    await conexion.commit();

    return res.status(201).json({ mensaje: 'Factura generada correctamente.', id_factura: resultado.insertId });

  } catch (error) {
    await conexion.rollback();

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Esta consulta ya tiene una factura generada.' });
    }
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al generar la factura.' });
  } finally {
    conexion.release();
  }
};

const marcarFacturaPagada = async (req, res) => {
  const { id_factura } = req.params;
  const { forma_pago } = req.body;

  if (!forma_pago) {
    return res.status(400).json({ mensaje: 'Debes indicar la forma de pago.' });
  }

  try {
    const [resultado] = await pool.query(
      `UPDATE factura SET estado = 'pagada', forma_pago = ? WHERE id_factura = ? AND estado = 'pendiente'`,
      [forma_pago, id_factura]
    );

    if (resultado.affectedRows === 0) {
      return res.status(409).json({ mensaje: 'La factura no existe o ya estaba pagada.' });
    }

    return res.json({ mensaje: 'Factura marcada como pagada.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error del servidor al actualizar la factura.' });
  }
};

module.exports = {
  listarServiciosActivos, listarConsultasParaFacturar, listarFacturasDelDia, crearFactura, marcarFacturaPagada
};