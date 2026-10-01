/* Aplica o tema salvo antes da primeira pintura (evita piscar o tema errado). */
(function () {
  try {
    var t = JSON.parse(localStorage.getItem('atos.tema') || '"escuro"');
    var claro = t === 'claro' || (t === 'sistema' && window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches);
    document.documentElement.setAttribute('data-theme', claro ? 'light' : 'dark');
  } catch (e) { /* armazenamento indisponível: fica o tema escuro */ }
})();
