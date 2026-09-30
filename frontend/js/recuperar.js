const formRecuperar = document.getElementById('formRecuperar');
const resultado = document.getElementById('resultado');

formRecuperar.addEventListener('submit', async (e) => {
  e.preventDefault();
  resultado.innerHTML = 'Enviando...';

  const numero_documento_o_correo = document.getElementById('documentoOCorreo').value;

  try {
    const respuesta = await fetch('https://ips-vida-sana-production.up.railway.app/api/auth/olvide-contrasena', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numero_documento_o_correo })
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      resultado.innerHTML = `<p style="color:#b91c1c;">${datos.mensaje}</p>`;
      return;
    }

    resultado.innerHTML = `
      <p style="color:#15803d;">${datos.mensaje}</p>
      ${datos.vistaPreviaCorreo ? `
        <p style="color:#5f5e5a; margin-top:10px;">
          No pudimos enviar el correo en este momento, pero aquí tienes tu enlace de restablecimiento:
        </p>
        <a href="${datos.vistaPreviaCorreo}" target="_blank">
          <button type="button" style="width:100%; padding:9px; background:#fff; color:#185fa5; border:1px solid #185fa5; border-radius:8px; font-weight:600; margin-top:6px;">
            Ir a restablecer mi contraseña
          </button>
        </a>
      ` : ''}
    `;

  } catch (error) {
    resultado.innerHTML = '<p style="color:#b91c1c;">No se pudo conectar con el servidor.</p>';
    console.error(error);
  }
});