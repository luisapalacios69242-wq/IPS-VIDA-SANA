process.env.TZ = 'America/Bogota';

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const pacienteRoutes = require('./routes/paciente');
const citaRoutes = require('./routes/cita');
const secretariaRoutes = require('./routes/secretaria');
const doctorRoutes = require('./routes/doctor');
const adminRoutes = require('./routes/admin');
const documentoRoutes = require('./routes/documento');
const notificacionRoutes = require('./routes/notificacion');
const facturaRoutes = require('./routes/factura');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/pacientes', pacienteRoutes);
app.use('/api/citas', citaRoutes);
app.use('/api/secretaria', secretariaRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/documentos', documentoRoutes);
app.use('/api/notificaciones', notificacionRoutes);
app.use('/api/facturas', facturaRoutes);

app.get('/', (req, res) => {
  res.send('API Sistema de Gestión de Citas Médicas funcionando');
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});