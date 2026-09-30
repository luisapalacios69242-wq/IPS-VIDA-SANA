// Campanita de notificaciones, compartida por cualquier panel.
// Toma la constante API de cada panel. Se monta pasándole el usuario.id_usuario
// (no el id_paciente/id_doctor — las notificaciones se guardan por usuario_id).

const Notificaciones = (() => {
    const ICONO_CAMPANA = `
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    `;

    const TIPO_INFO = {
        recordatorio_paciente: {
            color: '#b45309', fondo: '#fef3c7',
            svg: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>'
        },
        cambio_agenda_doctor: {
            color: '#185fa5', fondo: '#e0edfa',
            svg: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>'
        },
        cita_confirmada: {
            color: '#15803d', fondo: '#dcfce7',
            svg: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
        },
        cita_cancelada: {
            color: '#b91c1c', fondo: '#fee2e2',
            svg: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'
        },
        cita_reprogramada: {
            color: '#7c3aed', fondo: '#ede9fe',
            svg: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"/></svg>'
        }
    };

    const TIPO_DEFAULT = { color: '#5f5e5a', fondo: '#eee', svg: ICONO_CAMPANA };

    function tiempoRelativo(fechaTexto) {
        const fecha = new Date(fechaTexto.replace(' ', 'T'));
        const minutos = Math.floor((new Date() - fecha) / 60000);

        if (minutos < 1) return 'Ahora mismo';
        if (minutos < 60) return `Hace ${minutos} min`;
        const horas = Math.floor(minutos / 60);
        if (horas < 24) return `Hace ${horas} h`;
        const dias = Math.floor(horas / 24);
        return `Hace ${dias} día(s)`;
    }

    function montar({ contenedor, usuarioId }) {
        contenedor.innerHTML = `
          <div class="campana-wrap">
            <button type="button" class="btn-campana" title="Notificaciones">
              ${ICONO_CAMPANA}
              <span class="campana-badge oculto">0</span>
            </button>
            <div class="campana-panel oculto">
              <div class="campana-cabecera">
                <strong>Notificaciones</strong>
                <button type="button" class="campana-leer-todas">Marcar todas como leídas</button>
              </div>
              <div class="campana-lista">Cargando...</div>
            </div>
          </div>
        `;

        const btnCampana = contenedor.querySelector('.btn-campana');
        const badge = contenedor.querySelector('.campana-badge');
        const panel = contenedor.querySelector('.campana-panel');
        const lista = contenedor.querySelector('.campana-lista');
        const btnLeerTodas = contenedor.querySelector('.campana-leer-todas');

        async function actualizarContador() {
            try {
                const respuesta = await fetch(`${API}/api/notificaciones/${usuarioId}/no-leidas`);
                const datos = await respuesta.json();

                if (datos.total > 0) {
                    badge.textContent = datos.total > 9 ? '9+' : datos.total;
                    badge.classList.remove('oculto');
                    btnCampana.classList.add('tiene-pendientes');
                } else {
                    badge.classList.add('oculto');
                    btnCampana.classList.remove('tiene-pendientes');
                }
            } catch (error) {
                console.error(error);
            }
        }

        async function cargarLista() {
            lista.innerHTML = '<p class="campana-vacio">Cargando...</p>';

            try {
                const respuesta = await fetch(`${API}/api/notificaciones/${usuarioId}`);
                const notificaciones = await respuesta.json();

                if (!respuesta.ok) {
                    lista.innerHTML = `<p class="campana-vacio">${notificaciones.mensaje}</p>`;
                    return;
                }

                if (notificaciones.length === 0) {
                    lista.innerHTML = `
                      <div class="campana-vacio">
                        ${ICONO_CAMPANA}
                        <p>No tienes notificaciones.</p>
                      </div>
                    `;
                    return;
                }

                lista.innerHTML = notificaciones.map(n => {
                    const info = TIPO_INFO[n.tipo] || TIPO_DEFAULT;
                    return `
                      <div class="campana-item ${n.leida ? '' : 'no-leida'}" data-id="${n.id_notificacion}">
                        <span class="campana-icono" style="color:${info.color}; background:${info.fondo}">
                          ${info.svg}
                        </span>
                        <div class="campana-texto">
                          <p>${n.mensaje}</p>
                          <span class="campana-fecha">${tiempoRelativo(n.fecha_creacion)}</span>
                        </div>
                        ${n.leida ? '' : '<span class="campana-punto"></span>'}
                      </div>
                    `;
                }).join('');

                lista.querySelectorAll('.campana-item.no-leida').forEach(item => {
                    item.addEventListener('click', async () => {
                        item.classList.remove('no-leida');
                        item.querySelector('.campana-punto')?.remove();
                        try {
                            await fetch(`${API}/api/notificaciones/${item.dataset.id}/leida`, { method: 'PUT' });
                            actualizarContador();
                        } catch (error) {
                            console.error(error);
                        }
                    });
                });

            } catch (error) {
                lista.innerHTML = '<p class="campana-vacio">No se pudieron cargar las notificaciones.</p>';
                console.error(error);
            }
        }

        btnCampana.addEventListener('click', (e) => {
            e.stopPropagation();
            const abierto = !panel.classList.contains('oculto');

            if (abierto) {
                panel.classList.add('oculto');
                return;
            }

            panel.classList.remove('oculto');
            cargarLista();
        });

        document.addEventListener('click', (e) => {
            if (!contenedor.contains(e.target)) panel.classList.add('oculto');
        });

        btnLeerTodas.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                await fetch(`${API}/api/notificaciones/usuario/${usuarioId}/leer-todas`, { method: 'PUT' });
                cargarLista();
                actualizarContador();
            } catch (error) {
                console.error(error);
            }
        });

        actualizarContador();
        setInterval(actualizarContador, 60000);
    }

    return { montar };
})();