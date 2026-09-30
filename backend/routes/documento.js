const express = require('express');
const router = express.Router();
const {
  generarPdfHistoriaClinica, generarPdfOrdenExamen, generarPdfFormula, generarPdfResumenAtencion,
  generarPdfFactura, generarPdfIncapacidad
} = require('../controllers/documentoController');

router.get('/historia-clinica/:id_paciente/pdf', generarPdfHistoriaClinica);
router.get('/orden/:id_orden/pdf', generarPdfOrdenExamen);
router.get('/formula/:id_formula/pdf', generarPdfFormula);
router.get('/atencion/:id_consulta/pdf', generarPdfResumenAtencion);
router.get('/factura/:id_factura/pdf', generarPdfFactura);
router.get('/incapacidad/:id_incapacidad/pdf', generarPdfIncapacidad);

module.exports = router;