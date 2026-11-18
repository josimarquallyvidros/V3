/* =====================================================================
   viewer-moveis.js  v1.0
   Cores, materiais PBR, geração do móvel por CAMADAS, cotas e legenda.
   Expõe window.V3.  (Não usa THREE no carregamento, só quando chamado.)
   Unidade interna da cena: METROS.  Todas as medidas de entrada: mm.
   Eixos: X = profundidade do bloco 1 (frente do bloco 1 = +X)
          Z = comprimento do bloco 1 / profundidade do bloco 2 (frente do bloco 2 = +Z)
          Y = altura (chão em Y = 0)
   ===================================================================== */
(function (g) {
  "use strict";
  const MM = 0.001;
  const V3 = (g.V3 = g.V3 || {});
  V3.MM = MM;

  /* ------------------------------ CORES ------------------------------ */
  const PERFIL_HEX = { "Bronze": "#a0522d", "Preto": "#1a1a1a", "Branco": "#e8e8e8", "Champanhe": "#d9cbb0", "Fosco": "#5a5a5a", "A definir": "#7c3aed" };
  const VIDRO_COMUM = { "Incolor": "#cfeaff", "Fume": "#4a4f55", "Champanhe": "#9c7448", "A definir": "#9bb5cc" };
  const VIDRO_PINTADO = { "Preto": "#121212", "Branco": "#f3f3f1", "Cinza": "#8a8a8a", "Bege": "#e7d9be" };
  const ACM_HEX = { "ACM Preto": "#1b1b1b", "ACM Branco": "#eeeeea", "ACM Cinza": "#8c8e91", "ACM Amadeirado": "#8a5a34" };
  const COR_PUXADOR = "#c0c8d4", COR_ACM_BASE = "#7d8288", COR_VIDRO_INTERNO = "#cfeaff";

  V3.GRUPOS_COR_VIDRO = [
    { rotulo: "Vidro", itens: ["Incolor", "Fume", "Champanhe"] },
    { rotulo: "Vidro pintado", itens: ["Preto", "Branco", "Cinza", "Bege"] },
    { rotulo: "ACM", itens: ["ACM Preto", "ACM Branco", "ACM Cinza", "ACM Amadeirado"] }
  ];
  V3.CORES_VIDRO = [].concat(...V3.GRUPOS_COR_VIDRO.map(x => x.itens), ["A definir"]);
  V3.COR_PUXADOR = COR_PUXADOR;

  V3.hexPerfil = function (c) { return PERFIL_HEX[c] || "#64748b"; };
  V3.classificarCorVidro = function (cor) {
    cor = String(cor || "Incolor").trim();
    if (ACM_HEX[cor]) return { tipo: "acm", hex: ACM_HEX[cor], cor, madeira: cor === "ACM Amadeirado" };
    if (VIDRO_PINTADO[cor]) return { tipo: "pintado", hex: VIDRO_PINTADO[cor], cor };
    return { tipo: "comum", hex: VIDRO_COMUM[cor] || "#cfeaff", cor };
  };
  V3.hexCorVidro = function (cor) { return V3.classificarCorVidro(cor).hex; };

  /** Gera as <option> agrupadas (Vidro / Vidro pintado / ACM) para o seletor do app.js */
  V3.optsCorVidro = function (sel) {
    const op = c => `<option value="${c}" ${sel === c ? "selected" : ""}>${c}</option>`;
    return V3.GRUPOS_COR_VIDRO.map(gr => `<optgroup label="${gr.rotulo}">${gr.itens.map(op).join("")}</optgroup>`).join("") + op("A definir");
  };

  /** Cor "de fábrica" de cada camada (mostrada no seletor de cor do painel) */
  V3.corBaseCamada = function (id, amb) {
    const cls = V3.classificarCorVidro(amb && amb.corVidro);
    switch (id) {
      case "estrutura": case "tubo": case "frente_perfis": return V3.hexPerfil(amb && amb.corPerfil);
      case "vidro": return cls.tipo === "comum" ? cls.hex : "#cfeaff";
      case "vidro_pintado": return cls.tipo === "pintado" ? cls.hex : "#121212";
      case "acm": return cls.tipo === "acm" ? cls.hex : "#8c8e91";
      case "prateleiras": return COR_VIDRO_INTERNO;
      case "acessorios": return COR_PUXADOR;
      case "acm_base": return COR_ACM_BASE;
    }
    return "#999999";
  };

  V3.CAMADAS = [
    { id: "estrutura", nome: "Estrutura (perfis)" },
    { id: "tubo", nome: "Base: tubo 50x50" },
    { id: "frente_perfis", nome: "Frente: perfis" },
    { id: "vidro", nome: "Frente: vidro" },
    { id: "vidro_pintado", nome: "Frente: vidro pintado" },
    { id: "acm", nome: "Frente: ACM" },
    { id: "prateleiras", nome: "Prateleiras / vidros internos" },
    { id: "acessorios", nome: "Acessórios" },
    { id: "acm_base", nome: "Base ACM (interno)" }
  ];

  /* ---------------------------- TEXTURAS ----------------------------- */
  function rng(seed) { let a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function srgb(tex) {
    if ("colorSpace" in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    else if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
  }
  function hexToRgb(h) { return { r: parseInt(h.slice(1, 3), 16) || 0, g: parseInt(h.slice(3, 5), 16) || 0, b: parseInt(h.slice(5, 7), 16) || 0 }; }
  function lum(h) { const c = hexToRgb(h); return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255; }

  function texMadeira(hex) {
    const c = document.createElement("canvas"); c.width = c.height = 512;
    const x = c.getContext("2d"), r = rng(7);
    x.fillStyle = hex; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 220; i++) {
      const px = r() * 512, w = 0.5 + r() * 3;
      x.fillStyle = r() < 0.5 ? `rgba(0,0,0,${0.04 + r() * 0.14})` : `rgba(255,255,255,${0.03 + r() * 0.08})`;
      x.fillRect(px, 0, w, 512);
    }
    for (let i = 0; i < 26; i++) {
      x.strokeStyle = `rgba(40,20,5,${0.08 + r() * 0.15})`; x.lineWidth = 0.6 + r() * 1.4;
      x.beginPath(); let px = r() * 512; x.moveTo(px, 0);
      for (let y = 0; y <= 512; y += 32) { px += (r() - 0.5) * 10; x.lineTo(px, y); }
      x.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; srgb(t); return t;
  }
  function texPiso(tipo, hex, rx, ry) {
    const S = 1024, c = document.createElement("canvas"); c.width = c.height = S;
    const x = c.getContext("2d"), r = rng(11);
    x.fillStyle = hex; x.fillRect(0, 0, S, S);
    if (tipo === "madeira") {
      const rows = 8, h = S / rows;
      for (let i = 0; i < rows; i++) {
        let px = -r() * S * 0.5;
        while (px < S) {
          const w = S * (0.35 + r() * 0.35);
          x.fillStyle = r() < 0.5 ? `rgba(0,0,0,${r() * 0.12})` : `rgba(255,255,255,${r() * 0.10})`;
          x.fillRect(px, i * h, w, h);
          for (let k = 0; k < 10; k++) {
            x.strokeStyle = `rgba(60,35,10,${0.05 + r() * 0.1})`; x.lineWidth = 1;
            const yy = i * h + r() * h; x.beginPath(); x.moveTo(px, yy); x.lineTo(px + w, yy + (r() - 0.5) * 4); x.stroke();
          }
          x.fillStyle = "rgba(20,10,0,0.55)"; x.fillRect(px, i * h, 2, h); px += w;
        }
        x.fillStyle = "rgba(20,10,0,0.55)"; x.fillRect(0, i * h, S, 2);
      }
    } else if (tipo === "porcelanato") {
      const n = 2, s = S / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { x.fillStyle = `rgba(0,0,0,${r() * 0.07})`; x.fillRect(i * s, j * s, s, s); }
      x.fillStyle = "rgba(60,60,60,0.55)";
      for (let i = 0; i < n; i++) { x.fillRect(i * s, 0, 3, S); x.fillRect(0, i * s, S, 3); }
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; srgb(t); return t;
  }
  function texCeu() {
    const c = document.createElement("canvas"); c.width = 4; c.height = 256;
    const x = c.getContext("2d"), gr = x.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, "#7fb8ff"); gr.addColorStop(0.55, "#cfe6ff"); gr.addColorStop(1, "#ffffff");
    x.fillStyle = gr; x.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c); srgb(t); return t;
  }

  /* ---------------------------- MATERIAIS ---------------------------- */
 const cache = {};
  // Cada vidro comum tem opacidade e reflexo próprios: o Fumê é bem escuro e quase sem brilho de ambiente,
  // o Champanhe é dourado translúcido e o Incolor é leve. Sem isso o reflexo claro "lavava" a tinta.
  const VIDRO_AJUSTE = {
    "#cfeaff": { op: 0.20, env: 1.5, cc: 1 },     // Incolor
    "#4a4f55": { op: 0.80, env: 0.45, cc: 0.3 },  // Fumê
    "#9c7448": { op: 0.50, env: 0.9, cc: 0.6 },   // Champanhe
    "#9bb5cc": { op: 0.32, env: 1.2, cc: 1 }      // A definir
  };
  const glass = h => {
    const L = lum(h), a = VIDRO_AJUSTE[String(h).toLowerCase()] || { op: Math.min(0.85, 0.16 + (1 - L) * 0.7), env: Math.max(0.4, 1.5 - (1 - L) * 1.1), cc: 1 };
    return new THREE.MeshPhysicalMaterial({ color: h, metalness: 0, roughness: 0.04, transparent: true, opacity: a.op, envMapIntensity: a.env, clearcoat: a.cc, clearcoatRoughness: 0.03, depthWrite: false });
  };
  
  const KINDS = {
    perfil: h => new THREE.MeshStandardMaterial({ color: h, metalness: 0.65, roughness: 0.38 }),
    vidro: glass,
    vidro_interno: glass,
    vidro_item: glass,
    pintado: h => new THREE.MeshPhysicalMaterial({ color: h, metalness: 0.1, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.3 }),
    acm: h => new THREE.MeshStandardMaterial({ color: h, metalness: 0.15, roughness: 0.55 }),
    acm_madeira: h => new THREE.MeshStandardMaterial({ color: "#ffffff", map: texMadeira(h), metalness: 0, roughness: 0.6 }),
    acm_base: h => new THREE.MeshStandardMaterial({ color: h, metalness: 0.1, roughness: 0.85 }),
    puxador: h => new THREE.MeshStandardMaterial({ color: h, metalness: 1, roughness: 0.25 }),
    metal: h => new THREE.MeshStandardMaterial({ color: h, metalness: 1, roughness: 0.32 }),
    cromado: h => new THREE.MeshStandardMaterial({ color: h, metalness: 1, roughness: 0.1 }),
    pedra: h => new THREE.MeshStandardMaterial({ color: h, metalness: 0.05, roughness: 0.35 }),
    fosco: h => new THREE.MeshStandardMaterial({ color: h, metalness: 0, roughness: 0.75 }),
    laca: h => new THREE.MeshPhysicalMaterial({ color: h, metalness: 0, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    ceramica: h => new THREE.MeshStandardMaterial({ color: h, metalness: 0, roughness: 0.15 }),
    tecido: h => new THREE.MeshStandardMaterial({ color: h, metalness: 0, roughness: 0.92 }),
    parede: h => new THREE.MeshStandardMaterial({ color: h, metalness: 0, roughness: 0.95 }),
    piso: (h, o) => {
      const m = new THREE.MeshStandardMaterial({ color: h, metalness: 0, roughness: 0.55 });
      if (o && o.tipo && o.tipo !== "liso") { m.map = texPiso(o.tipo, h, o.rx || 1, o.ry || 1); m.color = new THREE.Color("#ffffff"); }
      return m;
    },
    ceu: () => new THREE.MeshBasicMaterial({ map: texCeu(), toneMapped: false })
  };
  V3.mat = function (kind, hex, extra, opts) {
    hex = hex || "#cccccc";
    const key = kind + "|" + hex + "|" + (extra || "");
    if (cache[key]) return cache[key];
    const m = (KINDS[kind] || KINDS.fosco)(hex, opts);
    m.userData = Object.assign(m.userData || {}, { kind, base: { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite } });
    cache[key] = m; return m;
  };
  V3.todosMateriais = function () { return Object.keys(cache).map(k => cache[k]); };

  V3.display = { modo: "solido", vidroOpaco: false };
  V3.aplicarDisplay = function () {
    const d = V3.display;
    V3.todosMateriais().forEach(m => {
      const b = m.userData.base, k = m.userData.kind;
      const isGlass = k === "vidro" || k === "vidro_interno" || k === "vidro_item";
      let tr = b.transparent, op = b.opacity, dw = b.depthWrite;
      if (isGlass && d.vidroOpaco) { tr = false; op = 1; dw = true; }
      if (d.modo === "transp") { tr = true; op = isGlass ? b.opacity * 0.5 : Math.min(b.opacity, 0.3); dw = false; }
      const wf = d.modo === "wireframe";
      if (m.wireframe !== wf) { m.wireframe = wf; }
      if (m.transparent !== tr || m.opacity !== op || m.depthWrite !== dw) { m.transparent = tr; m.opacity = op; m.depthWrite = dw; m.needsUpdate = true; }
    });
  };

  /* --------------------------- PRIMITIVAS ---------------------------- */
  /** Caixa por canto (x,y,z) e tamanho (dx,dy,dz), em mm */
  V3.box = function (parent, mat, x, y, z, dx, dy, dz, meta) {
    if (!(dx > 0 && dy > 0 && dz > 0)) return null;
    const m = new THREE.Mesh(new THREE.BoxGeometry(dx * MM, dy * MM, dz * MM), mat);
    m.position.set((x + dx / 2) * MM, (y + dy / 2) * MM, (z + dz / 2) * MM);
    const transp = mat.userData && mat.userData.base && mat.userData.base.transparent;
    m.castShadow = !transp; m.receiveShadow = true;
    if (meta) m.userData = Object.assign(m.userData, meta);
    parent.add(m); return m;
  };

  /** Ajudantes para os itens de ambiente. Origem do item = centro da base, frente = +Z */
  V3.H = {
    mat: function (k, h, e, o) { return V3.mat(k, h, e, o); },
    box: function (parent, mat, w, h, d, x, y, z) {
      if (!(w > 0 && h > 0 && d > 0)) return null;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w * MM, h * MM, d * MM), mat);
      m.position.set((x || 0) * MM, ((y || 0) + h / 2) * MM, (z || 0) * MM);
      m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
    },
    /** eixo 'y' (padrão): y = base.  eixo 'x'/'z': y = altura do centro e h = comprimento */
    cyl: function (parent, mat, rTop, rBot, h, x, y, z, seg, eixo) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop * MM, rBot * MM, h * MM, seg || 24), mat);
      if (eixo === "z") { m.rotation.x = Math.PI / 2; m.position.set((x || 0) * MM, (y || 0) * MM, (z || 0) * MM); }
      else if (eixo === "x") { m.rotation.z = Math.PI / 2; m.position.set((x || 0) * MM, (y || 0) * MM, (z || 0) * MM); }
      else m.position.set((x || 0) * MM, ((y || 0) + h / 2) * MM, (z || 0) * MM);
      m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
    },
    torus: function (parent, mat, R, r, x, y, z) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(R * MM, r * MM, 10, 36), mat);
      m.rotation.x = Math.PI / 2; m.position.set((x || 0) * MM, (y || 0) * MM, (z || 0) * MM);
      m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
    },
    /** Tronco retangular: base bw x bd, topo tw x td deslocado (dxTop,dzTop). y = base */
    frustum: function (parent, mat, bw, bd, tw, td, h, x, y, z, dxTop, dzTop) {
      const b = [[-bw / 2, 0, -bd / 2], [bw / 2, 0, -bd / 2], [bw / 2, 0, bd / 2], [-bw / 2, 0, bd / 2]];
      const ox = dxTop || 0, oz = dzTop || 0;
      const t = [[-tw / 2 + ox, h, -td / 2 + oz], [tw / 2 + ox, h, -td / 2 + oz], [tw / 2 + ox, h, td / 2 + oz], [-tw / 2 + ox, h, td / 2 + oz]];
      const tris = [[b[0], b[2], b[1]], [b[0], b[3], b[2]], [t[0], t[1], t[2]], [t[0], t[2], t[3]],
        [b[0], b[1], t[1]], [b[0], t[1], t[0]], [b[1], b[2], t[2]], [b[1], t[2], t[1]],
        [b[2], b[3], t[3]], [b[2], t[3], t[2]], [b[3], b[0], t[0]], [b[3], t[0], t[3]]];
      const pos = []; tris.forEach(tr => tr.forEach(p => pos.push(p[0] * MM, p[1] * MM, p[2] * MM)));
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat); m.position.set((x || 0) * MM, (y || 0) * MM, (z || 0) * MM);
      m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
    }
  };

  /* ----------------------- CATÁLOGO DE ITENS ------------------------- */
  const ITENS = {};
  V3.registrarItem = function (def) { ITENS[def.id] = def; };
  V3.itemDef = function (id) { return ITENS[id]; };
  V3.itensCatalogo = function () { return Object.keys(ITENS).map(k => ITENS[k]).sort((a, b) => (a.ordem || 99) - (b.ordem || 99)); };

  /** Subtrai os cortes [a,b] do intervalo [ini,fim] e devolve os trechos que sobram (descarta sobras menores que 50 mm) */
  V3.segmentos = function (ini, fim, cortes) {
    const cs = (cortes || []).slice().sort((x, y) => x[0] - y[0]), out = [];
    let cur = ini;
    cs.forEach(c => { if (c[0] > cur) out.push([cur, Math.min(c[0], fim)]); cur = Math.max(cur, c[1]); });
    if (cur < fim) out.push([cur, fim]);
    return out.filter(s => s[1] - s[0] >= 50);
  };

  /* --------------------------- O MÓVEL 3D ---------------------------- */
  V3.construirMovel = function (amb, cena) {
    const root = new THREE.Group(); root.name = "movel";
    const lay = {};
    V3.CAMADAS.forEach(c => { const gr = new THREE.Group(); gr.name = c.id; root.add(gr); lay[c.id] = gr; });
    const cam = (cena && cena.camadas) || {};
    const ov = id => (cam[id] && cam[id].cor) || null;
    const M = (layer, kind, hex) => V3.mat(kind, ov(layer) || hex);

    function matPainel(cls) {
      if (cls.tipo === "comum") return { layer: "vidro", mat: M("vidro", "vidro", cls.hex) };
      if (cls.tipo === "pintado") return { layer: "vidro_pintado", mat: M("vidro_pintado", "pintado", cls.hex) };
      const o = ov("acm");
      return { layer: "acm", mat: (cls.madeira && !o) ? V3.mat("acm_madeira", cls.hex) : V3.mat("acm", o || cls.hex) };
    }
    /** Construtor de caixas em coordenadas locais (u ao longo do bloco, v altura, w profundidade) */
    function mk(orient) {
      return function (layer, mat, u, v, w, du, dv, dw) {
        const m = orient === "Z" ? V3.box(lay[layer], mat, w, v, u, dw, dv, du) : V3.box(lay[layer], mat, u, v, w, du, dv, dw);
        if (m) m.userData.camada = layer; return m;
      };
    }

    const isL = amb.tipo === "L";
    const L1 = +amb.largura || 0, A1 = +amb.altura || 0, P1 = +amb.profundidade || 0;
    const L2 = isL ? (+amb.largura_perna2 || 0) : 0;
    const A2 = isL ? (+amb.altura_perna2 || A1) : A1;
    const P2 = isL ? (+amb.profundidade_perna2 || P1) : 0;
    const BA = +amb.BA || 1;                                  // 1 tubo | 2 rodízio | 3 aéreo
    const Vis = Math.min(5, Math.max(1, +amb.V || 1));        // visibilidade 1..5
    const TUBO = (BA === 3) ? 0 : 50;                         // tubo 50x50 de sustentação (BA 1 e 2)
    const elev = Math.max(0, +(cena && cena.elevacao) || 0);
    const yBot = elev;                                        // base do conjunto (início do tubo)
    const yCorpo = elev + TUBO;                               // início do corpo (A inclui o tubo, como no orçamento: A-B)
    const yTop1 = elev + A1, yTop2 = elev + A2;
    const altBase = 19, altTopo = 19, mh = 45, ESP_VID = 4, FOLGA_LAT = 5; //espessura do tubo, e vidro  e folga da laterais.
    const corPerfilAmb = V3.hexPerfil(amb.corPerfil);
    const matE = M("estrutura", "perfil", corPerfilAmb);
    const matTubo = M("tubo", "perfil", corPerfilAmb);
    const matBase = M("acm_base", "acm_base", COR_ACM_BASE);
    const matHandle = M("acessorios", "puxador", COR_PUXADOR);
    const matInt = M("prateleiras", "vidro_interno", COR_VIDRO_INTERNO);
    const gola = (+amb.AC === 2);
    const clsAmb = V3.classificarCorVidro(amb.corVidro || "Incolor");

    const info = { isL, L1, A1, P1, L2, A2, P2, elev, chao: 0, vaos: [], blocos: [], furos: [], altBase, altTopo, tubo: TUBO, V: Vis, BA };
    let topoMax = Math.max(yTop1, yTop2);

    function construirVao(B, blkId, orient, u0, u1, vB, vT, w1, vao) {
     const cls = V3.classificarCorVidro(vao.corVidro || amb.corVidro || "Incolor"); 
      const matP = M("frente_perfis", "perfil", V3.hexPerfil(vao.corPerfil || amb.corPerfil));
      const hv = 12.5, lat = 45, espF = 19, espV = 4;
      const tipo = vao.tipo;
      info.vaos.push({ bloco: blkId, orient, u0, u1, vB, vT, w1, vao });

      // postes (cada vão põe meia-largura; vãos vizinhos formam o divisor de 25 mm)
      [[u0, 0], [u0, w1 - lat], [u1 - hv, 0], [u1 - hv, w1 - lat]].forEach(p => B("estrutura", matE, p[0], vB, p[1], hv, vT - vB, lat));

      function folha(uA, uB, vA, vC) {
        const larg = uB - uA, alt = vC - vA; if (larg <= 10 || alt <= 10) return;
        const bw = Math.max(1, Math.min(45, larg / 2 - 1, alt / 2 - 1)), wB = w1 + 1; //profundidade das portinhas
        B("frente_perfis", matP, uA, vA, wB, bw, alt + 3, espF); // esquerda
        B("frente_perfis", matP, uB - bw, vA, wB, bw, alt + 3, espF); // direita
        B("frente_perfis", matP, uA + bw, vA, wB, larg - 2 * bw, bw, espF); // inferior (mais grossa
        B("frente_perfis", matP, uA + bw, vC - bw, wB, larg - 2 * bw, bw + 3, espF); // superios (mais grossa au
        const pn = matPainel(cls);
        B(pn.layer, pn.mat, uA, vA, w1 + 19, larg, alt, espV); //profundidade das portinhas vidro
      }
      const wP = w1 + 23;   // face externa do painel
      const FOLGA_V = 0;   // folga vertical da frente, em cima e embaixo (mm). 0 = frente fecha o vão, sem fenda.
      /** Puxador HORIZONTAL junto ao topo (igual ao das gavetas). Slim = barra; Gola (AC=2) = tira rente */
      function puxHoriz(uA, uB, vC) {
        if (gola) { B("acessorios", matHandle, uA, vC - 16, wP, uB - uA, 16, 2); return; }
        B("acessorios", matHandle, uA + 30, vC - 5, wP, Math.max(10, (uB - uA) - 60), 12, 8);
      }
      /** Puxador VERTICAL centralizado na altura da porta (só cristaleira). Gola (AC=2) = tira no topo */
      function puxVertCentro(uPos, vA, vC, uA, uB) {
        if (gola) { B("acessorios", matHandle, uA, vC - 16, wP, uB - uA, 16, 2); return; }
        const len = Math.max(80, Math.min(320, (vC - vA) * 0.35)), vm = (vA + vC) / 2;
        B("acessorios", matHandle, uPos, vm - len / 2, wP, 10, len, 8);
      }
      /** Duas folhas. vertical = true (cristaleira): puxadores verticais junto ao centro; senão horizontais no topo */
      function portaDupla(pu0, pu1, pB, pT, vertical) {
        const meio = (u0 + u1) / 2;
        folha(pu0, meio - 2, pB, pT); folha(meio + 2, pu1, pB, pT);
        if (vertical) {
          if (gola) puxVertCentro(0, pB, pT, pu0, pu1);
          else { puxVertCentro(meio - 2 - 32, pB, pT); puxVertCentro(meio + 2 + 22, pB, pT); }
        } else { puxHoriz(pu0, meio - 2, pT); puxHoriz(meio + 2, pu1, pT); }
      }
      const pB = vB + FOLGA_V, pT = vT - FOLGA_V, pu0 = u0 + 4, pu1 = u1 - 4;
      const isGav = tipo === "gaveta" || tipo === "gaveta_dupla";

      if (isGav) {
        const nG = Math.max(1, +vao.gavetasPortas || 1), folga = 2;
        const altG = ((vT - vB) - 2 * FOLGA_V - (nG - 1) * folga) / nG;
        for (let k = 0; k < nG; k++) {
          const gy = pB + k * (altG + folga);
          folha(pu0, pu1, gy, gy + altG);
          puxHoriz(pu0, pu1, gy + altG);
          if (k > 0) B("estrutura", matE, u0, gy - 13.5, w1 - 45, u1 - u0, 25, 44);
        }
      } else if (tipo === "porta_dupla") {
        portaDupla(pu0, pu1, pB, pT, false);
        B("estrutura", matE, (u0 + u1) / 2 - 12.5, vB, 0, 25, vT - vB, lat);
      } else if (tipo === "nicho") {
        /* nicho: sem frente */
      } else if (tipo === "cristaleira") {
        // 1 ou 2 portas (campo portasCrist; padrão 2, como no orçamento)
        if (+vao.portasCrist === 1) { folha(pu0, pu1, pB, pT); puxVertCentro(pu0 + 22, pB, pT, pu0, pu1); }
        else portaDupla(pu0, pu1, pB, pT, true);
        B("estrutura", matE, u0, vT - 4, 0, u1 - u0, 4, w1);                     // teto
        B("estrutura", matE, u0, pB, 0, u1 - u0, 4, w1);                         // base
        B("prateleiras", matInt, u0 + 13, pB + 4, 2, 4, pT - pB - 8, w1 - 6);            // lateral esq.
        B("prateleiras", matInt, u1 - 17, pB + 4, 2, 4, pT - pB - 8, w1 - 6);            // lateral dir.
        B("prateleiras", matInt, u0 + 13, pB + 4, 2, (u1 - u0) - 26, pT - pB - 8, 4);    // fundo
      } else {
        folha(pu0, pu1, pB, pT);
        puxHoriz(pu0, pu1, pT);
      }

      const qpr = +vao.QPR || 0;
      if (qpr > 0 && !isGav) {
        const esp = (pT - pB) / (qpr + 1);
        for (let k = 1; k <= qpr; k++) {
          const y = pB + esp * k;
          B("prateleiras", matInt, u0 + 18, y - 6, 8, Math.max(10, (u1 - u0) - 36), 6, Math.max(10, w1 - 33));
        }
      }
    }

    function construirBloco(id, orient, footIni, runFim, prof, vBase, vTopo, vaos, vaosIni, Lbloco, Abloco, lados) {
      const B = mk(orient);
      const h = vTopo - vBase - altBase - altTopo;

      // 1) layout dos vãos (a cristaleira cresce PARA CIMA a partir da base do bloco e pode passar da altura)
      const itens = [];
      const areaUtil = Math.max(0, runFim - 40 - vaosIni);
      if (vaos.length && areaUtil > 0) {
        const soma = vaos.reduce((s, v) => s + (+v.largura || 0), 0) || 1;
        let uC = vaosIni + 20;
        vaos.forEach(v => {
          const larg = ((+v.largura || 0) / soma) * areaUtil;
          const vB = vBase + altBase; let vT = vTopo - altTopo, w1 = prof;
          if (v.tipo === "cristaleira") {
            if (+v.altura_propria) vT = vB + (+v.altura_propria);
            if (+v.profundidade_propria) w1 = Math.min(prof, +v.profundidade_propria);
          }
          itens.push({ u0: uC, u1: uC + larg, vB, vT, w1, vao: v });
          uC += larg;
        });
      }

      // 2) tubo 50x50 de sustentação (BA = 1 tubo e 2 rodízio): quadro em volta da base do bloco
      if (TUBO > 0) {
        const t = TUBO;
        B("tubo", matTubo, footIni, yBot, 0, runFim - footIni, t, t);
        B("tubo", matTubo, footIni, yBot, prof - t, runFim - footIni, t, t);
        B("tubo", matTubo, footIni, yBot, t, t, t, prof - 2 * t);
        B("tubo", matTubo, runFim - t, yBot, t, t, t, prof - 2 * t);
      }

      // 3) base e topo: só PERFIS formando um quadro (frente, fundo e travessas), SEM tampo.
      //    A bancada (item de ambiente) é quem fecha o topo. Onde a cristaleira passa por cima, a frente/fundo do topo é recortada.
      const topoIni = vTopo - altTopo, PF = 45;   // PF = largura do perfil do quadro
      const cortes = itens.filter(i => i.vao.tipo === "cristaleira" && i.vT > topoIni + 0.5).map(i => [i.u0, i.u1]).sort((a, b) => a[0] - b[0]);
      cortes.forEach(c => info.furos.push({ bloco: id, u0: c[0], u1: c[1] }));   // onde a cristaleira atravessa o topo
      const quadro = (v, hq, cortesFB) => {
        V3.segmentos(footIni, runFim, cortesFB).forEach(s => {
          B("estrutura", matE, s[0], v, 0, s[1] - s[0], hq, PF);               // fundo
          B("estrutura", matE, s[0], v, prof - PF, s[1] - s[0], hq, PF);       // frente
        });
        B("estrutura", matE, footIni, v, PF, 45, hq, prof - 2 * PF);           // travessa da extremidade
        B("estrutura", matE, runFim - 45, v, PF, 45, hq, prof - 2 * PF);       // travessa da outra extremidade
      };
      quadro(vBase, altBase, []);
      quadro(topoIni, altTopo, cortes);

      // colunas das extremidades (20 no sentido do bloco x 45 em profundidade)
      B("estrutura", matE, footIni, vBase + altBase, 0, 20, h, mh);
      B("estrutura", matE, footIni, vBase + altBase, prof - mh, 20, h, mh);
      B("estrutura", matE, runFim - 20, vBase + altBase, 0, 20, h, mh);
      B("estrutura", matE, runFim - 20, vBase + altBase, prof - mh, 20, h, mh);
      // ACM interno da base (acompanha todo o fundo do bloco)
      B("acm_base", matBase, footIni + 20, vBase + altBase + 0.2, 2, (runFim - footIni) - 40, 3, prof - 4);

      // 4) vãos
      itens.forEach(i => { construirVao(B, id, orient, i.u0, i.u1, i.vB, i.vT, i.w1, i.vao); topoMax = Math.max(topoMax, i.vT); });

      // 5) fechamento em vidro (visibilidade 2 a 5): cor do vidro do ambiente, 5 mm menor em todas as bordas
      const pn = matPainel(clsAmb), vi = vBase + FOLGA_LAT, dv = (vTopo - vBase) - 2 * FOLGA_LAT;
      const fe = (layer, mat, u, w, du, dw) => B(layer, mat, u, vi, w, du, dv, dw);
      if (lados.fim) fe(pn.layer, pn.mat, runFim, FOLGA_LAT, ESP_VID, prof - 2 * FOLGA_LAT);
      if (lados.ini) fe(pn.layer, pn.mat, footIni - ESP_VID, FOLGA_LAT, ESP_VID, prof - 2 * FOLGA_LAT);
      if (lados.fundo) fe(pn.layer, pn.mat, footIni + FOLGA_LAT, -ESP_VID, (runFim - footIni) - 2 * FOLGA_LAT, ESP_VID);

      info.blocos.push({ id, orient, footIni, runIni: footIni, runFim, vaosIni, prof, base: yBot, corpoBase: vBase, topo: vTopo, L: Lbloco, A: Abloco, lados });
    }

    // Lados do observador (vendo pela frente): reto -> direita = início do bloco, esquerda = fim.
    // Em L -> esquerda = fim do bloco 1, direita = fim do bloco 2 (o canto não recebe vidro).
    const dir = (Vis === 2 || Vis >= 4), esq = (Vis === 3 || Vis >= 4), fundo = Vis === 5;
    const temB2 = isL && L2 > P1;
    const lados1 = temB2 ? { ini: false, fim: esq, fundo } : { ini: dir, fim: esq, fundo };
    construirBloco(1, "Z", 0, L1, P1, yCorpo, yTop1, amb.vaos || [], isL ? P2 : 0, L1, A1, lados1);
    if (temB2) construirBloco(2, "X", P1, L2, P2, yCorpo, yTop2, amb.vaos_perna2 || [], P1, L2, A2, { ini: false, fim: dir, fundo });

    info.bbox = { x0: 0, x1: isL ? Math.max(L2, P1) : P1, y0: yBot, y1: topoMax, z0: 0, z1: isL ? Math.max(L1, P2) : L1 };

    // direções de explosão
    const c = new THREE.Vector3((info.bbox.x0 + info.bbox.x1) / 2, (info.bbox.y0 + info.bbox.y1) / 2, (info.bbox.z0 + info.bbox.z1) / 2).multiplyScalar(MM);
    root.traverse(o => {
      if (o.isMesh) {
        o.userData.base = o.position.clone();
        o.userData.dir = o.position.clone().sub(c); if (o.userData.dir.lengthSq() < 1e-8) o.userData.dir.set(0, 1, 0); o.userData.dir.normalize();
      }
    });
    root.userData.layers = lay;
    return { group: root, info };
  };

  V3.aplicarVisibilidade = function (root, cena) {
    if (!root || !root.userData.layers) return;
    V3.CAMADAS.forEach(c => { const gr = root.userData.layers[c.id]; if (gr) gr.visible = !(cena.camadas[c.id] && cena.camadas[c.id].visivel === false); });
  };
  V3.aplicarExplosao = function (root, quantia) {
    if (!root) return;
    const q = quantia * 0.4;
    root.traverse(o => { if (o.isMesh && o.userData.base) { o.position.copy(o.userData.base); if (q > 0.0005) o.position.addScaledVector(o.userData.dir, q); } });
  };

  /* ----------------------- COTAS E LEGENDA --------------------------- */
  V3.listarCotas = function (amb, info) {
    const out = [];
    const W = (b, u, v, w) => (b.orient === "Z" ? [w, v, u] : [u, v, w]);
    info.blocos.forEach(b => {
      const wF = b.prof + 12;
      out.push({ t: "linha", a: W(b, b.footIni, b.topo + 120, wF), b: W(b, b.runFim, b.topo + 120, wF), label: `B${b.id}: ${Math.round(b.L)}mm` });
      out.push({ t: "linha", a: W(b, b.runFim + 90, b.base, wF), b: W(b, b.runFim + 90, b.topo, wF), label: `${Math.round(b.A)}mm`, vertical: true });
    });
    info.vaos.forEach(v => {
      const b = info.blocos.find(x => x.id === v.bloco); if (!b) return;
      const wF = b.prof + 12;
      out.push({ t: "linha", a: W(b, v.u0, b.topo + 45, wF), b: W(b, v.u1, b.topo + 45, wF), label: `${Math.round(+v.vao.largura || 0)}mm`, pequena: true });
      const nomes = { gaveta: "Gaveta", gaveta_dupla: "Gaveta Dupla", porta_tempero: "Porta Tempero", lixeira: "Lixeira", nicho: "Nicho", porta_simples: "Porta", porta_dupla: "Porta Dupla", cristaleira: "Cristaleira" };
      const nm = nomes[v.vao.tipo] || v.vao.tipo || "";
      out.push({ t: "rotulo", p: W(b, (v.u0 + v.u1) / 2, (v.vB + v.vT) / 2, v.w1 + 30), texto: v.vao.descricao ? `${nm} ${v.vao.descricao}` : nm });
    });
    return out;
  };

  V3.legenda = function (amb) {
    const out = [{ rotulo: "Perfil " + (amb.corPerfil || "-"), hex: V3.hexPerfil(amb.corPerfil) }];
    const set = {};
    const add = cor => { const c = V3.classificarCorVidro(cor || amb.corVidro || "A definir"); set[c.cor] = c; };
    (amb.vaos || []).forEach(v => add(v.corVidro)); (amb.tipo === "L" ? (amb.vaos_perna2 || []) : []).forEach(v => add(v.corVidro));
    if (!Object.keys(set).length) add(amb.corVidro);
    Object.keys(set).forEach(k => {
      const c = set[k];
      out.push({ rotulo: (c.tipo === "acm" ? "" : c.tipo === "pintado" ? "Vidro pintado " : "Vidro ") + c.cor, hex: c.hex });
    });
    out.push({ rotulo: "Puxador", hex: COR_PUXADOR });
    return out;
  };
})(window);
