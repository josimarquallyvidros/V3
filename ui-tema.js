/* =====================================================================
   ui-tema.js  v1.2
   Interface: tema, menu Configurações, estado inicial dos controles 3D
   e carimbo "Salvo". Corrige os controles 3D sem duplicar cliques.
   ===================================================================== */
(function (g) {
  "use strict";
  const root = document.documentElement;
  const $ = id => document.getElementById(id);

  function setTema(t) {
    root.setAttribute("data-theme", t);
    try { localStorage.setItem("orcaTema", t); } catch (e) {}
    const b = $("themeToggle");
    if (b) {
      b.setAttribute("aria-pressed", t === "dark");
      b.title = t === "dark" ? "Tema escuro (clique para o claro)" : "Tema claro (clique para o escuro)";
    }
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", t === "dark" ? "#081733" : "#0a2a5e");
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

    /* ---- Visualização 3D: estado inicial seguro ---- */
    const viewer = g.viewer3D;

    function sincronizarControles3D() {
      if (viewer && typeof viewer._syncBotoes === "function") {
        viewer._syncBotoes();
        return;
      }

      document.querySelectorAll("#cameraPresets button").forEach(b =>
        b.classList.toggle("on", b.dataset.cam === "iso"));
      document.querySelectorAll("#modeGroup button[data-mode]").forEach(b =>
        b.classList.toggle("on", b.dataset.mode === "solido"));

      ["btnCotas", "btnFundo", "btnExplosao", "btnOpaco", "btnAutoRotate"]
        .forEach(id => { const el = $(id); if (el) el.classList.remove("on"); });
    }

    // Remove imediatamente as classes antigas deixadas pelo index.html.
    document.querySelectorAll("#tab-view .viewer-controls button.on").forEach(b => b.classList.remove("on"));

    if (viewer) {
      viewer._presetAtual = "iso";
      viewer.modo = "solido";
      viewer.cotas = false;
      viewer.vidroOpaco = false;
      viewer.fundoBranco = false;
      viewer.explosaoAtiva = false;
      viewer.explosao = 0;
      if (viewer.controls) viewer.controls.autoRotate = false;
    }

    const slider = $("explosaoSlider");
    if (slider) { slider.value = "0"; slider.disabled = true; }

    sincronizarControles3D();

    // O visualizador é iniciado por app.js depois do DOMContentLoaded.
    // Reaplica o estado em alguns momentos para impedir classes residuais.
    [100, 300, 600, 1200].forEach(atraso => setTimeout(sincronizarControles3D, atraso));

    /* ---- Clique único: evita que app.js e viewer3d.js processem juntos ---- */
    document.addEventListener("click", function (e) {
      const camera = e.target.closest("#cameraPresets button[data-cam]");
      if (camera) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (viewer && typeof viewer.setPreset === "function") viewer.setPreset(camera.dataset.cam);
        document.querySelectorAll("#cameraPresets button").forEach(b => b.classList.toggle("on", b === camera));
        return;
      }

      const mode = e.target.closest("#modeGroup button[data-mode]");
      if (mode) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (viewer) {
          viewer.modo = mode.dataset.mode;
          if (typeof viewer.render === "function") viewer.render();
        }
        document.querySelectorAll("#modeGroup button[data-mode]").forEach(b => b.classList.toggle("on", b === mode));
      }
    }, true);

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
