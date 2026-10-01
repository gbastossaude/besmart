/* =====================================================================
   ATOS SISTEMA — main.js
   Inicia o sistema depois que todos os módulos carregaram.
   (Arquivo separado para não precisar de script inline — permite CSP estrita.)
   ===================================================================== */
(function (global) {
  'use strict';
  const iniciar = () => { if (global.App && global.API) global.App.start(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})(window);
