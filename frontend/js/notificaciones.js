// Campanita de notificaciones, compartida por cualquier panel.
// Toma la constante API de cada panel. Se monta pasándole el usuario.id_usuario
// (no el id_paciente/id_doctor — las notificaciones se guardan por usuario_id).

const Notificaciones = (() => {
    const TIPO_ICONO = {
        recordatorio_paciente: '⏰',
        cambio_agenda_doctor: '📋',
        cita_confirmada: '✅',
        cita_cancelada: '❌',
        cita_reprogramada: '🔄'
    };

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
              🔔<span class="campana-badge oculto">0</span>
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
                } else {
                    badge.classList.add('oculto');
                }
            } catch (error) {
                console.error(error);
            }
        }

        async function cargarLista() {
            lista.innerHTML = 'Cargando...';

            try {
                const respuesta = await fetch(`${API}/api/notificaciones/${usuarioId}`);
                const notificaciones = await respuesta.json();

                if (!respuesta.ok) {
                    lista.textContent = notificaciones.mensaje;
                    return;
                }

                if (notificaciones.length === 0) {
                    lista.innerHTML = '<p class="campana-vacio">No tienes notificaciones.</p>';
                    return;
                }

                lista.innerHTML = notificaciones.map(n => `
                  <div class="campana-item ${n.leida ? '' : 'no-leida'}" data-id="${n.id_notificacion}">
                    <span class="campana-icono">${TIPO_ICONO[n.tipo] || '🔔'}</span>
                    <div>
                      <p>${n.mensaje}</p>
                      <span class="campana-fecha">${tiempoRelativo(n.fecha_creacion)}</span>
                    </div>
                  </div>
                `).join('');

                lista.querySelectorAll('.campana-item.no-leida').forEach(item => {
                    item.addEventListener('click', async () => {
                        item.classList.remove('no-leida');
                        try {
                            await fetch(`${API}/api/notificaciones/${item.dataset.id}/leida`, { method: 'PUT' });
                            actualizarContador();
                        } catch (error) {
                            console.error(error);
                        }
                    });
                });

            } catch (error) {
                lista.textContent = 'No se pudieron cargar las notificaciones.';
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