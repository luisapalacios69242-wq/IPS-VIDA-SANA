const express = require('express');
const router = express.Router();
const {
  listarEspecialidades,
  listarDoctoresPorEspecialidad,
  disponibilidadDoctor,
  listarCitasDePaciente,
  agendarCita,
  cancelarCita,
  reprogramarCita
} = require('../controllers/citaController');

router.get('/especialidades', listarEspecialidades);
router.get('/doctores/:especialidad_id', listarDoctoresPorEspecialidad);
router.get('/disponibilidad/:doctor_id', disponibilidadDoctor);
router.get('/paciente/:id_paciente', listarCitasDePaciente);
router.post('/', agendarCita);
router.put('/:id_cita/cancelar', cancelarCita);
router.put('/:id_cita/reprogramar', reprogramarCita);

module.exports = router;