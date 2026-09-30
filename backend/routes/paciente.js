const express = require('express');
const router = express.Router();
const {
  registrarPaciente,
  registrarHistoriaClinica,
  obtenerHistoriaClinica,
  obtenerResumenHistoriaClinica,
  obtenerDocumentosPaciente,
  listarCitasPaciente,
  buscarPacientePorDocumento,
  obtenerFichaPaciente,
  actualizarFichaPaciente
} = require('../controllers/pacienteController');

router.post('/registro', registrarPaciente);
router.get('/buscar', buscarPacientePorDocumento);
router.get('/:id_paciente/ficha', obtenerFichaPaciente);
router.put('/:id_paciente/ficha', actualizarFichaPaciente);
router.get('/:id_paciente/citas', listarCitasPaciente);
router.post('/:id_paciente/historia-clinica', registrarHistoriaClinica);
router.get('/:id_paciente/historia-clinica/resumen', obtenerResumenHistoriaClinica);
router.get('/:id_paciente/historia-clinica', obtenerHistoriaClinica);
router.get('/:id_paciente/documentos', obtenerDocumentosPaciente);

module.exports = router;