// ============================================================
// Módulo de informes del administrador
// 6 informes: resumen, citas, financiero, doctores, morbilidad, pacientes
// ============================================================
(() => {
  const seccion = document.getElementById('seccion-informes');
  if (!seccion) return;

  const contenedor = document.getElementById('resultadoInformes');
  const mensaje = document.getElementById('mensajeInforme');
  const inputDesde = document.getElementById('infDesde');
  const inputHasta = document.getElementById('infHasta');
  const selDoctor = document.getElementById('infDoctor');
  const selEspecialidad = document.getElementById('infEspecialidad');
  const cabeceraImpresion = document.getElementById('infImpresion');

  const TITULOS = {
    resumen: 'Resumen ejecutivo',
    citas: 'Citas y asistencia',
    financiero: 'Informe financiero',
    doctores: 'Doctores y especialidades',
    morbilidad: 'Morbilidad y diagnósticos (CIE-10)',
    pacientes: 'Pacientes'
  };

  const NOMBRE_ESTADO = {
    programada: 'Programada', confirmada: 'Confirmada', en_espera: 'En espera', en_atencion: 'Atendiendo',
    atendida: 'Atendida', cancelada: 'Cancelada', no_asistida: 'No asistida'
  };

  const PALETA = ['#185fa5', '#1d9e75', '#e0a030', '#d85a5a', '#7c5cbf', '#3aa3c4', '#9ca3af'];
  const COLOR_ESTADO = {
    atendida: '#1d9e75', cancelada: '#9ca3af', no_asistida: '#d85a5a', programada: '#185fa5',
    confirmada: '#3aa3c4', en_espera: '#e0a030', en_atencion: '#7c5cbf'
  };

  let informeActivo = 'resumen';
  let graficas = [];
  let pendientes = [];
  let peticion = 0;
  let filtrosCargados = false;

  // ---------- Utilidades ----------
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const numero = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('es-CO', { maximumFractionDigits: 1 }));
  const moneda = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }));
  const porc = (v) => (v === null || v === undefined ? '—' : `${Number(v).toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`);

  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const fechaBonita = (t) => {
    if (!t) return '—';
    const [a, m, d] = String(t).slice(0, 10).split('-').map(Number);
    return `${d} ${MESES[m - 1]} ${a}`;
  };
  const etiquetaPeriodo = (p) => {
    const partes = String(p).split('-').map(Number);
    return partes.length === 3 ? `${String(partes[2]).padStart(2, '0')}/${String(partes[1]).padStart(2, '0')}` : `${MESES[partes[1] - 1]} ${String(partes[0]).slice(2)}`;
  };

  const fechaLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const vacio = (texto = 'Sin datos en este periodo.') => `<p class="inf-vacio">${esc(texto)}</p>`;

  // ---------- Componentes de interfaz ----------
  function delta(actual, anterior, { masEsMejor = true, puntos = false } = {}) {
    if (actual === null || actual === undefined || anterior === null || anterior === undefined) {
      return '<span class="inf-delta igual">Sin base de comparación</span>';
    }
    if (puntos) {
      const dif = Math.round((actual - anterior) * 10) / 10;
      if (dif === 0) return '<span class="inf-delta igual">= igual que antes</span>';
      const bueno = masEsMejor ? dif > 0 : dif < 0;
      return `<span class="inf-delta ${bueno ? 'bueno' : 'malo'}">${dif > 0 ? '▲' : '▼'} ${numero(Math.abs(dif))} pts</span>`;
    }
    if (anterior === 0) {
      return actual === 0
        ? '<span class="inf-delta igual">= igual que antes</span>'
        : '<span class="inf-delta igual">Nuevo (antes 0)</span>';
    }
    const cambio = Math.round(((actual - anterior) / Math.abs(anterior)) * 1000) / 10;
    if (cambio === 0) return '<span class="inf-delta igual">= igual que antes</span>';
    const bueno = masEsMejor ? cambio > 0 : cambio < 0;
    return `<span class="inf-delta ${bueno ? 'bueno' : 'malo'}">${cambio > 0 ? '▲' : '▼'} ${numero(Math.abs(cambio))} %</span>`;
  }

  function tarjetaKpi(titulo, valor, { pie = '', destacado = false } = {}) {
    return `
      <div class="inf-kpi ${destacado ? 'destacado' : ''}">
        <span class="inf-kpi-titulo">${esc(titulo)}</span>
        <strong class="inf-kpi-valor">${valor}</strong>
        <span class="inf-kpi-pie">${pie}</span>
      </div>`;
  }

  const gridKpis = (tarjetas) => `<div class="inf-kpis">${tarjetas.join('')}</div>`;

  function bloque(titulo, contenido, { ancho = '', nota = '' } = {}) {
    return `
      <div class="inf-bloque ${ancho}">
        <h3>${esc(titulo)}</h3>
        ${nota ? `<p class="inf-nota">${esc(nota)}</p>` : ''}
        ${contenido}
      </div>`;
  }

  function ranking(items, { formato = numero, color = '' } = {}) {
    if (!items.length) return vacio();
    const maximo = Math.max(...items.map((i) => i.valor), 1);
    return `<div class="inf-ranking">${items.map((i) => `
      <div class="inf-rank-fila">
        <span class="inf-rank-nombre" title="${esc(i.etiqueta)}">${esc(i.etiqueta)}</span>
        <div class="inf-rank-barra"><i style="width:${Math.max(2, (i.valor / maximo) * 100)}%; ${color ? `background:${color}` : ''}"></i></div>
        <strong>${formato(i.valor)}</strong>
      </div>`).join('')}</div>`;
  }

  function tabla(columnas, filas, { vacioTexto = 'Sin datos en este periodo.' } = {}) {
    if (!filas.length) return vacio(vacioTexto);
    return `
      <div class="inf-tabla-scroll">
        <table class="inf-tabla">
          <thead><tr>${columnas.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.t)}</th>`).join('')}</tr></thead>
          <tbody>${filas.map((f) => `<tr>${f.map((celda, i) => `<td class="${columnas[i].num ? 'num' : ''}">${celda}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>`;
  }

  const lienzo = (id, alto = 260) => `<div class="inf-grafica" style="height:${alto}px"><canvas id="${id}"></canvas></div>`;

  // ---------- Gráficas (Chart.js) ----------
  function colorTexto() { return '#64748b'; }
  function colorRejilla() { return 'rgba(148, 163, 184, 0.25)'; }

  function opcionesBase(extra = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      plugins: { legend: { labels: { color: colorTexto(), boxWidth: 12, font: { size: 11 } } } },
      ...extra
    };
  }

  function ejes({ apilado = false, formatoY, saltar = true } = {}) {
    return {
      x: { stacked: apilado, ticks: { color: colorTexto(), font: { size: 10 }, maxRotation: 0, autoSkip: saltar }, grid: { display: false } },
      y: {
        stacked: apilado, beginAtZero: true,
        ticks: { color: colorTexto(), font: { size: 10 }, precision: 0, callback: formatoY },
        grid: { color: colorRejilla() }
      }
    };
  }

  function graficaLinea(id, etiquetas, series) {
    pendientes.push({
      id,
      config: {
        type: 'line',
        data: {
          labels: etiquetas,
          datasets: series.map((s, i) => ({
            label: s.nombre, data: s.datos, borderColor: s.color || PALETA[i], backgroundColor: (s.color || PALETA[i]) + '22',
            fill: i === 0, tension: 0.3, pointRadius: etiquetas.length > 40 ? 0 : 3, borderWidth: 2
          }))
        },
        options: opcionesBase({ scales: ejes(), interaction: { mode: 'index', intersect: false } })
      }
    });
  }

  function graficaBarras(id, etiquetas, series, { apilado = false, horizontal = false, formatoY } = {}) {
    const escalas = ejes({ apilado, formatoY, saltar: etiquetas.length > 12 });
    if (horizontal) {
      // En horizontal, los ejes se intercambian
      const x = escalas.y; const y = escalas.x;
      escalas.x = x; escalas.y = y;
    }
    pendientes.push({
      id,
      config: {
        type: 'bar',
        data: {
          labels: etiquetas,
          datasets: series.map((s, i) => ({
            label: s.nombre, data: s.datos, backgroundColor: s.color || PALETA[i], borderRadius: 4, maxBarThickness: 38
          }))
        },
        options: opcionesBase({
          indexAxis: horizontal ? 'y' : 'x',
          scales: escalas,
          plugins: { legend: { display: series.length > 1, labels: { color: colorTexto(), boxWidth: 12, font: { size: 11 } } } }
        })
      }
    });
  }

  function graficaDona(id, etiquetas, valores, colores) {
    pendientes.push({
      id,
      config: {
        type: 'doughnut',
        data: {
          labels: etiquetas,
          datasets: [{ data: valores, backgroundColor: colores || etiquetas.map((_, i) => PALETA[i % PALETA.length]), borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' }]
        },
        options: opcionesBase({ cutout: '62%', plugins: { legend: { position: 'bottom', labels: { color: colorTexto(), boxWidth: 12, font: { size: 11 } } } } })
      }
    });
  }

  function dibujarGraficas() {
    graficas.forEach((g) => g.destroy());
    graficas = [];

    if (typeof Chart === 'undefined') {
      contenedor.querySelectorAll('.inf-grafica').forEach((div) => {
        div.innerHTML = '<p class="inf-vacio">No se pudo cargar la librería de gráficas (revisa tu conexión a internet).</p>';
      });
      pendientes = [];
      return;
    }

    pendientes.forEach(({ id, config }) => {
      const canvas = document.getElementById(id);
      if (canvas) graficas.push(new Chart(canvas, config));
    });
    pendientes = [];
  }

  // ============================================================
  // 1. Resumen ejecutivo
  // ============================================================
  function renderResumen(d) {
    const a = d.actual;
    const p = d.anterior;

    const kpis = gridKpis([
      tarjetaKpi('Citas del periodo', numero(a.citas), { pie: delta(a.citas, p.citas), destacado: true }),
      tarjetaKpi('Tasa de asistencia', porc(a.tasaAsistencia), { pie: delta(a.tasaAsistencia, p.tasaAsistencia, { puntos: true }) }),
      tarjetaKpi('Tasa de inasistencia', porc(a.tasaInasistencia), { pie: delta(a.tasaInasistencia, p.tasaInasistencia, { puntos: true, masEsMejor: false }) }),
      tarjetaKpi('Pacientes atendidos', numero(a.pacientesAtendidos), { pie: delta(a.pacientesAtendidos, p.pacientesAtendidos) }),
      tarjetaKpi('Pacientes nuevos', numero(a.pacientesNuevos), { pie: delta(a.pacientesNuevos, p.pacientesNuevos) }),
      tarjetaKpi('Ingresos recaudados', moneda(a.recaudado), { pie: delta(a.recaudado, p.recaudado), destacado: true }),
      tarjetaKpi('Cartera pendiente', moneda(a.cartera), { pie: delta(a.cartera, p.cartera, { masEsMejor: false }) }),
      tarjetaKpi('Ticket promedio', moneda(a.ticketPromedio), { pie: delta(a.ticketPromedio, p.ticketPromedio) }),
      tarjetaKpi('Ocupación de agenda', porc(a.ocupacion), { pie: '<span class="inf-delta igual">Cupos usados / cupos ofrecidos</span>' })
    ]);

    // Lectura rápida: frases automáticas con lo más relevante
    const frases = [];
    if (a.citas === 0) {
      frases.push('No hay citas registradas en este periodo con los filtros elegidos.');
    } else {
      if (a.tasaInasistencia !== null) {
        frases.push(`De cada 100 pacientes que debían asistir, ${numero(a.tasaInasistencia)} no llegaron${p.tasaInasistencia !== null ? ` (antes: ${porc(p.tasaInasistencia)})` : ''}.`);
      }
      if (a.canceladas > 0) frases.push(`Se cancelaron ${numero(a.canceladas)} citas (${porc(a.tasaCancelacion)} del total).`);
      if (a.recaudado > 0 || p.recaudado > 0) frases.push(`Los ingresos recaudados fueron ${moneda(a.recaudado)}${p.recaudado > 0 ? `, frente a ${moneda(p.recaudado)} del periodo anterior` : ''}.`);
      if (a.cartera > 0) frases.push(`Quedaron ${moneda(a.cartera)} por cobrar en facturas pendientes de este periodo.`);
      if (a.ocupacion !== null) {
        frases.push(a.ocupacion >= 85
          ? `La agenda está muy llena (${porc(a.ocupacion)}): conviene abrir más horarios.`
          : a.ocupacion <= 40
            ? `La agenda tiene mucha capacidad libre (ocupación ${porc(a.ocupacion)}).`
            : `La ocupación de la agenda es ${porc(a.ocupacion)}.`);
      }
    }

    const etiquetas = d.tendencia.map((t) => etiquetaPeriodo(t.periodo));
    graficaLinea('gr-tendencia', etiquetas, [
      { nombre: 'Citas agendadas', datos: d.tendencia.map((t) => t.total), color: PALETA[0] },
      { nombre: 'Atendidas', datos: d.tendencia.map((t) => t.atendidas), color: PALETA[1] },
      { nombre: 'No asistidas', datos: d.tendencia.map((t) => t.no_asistidas), color: PALETA[3] }
    ]);
    graficaBarras('gr-ingresos', etiquetas, [{ nombre: 'Ingresos recaudados', datos: d.tendencia.map((t) => t.ingresos), color: PALETA[1] }],
      { formatoY: (v) => `$${Number(v).toLocaleString('es-CO')}` });

    return `
      <p class="inf-comparacion">Periodo: <strong>${fechaBonita(d.periodo.desde)} – ${fechaBonita(d.periodo.hasta)}</strong>
        · comparado con <strong>${fechaBonita(d.periodoAnterior.desde)} – ${fechaBonita(d.periodoAnterior.hasta)}</strong></p>
      ${kpis}
      ${bloque('Lectura rápida', `<ul class="inf-lista">${frases.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`, { ancho: 'completo' })}
      <div class="inf-grid">
        ${bloque(`Citas por ${d.granularidad === 'dia' ? 'día' : 'mes'}`, lienzo('gr-tendencia', 280), { ancho: 'completo' })}
        ${bloque(`Ingresos recaudados por ${d.granularidad === 'dia' ? 'día' : 'mes'}`, lienzo('gr-ingresos', 240), { ancho: 'completo' })}
      </div>`;
  }

  // ============================================================
  // 2. Citas y asistencia
  // ============================================================
  function colorCalor(valor, maximo) {
    if (!valor) return 'transparent';
    const intensidad = Math.min(1, valor / maximo);
    return `rgba(24, 95, 165, ${0.12 + intensidad * 0.78})`;
  }

  function renderCitas(d) {
    const kpis = gridKpis([
      tarjetaKpi('Citas en el periodo', numero(d.total), { destacado: true }),
      tarjetaKpi('Atendidas', numero(d.atendidas)),
      tarjetaKpi('Tasa de asistencia', porc(d.tasaAsistencia), { pie: '<span class="inf-delta igual">Atendidas / (atendidas + no asistidas)</span>' }),
      tarjetaKpi('No asistidas', numero(d.noAsistidas), { pie: `<span class="inf-delta igual">Inasistencia ${porc(d.tasaInasistencia)}</span>` }),
      tarjetaKpi('Canceladas', numero(d.canceladas), { pie: `<span class="inf-delta igual">${porc(d.tasaCancelacion)} del total</span>` })
    ]);

    graficaDona('gr-estados', d.porEstado.map((e) => NOMBRE_ESTADO[e.estado] || e.estado), d.porEstado.map((e) => e.total),
      d.porEstado.map((e) => COLOR_ESTADO[e.estado] || '#9ca3af'));
    graficaBarras('gr-dias', d.porDia.map((x) => x.dia), [
      { nombre: 'Citas', datos: d.porDia.map((x) => x.total), color: PALETA[0] },
      { nombre: 'No asistidas', datos: d.porDia.map((x) => x.noAsistidas), color: PALETA[3] }
    ]);
    graficaBarras('gr-horas', d.porHora.map((x) => `${String(x.hora).padStart(2, '0')}:00`), [
      { nombre: 'Citas', datos: d.porHora.map((x) => x.total), color: PALETA[0] },
      { nombre: 'No asistidas', datos: d.porHora.map((x) => x.noAsistidas), color: PALETA[3] }
    ]);

    let calor = vacio('Sin citas para armar el mapa de horas pico.');
    if (d.mapaCalor) {
      const m = d.mapaCalor;
      const maximo = Math.max(...m.valores.flat(), 1);
      calor = `
        <div class="inf-tabla-scroll">
          <table class="inf-calor">
            <thead><tr><th></th>${m.horas.map((h) => `<th>${String(h).padStart(2, '0')}h</th>`).join('')}</tr></thead>
            <tbody>${m.dias.map((dia, i) => `
              <tr><th>${esc(dia)}</th>${m.valores[i].map((v) => `<td style="background:${colorCalor(v, maximo)}; color:${v / maximo > 0.55 ? '#fff' : 'inherit'}">${v || ''}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    }

    const pico = d.porHora.length ? d.porHora.reduce((a, b) => (b.total > a.total ? b : a)) : null;
    const diaPico = d.porDia.reduce((a, b) => (b.total > a.total ? b : a), { total: 0 });
    const notaPico = pico && pico.total > 0
      ? `Hora pico: ${String(pico.hora).padStart(2, '0')}:00 (${pico.total} citas). Día más cargado: ${diaPico.dia} (${diaPico.total} citas).`
      : '';

    const colorOcupacion = (o) => (o === null ? '#9ca3af' : o >= 85 ? '#d85a5a' : o >= 50 ? '#1d9e75' : '#e0a030');
    const ocupacion = d.ocupacion.length
      ? `<div class="inf-ranking">${d.ocupacion.map((o) => `
          <div class="inf-rank-fila">
            <span class="inf-rank-nombre">Dr(a). ${esc(o.doctor)}</span>
            <div class="inf-rank-barra"><i style="width:${Math.max(2, o.ocupacion || 0)}%; background:${colorOcupacion(o.ocupacion)}"></i></div>
            <strong>${o.ocupacion === null ? 'Sin horario' : porc(o.ocupacion)}</strong>
          </div>`).join('')}</div>
        <p class="inf-nota">Verde = saludable · Naranja = agenda con mucho espacio libre · Rojo = casi llena (85 % o más). Cupos de ${30} min según el horario de cada doctor, descontando bloqueos.</p>`
      : vacio('No hay doctores con horario para estos filtros.');

    const filasOcu = d.ocupacion.map((o) => [esc(`Dr(a). ${o.doctor}`), numero(o.capacidad), numero(o.agendadas), o.ocupacion === null ? '—' : porc(o.ocupacion)]);

    return `
      ${kpis}
      <div class="inf-grid">
        ${bloque('Citas por estado', d.total ? lienzo('gr-estados', 260) : vacio())}
        ${bloque('Citas por tipo', ranking(d.porTipo.map((t) => ({ etiqueta: t.tipo, valor: t.total }))))}
        ${bloque('Por día de la semana', lienzo('gr-dias', 260), { nota: 'Sin contar citas canceladas.' })}
        ${bloque('Por hora del día', lienzo('gr-horas', 260), { nota: notaPico })}
        ${bloque('Mapa de horas pico (día × hora)', calor, { ancho: 'completo', nota: 'Entre más oscuro, más citas. Sirve para ver cuándo reforzar personal o abrir turnos.' })}
        ${bloque('Ocupación de agenda por doctor', ocupacion, { ancho: 'completo' })}
        ${bloque('Detalle de ocupación', tabla([{ t: 'Doctor' }, { t: 'Cupos ofrecidos', num: true }, { t: 'Citas agendadas', num: true }, { t: 'Ocupación', num: true }], filasOcu), { ancho: 'completo' })}
      </div>`;
  }

  // ============================================================
  // 3. Financiero
  // ============================================================
  function renderFinanciero(d) {
    const t = d.totales;
    const kpis = gridKpis([
      tarjetaKpi('Ingresos recaudados', moneda(t.recaudado), { destacado: true, pie: `<span class="inf-delta igual">${numero(t.pagadas)} facturas pagadas</span>` }),
      tarjetaKpi('Por cobrar (periodo)', moneda(t.porCobrar), { pie: `<span class="inf-delta igual">${numero(t.pendientes)} facturas pendientes</span>` }),
      tarjetaKpi('Total facturado', moneda(t.facturado), { pie: `<span class="inf-delta igual">${numero(t.facturas)} facturas</span>` }),
      tarjetaKpi('Tasa de recaudo', porc(t.tasaRecaudo), { pie: '<span class="inf-delta igual">Recaudado / facturado</span>' }),
      tarjetaKpi('Ticket promedio', moneda(t.ticketPromedio), { pie: '<span class="inf-delta igual">Por factura pagada</span>' }),
      tarjetaKpi('Cartera total a hoy', moneda(d.cartera.total), { pie: `<span class="inf-delta igual">${numero(d.cartera.facturas)} facturas sin pagar</span>` })
    ]);

    const etiquetas = d.serie.map((s) => etiquetaPeriodo(s.periodo));
    graficaBarras('gr-fin-serie', etiquetas, [
      { nombre: 'Recaudado', datos: d.serie.map((s) => s.recaudado), color: PALETA[1] },
      { nombre: 'Pendiente', datos: d.serie.map((s) => s.pendiente), color: PALETA[2] }
    ], { apilado: true, formatoY: (v) => `$${Number(v).toLocaleString('es-CO')}` });

    graficaDona('gr-pago', d.porFormaPago.map((f) => f.forma), d.porFormaPago.map((f) => f.total));
    graficaBarras('gr-cartera', d.cartera.tramos.map((x) => x.tramo), [{ nombre: 'Valor pendiente', datos: d.cartera.tramos.map((x) => x.valor), color: PALETA[3] }],
      { formatoY: (v) => `$${Number(v).toLocaleString('es-CO')}` });

    const filasServicio = d.porServicio.map((s) => [esc(s.nombre), numero(s.cantidad), moneda(s.facturado), moneda(s.recaudado)]);
    const colsServicio = [{ t: 'Servicio' }, { t: 'Cantidad', num: true }, { t: 'Facturado', num: true }, { t: 'Recaudado', num: true }];

    const sinFact = d.sinFacturar.total
      ? `<div class="inf-alerta">⚠ Hay <strong>${numero(d.sinFacturar.total)}</strong> atenciones del periodo que ya se realizaron pero <strong>aún no tienen factura</strong>. Es dinero que se está dejando de cobrar.</div>
         ${tabla([{ t: 'Fecha' }, { t: 'Hora' }, { t: 'Paciente' }, { t: 'Doctor' }],
          d.sinFacturar.detalle.map((s) => [fechaBonita(s.fecha), esc(s.hora), esc(s.paciente), esc(`Dr(a). ${s.doctor}`)]))}
         ${d.sinFacturar.total > d.sinFacturar.detalle.length ? `<p class="inf-nota">Mostrando ${d.sinFacturar.detalle.length} de ${d.sinFacturar.total}.</p>` : ''}`
      : '<div class="inf-ok">✔ Todas las atenciones del periodo están facturadas.</div>';

    const filasCartera = d.cartera.masAntiguas.map((c) => [esc(c.numero), esc(c.paciente), fechaBonita(c.fecha), `${numero(c.dias)} días`, moneda(c.valor)]);

    return `
      ${kpis}
      <div class="inf-grid">
        ${bloque('Ingresos en el tiempo', d.totales.facturas ? lienzo('gr-fin-serie', 280) : vacio('Aún no hay facturas en este periodo.'), { ancho: 'completo', nota: 'Las facturas se cuentan por la fecha en que se emitieron.' })}
        ${bloque('Ingresos por servicio', tabla(colsServicio, filasServicio), { ancho: 'completo' })}
        ${bloque('Recaudo por especialidad', ranking(d.porEspecialidad.map((e) => ({ etiqueta: e.nombre, valor: e.recaudado })), { formato: moneda }))}
        ${bloque('Recaudo por doctor', ranking(d.porDoctor.map((e) => ({ etiqueta: `Dr(a). ${e.nombre}`, valor: e.recaudado })), { formato: moneda, color: PALETA[4] }))}
        ${bloque('Forma de pago', d.porFormaPago.length ? lienzo('gr-pago', 250) : vacio('No hay pagos registrados en este periodo.'))}
        ${bloque('Antigüedad de la cartera', d.cartera.facturas ? lienzo('gr-cartera', 250) : '<div class="inf-ok">✔ No hay cartera pendiente.</div>', { nota: 'Facturas sin pagar a hoy, según los días desde que se emitieron.' })}
        ${bloque('Facturas pendientes más antiguas', tabla([{ t: 'Factura' }, { t: 'Paciente' }, { t: 'Emitida' }, { t: 'Antigüedad', num: true }, { t: 'Valor', num: true }], filasCartera, { vacioTexto: 'No hay facturas pendientes.' }), { ancho: 'completo' })}
        ${bloque('Atenciones sin facturar', sinFact, { ancho: 'completo' })}
      </div>`;
  }

  // ============================================================
  // 4. Doctores y especialidades
  // ============================================================
  function renderDoctores(d) {
    const totalAtendidas = d.doctores.reduce((s, x) => s + x.atendidas, 0);
    const totalIngresos = d.doctores.reduce((s, x) => s + x.ingresos, 0);

    graficaBarras('gr-doc-atendidas', d.doctores.map((x) => `Dr(a). ${x.nombre}`), [
      { nombre: 'Atendidas', datos: d.doctores.map((x) => x.atendidas), color: PALETA[1] },
      { nombre: 'No asistidas', datos: d.doctores.map((x) => x.noAsistidas), color: PALETA[3] },
      { nombre: 'Canceladas', datos: d.doctores.map((x) => x.canceladas), color: '#9ca3af' }
    ], { horizontal: true, apilado: true });

    const filasDoc = d.doctores.map((x, i) => [
      `<strong>${i + 1}.</strong> Dr(a). ${esc(x.nombre)}<br><small>${esc(x.especialidades)}</small>`,
      numero(x.citas), numero(x.atendidas), numero(x.noAsistidas), numero(x.pacientes),
      porc(x.tasaAsistencia), moneda(x.ingresos), x.capacidad ? porc(x.ocupacion) : 'Sin horario'
    ]);
    const colsDoc = [{ t: 'Doctor' }, { t: 'Citas', num: true }, { t: 'Atendidas', num: true }, { t: 'No asist.', num: true },
      { t: 'Pacientes únicos', num: true }, { t: 'Asistencia', num: true }, { t: 'Recaudado', num: true }, { t: 'Ocupación', num: true }];

    const filasEsp = d.especialidades.map((e) => [
      esc(e.nombre), numero(e.citas), numero(e.atendidas), numero(e.noAsistidas), numero(e.pacientes), porc(e.tasaAsistencia), moneda(e.ingresos)
    ]);
    const colsEsp = [{ t: 'Especialidad' }, { t: 'Citas', num: true }, { t: 'Atendidas', num: true }, { t: 'No asist.', num: true },
      { t: 'Pacientes únicos', num: true }, { t: 'Asistencia', num: true }, { t: 'Recaudado', num: true }];

    const kpis = gridKpis([
      tarjetaKpi('Doctores', numero(d.doctores.length), { destacado: true }),
      tarjetaKpi('Atenciones realizadas', numero(totalAtendidas)),
      tarjetaKpi('Promedio por doctor', d.doctores.length ? numero(Math.round((totalAtendidas / d.doctores.length) * 10) / 10) : '—'),
      tarjetaKpi('Recaudado por doctores', moneda(totalIngresos))
    ]);

    return `
      ${kpis}
      <div class="inf-grid">
        ${bloque('Productividad por doctor', d.doctores.length ? lienzo('gr-doc-atendidas', Math.max(220, d.doctores.length * 46 + 70)) : vacio('No hay doctores para estos filtros.'), { ancho: 'completo' })}
        ${bloque('Ranking detallado', tabla(colsDoc, filasDoc), { ancho: 'completo', nota: 'Ordenado por atenciones realizadas. "Recaudado" cuenta solo facturas pagadas del periodo.' })}
        ${bloque('Por especialidad', tabla(colsEsp, filasEsp), { ancho: 'completo', nota: 'Si un doctor tiene varias especialidades, sus citas cuentan en cada una. El recaudo sale del servicio facturado.' })}
      </div>`;
  }

  // ============================================================
  // 5. Morbilidad
  // ============================================================
  function renderMorbilidad(d) {
    const inc = d.incapacidades;
    const kpis = gridKpis([
      tarjetaKpi('Consultas', numero(d.consultas), { destacado: true }),
      tarjetaKpi('Pacientes atendidos', numero(d.pacientes)),
      tarjetaKpi('Incapacidades emitidas', numero(inc.emitidas)),
      tarjetaKpi('Días de incapacidad', numero(inc.dias), { pie: `<span class="inf-delta igual">Promedio ${numero(inc.promedio)} días</span>` })
    ]);

    const etiquetaDx = (x) => (x.codigo ? `${x.codigo} · ${x.descripcion}` : x.descripcion || 'Sin diagnóstico');

    const filasTop = d.topDiagnosticos.map((x, i) => [
      `${i + 1}`, esc(x.codigo || '—'), esc(x.descripcion || 'Sin diagnóstico'), numero(x.casos), numero(x.pacientes), porc(d.consultas ? (x.casos / d.consultas) * 100 : null)
    ]);

    const generos = ['Femenino', 'Masculino', 'Otro / sin dato'];
    const edades = d.edadGenero.filter((e) => e.total > 0);
    graficaBarras('gr-edad-genero', edades.map((e) => e.grupo), generos.map((g, i) => ({
      nombre: g, datos: edades.map((e) => e[g]), color: [PALETA[4], PALETA[0], '#9ca3af'][i]
    })), { apilado: true });

    const listaTop = (arr) => `<ul class="inf-lista">${arr.map((x) => `<li>${esc(etiquetaDx(x))} <strong>(${x.casos})</strong></li>`).join('')}</ul>`;

    const porEdad = d.diagnosticosPorEdad.length
      ? d.diagnosticosPorEdad.map((g) => `<div class="inf-mini"><h4>${esc(g.grupo)}</h4>${listaTop(g.top)}</div>`).join('')
      : vacio();
    const porEsp = d.porEspecialidad.length
      ? d.porEspecialidad.map((g) => `<div class="inf-mini"><h4>${esc(g.especialidad)}</h4>${listaTop(g.top)}</div>`).join('')
      : vacio();

    const filasInc = inc.porDiagnostico.map((x) => [esc(etiquetaDx(x)), numero(x.emitidas), numero(x.dias)]);

    return `
      ${kpis}
      <div class="inf-grid">
        ${bloque('Diagnósticos más frecuentes (CIE-10)', tabla(
          [{ t: '#' }, { t: 'Código' }, { t: 'Diagnóstico' }, { t: 'Casos', num: true }, { t: 'Pacientes', num: true }, { t: '% de consultas', num: true }], filasTop,
          { vacioTexto: 'No hay diagnósticos registrados en este periodo.' }), { ancho: 'completo', nota: 'Perfil de morbilidad: de qué se enferman los pacientes que atiende la IPS.' })}
        ${bloque('Consultas por edad y género', edades.length ? lienzo('gr-edad-genero', 280) : vacio(), { ancho: 'completo', nota: 'Edad calculada a la fecha de cada consulta.' })}
        ${bloque('Diagnósticos principales por grupo de edad', `<div class="inf-minis">${porEdad}</div>`, { ancho: 'completo' })}
        ${bloque('Diagnósticos principales por especialidad', `<div class="inf-minis">${porEsp}</div>`, { ancho: 'completo' })}
        ${bloque('Incapacidades por diagnóstico', tabla([{ t: 'Diagnóstico' }, { t: 'Emitidas', num: true }, { t: 'Días', num: true }], filasInc, { vacioTexto: 'No se emitieron incapacidades en este periodo.' }), { ancho: 'completo' })}
        ${bloque('Exámenes más ordenados', ranking(d.examenes.map((e) => ({ etiqueta: e.nombre, valor: e.total })), { color: PALETA[5] }))}
        ${bloque('Medicamentos más formulados', ranking(d.medicamentos.map((e) => ({ etiqueta: e.nombre, valor: e.total })), { color: PALETA[4] }))}
      </div>`;
  }

  // ============================================================
  // 6. Pacientes
  // ============================================================
  function renderPacientes(d) {
    const kpis = gridKpis([
      tarjetaKpi('Pacientes atendidos', numero(d.atendidos), { destacado: true }),
      tarjetaKpi('Primera vez', numero(d.nuevos), { pie: `<span class="inf-delta igual">${porc(d.atendidos ? (d.nuevos / d.atendidos) * 100 : null)} de los atendidos</span>` }),
      tarjetaKpi('Recurrentes', numero(d.recurrentes), { pie: `<span class="inf-delta igual">${porc(d.atendidos ? (d.recurrentes / d.atendidos) * 100 : null)} de los atendidos</span>` }),
      tarjetaKpi('Nuevos registros', numero(d.registrados), { pie: '<span class="inf-delta igual">Cuentas creadas en el periodo</span>' }),
      tarjetaKpi('Pacientes en la base', numero(d.totalPacientes)),
      tarjetaKpi(`Inactivos (+${d.inactivos.diasUmbral} días)`, numero(d.inactivos.total), { pie: '<span class="inf-delta igual">Sin cita futura</span>' })
    ]);

    graficaDona('gr-nuevos', ['Primera vez', 'Recurrentes'], [d.nuevos, d.recurrentes], [PALETA[2], PALETA[0]]);
    graficaBarras('gr-edad', d.porEdad.map((e) => e.nombre), [{ nombre: 'Pacientes', datos: d.porEdad.map((e) => e.total), color: PALETA[0] }]);
    graficaDona('gr-genero', d.porGenero.map((g) => g.nombre), d.porGenero.map((g) => g.total));

    const filasFrecuentes = d.frecuentes.map((p, i) => [`${i + 1}`, esc(p.nombre), numero(p.visitas), fechaBonita(p.ultima)]);
    const filasInactivos = d.inactivos.detalle.map((p) => [esc(p.nombre), esc(p.telefono || '—'), fechaBonita(p.ultima), `${numero(p.dias)} días`, numero(p.visitas)]);

    return `
      ${kpis}
      <div class="inf-grid">
        ${bloque('Primera vez vs. recurrentes', d.atendidos ? lienzo('gr-nuevos', 250) : vacio(), { nota: 'Primera vez = nunca había sido atendido antes del periodo.' })}
        ${bloque('Pacientes por grupo de edad', d.atendidos ? lienzo('gr-edad', 250) : vacio())}
        ${bloque('Por género', d.atendidos ? lienzo('gr-genero', 250) : vacio())}
        ${bloque('Por ciudad', ranking(d.porCiudad.map((c) => ({ etiqueta: c.nombre, valor: c.total })), { color: PALETA[5] }))}
        ${bloque('Por EPS', ranking(d.porEps.map((c) => ({ etiqueta: c.nombre, valor: c.total })), { color: PALETA[4] }))}
        ${bloque('Pacientes más frecuentes', tabla([{ t: '#' }, { t: 'Paciente' }, { t: 'Visitas', num: true }, { t: 'Última visita', num: true }], filasFrecuentes), { ancho: 'completo' })}
        ${bloque(`Pacientes inactivos (más de ${d.inactivos.diasUmbral} días sin venir)`,
          tabla([{ t: 'Paciente' }, { t: 'Teléfono' }, { t: 'Última visita' }, { t: 'Sin venir', num: true }, { t: 'Visitas previas', num: true }], filasInactivos,
            { vacioTexto: 'No hay pacientes inactivos.' }) +
          (d.inactivos.total > d.inactivos.detalle.length ? `<p class="inf-nota">Mostrando ${d.inactivos.detalle.length} de ${d.inactivos.total}.</p>` : ''),
          { ancho: 'completo', nota: 'Lista para campañas de recordatorio y fidelización. No incluye pacientes con una cita futura.' })}
      </div>`;
  }

  const RENDERIZADORES = {
    resumen: renderResumen, citas: renderCitas, financiero: renderFinanciero,
    doctores: renderDoctores, morbilidad: renderMorbilidad, pacientes: renderPacientes
  };

  // ============================================================
  // Carga y control
  // ============================================================
  function leerFiltros() {
    return { desde: inputDesde.value, hasta: inputHasta.value, doctor: selDoctor.value, especialidad: selEspecialidad.value };
  }

  function textoFiltros() {
    const partes = [];
    if (selDoctor.value) partes.push(`Doctor: ${selDoctor.options[selDoctor.selectedIndex].text}`);
    if (selEspecialidad.value) partes.push(`Especialidad: ${selEspecialidad.options[selEspecialidad.selectedIndex].text}`);
    return partes.length ? partes.join(' · ') : 'Todos los doctores y especialidades';
  }

  function actualizarCabeceraImpresion() {
    cabeceraImpresion.innerHTML = `
      <h1>Consultorio Vida Sana — ${esc(TITULOS[informeActivo])}</h1>
      <p>Periodo: ${fechaBonita(inputDesde.value)} a ${fechaBonita(inputHasta.value)} · ${esc(textoFiltros())}</p>
      <p>Generado el ${new Date().toLocaleString('es-CO')}</p>`;
  }

  async function cargarInforme() {
    mensaje.textContent = '';
    const f = leerFiltros();

    if (!f.desde || !f.hasta) { mensaje.textContent = 'Elige las dos fechas.'; return; }
    if (f.hasta < f.desde) { mensaje.textContent = 'La fecha final no puede ser anterior a la inicial.'; return; }

    const miPeticion = ++peticion;
    contenedor.innerHTML = '<p class="inf-cargando">Generando informe…</p>';
    actualizarCabeceraImpresion();

    const params = new URLSearchParams({ desde: f.desde, hasta: f.hasta });
    if (f.doctor) params.set('doctor', f.doctor);
    if (f.especialidad) params.set('especialidad', f.especialidad);

    try {
      const respuesta = await fetch(`${API}/api/admin/informes/${informeActivo}?${params}`);
      const datos = await respuesta.json();
      if (miPeticion !== peticion) return; // llegó una respuesta vieja

      if (!respuesta.ok) {
        contenedor.innerHTML = '';
        mensaje.textContent = datos.mensaje || 'No se pudo generar el informe.';
        return;
      }

      pendientes = [];
      contenedor.innerHTML = RENDERIZADORES[informeActivo](datos);
      dibujarGraficas();
    } catch (error) {
      if (miPeticion !== peticion) return;
      contenedor.innerHTML = '';
      mensaje.textContent = 'No se pudo conectar con el servidor.';
      console.error(error);
    }
  }

  async function cargarFiltros() {
    if (filtrosCargados) return;
    filtrosCargados = true;
    try {
      const [rd, re] = await Promise.all([
        fetch(`${API}/api/admin/doctores`), fetch(`${API}/api/admin/especialidades`)
      ]);
      const doctores = await rd.json();
      const especialidades = await re.json();
      if (Array.isArray(doctores)) {
        selDoctor.innerHTML = '<option value="">Todos los doctores</option>' +
          doctores.map((d) => `<option value="${d.id_doctor}">Dr(a). ${esc(d.nombres)} ${esc(d.apellidos)}</option>`).join('');
      }
      if (Array.isArray(especialidades)) {
        selEspecialidad.innerHTML = '<option value="">Todas las especialidades</option>' +
          especialidades.map((e) => `<option value="${e.id_especialidad}">${esc(e.nombre)}</option>`).join('');
      }
    } catch (error) {
      filtrosCargados = false;
      console.error(error);
    }
  }

  function aplicarPreset(nombre) {
    const hoy = new Date();
    let desde; let hasta = new Date(hoy);
    if (nombre === 'hoy') desde = new Date(hoy);
    else if (nombre === '7') { desde = new Date(hoy); desde.setDate(desde.getDate() - 6); }
    else if (nombre === '30') { desde = new Date(hoy); desde.setDate(desde.getDate() - 29); }
    else if (nombre === 'mes') desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    else if (nombre === 'mes-ant') {
      desde = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      hasta = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
    } else if (nombre === 'trimestre') desde = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1);
    else if (nombre === 'anio') desde = new Date(hoy.getFullYear(), 0, 1);
    else return;

    inputDesde.value = fechaLocal(desde);
    inputHasta.value = fechaLocal(hasta);
    seccion.querySelectorAll('.inf-preset').forEach((b) => b.classList.toggle('activo', b.dataset.preset === nombre));
    cargarInforme();
  }

  // ---------- Eventos ----------
  seccion.querySelectorAll('.inf-tab').forEach((boton) => {
    boton.addEventListener('click', () => {
      informeActivo = boton.dataset.informe;
      seccion.querySelectorAll('.inf-tab').forEach((b) => b.classList.toggle('activo', b === boton));
      cargarInforme();
    });
  });

  seccion.querySelectorAll('.inf-preset').forEach((boton) => {
    boton.addEventListener('click', () => aplicarPreset(boton.dataset.preset));
  });

  document.getElementById('btnGenerarInforme').addEventListener('click', () => {
    seccion.querySelectorAll('.inf-preset').forEach((b) => b.classList.remove('activo'));
    cargarInforme();
  });

  document.getElementById('btnImprimirInforme').addEventListener('click', () => {
    actualizarCabeceraImpresion();
    window.print();
  });

  // Al abrir la sección "Informes" por primera vez, se cargan los filtros y el resumen del mes.
  let inicializado = false;
  document.querySelectorAll('.nav-item[data-seccion="informes"]').forEach((boton) => {
    boton.addEventListener('click', () => {
      cargarFiltros();
      if (!inicializado) {
        inicializado = true;
        aplicarPreset('mes');
      }
    });
  });
})();