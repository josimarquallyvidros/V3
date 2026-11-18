/* =====================================================================
   viewer-ambiente.js  v1.0
   Dados da cena (ambiente.cena), paredes com/sem janela e gerenciador
   dos itens de ambiente (somente visual, fora do orçamento).
   Depende de viewer-moveis.js (window.V3).
   ===================================================================== */
(function (g) {
  "use strict";
  const V3 = g.V3, MM = V3.MM;
  const num = (v, d) => (v === undefined || v === null || v === "" || isNaN(+v)) ? d : +v;
  const clone = o => JSON.parse(JSON.stringify(o));
  const isObj = o => o && typeof o === "object" && !Array.isArray(o);

  /* ------------------------------ CENA ------------------------------- */
  function parede(amb) {
    return {
      ativa: false, cor: "#e9e6df", altura: 2600, esp: 100, dist: 0,
      sobraIni: amb && amb.tipo === "L" ? 0 : 300, sobraFim: 400,
      janela: { ativa: false, largura: 1200, altura: 1000, peitoril: 1100, pos: null, caixilho: "#f5f5f5" }
    };
  }
  V3.cenaPadrao = function (amb) {
    const camadas = {};
    V3.CAMADAS.forEach(c => { camadas[c.id] = { visivel: true, cor: null }; });
    return { v: 1, camadas, luz: 1, sombras: true, elevacao: 0, paredes: { b1: parede(amb), b2: parede(amb) }, itens: [] };
  };
  function fill(t, d) {
    Object.keys(d).forEach(k => {
      if (t[k] === undefined) t[k] = clone({ x: d[k] }).x;
      else if (isObj(t[k]) && isObj(d[k])) fill(t[k], d[k]);
    });
  }
  /** Garante amb.cena completa (cria/complementa sem apagar nada) */
  V3.garantirCena = function (amb) {
    if (!isObj(amb.cena)) amb.cena = V3.cenaPadrao(amb);
    else fill(amb.cena, V3.cenaPadrao(amb));
    if (!Array.isArray(amb.cena.itens)) amb.cena.itens = [];
    return amb.cena;
  };

  /* ----------------- COORDENADAS DOS ITENS (por bloco) ---------------- */
  // Bloco 1: u = Z do mundo, w = X do mundo, frente = +X
  // Bloco 2: u = X do mundo, w = Z do mundo, frente = +Z
  // Bloco 0 (livre): u = X, w = Z
  V3.blocoParaMundo = function (bloco, u, w) { return bloco === 1 ? { x: w, z: u } : { x: u, z: w }; };
  V3.mundoParaBloco = function (bloco, x, z) { return bloco === 1 ? { u: z, w: x } : { u: x, w: z }; };
  V3.rotBase = function (bloco) { return bloco === 1 ? Math.PI / 2 : 0; };

  /* ------------------------------ PAREDES ----------------------------- */
  V3.rangeParede = function (k, cena, info) {
    const p1 = cena.paredes.b1, p2 = cena.paredes.b2;
    const p = k === 1 ? p1 : p2, blk = info.blocos.find(b => b.id === k);
    let ini = -num(p.sobraIni, 0), fim = (blk ? blk.runFim : 0) + num(p.sobraFim, 0);
    if (info.isL) {
      if (k === 1 && p2.ativa) ini = -(num(p2.dist, 0) + num(p2.esp, 100));
      if (k === 2 && p1.ativa) ini = -num(p1.dist, 0);
    }
    return { ini, fim, dist: num(p.dist, 0) };
  };

  V3.construirAmbiente = function (amb, cena, info) {
    const grp = new THREE.Group(); grp.name = "ambiente";
    [1, 2].forEach(k => {
      const blk = info.blocos.find(b => b.id === k), p = cena.paredes["b" + k];
      if (!blk || !p || !p.ativa) return;
      const orient = blk.orient, r = V3.rangeParede(k, cena, info);
      const t = Math.max(20, num(p.esp, 100)), d = num(p.dist, 0), H = Math.max(500, num(p.altura, 2600));
      const matW = V3.mat("parede", p.cor || "#e9e6df");
      const Bx = (mat, u, v, w, du, dv, dw) => {
        const m = orient === "Z" ? V3.box(grp, mat, w, v, u, dw, dv, du) : V3.box(grp, mat, u, v, w, du, dv, dw);
        if (m) { m.castShadow = false; m.receiveShadow = true; m.userData.parede = k; } return m;
      };
      const w0 = -d - t, len = r.fim - r.ini, j = p.janela || {};
      if (!j.ativa || len < 600) { Bx(matW, r.ini, 0, w0, len, H, t); return; }
      const jw = Math.min(Math.max(300, num(j.largura, 1200)), len - 200);
      let jc = (j.pos === null || j.pos === undefined || j.pos === "") ? (r.ini + r.fim) / 2 : num(j.pos, (r.ini + r.fim) / 2);
      jc = Math.min(Math.max(jc, r.ini + 100 + jw / 2), r.fim - 100 - jw / 2);
      const ju0 = jc - jw / 2, ju1 = jc + jw / 2;
      const jv0 = Math.min(Math.max(num(j.peitoril, 1100), 0), H - 300);
      const jv1 = Math.min(H - 100, jv0 + Math.max(200, num(j.altura, 1000)));
      Bx(matW, r.ini, 0, w0, ju0 - r.ini, H, t);
      Bx(matW, ju1, 0, w0, r.fim - ju1, H, t);
      Bx(matW, ju0, 0, w0, jw, jv0, t);
      Bx(matW, ju0, jv1, w0, jw, H - jv1, t);
      const fr = 50, fd = 60, wf = w0 + (t - fd) / 2, matF = V3.mat("fosco", j.caixilho || "#f5f5f5");
      Bx(matF, ju0, jv0, wf, fr, jv1 - jv0, fd);
      Bx(matF, ju1 - fr, jv0, wf, fr, jv1 - jv0, fd);
      Bx(matF, ju0 + fr, jv0, wf, jw - 2 * fr, fr, fd);
      Bx(matF, ju0 + fr, jv1 - fr, wf, jw - 2 * fr, fr, fd);
      if (jw >= 1000) Bx(matF, jc - 20, jv0 + fr, wf, 40, (jv1 - jv0) - 2 * fr, fd);
      Bx(V3.mat("vidro", "#cfeaff"), ju0 + fr, jv0 + fr, w0 + t / 2 - 2, jw - 2 * fr, (jv1 - jv0) - 2 * fr, 4);
      const sky = Bx(V3.mat("ceu", "#ffffff"), ju0 - 300, Math.max(0, jv0 - 300), w0 - 120, jw + 600, (jv1 - jv0) + 600, 4);
      if (sky) sky.castShadow = false;
    });
    return grp;
  };

  /* ------------------------------ ITENS ------------------------------- */
  V3.paramsItem = function (def, over) {
    const o = {}; (def.parametros || []).forEach(q => { o[q.k] = q.def; });
    return Object.assign(o, over || {});
  };
  V3.coresItem = function (def, over) {
    const o = {}; (def.cores || []).forEach(q => { o[q.k] = q.def; });
    return Object.assign(o, over || {});
  };
  /** Trechos (em mm, eixo X local do item) onde uma cristaleira atravessa o topo do bloco.
   *  Só vale para itens com "recortaCristaleira" (ex.: bancada), ligados a um bloco e sem rotação extra. */
  V3.recortesItem = function (it, info) {
    const def = V3.itemDef(it.tipo);
    if (!def || !def.recortaCristaleira || !info || !info.furos || !info.furos.length) return [];
    if (it.bloco !== 1 && it.bloco !== 2) return [];
    const rot = (((+it.rot || 0) % 360) + 360) % 360; if (rot !== 0 && rot !== 180) return [];
    const sgn = (it.bloco === 1 ? -1 : 1) * (rot === 180 ? -1 : 1);   // no bloco 1 o X local aponta contra o sentido do bloco
    const half = (+V3.paramsItem(def, it.params).largura || 0) / 2, u = +it.u || 0, out = [];
    info.furos.filter(f => f.bloco === it.bloco).forEach(f => {
      const a = (f.u0 - u) * sgn, b = (f.u1 - u) * sgn, lo = Math.min(a, b), hi = Math.max(a, b);
      if (hi > -half && lo < half) out.push([Math.round(lo), Math.round(hi)]);
    });
    return out;
  };
  V3.construirItem = function (it, info) {
    const def = V3.itemDef(it.tipo), grp = new THREE.Group();
    grp.userData.itemId = it.id;
    if (!def) return grp;
    try {
      const prm = V3.paramsItem(def, it.params); prm._recortes = V3.recortesItem(it, info);
      const inner = def.construir(prm, V3.coresItem(def, it.cores), V3.H);
      if (inner) grp.add(inner);
    } catch (e) { console.warn("[V3] erro ao construir item", it.tipo, e); }
    return grp;
  };
  V3.aplicarTransform = function (grp, it) {
    const m = V3.blocoParaMundo(it.bloco, num(it.u, 0), num(it.w, 0));
    grp.position.set(m.x * MM, num(it.y, 0) * MM, m.z * MM);
    grp.rotation.set(0, V3.rotBase(it.bloco) + num(it.rot, 0) * Math.PI / 180, 0);
    grp.visible = it.visivel !== false;
  };

  V3.ctxItem = function (bloco, cena, info) {
    const blk = info.blocos.find(b => b.id === bloco) || info.blocos[0];
    const p = cena.paredes["b" + blk.id];
    const parede = p && p.ativa ? V3.rangeParede(blk.id, cena, info) : null;
    let proximoU = blk.runFim + 20;
    (cena.itens || []).forEach(it => {
      const d = V3.itemDef(it.tipo);
      if (d && d.lateral && it.bloco === blk.id) proximoU = Math.max(proximoU, num(it.u, 0) + num((it.params || {}).largura, 600) / 2 + 20);
    });
    return { bloco: blk.id, uIni: blk.vaosIni, uFim: blk.runFim, runIni: blk.runIni, runFim: blk.runFim, prof: blk.prof, topo: blk.topo, chao: 0, parede, bbox: info.bbox, isL: info.isL, proximoU };
  };

  /** Cria o estado de um item novo, já posicionado de forma coerente */
  V3.novoItem = function (tipo, cena, info, bloco) {
    const def = V3.itemDef(tipo); if (!def) return null;
    bloco = (bloco === 2 && info.isL) ? 2 : 1;
    const ctx = V3.ctxItem(bloco, cena, info);
    const p = V3.paramsItem(def, {}), c = V3.coresItem(def, {});
    const o = (def.padrao ? def.padrao(ctx, p) : null) || {};
    return {
      id: "it_" + Math.random().toString(36).slice(2, 9), tipo, nome: def.nome,
      bloco: o.bloco !== undefined ? o.bloco : bloco,
      u: Math.round(num(o.u, (ctx.uIni + ctx.uFim) / 2)), y: Math.round(num(o.y, ctx.topo)), w: Math.round(num(o.w, 150)), rot: num(o.rot, 0),
      visivel: true, params: Object.assign(p, o.params || {}), cores: c
    };
  };
  /** Reposiciona um item existente na posição padrão do seu tipo */
  V3.reposicionarItem = function (it, cena, info) {
    const def = V3.itemDef(it.tipo); if (!def) return;
    const ctx = V3.ctxItem(it.bloco === 2 ? 2 : 1, cena, info);
    const o = (def.padrao ? def.padrao(ctx, V3.paramsItem(def, it.params)) : null) || {};
    if (o.bloco !== undefined) it.bloco = o.bloco;
    if (o.params) it.params = Object.assign({}, it.params || {}, o.params);
    it.u = Math.round(num(o.u, it.u)); it.y = Math.round(num(o.y, it.y)); it.w = Math.round(num(o.w, it.w)); it.rot = 0;
  };
})(window);
