const formLogin = document.getElementById('formLogin');
const mensajeError = document.getElementById('mensajeError');

function irAlPanel(rol) {
  const paginas = {
    paciente: 'inicio-paciente.html',
    secretaria: 'inicio-secretaria.html',
    doctor: 'inicio-doctor.html',
    administrador: 'inicio-admin.html'
  };

  if (!paginas[rol]) {
    mensajeError.textContent = 'Rol no reconocido.';
    return;
  }

  window.location.href = paginas[rol];
}

formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  mensajeError.textContent = '';

  const numero_documento = document.getElementById('documento').value;
  const contrasena = document.getElementById('contrasena').value;

  try {
    const respuesta = await fetch('https://ips-vida-sana-production.up.railway.app/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numero_documento, contrasena })
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      mensajeError.textContent = datos.mensaje;
      return;
    }

    if (datos.debeCambiarContrasena) {
      sessionStorage.setItem('cambioPendiente', JSON.stringify({
        usuario: datos.usuario,
        contrasena_actual: contrasena
      }));
      window.location.href = 'cambiar-contrasena.html';
      return;
    }

    localStorage.setItem('usuario', JSON.stringify(datos.usuario));
    irAlPanel(datos.usuario.rol);

  } catch (error) {
    mensajeError.textContent = 'No se pudo conectar con el servidor.';
    console.error(error);
  }
});

const btnVerContrasena = document.getElementById('btnVerContrasena');
const inputContrasena = document.getElementById('contrasena');

btnVerContrasena.addEventListener('click', () => {
  const esPassword = inputContrasena.type === 'password';
  inputContrasena.type = esPassword ? 'text' : 'password';
  btnVerContrasena.textContent = esPassword ? '🙈' : '👁️';
});