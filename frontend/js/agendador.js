// Utilidades de citas compartidas por el panel del paciente y el de la secretaria:
//  - Agendador.montar(...): elegir especialidad, doctor, día y horario, o reprogramar una cita existente.
//  - Agendador.listarCitas(...): lista las citas de un paciente con botones Reprogramar y Cancelar.
// Toma la constante API de cada panel.

const Agendador = (() => {
    const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const MESES_ADELANTE = 3;
    const ESTADOS = {
        programada: 'Programada', confirmada: 'Confirmada', en_espera: 'En espera',
        atendida: 'Atendida', cancelada: 'Cancelada', no_asistida: 'No asistida'
    };

    const dosDigitos = (n) => String(n).padStart(2, '0');
    const aTexto = (fecha) => `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;
    const aFecha = (texto) => {
        const [anio, mes, dia] = texto.split('-').map(Number);
        return new Date(anio, mes - 1, dia);
    };
    const fechaLarga = (texto) => {
        const f = aFecha(texto);
        return `${DIAS[f.getDay()]} ${f.getDate()} de ${MESES[f.getMonth()]} de ${f.getFullYear()}`;
    };
    const escapar = (texto) => String(texto ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const capitalizada = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);

    // ---------- Selector: agendar una cita nueva o reprogramar una existente ----------
    function montar({ contenedor, pacienteId, secretariaId = null, alTerminar = () => {}, reprogramar = null }) {
        const modoReprogramar = reprogramar !== null;
        const hoy = new Date();
        const primerMesPermitido = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        const ultimoMesPermitido = new Date(hoy.getFullYear(), hoy.getMonth() + MESES_ADELANTE, 1);
        const horaOriginal = modoReprogramar ? String(reprogramar.hora).slice(0, 5) : null;

        const estado = {
            doctorId: modoReprogramar ? reprogramar.doctor_id : null,
            doctorNombre: modoReprogramar ? reprogramar.doctor_nombre : '',
            mes: primerMesPermitido,
            dias: {},
            fechaSel: null,
            horaSel: null,
            solicitud: 0
        };

        const encabezado = modoReprogramar
            ? `<div style="border-top:1px solid #e5e3da; margin-top:10px; padding-top:10px;">
                 <p style="margin-top:0;">Elige la nueva fecha para la cita con <strong>Dr(a). ${escapar(reprogramar.doctor_nombre)}</strong>.
                 Actualmente: ${fechaLarga(reprogramar.fecha)} a las ${horaOriginal}.</p>
                 <button type="button" data-ag="cerrar" style="width:auto; margin:0 0 10px; background:#fff; color:#5f5e5a; border:1px solid #d3d1c7;">Cerrar</button>
               </div>`
            : `<div class="tarjeta" style="max-width:520px;">
                 <label>Especialidad</label>
                 <select data-ag="especialidad"></select>
                 <label>Doctor</label>
                 <select data-ag="doctor"><option value="">Primero elige una especialidad</option></select>
               </div>`;

        contenedor.innerHTML = `
          ${encabezado}

          <div data-ag="bloque-calendario" class="${modoReprogramar ? '' : 'oculto'}">
            <h3>Elige un día</h3>
            <div class="calendario">
              <div class="cal-cabecera">
                <button type="button" data-ag="mes-anterior">‹</button>
                <strong data-ag="titulo-mes"></strong>
                <button type="button" data-ag="mes-siguiente">›</button>
              </div>
              <div class="cal-semana">
                <span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span>
              </div>
              <div class="cal-dias" data-ag="dias"></div>
              <div class="cal-leyenda">
                <span><i style="background:#e6f1fb;"></i>Con horarios disponibles</span>
                <span><i style="background:#185fa5;"></i>Día elegido</span>
              </div>
            </div>
            <p data-ag="aviso-mes" class="ayuda-calendario"></p>
          </div>

          <div data-ag="bloque-horas" class="oculto">
            <h3 data-ag="titulo-horas"></h3>
            <div class="franjas" data-ag="franjas"></div>
          </div>

          <div data-ag="bloque-confirmar" class="tarjeta oculto" style="max-width:520px;">
            <p data-ag="resumen" style="margin-top:0;"></p>
            <button type="button" data-ag="confirmar">${modoReprogramar ? 'Confirmar nueva fecha' : 'Confirmar cita'}</button>
          </div>

          <p data-ag="mensaje" class="error"></p>
        `;

        const el = (nombre) => contenedor.querySelector(`[data-ag="${nombre}"]`);

        function mostrarError(texto) {
            el('mensaje').style.color = '';
            el('mensaje').textContent = texto;
        }

        function reiniciarSeleccion() {
            estado.solicitud++;
            estado.doctorId = null;
            estado.doctorNombre = '';
            estado.dias = {};
            estado.fechaSel = null;
            estado.horaSel = null;
            ['bloque-calendario', 'bloque-horas', 'bloque-confirmar'].forEach(n => el(n).classList.add('oculto'));
            el('mensaje').textContent = '';
            el('mensaje').style.color = '';
        }

        function limpiar() {
            if (modoReprogramar) return;
            el('especialidad').value = '';
            el('doctor').innerHTML = '<option value="">Primero elige una especialidad</option>';
            reiniciarSeleccion();
        }

        async function cargarEspecialidades() {
            try {
                const respuesta = await fetch(`${API}/citas/especialidades`);
                const lista = await respuesta.json();
                el('especialidad').innerHTML = '<option value="">Selecciona una especialidad</option>' +
                    lista.map(e => `<option value="${e.id_especialidad}">${escapar(e.nombre)}</option>`).join('');
            } catch (error) {
                mostrarError('No se pudieron cargar las especialidades.');
                console.error(error);
            }
        }

        function quitarHorarioActual() {
            const lista = estado.dias[reprogramar.fecha];
            if (!lista) return;
            const filtrada = lista.filter(h => h !== horaOriginal);
            if (filtrada.length > 0) estado.dias[reprogramar.fecha] = filtrada;
            else delete estado.dias[reprogramar.fecha];
        }

        async function cargarMes() {
            const turno = ++estado.solicitud;
            const anio = estado.mes.getFullYear();
            const mes = estado.mes.getMonth();
            const desde = aTexto(new Date(anio, mes, 1));
            const hasta = aTexto(new Date(anio, mes + 1, 0));
            const excluir = modoReprogramar ? `&excluir=${reprogramar.id_cita}` : '';

            el('titulo-mes').textContent = `${capitalizada(MESES[mes])} de ${anio}`;
            el('mes-anterior').disabled = estado.mes <= primerMesPermitido;
            el('mes-siguiente').disabled = estado.mes >= ultimoMesPermitido;
            el('aviso-mes').textContent = '';
            el('dias').innerHTML = '<p style="grid-column:1/-1; font-size:0.85rem;">Buscando horarios...</p>';

            try {
                const respuesta = await fetch(`${API}/citas/disponibilidad/${estado.doctorId}?desde=${desde}&hasta=${hasta}${excluir}`);
                const datos = await respuesta.json();

                if (turno !== estado.solicitud) return;

                if (!respuesta.ok) {
                    el('dias').innerHTML = '';
                    mostrarError(datos.mensaje);
                    return;
                }

                estado.dias = datos.dias;
                if (modoReprogramar) quitarHorarioActual();
            } catch (error) {
                if (turno !== estado.solicitud) return;
                el('dias').innerHTML = '';
                mostrarError('No se pudo conectar con el servidor.');
                console.error(error);
                return;
            }

            dibujarCalendario();
        }

        function dibujarCalendario() {
            const anio = estado.mes.getFullYear();
            const mes = estado.mes.getMonth();
            const desfase = (new Date(anio, mes, 1).getDay() + 6) % 7;
            const diasEnMes = new Date(anio, mes + 1, 0).getDate();
            const hoyTexto = aTexto(new Date());

            let celdas = '';
            for (let i = 0; i < desfase; i++) {
                celdas += '<div class="cal-dia vacio"></div>';
            }

            let conCupo = 0;

            for (let d = 1; d <= diasEnMes; d++) {
                const texto = aTexto(new Date(anio, mes, d));
                const hay = Array.isArray(estado.dias[texto]) && estado.dias[texto].length > 0;
                if (hay) conCupo++;

                const clases = ['cal-dia', hay ? 'disponible' : 'sin-cupo'];
                if (texto === hoyTexto) clases.push('hoy');
                if (texto === estado.fechaSel) clases.push('seleccionado');

                celdas += `<div class="${clases.join(' ')}" ${hay ? `data-fecha="${texto}"` : ''}>${d}</div>`;
            }

            el('dias').innerHTML = celdas;
            el('aviso-mes').textContent = conCupo === 0
                ? 'No hay horarios disponibles en este mes. Prueba con el mes siguiente.'
                : '';
        }

        function dibujarFranjas() {
            const horas = estado.dias[estado.fechaSel] || [];

            el('titulo-horas').textContent = `Horarios disponibles · ${fechaLarga(estado.fechaSel)}`;
            el('franjas').innerHTML = horas.map(h =>
                `<button type="button" class="franja ${h === estado.horaSel ? 'elegida' : ''}" data-hora="${h}">${h}</button>`
            ).join('');
            el('bloque-horas').classList.remove('oculto');
        }

        function seleccionarDia(texto) {
            estado.fechaSel = texto;
            estado.horaSel = null;
            el('bloque-confirmar').classList.add('oculto');
            el('mensaje').textContent = '';
            dibujarCalendario();
            dibujarFranjas();
        }

        function elegirHora(hora) {
            estado.horaSel = hora;
            dibujarFranjas();

            el('resumen').innerHTML = modoReprogramar
                ? `Vas a mover la cita al <strong>${fechaLarga(estado.fechaSel)}</strong> a las <strong>${hora}</strong> ` +
                  `con <strong>Dr(a). ${escapar(estado.doctorNombre)}</strong>.`
                : `Vas a agendar la cita para el <strong>${fechaLarga(estado.fechaSel)}</strong> ` +
                  `a las <strong>${hora}</strong> con <strong>Dr(a). ${escapar(estado.doctorNombre)}</strong>.`;

            el('bloque-confirmar').classList.remove('oculto');
        }

        function cambiarMes(delta) {
            estado.mes = new Date(estado.mes.getFullYear(), estado.mes.getMonth() + delta, 1);
            estado.fechaSel = null;
            estado.horaSel = null;
            el('bloque-horas').classList.add('oculto');
            el('bloque-confirmar').classList.add('oculto');
            cargarMes();
        }

        async function refrescar() {
            estado.horaSel = null;
            el('bloque-confirmar').classList.add('oculto');
            await cargarMes();

            if (estado.fechaSel && (estado.dias[estado.fechaSel] || []).length > 0) {
                dibujarFranjas();
            } else {
                estado.fechaSel = null;
                el('bloque-horas').classList.add('oculto');
                dibujarCalendario();
            }
        }

        el('mes-anterior').addEventListener('click', () => cambiarMes(-1));
        el('mes-siguiente').addEventListener('click', () => cambiarMes(1));

        el('dias').addEventListener('click', (e) => {
            const celda = e.target.closest('.cal-dia');
            if (!celda || !celda.dataset.fecha) return;
            seleccionarDia(celda.dataset.fecha);
        });

        el('franjas').addEventListener('click', (e) => {
            const boton = e.target.closest('.franja');
            if (boton) elegirHora(boton.dataset.hora);
        });

        el('confirmar').addEventListener('click', async () => {
            let paciente_id = null;

            if (!modoReprogramar) {
                paciente_id = pacienteId();

                if (!paciente_id) {
                    mostrarError('Primero indica para qué paciente es la cita.');
                    return;
                }
            }

            if (!estado.doctorId || !estado.fechaSel || !estado.horaSel) return;

            const fecha = estado.fechaSel;
            const hora = estado.horaSel;
            const boton = el('confirmar');
            boton.disabled = true;
            el('mensaje').textContent = '';

            try {
                const cabeceras = { 'Content-Type': 'application/json' };

                const respuesta = modoReprogramar
                    ? await fetch(`${API}/citas/${reprogramar.id_cita}/reprogramar`, {
                        method: 'PUT',
                        headers: cabeceras,
                        body: JSON.stringify({ nueva_fecha: fecha, nueva_hora: `${hora}:00`, secretaria_id: secretariaId })
                    })
                    : await fetch(`${API}/citas`, {
                        method: 'POST',
                        headers: cabeceras,
                        body: JSON.stringify({
                            paciente_id,
                            doctor_id: estado.doctorId,
                            secretaria_id: secretariaId,
                            fecha,
                            hora: `${hora}:00`,
                            tipo: 'consulta'
                        })
                    });

                const datos = await respuesta.json();

                if (!respuesta.ok) {
                    mostrarError(datos.mensaje);
                    await refrescar();
                    return;
                }

                const texto = modoReprogramar
                    ? `Cita reprogramada para el ${fechaLarga(fecha)} a las ${hora}.`
                    : `Cita agendada para el ${fechaLarga(fecha)} a las ${hora}.`;

                el('mensaje').style.color = '#15803d';
                el('mensaje').textContent = texto;

                if (!modoReprogramar) await refrescar();
                alTerminar(texto);

            } catch (error) {
                mostrarError('No se pudo conectar con el servidor.');
                console.error(error);
            } finally {
                boton.disabled = false;
            }
        });

        if (modoReprogramar) {
            el('cerrar').addEventListener('click', () => { contenedor.innerHTML = ''; });
            cargarMes();
        } else {
            el('especialidad').addEventListener('change', async (e) => {
                reiniciarSeleccion();
                const selectDoctor = el('doctor');

                if (!e.target.value) {
                    selectDoctor.innerHTML = '<option value="">Primero elige una especialidad</option>';
                    return;
                }

                try {
                    const respuesta = await fetch(`${API}/citas/doctores/${e.target.value}`);
                    const doctores = await respuesta.json();

                    selectDoctor.innerHTML = doctores.length
                        ? '<option value="">Selecciona un doctor</option>' +
                          doctores.map(d => `<option value="${d.id_doctor}">${escapar(d.nombres)} ${escapar(d.apellidos)}</option>`).join('')
                        : '<option value="">No hay doctores en esta especialidad</option>';
                } catch (error) {
                    mostrarError('No se pudieron cargar los doctores.');
                    console.error(error);
                }
            });

            el('doctor').addEventListener('change', (e) => {
                reiniciarSeleccion();

                if (!e.target.value) return;

                estado.doctorId = e.target.value;
                estado.doctorNombre = e.target.options[e.target.selectedIndex].text;
                estado.mes = primerMesPermitido;
                el('bloque-calendario').classList.remove('oculto');
                cargarMes();
            });

            cargarEspecialidades();
        }

        return { limpiar };
    }

    // ---------- Lista de citas de un paciente, con Reprogramar y Cancelar ----------
    function listarCitas({ contenedor, pacienteId, secretariaId = null, alCambiar = () => {} }) {
        let citasCargadas = [];
        let aviso = '';

        async function cargar() {
            const id = pacienteId();

            if (!id) {
                contenedor.innerHTML = '';
                return;
            }

            contenedor.textContent = 'Cargando...';

            try {
                const respuesta = await fetch(`${API}/citas/paciente/${id}`);
                const citas = await respuesta.json();

                if (!respuesta.ok) {
                    contenedor.textContent = citas.mensaje;
                    return;
                }

                citasCargadas = citas;

                if (citas.length === 0) {
                    aviso = '';
                    contenedor.textContent = 'Aún no hay citas registradas.';
                    return;
                }

                const ahora = new Date();
                const bannerAviso = aviso ? `<p style="color:#15803d;">${escapar(aviso)}</p>` : '';
                aviso = '';

                contenedor.innerHTML = bannerAviso + citas.map(c => {
                    const futura = new Date(`${c.fecha}T${c.hora}`) > ahora;
                    const gestionable = futura && ['programada', 'confirmada'].includes(c.estado);

                    return `
                      <div class="tarjeta" style="max-width:600px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                          <div>
                            <strong>${fechaLarga(c.fecha)} · ${c.hora.slice(0, 5)}</strong><br>
                            <span style="font-size:0.8rem; color:#5f5e5a;">
                              ${escapar(c.especialidad || '')} — Dr(a). ${escapar(c.doctor_nombres)} ${escapar(c.doctor_apellidos)}
                            </span>
                          </div>
                          <span class="estado-badge">${ESTADOS[c.estado] || c.estado}</span>
                        </div>
                        ${gestionable ? `
                          <div style="display:flex; gap:8px; margin-top:10px;">
                            <button type="button" class="btn-reprogramar" data-id="${c.id_cita}" style="width:auto; margin:0; background:#fff; color:#185fa5; border:1px solid #185fa5;">Reprogramar</button>
                            <button type="button" class="btn-cancelar-cita" data-id="${c.id_cita}" style="width:auto; margin:0; background:#fff; color:#b91c1c; border:1px solid #d3d1c7;">Cancelar</button>
                          </div>` : ''}
                        <div data-reprog="${c.id_cita}"></div>
                      </div>`;
                }).join('');

            } catch (error) {
                contenedor.textContent = 'No se pudieron cargar las citas.';
                console.error(error);
            }
        }

        contenedor.addEventListener('click', async (e) => {
            const btnCancelar = e.target.closest('.btn-cancelar-cita');

            if (btnCancelar) {
                const cita = citasCargadas.find(c => String(c.id_cita) === btnCancelar.dataset.id);
                if (!cita) return;

                if (!confirm(`¿Cancelar la cita del ${fechaLarga(cita.fecha)} a las ${cita.hora.slice(0, 5)}?`)) return;

                try {
                    const respuesta = await fetch(`${API}/citas/${cita.id_cita}/cancelar`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ secretaria_id: secretariaId })
                    });
                    const datos = await respuesta.json();

                    if (!respuesta.ok) {
                        alert(datos.mensaje);
                        return;
                    }

                    aviso = 'La cita fue cancelada.';
                    alCambiar();
                    cargar();

                } catch (error) {
                    alert('No se pudo conectar con el servidor.');
                    console.error(error);
                }
                return;
            }

            const btnReprogramar = e.target.closest('.btn-reprogramar');

            if (btnReprogramar) {
                const cita = citasCargadas.find(c => String(c.id_cita) === btnReprogramar.dataset.id);
                if (!cita) return;

                const panel = contenedor.querySelector(`[data-reprog="${cita.id_cita}"]`);

                if (panel.innerHTML.trim()) {
                    panel.innerHTML = '';
                    return;
                }

                montar({
                    contenedor: panel,
                    pacienteId,
                    secretariaId,
                    reprogramar: {
                        id_cita: cita.id_cita,
                        doctor_id: cita.doctor_id,
                        doctor_nombre: `${cita.doctor_nombres} ${cita.doctor_apellidos}`,
                        fecha: cita.fecha,
                        hora: cita.hora
                    },
                    alTerminar: (texto) => {
                        aviso = texto;
                        alCambiar();
                        cargar();
                    }
                });
            }
        });

        return { recargar: cargar };
    }

    return { montar, listarCitas };
})();