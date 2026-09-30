const express = require('express');
const router = express.Router();
const {
  registrarUsuario, listarUsuarios, actualizarUsuario, listarDoctores,
  listarEspecialidadesAdmin, crearEspecialidad, actualizarEspecialidad, eliminarEspecialidad,
  asignarHorario, eliminarHorario, crearBloqueoHorario, eliminarBloqueo, listarHorariosDoctor,
  listarServiciosAdmin, crearServicio, actualizarServicio
} = require('../controllers/adminController');
const { obtenerInformes } = require('../controllers/informeController');

router.post('/usuarios', registrarUsuario);
router.get('/usuarios', listarUsuarios);
router.put('/usuarios/:id_usuario', actualizarUsuario);
router.get('/doctores', listarDoctores);

router.get('/especialidades', listarEspecialidadesAdmin);
router.post('/especialidades', crearEspecialidad);
router.put('/especialidades/:id_especialidad', actualizarEspecialidad);
router.delete('/especialidades/:id_especialidad', eliminarEspecialidad);

router.get('/servicios', listarServiciosAdmin);
router.post('/servicios', crearServicio);
router.put('/servicios/:id_servicio', actualizarServicio);

router.post('/horarios', asignarHorario);
router.delete('/horarios/:id_horario', eliminarHorario);
router.post('/bloqueos', crearBloqueoHorario);
router.delete('/bloqueos/:id_bloqueo', eliminarBloqueo);
router.get('/doctores/:id_doctor/horarios', listarHorariosDoctor);

router.get('/informes', obtenerInformes);

module.exports = router;