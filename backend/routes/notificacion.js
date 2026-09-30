const express = require('express');
const router = express.Router();
const {
  listarNotificaciones, contarNoLeidas, marcarLeida, marcarTodasLeidas
} = require('../controllers/notificacionController');

router.get('/:id_usuario', listarNotificaciones);
router.get('/:id_usuario/no-leidas', contarNoLeidas);
router.put('/:id_notificacion/leida', marcarLeida);
router.put('/usuario/:id_usuario/leer-todas', marcarTodasLeidas);

module.exports = router;