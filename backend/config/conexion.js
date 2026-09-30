const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || process.env.MYSQLHOST,
  user: process.env.DB_USER || process.env.MYSQLUSER,
  password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD,
  database: process.env.DB_NAME || process.env.MYSQLDATABASE,
  port: process.env.DB_PORT || process.env.MYSQLPORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true
});

// Cada conexión usa hora de Colombia, para que CURDATE() y CURTIME() de los triggers coincidan con la hora local.
pool.on('connection', (conexion) => {
  conexion.query("SET time_zone = '-05:00'", (error) => {
    if (error) console.error('No se pudo fijar la zona horaria de MySQL:', error.message);
  });
});

module.exports = pool;