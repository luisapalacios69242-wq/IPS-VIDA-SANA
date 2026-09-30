const API = 'https://ips-vida-sana-production.up.railway.app';

const pendiente = JSON.parse(sessionStorage.getItem('cambioPendiente') || 'null');

if (!pendiente) {
  window.location.href = 'index.html';
}

const formCambiar = document.getElementById('formCambiar');
const mensajeError = document.getElementById('mensajeError');

function irAlPanel(rol) {
  const paginas = {
    paciente: 'inicio-paciente.html',
    secretaria: 'inicio-secretaria.html',
    doctor: 'inicio-doctor.html',
    administrador: 'inicio-admin.html'
  };
  window.location.href = paginas[rol] || 'index.html';
}

formCambiar.addEventListener('submit', async (e) => {
  e.preventDefault();
  mensajeError.textContent = '';

  const contrasena_nueva = document.getElementById('contrasenaNueva').value;
  const confirmar = document.getElementById('contrasenaConfirmar').value;

  if (contrasena_nueva.length < 6) {
    mensajeError.textContent = 'La contraseña debe tener al menos 6 caracteres.';
    return;
  }

  if (contrasena_nueva !== confirmar) {
    mensajeError.textContent = 'Las contraseñas no coinciden.';
    return;
  }

  if (contrasena_nueva === pendiente.contrasena_actual) {
    mensajeError.textContent = 'La nueva contraseña debe ser distinta a tu cédula.';
    return;
  }

  try {
    const respuesta = await fetch(`${API}/api/auth/cambiar-contrasena`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id_usuario: pendiente.usuario.id_usuario,
        contrasena_actual: pendiente.contrasena_actual,
        contrasena_nueva
      })
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      mensajeError.textContent = datos.mensaje;
      return;
    }

    localStorage.setItem('usuario', JSON.stringify({ ...pendiente.usuario, contrasena_temporal: 0 }));
    sessionStorage.removeItem('cambioPendiente');
    irAlPanel(pendiente.usuario.rol);

  } catch (error) {
    mensajeError.textContent = 'No se pudo conectar con el servidor.';
    console.error(error);
  }
});

document.getElementById('btnVerContrasena').addEventListener('click', () => {
  const input = document.getElementById('contrasenaNueva');
  const esPassword = input.type === 'password';
  input.type = esPassword ? 'text' : 'password';
  document.getElementById('btnVerContrasena').textContent = esPassword ? '🙈' : '👁️';
});