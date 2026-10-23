// Plantillas de historia clínica por especialidad.
// Una sola definición sirve para: formulario del doctor, validación en el servidor y PDF.
// Tipos de campo: texto | area | numero | lista

const PLANTILLAS = {
  pediatria: {
    nombre: 'Pediatría',
    secciones: [
      {
        titulo: 'Motivo de consulta y acompañante',
        campos: [
          { clave: 'motivo_consulta', etiqueta: 'Motivo de consulta *', tipo: 'area', obligatorio: true, placeholder: 'Por qué consulta, según el acompañante' },
          { clave: 'acompanante', etiqueta: 'Acompañante y parentesco', tipo: 'texto', placeholder: 'Ej. María Pérez, madre' }
        ]
      },
      {
        titulo: 'Antecedentes perinatales y alimentación',
        campos: [
          { clave: 'edad_gestacional', etiqueta: 'Edad gestacional al nacer', tipo: 'texto', placeholder: 'Ej. 38 semanas' },
          { clave: 'peso_nacer', etiqueta: 'Peso al nacer (g)', tipo: 'numero', min: 300, max: 7000, placeholder: 'Ej. 3100' },
          { clave: 'talla_nacer', etiqueta: 'Talla al nacer (cm)', tipo: 'numero', min: 20, max: 65, placeholder: 'Ej. 50' },
          { clave: 'tipo_parto', etiqueta: 'Tipo de parto', tipo: 'lista', opciones: ['Vaginal', 'Cesárea', 'No sabe'] },
          { clave: 'lactancia', etiqueta: 'Lactancia', tipo: 'lista', opciones: ['Materna exclusiva', 'Mixta', 'Fórmula', 'Ya no recibe', 'No aplica'] },
          { clave: 'alimentacion', etiqueta: 'Alimentación actual', tipo: 'area', placeholder: 'Alimentación complementaria, comidas al día, alimentos que rechaza' }
        ]
      },
      {
        titulo: 'Crecimiento (curvas OMS)',
        campos: [
          { clave: 'perimetro_cefalico', etiqueta: 'Perímetro cefálico (cm)', tipo: 'numero', min: 20, max: 65, placeholder: 'Ej. 46' },
          { clave: 'peso_edad', etiqueta: 'Peso para la edad', tipo: 'lista', opciones: ['Adecuado', 'Riesgo de bajo peso', 'Bajo peso', 'Sobrepeso'] },
          { clave: 'talla_edad', etiqueta: 'Talla para la edad', tipo: 'lista', opciones: ['Adecuada', 'Riesgo de talla baja', 'Talla baja'] },
          { clave: 'estado_nutricional', etiqueta: 'Estado nutricional (IMC o peso/talla)', tipo: 'lista', opciones: ['Adecuado', 'Riesgo de desnutrición aguda', 'Desnutrición aguda', 'Riesgo de sobrepeso', 'Sobrepeso', 'Obesidad'] }
        ]
      },
      {
        titulo: 'Vacunación (PAI) y desarrollo',
        campos: [
          { clave: 'vacunacion', etiqueta: 'Esquema de vacunación', tipo: 'lista', opciones: ['Completo para la edad', 'Incompleto', 'Sin carné o no sabe'] },
          { clave: 'vacunas_pendientes', etiqueta: 'Vacunas pendientes', tipo: 'texto', placeholder: 'Ej. Triple viral, refuerzo DPT' },
          { clave: 'desarrollo_motor', etiqueta: 'Desarrollo motor', tipo: 'lista', opciones: ['Acorde a la edad', 'En alerta', 'Retraso'] },
          { clave: 'desarrollo_lenguaje', etiqueta: 'Desarrollo del lenguaje', tipo: 'lista', opciones: ['Acorde a la edad', 'En alerta', 'Retraso'] },
          { clave: 'desarrollo_social', etiqueta: 'Desarrollo social y adaptativo', tipo: 'lista', opciones: ['Acorde a la edad', 'En alerta', 'Retraso'] }
        ]
      },
      {
        titulo: 'Signos de alarma y recomendaciones',
        campos: [
          { clave: 'hidratacion', etiqueta: 'Estado de hidratación', tipo: 'lista', opciones: ['Hidratado', 'Deshidratación leve', 'Deshidratación moderada', 'Deshidratación grave'] },
          { clave: 'signos_alarma', etiqueta: 'Signos de alarma', tipo: 'area', placeholder: 'Ninguno. Si hay: no come, vomita todo, convulsiones, letargia, dificultad respiratoria...' },
          { clave: 'recomendaciones', etiqueta: 'Recomendaciones al cuidador y próximo control', tipo: 'area', placeholder: 'Alimentación, pautas de crianza, cuándo volver a control' }
        ]
      }
    ]
  },

  cardiologia: {
    nombre: 'Cardiología',
    secciones: [
      {
        titulo: 'Motivo de consulta y síntomas',
        campos: [
          { clave: 'motivo_consulta', etiqueta: 'Motivo de consulta *', tipo: 'area', obligatorio: true, placeholder: 'Por qué consulta el paciente' },
          { clave: 'dolor_toracico', etiqueta: 'Dolor torácico', tipo: 'lista', opciones: ['No refiere', 'Típico (angina)', 'Atípico', 'No anginoso'] },
          { clave: 'dolor_descripcion', etiqueta: 'Características del dolor', tipo: 'area', placeholder: 'Localización, duración, relación con el esfuerzo, qué lo alivia' },
          { clave: 'disnea', etiqueta: 'Disnea', tipo: 'lista', opciones: ['No', 'Con grandes esfuerzos', 'Con esfuerzos moderados', 'En reposo'] },
          { clave: 'palpitaciones', etiqueta: 'Palpitaciones', tipo: 'lista', opciones: ['No', 'Ocasionales', 'Frecuentes'] },
          { clave: 'sincope', etiqueta: 'Síncope', tipo: 'lista', opciones: ['No', 'Presíncope', 'Síncope'] },
          { clave: 'edema', etiqueta: 'Edema de miembros inferiores', tipo: 'lista', opciones: ['No', 'Leve', 'Moderado', 'Severo'] },
          { clave: 'clase_nyha', etiqueta: 'Clase funcional (NYHA)', tipo: 'lista', opciones: ['I - Sin limitación', 'II - Limitación leve', 'III - Limitación marcada', 'IV - Síntomas en reposo'] }
        ]
      },
      {
        titulo: 'Factores de riesgo cardiovascular',
        campos: [
          { clave: 'tabaquismo', etiqueta: 'Tabaquismo', tipo: 'lista', opciones: ['Nunca', 'Exfumador', 'Fumador actual'] },
          { clave: 'actividad_fisica', etiqueta: 'Actividad física', tipo: 'lista', opciones: ['Sedentario', 'Ocasional', 'Regular'] },
          { clave: 'otros_factores', etiqueta: 'Otros factores', tipo: 'area', placeholder: 'Hipertensión, diabetes, dislipidemia, obesidad, antecedentes familiares de enfermedad coronaria o muerte súbita' }
        ]
      },
      {
        titulo: 'Examen cardiovascular',
        campos: [
          { clave: 'pa_brazo_derecho', etiqueta: 'Presión arterial brazo derecho', tipo: 'texto', placeholder: 'Ej. 130/85' },
          { clave: 'pa_brazo_izquierdo', etiqueta: 'Presión arterial brazo izquierdo', tipo: 'texto', placeholder: 'Ej. 128/84' },
          { clave: 'saturacion', etiqueta: 'Saturación de oxígeno (%)', tipo: 'numero', min: 50, max: 100, placeholder: 'Ej. 97' },
          { clave: 'ritmo', etiqueta: 'Ritmo cardíaco', tipo: 'lista', opciones: ['Regular', 'Irregular'] },
          { clave: 'ruidos_cardiacos', etiqueta: 'Ruidos cardíacos', tipo: 'lista', opciones: ['Normales', 'Alterados'] },
          { clave: 'soplos', etiqueta: 'Soplos', tipo: 'lista', opciones: ['No', 'Sistólico', 'Diastólico', 'Continuo'] },
          { clave: 'soplo_detalle', etiqueta: 'Foco y grado del soplo', tipo: 'texto', placeholder: 'Ej. Foco aórtico, grado II/VI' },
          { clave: 'yugulares', etiqueta: 'Venas yugulares', tipo: 'lista', opciones: ['Normales', 'Ingurgitadas'] },
          { clave: 'pulsos', etiqueta: 'Pulsos periféricos', tipo: 'lista', opciones: ['Presentes y simétricos', 'Disminuidos', 'Ausentes'] },
          { clave: 'auscultacion_pulmonar', etiqueta: 'Auscultación pulmonar', tipo: 'lista', opciones: ['Limpia', 'Crépitos', 'Sibilancias'] }
        ]
      },
      {
        titulo: 'Paraclínicos',
        campos: [
          { clave: 'ecg', etiqueta: 'Electrocardiograma', tipo: 'area', placeholder: 'Ritmo, frecuencia, eje, hallazgos (ST, T, bloqueos)' },
          { clave: 'ecocardiograma', etiqueta: 'Ecocardiograma', tipo: 'area', placeholder: 'Hallazgos relevantes (válvulas, cavidades, función)' },
          { clave: 'fevi', etiqueta: 'Fracción de eyección (%)', tipo: 'numero', min: 5, max: 85, placeholder: 'Ej. 55' },
          { clave: 'perfil_lipidico', etiqueta: 'Perfil lipídico', tipo: 'texto', placeholder: 'CT, LDL, HDL, TG (mg/dL)' },
          { clave: 'glucosa', etiqueta: 'Glucosa (mg/dL)', tipo: 'numero', min: 20, max: 800, placeholder: 'Ej. 95' },
          { clave: 'creatinina', etiqueta: 'Creatinina (mg/dL)', tipo: 'numero', min: 0.1, max: 20, placeholder: 'Ej. 0.9' }
        ]
      },
      {
        titulo: 'Riesgo y plan',
        campos: [
          { clave: 'riesgo_cv', etiqueta: 'Riesgo cardiovascular', tipo: 'lista', opciones: ['Bajo', 'Intermedio', 'Alto', 'Muy alto'] },
          { clave: 'medicacion_actual', etiqueta: 'Medicación actual', tipo: 'area', placeholder: 'Medicamentos, dosis y adherencia' },
          { clave: 'plan_manejo', etiqueta: 'Plan de manejo y seguimiento', tipo: 'area', placeholder: 'Conducta, exámenes pendientes, próximo control' }
        ]
      }
    ]
  },

  fisioterapia: {
    nombre: 'Fisioterapia',
    secciones: [
      {
        titulo: 'Motivo de consulta y dolor',
        campos: [
          { clave: 'motivo_consulta', etiqueta: 'Motivo de consulta *', tipo: 'area', obligatorio: true, placeholder: 'Por qué consulta el paciente' },
          { clave: 'zona_afectada', etiqueta: 'Zona afectada *', tipo: 'texto', obligatorio: true, placeholder: 'Ej. Hombro derecho, columna lumbar' },
          { clave: 'tiempo_evolucion', etiqueta: 'Tiempo de evolución', tipo: 'texto', placeholder: 'Ej. 3 semanas' },
          { clave: 'mecanismo_lesion', etiqueta: 'Mecanismo de la lesión', tipo: 'area', placeholder: 'Cómo comenzó: caída, sobreesfuerzo, postural, posquirúrgico...' },
          { clave: 'dolor_eva', etiqueta: 'Dolor, escala EVA (0 a 10)', tipo: 'numero', min: 0, max: 10, placeholder: 'Ej. 6' },
          { clave: 'dolor_tipo', etiqueta: 'Tipo de dolor', tipo: 'lista', opciones: ['Sordo', 'Punzante', 'Quemante', 'Opresivo', 'Eléctrico'] },
          { clave: 'dolor_factores', etiqueta: 'Qué lo aumenta o lo alivia', tipo: 'area', placeholder: 'Movimiento, reposo, calor, medicación' }
        ]
      },
      {
        titulo: 'Valoración física',
        campos: [
          { clave: 'postura', etiqueta: 'Postura', tipo: 'area', placeholder: 'Alteraciones posturales, asimetrías' },
          { clave: 'marcha', etiqueta: 'Marcha', tipo: 'lista', opciones: ['Normal', 'Antálgica', 'Claudicante', 'Con ayuda técnica'] },
          { clave: 'inflamacion', etiqueta: 'Edema o inflamación', tipo: 'lista', opciones: ['No', 'Leve', 'Moderado', 'Severo'] },
          { clave: 'rango_movimiento', etiqueta: 'Rango de movimiento (goniometría, en grados)', tipo: 'area', placeholder: 'Ej. Flexión de hombro: 120° (normal 180°)' },
          { clave: 'fuerza_muscular', etiqueta: 'Fuerza muscular (escala de Daniels)', tipo: 'lista', opciones: ['0 - Sin contracción', '1 - Contracción sin movimiento', '2 - Movimiento sin gravedad', '3 - Movimiento contra gravedad', '4 - Contra resistencia parcial', '5 - Normal'] },
          { clave: 'tono_muscular', etiqueta: 'Tono muscular', tipo: 'lista', opciones: ['Normal', 'Hipotonía', 'Hipertonía', 'Espasticidad'] },
          { clave: 'sensibilidad', etiqueta: 'Sensibilidad', tipo: 'lista', opciones: ['Conservada', 'Disminuida', 'Aumentada', 'Ausente'] },
          { clave: 'pruebas_especiales', etiqueta: 'Pruebas especiales', tipo: 'area', placeholder: 'Pruebas realizadas y resultado (positiva o negativa)' }
        ]
      },
      {
        titulo: 'Diagnóstico fisioterapéutico y plan',
        campos: [
          { clave: 'diagnostico_fisio', etiqueta: 'Diagnóstico fisioterapéutico', tipo: 'area', placeholder: 'Deficiencias y limitaciones funcionales encontradas' },
          { clave: 'objetivos', etiqueta: 'Objetivos del tratamiento *', tipo: 'area', obligatorio: true, placeholder: 'Ej. Disminuir el dolor, recuperar rango de movimiento, fortalecer' },
          { clave: 'tecnicas', etiqueta: 'Técnicas y modalidades', tipo: 'area', placeholder: 'Terapia manual, ejercicio terapéutico, electroterapia, ultrasonido, calor o frío' },
          { clave: 'frecuencia', etiqueta: 'Frecuencia', tipo: 'texto', placeholder: 'Ej. 3 veces por semana' },
          { clave: 'sesiones_totales', etiqueta: 'Sesiones totales del plan', tipo: 'numero', min: 1, max: 60, placeholder: 'Ej. 10' },
          { clave: 'sesion_actual', etiqueta: 'Sesión número', tipo: 'numero', min: 1, max: 60, placeholder: 'Ej. 1' },
          { clave: 'evolucion', etiqueta: 'Evolución en esta sesión', tipo: 'area', placeholder: 'Respuesta al tratamiento, cambios en dolor y movilidad' },
          { clave: 'ejercicios_casa', etiqueta: 'Ejercicios y recomendaciones para casa', tipo: 'area', placeholder: 'Ejercicios, pausas activas, cuidados' }
        ]
      }
    ]
  }
};

// Valida y limpia los datos que llegan del formulario. Devuelve { datos } o { error }.
const limpiarDatosExtra = (plantilla, entrada) => {
  const definicion = PLANTILLAS[plantilla];
  const e = entrada || {};
  const datos = {};

  for (const seccion of definicion.secciones) {
    for (const c of seccion.campos) {
      let valor = String(e[c.clave] ?? '').trim().slice(0, 2000);
      const nombre = c.etiqueta.replace(' *', '');

      if (c.obligatorio && !valor) return { error: `${nombre} es obligatorio.` };

      if (valor && c.tipo === 'numero') {
        const n = Number(String(valor).replace(',', '.'));
        if (!Number.isFinite(n) || (c.min !== undefined && n < c.min) || (c.max !== undefined && n > c.max)) {
          return { error: `${nombre}: el valor debe estar entre ${c.min} y ${c.max}.` };
        }
        valor = String(n);
      }

      if (valor && c.tipo === 'lista' && !c.opciones.includes(valor)) {
        return { error: `${nombre}: opción no válida.` };
      }

      datos[c.clave] = valor;
    }
  }

  return { datos };
};

module.exports = { PLANTILLAS, limpiarDatosExtra };