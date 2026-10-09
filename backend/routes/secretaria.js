const express = require('express');
const router = express.Router();
const { citasDelDia, confirmarLlegada } = require('../controllers/secretariaController');

router.get('/citas-del-dia', citasDelDia);
router.put('/citas/:id_cita/confirmar-llegada', confirmarLlegada);

const registrosSecretaria = require('../controllers/registroController').secretaria;
router.get('/registros', registrosSecretaria.listar);
router.put('/registros/:id_usuario/restablecer-contrasena', registrosSecretaria.restablecerContrasena);
router.put('/registros/:id_usuario/documento', registrosSecretaria.corregirDocumento);

module.exports = router;