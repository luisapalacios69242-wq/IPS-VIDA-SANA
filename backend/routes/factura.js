const express = require('express');
const router = express.Router();
const {
  listarServiciosActivos, listarConsultasParaFacturar, listarFacturasDelDia, crearFactura, marcarFacturaPagada
} = require('../controllers/facturaController');

router.get('/servicios', listarServiciosActivos);
router.get('/consultas-pendientes', listarConsultasParaFacturar);
router.get('/dia', listarFacturasDelDia);
router.post('/', crearFactura);
router.put('/:id_factura/pagar', marcarFacturaPagada);

module.exports = router;