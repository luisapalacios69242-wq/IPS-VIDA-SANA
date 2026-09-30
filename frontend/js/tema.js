// Modo oscuro para todo el sitio.
// 1) Aplica el tema guardado apenas carga el <head>, antes de pintar (sin parpadeo).
// 2) Cuando el DOM está listo, engancha cualquier botón con clase .btn-tema
//    que exista en la página (cada página pone el suyo en su HTML).

(function aplicarTemaGuardado() {
  try {
    const guardado = localStorage.getItem('vs-tema');
    if (guardado === 'dark' || guardado === 'light') {
      document.documentElement.setAttribute('data-theme', guardado);
    }
  } catch (e) {
    // localStorage puede fallar en modo privado; seguimos con el tema por defecto
  }
})();

document.addEventListener('DOMContentLoaded', () => {
  const ICONO_LUNA = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>`;
  const ICONO_SOL = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`;

  const temaActual = () => document.documentElement.getAttribute('data-theme') || 'light';

  document.querySelectorAll('.btn-tema').forEach(btn => {
    btn.innerHTML = temaActual() === 'dark' ? ICONO_SOL : ICONO_LUNA;
    btn.title = temaActual() === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';

    btn.addEventListener('click', () => {
      const nuevo = temaActual() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', nuevo);
      try { localStorage.setItem('vs-tema', nuevo); } catch (e) { /* ignorar */ }

      document.querySelectorAll('.btn-tema').forEach(b => {
        b.innerHTML = nuevo === 'dark' ? ICONO_SOL : ICONO_LUNA;
        b.title = nuevo === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
      });
    });
  });
});