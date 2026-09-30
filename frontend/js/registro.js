const API = 'https://ips-vida-sana-production.up.railway.app';

function fechaLocalHoy() {
    const h = new Date();
    return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
}

document.getElementById('btnRegistrar').addEventListener('click', async () => {
    const mensaje = document.getElementById('mensajeRegistro');
    mensaje.textContent = '';
    mensaje.style.color = '';

    const valor = (id) => document.getElementById(id).value.trim();

    const datos = {
        tipo_documento: valor('reg-tipo-doc'),
        numero_documento: valor('reg-documento'),
        nombres: valor('reg-nombres'),
        apellidos: valor('reg-apellidos'),
        fecha_nacimiento: valor('reg-fecha'),
        genero: valor('reg-genero'),
        estado_civil: valor('reg-estado-civil') || null,
        telefono: valor('reg-telefono'),
        ciudad: valor('reg-ciudad'),
        direccion: valor('reg-direccion'),
        correo: valor('reg-correo'),
        contacto_emergencia_nombre: valor('reg-contacto-nombre'),
        contacto_emergencia_telefono: valor('reg-contacto-telefono'),
        eps: valor('reg-eps') || null
    };

    if (!/^[A-Za-z0-9]{4,20}$/.test(datos.numero_documento)) {
        mensaje.textContent = 'El número de documento debe tener entre 4 y 20 letras o números, sin espacios ni puntos.';
        return;
    }

    const errorValidacion = validarFicha(datos);

    if (errorValidacion) {
        mensaje.textContent = errorValidacion;
        return;
    }

    if (datos.fecha_nacimiento > fechaLocalHoy()) {
        mensaje.textContent = 'La fecha de nacimiento no puede ser futura.';
        return;
    }

    const boton = document.getElementById('btnRegistrar');
    boton.disabled = true;

    try {
        const respuesta = await fetch(`${API}/api/pacientes/registro`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });

        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            mensaje.textContent = resultado.mensaje;
            boton.disabled = false;
            return;
        }

        // Ya está registrado. Para que no tenga que volver a escribir su cédula,
        // lo dejamos directo en la pantalla de crear su contraseña.
        const respLogin = await fetch(`${API}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                numero_documento: datos.numero_documento,
                contrasena: datos.numero_documento
            })
        });

        const datosLogin = await respLogin.json();

        if (!respLogin.ok) {
            mensaje.style.color = '#15803d';
            mensaje.textContent = 'Registro exitoso. Ve a iniciar sesión con tu documento como usuario y contraseña.';
            boton.disabled = false;
            return;
        }

        sessionStorage.setItem('cambioPendiente', JSON.stringify({
            usuario: datosLogin.usuario,
            contrasena_actual: datos.numero_documento
        }));
        window.location.href = 'cambiar-contrasena.html';

    } catch (error) {
        mensaje.textContent = 'No se pudo conectar con el servidor.';
        console.error(error);
        boton.disabled = false;
    }
});