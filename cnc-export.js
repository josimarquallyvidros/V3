/* =====================================================================
   cnc-export.js  v1.0
   Arquivos de corte para router CNC / mesa de corte:
     - DXF (milímetros) de VIDROS e de ACM, uma chapa ao lado da outra
     - G-code (.nc) de ACM, com contorno externo, passes e parâmetros da fresa
   Cada cor/material é encaixado separadamente (como na compra de chapas).
   Parâmetros em Materiais > Parâmetros Globais (diâmetro da fresa, profundidade...).
   Carregar DEPOIS do app.js (usa state, calcularTudo, cortarChapas, matById, toast).
   ===================================================================== */
(function (g) {
  "use strict";
  const num = (v, d) => (v === undefined || v === null || v === "" || isNaN(+v)) ? d : +v;
  const f3 = v => (Math.round(v * 1000) / 1000).toString();

  /** Agrupa as peças por material|cor e encaixa cada grupo em chapas.
   *  Entre as peças fica uma folga (ACM = diâmetro da fresa; vidro = kerf) para a ferramenta passar. */
  function grupos(tipo) {
    const gl = calcularTudo(), p = state.params;
    const pecas = tipo === "acm" ? gl.acm : gl.vidros;
    const chapa = tipo === "acm" ? p.chapaACM : p.chapaVidro;
    const gap = tipo === "acm" ? num(p.cncFresa, 6) : num(p.kerf, 3);
    const por = {};
    (pecas || []).forEach(v => { const k = (v.matId || "") + "|" + (v.cor || "A definir"); (por[k] = por[k] || []).push(v); });
    return Object.keys(por).map(k => {
      const partes = k.split("|"), m = matById(partes[0]);
      const infladas = por[k].map(v => Object.assign({}, v, { largura: (+v.largura || 0) + gap, altura: (+v.altura || 0) + gap }));
      const plano = cortarChapas(infladas, { w: chapa.w + gap, h: chapa.h + gap });
      return { nome: (m && m.nome) || partes[0], cor: partes[1], plano, gap, W: chapa.w, H: chapa.h };
    });
  }
  /** Converte um item do plano para coordenadas reais da chapa (origem no canto superior esquerdo, y para baixo) */
  function geom(it, gap) {
    return {
      peca: { x: it.x, y: it.y, w: it.w - gap, h: it.h - gap },            // tamanho real da peça
      trilha: { x: it.x - gap / 2, y: it.y - gap / 2, w: it.w, h: it.h },   // caminho do centro da fresa (por fora da peça)
      rot: !!it.rotacionado, aviso: !!it.aviso
    };
  }
  const rotulo = it => String(it.rotulo || it.nome || it.descricao || "").replace(/[\r\n]+/g, " ").slice(0, 40);

  /* -------------------------------- DXF -------------------------------- */
  function dxf(grps, tipo) {
    const out = [];
    const add = (c, v) => { out.push(String(c)); out.push(String(v)); };
    const layers = [["CHAPA", 5], ["PECAS", 7], ["TEXTO", 3]];
    if (tipo === "acm") layers.push(["FRESA", 1]);
    add(0, "SECTION"); add(2, "HEADER"); add(9, "$ACADVER"); add(1, "AC1009"); add(9, "$INSUNITS"); add(70, 4); add(0, "ENDSEC");
    add(0, "SECTION"); add(2, "TABLES"); add(0, "TABLE"); add(2, "LAYER"); add(70, layers.length);
    layers.forEach(l => { add(0, "LAYER"); add(2, l[0]); add(70, 0); add(62, l[1]); add(6, "CONTINUOUS"); });
    add(0, "ENDTAB"); add(0, "ENDSEC");
    add(0, "SECTION"); add(2, "ENTITIES");
    const rect = (layer, x, y, w, h) => {
      add(0, "POLYLINE"); add(8, layer); add(66, 1); add(70, 1);
      [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].forEach(pt => { add(0, "VERTEX"); add(8, layer); add(10, f3(pt[0])); add(20, f3(pt[1])); add(30, 0); });
      add(0, "SEQEND"); add(8, layer);
    };
    const texto = (layer, x, y, h, s) => { add(0, "TEXT"); add(8, layer); add(10, f3(x)); add(20, f3(y)); add(30, 0); add(40, f3(h)); add(1, s); };
    let idx = 0;
    grps.forEach(gp => {
      (gp.plano.chapas || []).forEach((ch, ci) => {
        const ox = idx * (gp.W + 400);
        // DXF tem Y para cima: invertemos Y para manter o mesmo desenho do plano de corte
        const Y = (y, h) => gp.H - y - h;
        rect("CHAPA", ox, 0, gp.W, gp.H);
        texto("TEXTO", ox, gp.H + 40, 40, `${gp.nome} - ${gp.cor} - chapa ${ci + 1}  (${gp.W}x${gp.H} mm)`);
        (ch.itens || []).forEach(it => {
          const q = geom(it, gp.gap);
          rect("PECAS", ox + q.peca.x, Y(q.peca.y, q.peca.h), q.peca.w, q.peca.h);
          if (tipo === "acm") rect("FRESA", ox + q.trilha.x, Y(q.trilha.y, q.trilha.h), q.trilha.w, q.trilha.h);
          const th = Math.max(8, Math.min(30, q.peca.h / 5, q.peca.w / 12));
          texto("TEXTO", ox + q.peca.x + 6, Y(q.peca.y, q.peca.h) + q.peca.h / 2 - th / 2, th, `${Math.round(q.peca.w)}x${Math.round(q.peca.h)}${q.rot ? " R" : ""} ${rotulo(it)}`.trim());
        });
        idx++;
      });
    });
    add(0, "ENDSEC"); add(0, "EOF");
    return out.join("\r\n");
  }

  /* ------------------------------- G-CODE ------------------------------- */
  function gcode(grps) {
    const p = state.params, r = num(p.cncFresa, 6) / 2;
    const prof = num(p.cncProf, 4.5), passe = Math.max(0.1, num(p.cncPasse, 2)), zs = num(p.cncZseg, 5);
    const F = num(p.cncAvanco, 3000), Fz = num(p.cncMergulho, 1000), S = num(p.cncRpm, 18000);
    const L = [];
    L.push("(ACM - gerado pelo sistema de orcamento)");
    L.push(`(Fresa ${f3(r * 2)} mm | profundidade ${f3(prof)} mm | passe ${f3(passe)} mm | avanco ${F} mm/min | ${S} rpm)`);
    L.push("(Origem X0 Y0 = canto inferior esquerdo da chapa, Z0 = topo do material)");
    L.push("G21 G90 G17 G40 G49");
    let idx = 0, totalChapas = grps.reduce((s, x) => s + (x.plano.chapas || []).length, 0);
    grps.forEach(gp => {
      (gp.plano.chapas || []).forEach((ch, ci) => {
        idx++;
        L.push("");
        L.push(`(==== CHAPA ${idx}/${totalChapas}: ${String(gp.nome).replace(/[()]/g, "")} - ${String(gp.cor).replace(/[()]/g, "")} - ${gp.W}x${gp.H} ====)`);
        if (idx > 1) L.push("M5"), L.push("M0 (TROCAR A CHAPA E CONFIRMAR)");
        L.push(`M3 S${S}`);
        L.push(`G0 Z${f3(zs)}`);
        // peças menores primeiro (evita movimento da chapa); depois as maiores
        const itens = (ch.itens || []).filter(it => !it.aviso).slice().sort((a, b) => a.w * a.h - b.w * b.h);
        itens.forEach(it => {
          const q = geom(it, gp.gap).trilha;
          // coordenadas reais com Y para cima
          const x0 = q.x, x1 = q.x + q.w, y0 = gp.H - (q.y + q.h), y1 = gp.H - q.y;
          L.push(`(Peca ${Math.round(it.w - gp.gap)}x${Math.round(it.h - gp.gap)} ${rotulo(it).replace(/[()]/g, "")})`);
          L.push(`G0 X${f3(x0)} Y${f3(y0)}`);
          for (let z = passe; ; z += passe) {
            const zz = Math.min(z, prof);
            L.push(`G1 Z${f3(-zz)} F${Fz}`);
            L.push(`G1 X${f3(x1)} Y${f3(y0)} F${F}`);
            L.push(`G1 X${f3(x1)} Y${f3(y1)}`);
            L.push(`G1 X${f3(x0)} Y${f3(y1)}`);
            L.push(`G1 X${f3(x0)} Y${f3(y0)}`);
            if (zz >= prof) break;
          }
          L.push(`G0 Z${f3(zs)}`);
        });
        (ch.itens || []).filter(it => it.aviso).forEach(it => L.push(`(ATENCAO: peca ${Math.round(it.w)}x${Math.round(it.h)} maior que a chapa - nao cortada)`));
      });
    });
    L.push("M5"); L.push("G0 Z" + f3(zs)); L.push("G0 X0 Y0"); L.push("M30");
    return L.join("\r\n");
  }


  /* ===================== PLANO DE CORTE DE PERFIS (tela e impressão) ===================== */
  const escH = s => (typeof escapeHtml === "function") ? escapeHtml(s) : String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  /** "45/45" -> { a: 45, b: 45 }.  Qualquer valor diferente de 45 é tratado como 90 (corte reto) */
  function corteInfo(c) {
    const p = String(c || "90/90").split("/");
    const a = +p[0] === 45 ? 45 : 90, b = +(p[1] !== undefined ? p[1] : p[0]) === 45 ? 45 : 90;
    return { a, b, txt: a + "/" + b, cls: "cut-" + a + "-" + b };
  }
  /**
   * HTML de um grupo (perfil + cor): lista de cortes agrupada (qtd x medida x tipo de corte x uso)
   * e cada barra desenhada com a medida de cada peça e o formato do corte (esquadria 45° ou reto 90°).
   * Usado por renderPlanosCorte() no app.js:  boxP.innerHTML = chaves.map(c => htmlPlanoPerfis(g.cortePerfis[c])).join("")
   */
  g.htmlPlanoPerfis = function (r) {
    if (!r || !r.barras) return "";
    const barra = r.comprimentoBarra || 6000, kerf = r.kerf || 0;
    const grp = {};
    r.barras.forEach(b => b.itens.forEach(p => {
      const ci = corteInfo(p.corte), k = p.comprimento + "|" + ci.txt + "|" + (p.obs || "");
      (grp[k] = grp[k] || { c: p.comprimento, ci, obs: p.obs || "", q: 0 }).q++;
    }));
    const linhas = Object.keys(grp).map(k => grp[k]).sort((x, y) => y.c - x.c)
      .map(x => `<tr><td class="r"><b>${x.q}×</b></td><td class="r"><b>${x.c} mm</b></td><td><span class="cut ${x.ci.cls}">${x.ci.txt}</span></td><td class="small">${escH(x.obs)}</td></tr>`).join("");

    const barras = r.barras.map((b, bi) => {
      let segs = "";
      b.itens.forEach((p, i) => {
        const ci = corteInfo(p.corte), w = (p.comprimento / barra) * 100;
        const pol = `${ci.a === 45 ? "var(--s)" : "0"} 0, calc(100% - ${ci.b === 45 ? "var(--s)" : "0"}) 0, 100% 100%, 0 100%`;
        segs += `<div class="pc ${ci.cls}" style="width:${w}%;clip-path:polygon(${pol})" title="${p.comprimento} mm · corte ${ci.txt}${p.obs ? " · " + escH(p.obs) : ""}"><span class="m">${p.comprimento}</span><span class="t">${ci.txt}</span></div>`;
        if (kerf && i < b.itens.length - 1) segs += `<div class="kf" style="width:${(kerf / barra) * 100}%"></div>`;
      });
      return `<div class="svg-wrap" style="display:block;width:100%"><div class="plano-head"><span class="ph-title">Barra ${bi + 1} — ${barra}mm</span><span class="ph-meta">${b.itens.length} peças · restante ${Math.round(b.restante)}mm${b.aviso ? " · ⚠️ " + escH(b.aviso) : ""}</span></div><div class="barra">${segs}</div></div>`;
    }).join("");

    return `<div class="perfil-grupo" style="margin-bottom:18px">
      <b>${escH(r.nome)}</b> <span class="pill">${r.totalPecas} peças</span> <span class="pill ok">${r.totalBarras} barras</span> <span class="pill">${r.aproveitamento.toFixed(1)}%</span>
      <table class="lista-cortes"><thead><tr><th class="r">Qtd</th><th class="r">Medida</th><th>Corte</th><th>Uso</th></tr></thead><tbody>${linhas}</tbody></table>
      <div class="small" style="margin:4px 0 8px">Legenda: <span class="cut cut-45-45">45/45</span> esquadria nas duas pontas (a medida é a maior face) · <span class="cut cut-90-90">90/90</span> corte reto</div>
      ${barras}</div>`;
  };

  /* ------------------------------- DOWNLOAD ------------------------------- */
  function baixar(nome, texto, mime) {
    const blob = new Blob([texto], { type: mime || "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  /** tipo = "vidros" | "acm"  ·  formato = "dxf" | "gcode" (G-code só para ACM) */
  g.baixarCNC = function (tipo, formato) {
    try {
      if (tipo !== "acm" && formato === "gcode") { toast("G-code só está disponível para ACM", true); return; }
      const grps = grupos(tipo), total = grps.reduce((s, x) => s + (x.plano.chapas || []).length, 0);
      if (!total) { toast("Sem peças de " + (tipo === "acm" ? "ACM" : "vidro") + " para cortar", true); return; }
      const num_ = (state.orcamento.numero || "sem-numero").toString().replace(/[^\w\-]+/g, "_");
      const base = `corte-${tipo}-${num_}`;
      if (formato === "gcode") baixar(base + ".nc", gcode(grps), "text/plain");
      else baixar(base + ".dxf", dxf(grps, tipo), "application/dxf");
      toast(`⬇️ ${formato === "gcode" ? "G-code" : "DXF"} gerado (${total} chapa${total > 1 ? "s" : ""})`);
    } catch (e) { console.error(e); toast("Erro ao gerar o arquivo: " + e.message, true); }
  };
})(window);
