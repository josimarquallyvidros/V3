/* =====================================================================
   ui-tema.js  v1.3
   Tema, menu Configurações e correção definitiva dos controles 3D.
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

    /* ---- CSS local: somente botões realmente ativos ficam azuis ---- */
    if (!document.getElementById("viewerControlsFix")) {
      const style = document.createElement("style");
      style.id = "viewerControlsFix";
      style.textContent = `
        #tab-view .viewer-controls button {
          background: transparent !important;
          background-image: none !important;
          color: var(--muted, #8aa0bf) !important;
          box-shadow: none !important;
        }
        #tab-view .viewer-controls button.on {
          background: var(--acc, #3b82f6) !important;
          background-image: none !important;
          color: #fff !important;
        }
        #tab-view #btnExplosao.on { background: var(--warn, #f59e0b) !important; color: #111 !important; }
        #tab-view #btnOpaco.on { background: var(--acc2, #22d3ee) !important; color: #04121f !important; }
      `;
      document.head.appendChild(style);
    }

    /* ---- menu Configurações ---- */
    const menu = $("menuCfg"), btn = $("btnCfg");
    if (menu && btn) {
      btn.addEventListener("click", e => { e.stopPropagation(); menu.classList.toggle("open"); });
      document.addEventListener("click", e => { if (!menu.contains(e.target)) menu.classList.remove("open"); });
      document.addEventListener("keydown", e => { if (e.key === "Escape") menu.classList.remove("open"); });
      menu.querySelectorAll(".mi, .tab").forEach(el => el.addEventListener("click", () => menu.classList.remove("open")));
    }

    /* ---- destaque do menu ativo ---- */
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

    /* ---- Estado visual 3D: somente 1 câmera e 1 modo ativos ---- */
    function sincronizarControles3D() {
      const viewer = g.viewer3D;

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

      document.querySelectorAll("#cameraPresets button").forEach(b =>
        b.classList.toggle("on", b.dataset.cam === "iso"));
      document.querySelectorAll("#modeGroup button[data-mode]").forEach(b =>
        b.classList.toggle("on", b.dataset.mode === "solido"));

      ["btnCotas", "btnFundo", "btnExplosao", "btnOpaco", "btnAutoRotate"]
        .forEach(id => { const el = $(id); if (el) el.classList.remove("on"); });

      const slider = $("explosaoSlider");
      if (slider) { slider.value = "0"; slider.disabled = true; }

      if (viewer && typeof viewer._syncBotoes === "function") viewer._syncBotoes();

      // Corrige reapresentação caso app.js tenha redeclarado classes antigas.
      document.querySelectorAll("#cameraPresets button").forEach(b =>
        b.classList.toggle("on", b.dataset.cam === "iso"));
      document.querySelectorAll("#modeGroup button[data-mode]").forEach(b =>
        b.classList.toggle("on", b.dataset.mode === "solido"));
    }

    // Remove estados pintados pelo HTML antes dos scripts terminarem.
    document.querySelectorAll("#tab-view .viewer-controls button").forEach(b => b.classList.remove("on"));
    document.querySelectorAll("#cameraPresets button").forEach(b => b.classList.toggle("on", b.dataset.cam === "iso"));
    document.querySelectorAll("#modeGroup button[data-mode]").forEach(b => b.classList.toggle("on", b.dataset.mode === "solido"));

    [50, 150, 300, 600, 1200].forEach(atraso => setTimeout(sincronizarControles3D, atraso));

    // Captura um único clique para câmera/modo, antes dos handlers duplicados.
    document.addEventListener("click", function (e) {
      const camera = e.target.closest("#cameraPresets button[data-cam]");
      if (camera) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const viewer = g.viewer3D;
        if (viewer && typeof viewer.setPreset === "function") viewer.setPreset(camera.dataset.cam);
        document.querySelectorAll("#cameraPresets button").forEach(b => b.classList.toggle("on", b === camera));
        return;
      }

      const mode = e.target.closest("#modeGroup button[data-mode]");
      if (mode) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const viewer = g.viewer3D;
        if (viewer) { viewer.modo = mode.dataset.mode; if (typeof viewer.render === "function") viewer.render(); }
        document.querySelectorAll("#modeGroup button[data-mode]").forEach(b => b.classList.toggle("on", b === mode));
      }
    }, true);

    /* ---- carimbo "Salvo" ---- */
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
