// ============================================================
// Informes adicionales del administrador:
//   - Consultas atendidas (qué doctor atendió qué consulta)
//   - Diagnósticos (detalle completo)
//   - Especialidades (detalle completo)
//   - Botón "Exportar a Excel" para cualquier informe
// Requiere js/informes.js (se carga justo antes).
// ============================================================
(() => {
  const IA = window.InformesAdmin;
  if (!IA) return;

  const {
    esc, numero, moneda, porc, fechaBonita, etiquetaPeriodo, vacio, tarjetaKpi, gridKpis, bloque, ranking, tabla, lienzo,
    graficaLinea, graficaBarras, PALETA
  } = IA.h;

  const POR_PAGINA = 20;
  const ESTADO_FACTURA = { pagada: 'Pagada', pendiente: 'Pendiente' };

  const etiquetaDx = (x) => (x && x.codigo ? `${x.codigo} · ${x.descripcion}` : (x && x.descripcion) || '—');

  // ============================================================
  // Consultas atendidas
  // ============================================================
  let consultas = { detalle: [], filtradas: [], pagina: 1, texto: '' };

  function filtrarDetalle() {
    const t = consultas.texto.trim().toLowerCase();
    consultas.filtradas = !t ? consultas.detalle : consultas.detalle.filter((r) =>
      [r.doctor, r.paciente, r.especialidad, r.servicio, r.codigo, r.diagnostico].join(' ').toLowerCase().includes(t));
  }

  function htmlFilasDetalle() {
    const ini = (consultas.pagina - 1) * POR_PAGINA;
    return consultas.filtradas.slice(ini, ini + POR_PAGINA).map((r) => `
      <tr>
        <td>${fechaBonita(r.fecha)}<br><small>${esc(r.hora)}</small></td>
        <td>Dr(a). ${esc(r.doctor)}<br><small>${esc(r.especialidad)}</small></td>
        <td>${esc(r.paciente)}</td>
        <td>${esc(r.servicio)}</td>
        <td>${esc(etiquetaDx({ codigo: r.codigo, descripcion: r.diagnostico || 'Sin diagnóstico' }))}</td>
        <td class="num">${r.valor === null ? '—' : moneda(r.valor)}<br><small>${esc(ESTADO_FACTURA[r.estado_factura] || 'Sin facturar')}</small></td>
      </tr>`).join('') || '<tr><td colspan="6" class="inf-vacio">No hay consultas que coincidan.</td></tr>';
  }

  function htmlPaginacion() {
    const total = consultas.filtradas.length;
    const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    return `
      <span>${numero(total)} consulta(s) · página ${consultas.pagina} de ${paginas}</span>
      <span>
        <button type="button" class="inf-btn-sec" data-pag="-1" ${consultas.pagina <= 1 ? 'disabled' : ''}>← Anterior</button>
        <button type="button" class="inf-btn-sec" data-pag="1" ${consultas.pagina >= paginas ? 'disabled' : ''}>Siguiente →</button>
      </span>`;
  }

  function renderConsultas(d) {
    const t = d.totales;
    consultas = { detalle: d.detalle, filtradas: d.detalle, pagina: 1, texto: '' };

    const kpis = gridKpis([
      tarjetaKpi('Consultas atendidas', numero(t.consultas), { destacado: true }),
      tarjetaKpi('Doctores que atendieron', numero(t.doctores)),
      tarjetaKpi('Pacientes únicos', numero(t.pacientes)),
      tarjetaKpi('Recaudado', moneda(t.recaudado), { pie: `<span class="inf-delta igual">Facturado ${moneda(t.facturado)}</span>` }),
      tarjetaKpi('Sin facturar', numero(t.sinFacturar), { pie: '<span class="inf-delta igual">Consultas sin factura</span>' })
    ]);

    graficaBarras('gr-cons-doctor', d.porDoctor.map((x) => `Dr(a). ${x.nombre}`),
      [{ nombre: 'Consultas atendidas', datos: d.porDoctor.map((x) => x.consultas), color: PALETA[1] }], { horizontal: true });

    const filasDoctor = d.porDoctor.map((x, i) => [
      `<strong>${i + 1}.</strong> <a href="#" class="inf-ver-doctor" data-doctor="${x.id_doctor}">Dr(a). ${esc(x.nombre)}</a><br><small>${esc(x.especialidades)}</small>`,
      numero(x.consultas), numero(x.pacientes), moneda(x.recaudado), numero(x.sinFacturar),
      x.diagnosticoFrecuente ? `${esc(etiquetaDx(x.diagnosticoFrecuente))} <small>(${x.diagnosticoFrecuente.casos})</small>` : '—'
    ]);

    const filasEsp = d.porEspecialidad.map((x) => [
      esc(x.nombre), numero(x.consultas), numero(x.pacientes), numero(x.doctores), moneda(x.recaudado),
      x.diagnosticoFrecuente ? `${esc(etiquetaDx(x.diagnosticoFrecuente))} <small>(${x.diagnosticoFrecuente.casos})</small>` : '—'
    ]);

    const nota = d.detalleTruncado
      ? `Se muestran las ${numero(d.detalle.length)} consultas más recientes de ${numero(d.detalleTotal)}. Acota las fechas o exporta a Excel para ver todas.`
      : '';

    const detalle = `
      <div class="inf-buscador"><input type="search" id="consBuscar" placeholder="Buscar por doctor, paciente, servicio o diagnóstico…"></div>
      <div class="inf-tabla-scroll">
        <table class="inf-tabla">
          <thead><tr><th>Fecha</th><th>Doctor</th><th>Paciente</th><th>Servicio</th><th>Diagnóstico</th><th class="num">Valor</th></tr></thead>
          <tbody id="consCuerpo">${htmlFilasDetalle()}</tbody>
        </table>
      </div>
      <div class="inf-paginacion" id="consPaginacion">${htmlPaginacion()}</div>`;

    return `
      ${kpis}
      <div class="inf-grid">
        ${bloque('Consultas atendidas por doctor', d.porDoctor.length ? lienzo('gr-cons-doctor', Math.max(200, d.porDoctor.length * 44 + 70)) : vacio('Ningún doctor atendió consultas en este periodo.'), { ancho: 'completo' })}
        ${bloque('Qué atendió cada doctor', tabla(
          [{ t: 'Doctor' }, { t: 'Consultas', num: true }, { t: 'Pacientes únicos', num: true }, { t: 'Recaudado', num: true }, { t: 'Sin facturar', num: true }, { t: 'Diagnóstico más frecuente' }],
          filasDoctor), { ancho: 'completo', nota: 'Haz clic en el nombre de un doctor para ver solo sus consultas.' })}
        ${bloque('Por especialidad', tabla(
          [{ t: 'Especialidad' }, { t: 'Consultas', num: true }, { t: 'Pacientes únicos', num: true }, { t: 'Doctores', num: true }, { t: 'Recaudado', num: true }, { t: 'Diagnóstico más frecuente' }],
          filasEsp), { ancho: 'completo' })}
        ${bloque('Detalle de consultas', t.consultas ? detalle : vacio('No hay consultas en este periodo.'), { ancho: 'completo', nota })}
      </div>`;
  }

  // ============================================================
  // Diagnósticos
  // ============================================================
  function renderDiagnosticos(d) {
    const t = d.totales;
    const kpis = gridKpis([
      tarjetaKpi('Consultas', numero(t.consultas), { destacado: true }),
      tarjetaKpi('Diagnósticos distintos', numero(t.distintos)),
      tarjetaKpi('Pacientes únicos', numero(t.pacientes)),
      tarjetaKpi('Con diagnóstico', porc(t.consultas ? (t.conDiagnostico / t.consultas) * 100 : null), { pie: `<span class="inf-delta igual">${numero(t.sinDiagnostico)} sin diagnóstico</span>` })
    ]);

    const filasDx = d.diagnosticos.map((x, i) => [
      `${i + 1}`, esc(x.codigo || '—'), esc(x.descripcion), `<small>${esc(x.capitulo)}</small>`, numero(x.casos), porc(x.porcentaje),
      numero(x.pacientes), numero(x.doctores), `${numero(x.femenino)} / ${numero(x.masculino)}`, esc(x.especialidadPrincipal)
    ]);

    const etiquetas = d.tendencia.periodos.map(etiquetaPeriodo);
    if (d.tendencia.series.length) {
      if (etiquetas.length > 1) graficaLinea('gr-dx-tendencia', etiquetas, d.tendencia.series);
      else graficaBarras('gr-dx-tendencia', d.tendencia.series.map((s) => s.nombre), [{ nombre: 'Casos', datos: d.tendencia.series.map((s) => s.datos[0]), color: PALETA[0] }], { horizontal: true });
    }

    const lista = (arr) => `<ul class="inf-lista">${arr.map((x) => `<li>${esc(etiquetaDx(x))} <strong>(${x.casos})</strong></li>`).join('')}</ul>`;
    const porEsp = d.porEspecialidad.length
      ? d.porEspecialidad.map((g) => `<div class="inf-mini"><h4>${esc(g.especialidad)}</h4><p class="inf-nota">${numero(g.consultas)} consultas · ${numero(g.distintos)} diagnósticos distintos</p>${lista(g.top)}</div>`).join('')
      : vacio();

    const filasDoc = d.porDoctor.map((g) => [
      `Dr(a). ${esc(g.doctor)}<br><small>${esc(g.especialidades)}</small>`, numero(g.consultas), numero(g.distintos),
      g.top.map((x) => `${esc(etiquetaDx(x))} <small>(${x.casos})</small>`).join('<br>') || '—'
    ]);

    return `
      ${kpis}
      <div class="inf-grid">
        ${bloque('Diagnósticos por capítulo CIE-10', ranking(d.capitulos.map((c) => ({ etiqueta: `${c.capitulo} (${porc(c.porcentaje)})`, valor: c.casos })), { color: PALETA[2] }),
          { ancho: 'completo', nota: 'Agrupa los diagnósticos por la gran categoría de enfermedad a la que pertenecen.' })}
        ${bloque('Tendencia de los 5 diagnósticos más frecuentes', d.tendencia.series.length ? lienzo('gr-dx-tendencia', 300) : vacio(), { ancho: 'completo' })}
        ${bloque('Listado de diagnósticos', tabla(
          [{ t: '#' }, { t: 'Código' }, { t: 'Diagnóstico' }, { t: 'Capítulo' }, { t: 'Casos', num: true }, { t: '% total', num: true },
            { t: 'Pacientes', num: true }, { t: 'Doctores', num: true }, { t: 'Mujeres / Hombres', num: true }, { t: 'Especialidad principal' }], filasDx,
          { vacioTexto: 'No hay diagnósticos registrados en este periodo.' }),
          { ancho: 'completo', nota: d.totalDiagnosticosDistintos > d.diagnosticos.length ? `Mostrando los ${d.diagnosticos.length} más frecuentes de ${d.totalDiagnosticosDistintos}. El Excel trae la lista completa.` : '' })}
        ${bloque('Diagnósticos principales por especialidad', `<div class="inf-minis">${porEsp}</div>`, { ancho: 'completo' })}
        ${bloque('Diagnósticos que atiende cada doctor', tabla(
          [{ t: 'Doctor' }, { t: 'Consultas', num: true }, { t: 'Dx distintos', num: true }, { t: 'Los 3 más frecuentes' }], filasDoc), { ancho: 'completo' })}
      </div>`;
  }

  // ============================================================
  // Especialidades
  // ============================================================
  function renderEspecialidades(d) {
    const t = d.totales;
    const kpis = gridKpis([
      tarjetaKpi('Especialidades', numero(t.especialidades), { destacado: true }),
      tarjetaKpi('Consultas atendidas', numero(t.consultas)),
      tarjetaKpi('Pacientes únicos', numero(t.pacientes)),
      tarjetaKpi('Recaudado', moneda(t.recaudado)),
      tarjetaKpi('Ticket promedio', moneda(t.ticketPromedio), { pie: '<span class="inf-delta igual">Por factura pagada</span>' })
    ]);

    graficaBarras('gr-esp-consultas', d.especialidades.map((e) => e.nombre), [
      { nombre: 'Consultas atendidas', datos: d.especialidades.map((e) => e.consultas), color: PALETA[1] },
      { nombre: 'No asistidas', datos: d.especialidades.map((e) => e.noAsistidas), color: PALETA[3] }
    ]);

    const filas = d.especialidades.map((e) => [
      esc(e.nombre), numero(e.citas), numero(e.consultas), numero(e.noAsistidas), porc(e.tasaInasistencia), numero(e.pacientes),
      moneda(e.recaudado), porc(e.porcentajeIngresos), moneda(e.ticketPromedio)
    ]);

    const tarjetas = d.especialidades.map((e) => `
      <div class="inf-mini">
        <h4>${esc(e.nombre)}</h4>
        <p class="inf-nota">${e.doctores.length ? e.doctores.map((x) => `Dr(a). ${esc(x)}`).join(', ') : 'Sin consultas atendidas en el periodo'}</p>
        <strong>Diagnósticos más frecuentes</strong>
        ${e.diagnosticos.length ? `<ul class="inf-lista">${e.diagnosticos.map((x) => `<li>${esc(etiquetaDx(x))} <strong>(${x.casos})</strong></li>`).join('')}</ul>` : '<p class="inf-vacio">Sin datos.</p>'}
        <strong>Servicios prestados</strong>
        ${e.servicios.length ? `<ul class="inf-lista">${e.servicios.map((s) => `<li>${esc(s.nombre)} <strong>(${s.cantidad})</strong> · ${moneda(s.recaudado)}</li>`).join('')}</ul>` : '<p class="inf-vacio">Sin datos.</p>'}
      </div>`).join('');

    return `
      ${kpis}
      <div class="inf-grid">
        ${bloque('Consultas por especialidad', d.especialidades.length ? lienzo('gr-esp-consultas', 280) : vacio('No hay especialidades para estos filtros.'), { ancho: 'completo' })}
        ${bloque('Comparativo de especialidades', tabla(
          [{ t: 'Especialidad' }, { t: 'Citas', num: true }, { t: 'Atendidas', num: true }, { t: 'No asist.', num: true }, { t: 'Inasistencia', num: true },
            { t: 'Pacientes únicos', num: true }, { t: 'Recaudado', num: true }, { t: '% ingresos', num: true }, { t: 'Ticket prom.', num: true }], filas),
          { ancho: 'completo', nota: 'Las citas se cuentan por la especialidad del doctor; el recaudo, por el servicio facturado.' })}
        ${bloque('Ficha de cada especialidad', `<div class="inf-minis">${tarjetas || vacio()}</div>`, { ancho: 'completo' })}
      </div>`;
  }

  IA.registrar('consultas', 'Consultas atendidas', renderConsultas);
  IA.registrar('diagnosticos', 'Diagnósticos', renderDiagnosticos);
  IA.registrar('especialidades', 'Especialidades', renderEspecialidades);

  // ---------- Eventos de la pestaña "Consultas atendidas" ----------
  const resultado = document.getElementById('resultadoInformes');

  resultado.addEventListener('input', (e) => {
    if (e.target.id !== 'consBuscar') return;
    consultas.texto = e.target.value;
    consultas.pagina = 1;
    filtrarDetalle();
    document.getElementById('consCuerpo').innerHTML = htmlFilasDetalle();
    document.getElementById('consPaginacion').innerHTML = htmlPaginacion();
  });

  resultado.addEventListener('click', (e) => {
    const pag = e.target.closest('[data-pag]');
    if (pag) {
      consultas.pagina = Math.max(1, consultas.pagina + Number(pag.dataset.pag));
      document.getElementById('consCuerpo').innerHTML = htmlFilasDetalle();
      document.getElementById('consPaginacion').innerHTML = htmlPaginacion();
      return;
    }
    const doctor = e.target.closest('.inf-ver-doctor');
    if (doctor) {
      e.preventDefault();
      document.getElementById('infDoctor').value = doctor.dataset.doctor;
      document.getElementById('btnGenerarInforme').click();
    }
  });

  // ---------- Exportar a Excel ----------
  const btnExcel = document.getElementById('btnExcelInforme');
  if (btnExcel) {
    btnExcel.addEventListener('click', async () => {
      const mensaje = document.getElementById('mensajeInforme');
      const f = IA.filtros();
      mensaje.textContent = '';
      if (!f.desde || !f.hasta) { mensaje.textContent = 'Elige las dos fechas.'; return; }

      const params = new URLSearchParams({ desde: f.desde, hasta: f.hasta });
      if (f.doctor) params.set('doctor', f.doctor);
      if (f.especialidad) params.set('especialidad', f.especialidad);

      const textoOriginal = btnExcel.textContent;
      btnExcel.disabled = true;
      btnExcel.textContent = 'Generando…';
      try {
        const respuesta = await fetch(`${API}/api/admin/informes/${IA.informeActivo()}/excel?${params}`);
        if (!respuesta.ok) {
          let texto = 'No se pudo generar el Excel.';
          try { texto = (await respuesta.json()).mensaje || texto; } catch (_) { /* respuesta sin JSON */ }
          mensaje.textContent = texto;
          return;
        }
        const blob = await respuesta.blob();
        const enlace = document.createElement('a');
        enlace.href = URL.createObjectURL(blob);
        enlace.download = `informe-${IA.informeActivo()}-${f.desde}_a_${f.hasta}.xlsx`;
        document.body.appendChild(enlace);
        enlace.click();
        enlace.remove();
        setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
      } catch (error) {
        mensaje.textContent = 'No se pudo conectar con el servidor.';
        console.error(error);
      } finally {
        btnExcel.disabled = false;
        btnExcel.textContent = textoOriginal;
      }
    });
  }
})();