/* =====================================================================
   viewer-ui.js  v1.0
   Painel lateral do visualizador: camadas e cores, cena, paredes/janela,
   itens de ambiente (lista + edição de posição/medidas/cores) e imagem.
   Depende de V3 (viewer-moveis/ambiente) e do viewer3D.
   ===================================================================== */
(function (g) {
  "use strict";
  const V3 = g.V3, $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const numOr = (v, d) => (v === "" || v === null || v === undefined || isNaN(+v)) ? d : +v;
  const val = v => (v === null || v === undefined) ? "" : v;
  const UI = g.V3UI = { v: null, open: { camadas: true, itens: true } };

  UI.init = function (viewer) {
    this.v = viewer;
    viewer.hooks.ambiente = () => UI.refresh();
    viewer.hooks.selecao = () => { UI.marcarSelecao(); UI.renderItemEditor(); };
    viewer.hooks.item = it => UI.atualizarCamposItem(it);
    const p = $("viewerPanel"); if (!p) return;
    p.addEventListener("input", e => UI.onCampo(e, false));
    p.addEventListener("change", e => UI.onCampo(e, true));
    p.addEventListener("click", e => UI.onClique(e));
    UI.refresh();
  };

  /* ------------------------------ SEÇÕES ------------------------------ */
  function sec(id, titulo, corpo) {
    return `<details class="vp-sec" data-sec="${id}" ${UI.open[id] ? "open" : ""}><summary>${titulo}</summary><div class="vp-body">${corpo}</div></details>`;
  }
  function campo(label, attrs, valor, tipo, extra) {
    return `<label class="vp-f"><span>${label}</span><input type="${tipo || "number"}" ${attrs} value="${esc(valor)}" ${extra || ""}></label>`;
  }
  function cor(label, attrs, valor) { return `<label class="vp-f vp-c"><span>${label}</span><input type="color" ${attrs} value="${esc(valor)}"></label>`; }

  function secCamadas() {
    const cena = UI.v.cena, amb = UI.v.amb;
    const linhas = V3.CAMADAS.map(c => {
      const L = cena.camadas[c.id] || {}, efetiva = L.cor || V3.corBaseCamada(c.id, amb);
      return `<div class="vp-row">
        <label class="vp-chk"><input type="checkbox" data-a="layer" data-id="${c.id}" data-p="visivel" ${L.visivel === false ? "" : "checked"}><span>${c.nome}</span></label>
        <input type="color" data-a="layer" data-id="${c.id}" data-p="cor" value="${efetiva}" title="Cor desta camada (só visual)">
        <button class="vp-mini" data-do="layer-reset" data-id="${c.id}" title="Voltar à cor do orçamento" ${L.cor ? "" : "disabled"}>↺</button>
      </div>`;
    }).join("");
    return sec("camadas", "🧱 Camadas e cores", linhas +
      `<div class="vp-actions"><button data-do="layers-on">👁 Mostrar tudo</button><button data-do="layers-front-off">🚪 Ocultar frentes</button></div>
       <div class="vp-hint">As cores daqui são só visuais. A cor do orçamento continua nos campos do vão.</div>`);
  }
  function secCena() {
    const c = UI.v.cena;
    return sec("cena", "💡 Cena e luz",
      campo("Altura do móvel ao piso (mm)", `data-a="cena" data-k="elevacao" step="10" min="0"`, c.elevacao) +
      `<label class="vp-f"><span>Intensidade da luz</span><input type="range" data-a="cena" data-k="luz" min="0.3" max="1.8" step="0.05" value="${c.luz}"></label>
       <label class="vp-chk"><input type="checkbox" data-a="cena" data-k="sombras" ${c.sombras === false ? "" : "checked"}><span>Sombras</span></label>`);
  }
  function blocoParede(b) {
    const p = UI.v.cena.paredes["b" + b], j = p.janela;
    let h = `<div class="vp-sub"><label class="vp-chk"><input type="checkbox" data-a="parede" data-b="${b}" data-k="ativa" ${p.ativa ? "checked" : ""}><span><b>Parede atrás do bloco ${b}</b></span></label>`;
    if (p.ativa) {
      h += cor("Cor", `data-a="parede" data-b="${b}" data-k="cor"`, p.cor) +
        campo("Altura (mm)", `data-a="parede" data-b="${b}" data-k="altura" step="50" min="500"`, p.altura) +
        campo("Distância do móvel (mm)", `data-a="parede" data-b="${b}" data-k="dist" step="5" min="0"`, p.dist) +
        campo("Sobra no início (mm)", `data-a="parede" data-b="${b}" data-k="sobraIni" step="50"`, p.sobraIni) +
        campo("Sobra no fim (mm)", `data-a="parede" data-b="${b}" data-k="sobraFim" step="50"`, p.sobraFim) +
        `<label class="vp-chk"><input type="checkbox" data-a="janela" data-b="${b}" data-k="ativa" ${j.ativa ? "checked" : ""}><span>Com janela</span></label>`;
      if (j.ativa) {
        h += campo("Largura da janela (mm)", `data-a="janela" data-b="${b}" data-k="largura" step="50" min="300"`, j.largura) +
          campo("Altura da janela (mm)", `data-a="janela" data-b="${b}" data-k="altura" step="50" min="200"`, j.altura) +
          campo("Peitoril do piso (mm)", `data-a="janela" data-b="${b}" data-k="peitoril" step="50" min="0"`, j.peitoril) +
          campo("Posição do centro (mm, vazio = centro)", `data-a="janela" data-b="${b}" data-k="pos" step="50" placeholder="centro"`, val(j.pos)) +
          cor("Caixilho", `data-a="janela" data-b="${b}" data-k="caixilho"`, j.caixilho);
      }
    }
    return h + "</div>";
  }
  function secParedes() {
    const isL = UI.v.info && UI.v.info.isL;
    return sec("paredes", "🧱 Parede e janela",
      blocoParede(1) + (isL ? blocoParede(2) + `<div class="vp-actions"><button data-do="paredes-ambas">Parede nos 2 blocos</button></div>` : "") +
      `<div class="vp-hint">A parede fica atrás do bloco. Para ver o piso, adicione o item "Piso".</div>`);
  }
  function secItens() {
    const cena = UI.v.cena, cat = V3.itensCatalogo().filter(d => d.id !== "exemplo");
    const lista = cena.itens.map(it => `<div class="vp-item ${it.id === UI.v.selId ? "on" : ""}" data-id="${it.id}">
        <input type="checkbox" data-a="ivis" data-id="${it.id}" ${it.visivel === false ? "" : "checked"} title="Mostrar/ocultar">
        <button class="vp-name" data-do="sel" data-id="${it.id}">${esc(it.nome || it.tipo)}</button>
        <button class="vp-mini" data-do="dup" data-id="${it.id}" title="Duplicar">⧉</button>
        <button class="vp-mini" data-do="del" data-id="${it.id}" title="Remover">🗑</button></div>`).join("");
    return sec("itens", "🍳 Itens do ambiente <small>(só visual)</small>",
      `<div class="vp-add"><select id="vpNovo">${cat.map(d => `<option value="${d.id}">${esc(d.nome)}</option>`).join("")}</select>${UI.v.info && UI.v.info.isL ? '<select id="vpBloco" title="Em qual bloco o item será colocado"><option value="0">Bloco: automático</option><option value="1">Bloco 1</option><option value="2">Bloco 2</option></select>' : ""}<button data-do="add">＋ Adicionar</button></div>
       <div class="vp-list">${lista || '<div class="vp-hint">Nenhum item ainda.</div>'}</div>
       <div id="vpItemEditor"></div>`);
  }
  function secImagem() {
    const o = UI.v.opcoesFoto, chk = (k, t) => `<label class="vp-chk"><input type="checkbox" data-a="foto" data-k="${k}" ${o[k] ? "checked" : ""}><span>${t}</span></label>`;
    const opt = (v, t, s) => `<option value="${v}" ${s === v ? "selected" : ""}>${t}</option>`;
    return sec("imagem", "📸 Imagem final",
      `<label class="vp-f"><span>Fundo</span><select data-a="foto" data-k="fundo">${opt("claro", "Claro (degradê)", o.fundo)}${opt("branco", "Branco", o.fundo)}${opt("escuro", "Escuro (igual à tela)", o.fundo)}${opt("transparente", "Transparente", o.fundo)}</select></label>
       <label class="vp-f"><span>Resolução</span><select data-a="foto" data-k="resolucao">${opt("1280x720", "1280×720", o.resolucao)}${opt("1920x1080", "1920×1080 (Full HD)", o.resolucao)}${opt("3840x2160", "3840×2160 (4K)", o.resolucao)}</select></label>
       ${chk("logo", "Logo no canto superior esquerdo")}${chk("cotas", "Incluir cotas")}${chk("legenda", "Incluir legenda de cores")}${chk("titulo", "Nome do ambiente e cliente")}${chk("enquadrar", "Enquadrar o móvel automaticamente")}
       <div class="vp-actions"><button data-do="png">📸 Baixar PNG</button><button data-do="print">🖨️ Imprimir</button></div>`);
  }

  /* --------------------------- EDITOR DO ITEM --------------------------- */
  UI.renderItemEditor = function () {
    const box = $("vpItemEditor"); if (!box) return;
    const v = UI.v, it = v.selId ? v._itemPorId(v.selId) : null;
    if (!it) { box.innerHTML = '<div class="vp-hint">Clique num item na cena ou na lista para editar posição, medidas e cores.</div>'; return; }
    const def = V3.itemDef(it.tipo) || { parametros: [], cores: [] }, isL = v.info && v.info.isL;
    const livre = it.bloco === 0;
    const P = V3.paramsItem(def, it.params), C = V3.coresItem(def, it.cores);
    const bl = (n, t) => `<option value="${n}" ${it.bloco === n ? "selected" : ""}>${t}</option>`;
    const params = (def.parametros || []).map(q => q.tipo === "select"
      ? `<label class="vp-f"><span>${q.label}</span><select data-a="param" data-k="${q.k}">${q.opcoes.map(o => `<option value="${o[0]}" ${P[q.k] === o[0] ? "selected" : ""}>${o[1]}</option>`).join("")}</select></label>`
      : campo(q.label, `data-a="param" data-k="${q.k}" step="${q.step || 1}" min="${q.min !== undefined ? q.min : ""}" max="${q.max !== undefined ? q.max : ""}"`, P[q.k])).join("");
    const cores = (def.cores || []).map(q => cor(q.label, `data-a="icor" data-k="${q.k}"`, C[q.k])).join("");
    box.innerHTML = `<div class="vp-sub"><div class="vp-title">✏️ ${esc(it.nome)}</div>
      ${campo("Nome", `data-a="item" data-k="nome"`, it.nome, "text")}
      <label class="vp-f"><span>Posicionar em relação a</span><select data-a="item" data-k="bloco">${bl(1, "Bloco 1")}${isL ? bl(2, "Bloco 2") : ""}${bl(0, "Livre (X/Z do mundo)")}</select></label>
      ${campo(livre ? "X (mm)" : "Ao longo do bloco (mm)", `data-a="item" data-k="u" step="10"`, it.u)}
      ${campo("Altura da base (mm)", `data-a="item" data-k="y" step="10"`, it.y)}
      ${campo(livre ? "Z (mm)" : "Recuo da parede (mm)", `data-a="item" data-k="w" step="10"`, it.w)}
      ${campo("Rotação (°)", `data-a="item" data-k="rot" step="15"`, it.rot)}
      <div class="vp-actions"><button data-do="gz-translate" class="${v.gizmoMode === "translate" ? "on" : ""}">✥ Mover na cena</button><button data-do="gz-rotate" class="${v.gizmoMode === "rotate" ? "on" : ""}">⟳ Girar</button><button data-do="gz-off" class="${v.gizmoMode === "off" ? "on" : ""}">✕ Sem gizmo</button></div>
      <div class="vp-hint">Posição medida a partir do centro do item. Arraste as setas na cena (encaixe de 10 mm).</div>
      ${params}${cores}
      <div class="vp-actions"><button data-do="reset">↩ Posição padrão</button></div></div>`;
  };
  UI.atualizarCamposItem = function (it) {
    const box = $("vpItemEditor"); if (!box) return;
    ["u", "y", "w", "rot"].forEach(k => { const el = box.querySelector(`[data-a="item"][data-k="${k}"]`); if (el && document.activeElement !== el) el.value = it[k]; });
  };
  UI.marcarSelecao = function () {
    document.querySelectorAll("#viewerPanel .vp-item").forEach(el => el.classList.toggle("on", el.dataset.id === UI.v.selId));
  };

  /* ------------------------------ REFRESH ------------------------------ */
  UI.refresh = function () {
    const el = $("viewerPanel"); if (!el || !UI.v) return;
    el.querySelectorAll("details[data-sec]").forEach(d => { UI.open[d.dataset.sec] = d.open; });
    if (!UI.v.amb || !UI.v.cena || !UI.v.info) { el.innerHTML = '<div class="vp-hint">Adicione um ambiente para configurar a cena.</div>'; return; }
    el.innerHTML = secCamadas() + secCena() + secParedes() + secItens() + secImagem();
    UI.renderItemEditor();
  };

  /* ------------------------------- CAMPOS ------------------------------- */
  UI.onCampo = function (e, final) {
    const el = e.target.closest("[data-a]"); if (!el) return;
    const v = UI.v, cena = v.cena; if (!cena) return;
    const a = el.dataset.a, k = el.dataset.k, isChk = el.type === "checkbox", x = isChk ? el.checked : el.value;
    let refresh = false, editor = false;

    if (a === "layer") {
      const L = cena.camadas[el.dataset.id]; if (!L) return;
      if (el.dataset.p === "visivel") L.visivel = x; else { L.cor = x; if (final) refresh = true; }
    } else if (a === "cena") {
      if (k === "sombras") cena.sombras = x; else if (x !== "") cena[k] = numOr(x, k === "luz" ? 1 : 0);
    } else if (a === "parede") {
      const p = cena.paredes["b" + el.dataset.b]; if (!p) return;
      if (k === "ativa") { p.ativa = x; refresh = true; } else if (k === "cor") p.cor = x; else if (x !== "") p[k] = numOr(x, p[k]);
    } else if (a === "janela") {
      const p = cena.paredes["b" + el.dataset.b]; if (!p) return; const j = p.janela;
      if (k === "ativa") { j.ativa = x; refresh = true; } else if (k === "caixilho") j.caixilho = x;
      else if (k === "pos") j.pos = x === "" ? null : numOr(x, null); else if (x !== "") j[k] = numOr(x, j[k]);
    } else if (a === "foto") {
      v.opcoesFoto[k] = isChk ? x : x; return;
    } else if (a === "ivis") {
      const it = v._itemPorId(el.dataset.id); if (!it) return; it.visivel = x;
    } else if (a === "item" || a === "param" || a === "icor") {
      const it = v.selId ? v._itemPorId(v.selId) : null; if (!it) return;
      if (a === "icor") { it.cores = it.cores || {}; it.cores[k] = x; }
      else if (a === "param") {
        const def = V3.itemDef(it.tipo), q = def && (def.parametros || []).find(z => z.k === k); if (!q) return;
        it.params = it.params || {};
        if (q.tipo === "select") it.params[k] = x; else if (x !== "") it.params[k] = numOr(x, q.def);
      } else if (k === "nome") { it.nome = x; }
      else if (k === "bloco") {
        const nb = +x, ob = it.bloco, m = V3.blocoParaMundo(ob, +it.u || 0, +it.w || 0);
        const rotMundo = V3.rotBase(ob) + (+it.rot || 0) * Math.PI / 180, n = V3.mundoParaBloco(nb, m.x, m.z);
        it.bloco = nb; it.u = Math.round(n.u); it.w = Math.round(n.w);
        let r = (rotMundo - V3.rotBase(nb)) * 180 / Math.PI; it.rot = Math.round(((r + 180) % 360 + 360) % 360 - 180);
        editor = true;
      } else if (x !== "") it[k] = numOr(x, it[k]);
    } else return;

    v.render();
    if (final) { v._salvar(); if (refresh) UI.refresh(); if (editor) UI.renderItemEditor(); if (a === "item" && k === "nome") { const n = document.querySelector(`#viewerPanel .vp-item[data-id="${v.selId}"] .vp-name`); if (n) n.textContent = x; } }
  };

  /* ------------------------------- CLIQUES ------------------------------- */
  UI.onClique = function (e) {
    const b = e.target.closest("[data-do]"); if (!b) return;
    const v = UI.v, cena = v.cena, id = b.dataset.id, d = b.dataset.do;
    if (!cena && d !== "png" && d !== "print") return;
    switch (d) {
      case "layer-reset": if (cena.camadas[id]) cena.camadas[id].cor = null; break;
      case "layers-on": V3.CAMADAS.forEach(c => { cena.camadas[c.id].visivel = true; }); break;
      case "layers-front-off": ["frente_perfis", "vidro", "vidro_pintado", "acm"].forEach(c => { cena.camadas[c].visivel = false; }); break;
      case "paredes-ambas": cena.paredes.b1.ativa = true; cena.paredes.b2.ativa = true; break;
      case "add": {
        const sel = $("vpNovo"); if (!sel) return;
        const bs = $("vpBloco"); let bloco = bs ? (+bs.value || 0) : 1;
        if (!bloco) {                                   // automático: 1º item no bloco 1, o seguinte do mesmo tipo no bloco 2
          bloco = 1;
          if (v.info.isL) { const tem = b => cena.itens.some(i => i.tipo === sel.value && i.bloco === b); if (tem(1) && !tem(2)) bloco = 2; }
        }
        const it = V3.novoItem(sel.value, cena, v.info, bloco); if (!it) return;
        cena.itens.push(it); v.render(); v._salvar(); v.selecionarItem(it.id); UI.refresh(); return;
      }
      case "sel": v.selecionarItem(id); return;
      case "dup": {
        const o = v._itemPorId(id); if (!o) return;
        const c = JSON.parse(JSON.stringify(o)); c.id = "it_" + Math.random().toString(36).slice(2, 9); c.nome = (o.nome || "") + " (cópia)"; c.u = (+o.u || 0) + 150;
        cena.itens.push(c); v.render(); v._salvar(); v.selecionarItem(c.id); UI.refresh(); return;
      }
      case "del": cena.itens = cena.itens.filter(i => i.id !== id); if (v.selId === id) v._deselecionar(true); v.render(); v._salvar(); UI.refresh(); return;
      case "reset": { const it = v.selId && v._itemPorId(v.selId); if (it) { V3.reposicionarItem(it, cena, v.info); v.render(); v._salvar(); UI.renderItemEditor(); } return; }
      case "gz-translate": case "gz-rotate": case "gz-off": v.setGizmoMode(d.slice(3)); UI.renderItemEditor(); return;
      case "png": v.snapshot(false); return;
      case "print": if (typeof g.imprimirVisualizacao === "function") g.imprimirVisualizacao(); else v.snapshot(true); return;
      default: return;
    }
    v.render(); v._salvar(); UI.refresh();
  };
})(window);
