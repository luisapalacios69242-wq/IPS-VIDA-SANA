const express = require('express');
const router = express.Router();
const { citasDelDia, confirmarLlegada } = require('../controllers/secretariaController');

router.get('/citas-del-dia', citasDelDia);
router.put('/citas/:id_cita/confirmar-llegada', confirmarLlegada);

module.exports = router;