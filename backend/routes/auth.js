const express = require('express');
const router = express.Router();
const {
  login, cambiarContrasena, solicitarRecuperacion, restablecerContrasena
} = require('../controllers/authController');

router.post('/login', login);
router.put('/cambiar-contrasena', cambiarContrasena);
router.post('/olvide-contrasena', solicitarRecuperacion);
router.post('/restablecer-contrasena', restablecerContrasena);

module.exports = router;