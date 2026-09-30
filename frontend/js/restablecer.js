const parametros = new URLSearchParams(window.location.search);
const token = parametros.get('token');

const formRestablecer = document.getElementById('formRestablecer');
const resultado = document.getElementById('resultado');

if (!token) {
  formRestablecer.style.display = 'none';
  resultado.innerHTML = '<p style="color:#b91c1c;">Este enlace no es válido. Solicita uno nuevo desde "Olvidé mi contraseña".</p>';
}

formRestablecer.addEventListener('submit', async (e) => {
  e.preventDefault();
  resultado.innerHTML = '';

  const contrasena_nueva = document.getElementById('contrasenaNueva').value;
  const contrasenaConfirmar = document.getElementById('contrasenaConfirmar').value;

  if (contrasena_nueva !== contrasenaConfirmar) {
    resultado.innerHTML = '<p style="color:#b91c1c;">Las contraseñas no coinciden.</p>';
    return;
  }

  try {
    const respuesta = await fetch('http://localhost:4000/api/auth/restablecer-contrasena', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, contrasena_nueva })
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      resultado.innerHTML = `<p style="color:#b91c1c;">${datos.mensaje}</p>`;
      return;
    }

    formRestablecer.style.display = 'none';
    resultado.innerHTML = `
      <p style="color:#15803d;">${datos.mensaje}</p>
      <a href="index.html"><button style="width:100%; margin-top:10px;">Ir a iniciar sesión</button></a>
    `;

  } catch (error) {
    resultado.innerHTML = '<p style="color:#b91c1c;">No se pudo conectar con el servidor.</p>';
    console.error(error);
  }
});

document.getElementById('btnVerContrasena').addEventListener('click', () => {
  const input = document.getElementById('contrasenaNueva');
  const esPassword = input.type === 'password';
  input.type = esPassword ? 'text' : 'password';
  document.getElementById('btnVerContrasena').textContent = esPassword ? '🙈' : '👁️';
});