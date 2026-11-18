/* =====================================================================
   ui-tema.js  v1.0
   Só interface: alternar tema claro/escuro (lembra a escolha), menu
   "Configurações", destaque do menu ativo e carimbo "Salvo".
   Não altera dados nem cálculos. A troca de abas continua sendo a do app.js
   (qualquer  .tabs > .tab[data-tab]  funciona, inclusive dentro dos menus).
   ===================================================================== */
(function (g) {
  "use strict";
  const root = document.documentElement;
  const $ = id => document.getElementById(id);

  function setTema(t) {
    root.setAttribute("data-theme", t);
    try { localStorage.setItem("orcaTema", t); } catch (e) {}
    const b = $("themeToggle"); if (b) { b.setAttribute("aria-pressed", t === "dark"); b.title = t === "dark" ? "Tema escuro (clique para o claro)" : "Tema claro (clique para o escuro)"; }
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", t === "dark" ? "#081733" : "#0a2a5e");
  }
  g.alternarTema = function () { setTema(root.getAttribute("data-theme") === "dark" ? "light" : "dark"); };

  document.addEventListener("DOMContentLoaded", function () {
    setTema(root.getAttribute("data-theme") || "light");

    /* ---- menu Configurações ---- */
    const menu = $("menuCfg"), btn = $("btnCfg");
    if (menu && btn) {
      btn.addEventListener("click", e => { e.stopPropagation(); menu.classList.toggle("open"); });
      document.addEventListener("click", e => { if (!menu.contains(e.target)) menu.classList.remove("open"); });
      document.addEventListener("keydown", e => { if (e.key === "Escape") menu.classList.remove("open"); });
      menu.querySelectorAll(".mi, .tab").forEach(el => el.addEventListener("click", () => menu.classList.remove("open")));
    }

    /* ---- destaque do menu ativo + rolagem até a seção pedida ---- */
    function marcarAtivo() {
      const on = document.querySelector(".tabs > .tab.on");
      if (btn) btn.classList.toggle("on", !!(on && on.closest(".menu-pop")));
    }
    document.addEventListener("click", e => {
      const t = e.target.closest(".tabs > .tab"); if (!t) return;
      setTimeout(() => {
        marcarAtivo();
        const alvo = t.dataset.scroll && document.querySelector(t.dataset.scroll);
        if (alvo) alvo.scrollIntoView({ behavior: "smooth", block: "start" });
        else window.scrollTo({ top: 0, behavior: "smooth" });
      }, 40);
    });

    /* ---- carimbo "Salvo" no cabeçalho (espelha o autosave da barra de status) ---- */
    const sb = $("sbAutosave"), stamp = $("saveStamp");
    if (sb && stamp) {
      const sync = () => {
        const t = (sb.textContent || "").replace(/^autosave:\s*/i, "").trim();
        stamp.textContent = t && t !== "—" ? new Date().toLocaleDateString("pt-BR") + " " + t.slice(0, 5) : "—";
      };
      new MutationObserver(sync).observe(sb, { childList: true, characterData: true, subtree: true });
      sync();
    }
  });
})(window);
