const express = require('express');
const router = express.Router();
const {
  agendaDelDoctor, atenderConsulta, especialidadesDelDoctor, iniciarAtencion, marcarNoAsistio, buscarDiagnosticos,
  listarMedicamentos, listarTiposExamen, generarFormula, generarOrdenExamen, generarIncapacidad,
  listarPlantillas
} = require('../controllers/doctorController');

router.get('/:id_doctor/agenda', agendaDelDoctor);
router.get('/diagnosticos', buscarDiagnosticos);
router.get('/plantillas', listarPlantillas);
router.get('/:id_doctor/especialidades', especialidadesDelDoctor);
router.get('/:id_doctor/servicios', serviciosDelDoctor);
router.post('/citas/:id_cita/atender', atenderConsulta);
router.put('/citas/:id_cita/iniciar', iniciarAtencion);
router.put('/citas/:id_cita/no-asistio', marcarNoAsistio);

router.get('/medicamentos', listarMedicamentos);
router.get('/tipos-examen', listarTiposExamen);
router.post('/consultas/:id_consulta/formula', generarFormula);
router.post('/consultas/:id_consulta/orden-examen', generarOrdenExamen);
router.post('/consultas/:id_consulta/incapacidad', generarIncapacidad);

module.exports = router;