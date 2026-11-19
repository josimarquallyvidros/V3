/* =====================================================================
   viewer3d.js  v2.0  (Three.js)
   Motor do visualizador: câmera, luz, sombras, reflexos, seleção de itens
   com gizmo, cotas e exportação de imagem (PNG 1920x1080 com logo).
   Mantém a API usada pelo app.js: init, render, resize, snapshot,
   _getState, _buildAmbTabs, canvas, modo, toggleXxx, setExplosao...
   Depende de: three.min.js (r147), OrbitControls.js, TransformControls.js,
   viewer-moveis.js, viewer-ambiente.js (V3) e viewer-ui.js (V3UI).
   ===================================================================== */
(function (g) {
  "use strict";
  const MM = 0.001, V3 = g.V3;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- desenho 2D (cotas) ---------- */
  function cotaLinha(ctx, a, b, label, pequena, k) {
    const f = (pequena ? 10 : 12) * k;
    ctx.save(); ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = Math.max(1, k);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len * 5 * k, ny = dx / len * 5 * k;
    [a, b].forEach(p => { ctx.beginPath(); ctx.moveTo(p.x - nx, p.y - ny); ctx.lineTo(p.x + nx, p.y + ny); ctx.stroke(); });
    ctx.font = `600 ${f}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const tw = ctx.measureText(label).width, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    ctx.fillStyle = "rgba(10,15,25,.78)"; ctx.fillRect(mx - tw / 2 - 4 * k, my - f / 2 - 3 * k, tw + 8 * k, f + 6 * k);
    ctx.fillStyle = "#fbbf24"; ctx.fillText(label, mx, my); ctx.restore();
  }
  function cotaRotulo(ctx, p, texto, k) {
    const f = 10 * k; ctx.save(); ctx.font = `600 ${f}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const tw = ctx.measureText(texto).width;
    ctx.fillStyle = "rgba(10,15,25,.6)"; ctx.fillRect(p.x - tw / 2 - 4 * k, p.y - f / 2 - 2 * k, tw + 8 * k, f + 4 * k);
    ctx.fillStyle = "#ffffff"; ctx.fillText(texto, p.x, p.y); ctx.restore();
  }

  const viewer3D = {
    canvas: null, overlay: null, ready: false,
    modo: "solido", cotas: true, vidroOpaco: false, fundoBranco: false,
    explosao: 0, explosaoAtiva: false,
    ambIdx: 0, ambId: null, amb: null, cena: null, info: null,
    hooks: {}, itemGroups: {}, selId: null, selBox: null, gizmo: null, gizmoMode: "translate",
    opcoesFoto: { fundo: "claro", logo: true, cotas: false, legenda: false, titulo: false, resolucao: "1920x1080", enquadrar: true },
    _dirty: true, _presetAtual: "iso",

    /* ================================ INIT ================================ */
    init: function (opts) {
      opts = opts || {};
      this._getState = opts.getState; this._onChange = opts.onChange; this._toast = opts.onSnapshot;
      this.canvas = $("viewer3D"); this.overlay = $("viewerOverlay"); this.msgEl = $("viewerMsg");
      if (!this.canvas) return;
      if (typeof THREE === "undefined" || !THREE.OrbitControls) {
        this._erro("Biblioteca 3D não encontrada. Confira se three.min.js e OrbitControls.js estão na pasta do site."); return;
      }
      try { this._setup(); } catch (e) { console.error(e); this._erro("Não foi possível iniciar o 3D (WebGL indisponível neste navegador/dispositivo)."); return; }
      this.ready = true;
      this._logo = new Image(); this._logo.src = "logo.png";
      this._bindUI(); this._bindPointer();
      if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => this.resize()).observe(this.canvas);
      window.addEventListener("resize", () => this.resize());
      if (g.V3UI) g.V3UI.init(this);
      this.resize(); this._buildAmbTabs(); this.render(); this._syncBotoes(); this._loop();
      // Re-sincroniza após o carregamento completo para eliminar qualquer
      // estado inconsistente deixado por bindings duplicados (app.js vs viewer3d.js)
      setTimeout(() => { try { this._syncBotoes(); } catch (e) {} }, 300);
    },
    _erro: function (m) { if (this.msgEl) { this.msgEl.textContent = m; this.msgEl.style.display = "block"; } console.error("[viewer3D] " + m); },

    _setup: function () {
      if (THREE.ColorManagement && "legacyMode" in THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
      const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
      r.setClearColor(0x000000, 0);
      if ("outputColorSpace" in r) r.outputColorSpace = THREE.SRGBColorSpace; else r.outputEncoding = THREE.sRGBEncoding;
      r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
      r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 150);
      this.camera.position.set(4, 2.5, 4);
      const c = this.controls = new THREE.OrbitControls(this.camera, this.canvas);
      c.enableDamping = true; c.dampingFactor = 0.08; c.screenSpacePanning = true;
      c.maxPolarAngle = Math.PI * 0.495; c.minDistance = 0.4; c.maxDistance = 40; c.autoRotateSpeed = 2;
      c.addEventListener("change", () => { this._dirty = true; });

      this.hemi = new THREE.HemisphereLight(0xffffff, 0x9a9a9a, 0.4); this.scene.add(this.hemi);
      const k = this.key = new THREE.DirectionalLight(0xffffff, 2.0);
      k.castShadow = true; k.shadow.mapSize.set(2048, 2048); k.shadow.bias = -0.0003; k.shadow.normalBias = 0.02;
      this.scene.add(k); this.scene.add(k.target);
      this.fill = new THREE.DirectionalLight(0xdfe8ff, 0.6); this.scene.add(this.fill); this.scene.add(this.fill.target);
      this._env();

      this.grpMovel = new THREE.Group(); this.grpAmb = new THREE.Group(); this.grpItens = new THREE.Group();
      this.scene.add(this.grpMovel); this.scene.add(this.grpAmb); this.scene.add(this.grpItens);

      if (THREE.TransformControls) {
        const t = this.gizmo = new THREE.TransformControls(this.camera, this.canvas);
        t.setTranslationSnap(0.01); t.setRotationSnap(THREE.MathUtils.degToRad(15)); t.setSize(0.8);
        t.addEventListener("dragging-changed", e => { this.controls.enabled = !e.value; this._dirty = true; });
        t.addEventListener("objectChange", () => this._itemMovido());
        t.addEventListener("change", () => { this._dirty = true; });
        t.addEventListener("mouseDown", () => { this._gizmoHit = true; });
        t.addEventListener("mouseUp", () => { setTimeout(() => { this._gizmoHit = false; }, 60); this._salvar(); setTimeout(() => this.render(), 0); });
        this.scene.add(t);
      }
    },

    /** Reflexo ambiente gerado por código (céu + painéis de luz), sem arquivo HDR */
    _env: function () {
      const env = new THREE.Scene();
      const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true }));
      const pos = sky.geometry.attributes.position, col = [];
      const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      for (let i = 0; i < pos.count; i++) {
        const t = (pos.getY(i) / 10 + 1) / 2;
        const c = t < 0.5 ? lerp([0.33, 0.31, 0.29], [0.95, 0.95, 0.95], t / 0.5) : lerp([0.95, 0.95, 0.95], [0.8, 0.9, 1.0], (t - 0.5) / 0.5);
        col.push(c[0], c[1], c[2]);
      }
      sky.geometry.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); env.add(sky);
      [[6, 5, 3, 8], [-5, 4, 5, 5], [0, 8, 0, 6], [3, 3, -6, 3]].forEach(s => {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(s[3], s[3], s[3]), side: THREE.DoubleSide }));
        p.position.set(s[0], s[1], s[2]); p.lookAt(0, 0, 0); env.add(p);
      });
      const pm = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pm.fromScene(env, 0.03).texture; pm.dispose();
    },

    /* ============================== EVENTOS UI ============================== */
    _bindUI: function () {
      document.querySelectorAll("#cameraPresets button").forEach(b => { b.onclick = () => this.setPreset(b.dataset.cam); });
      document.querySelectorAll("#modeGroup button[data-mode]").forEach(b => {
        b.onclick = () => {
          this.modo = b.dataset.mode;
          document.querySelectorAll("#modeGroup button[data-mode]").forEach(x => x.classList.toggle("on", x === b));
          this.render();
        };
      });
      const bc = $("btnCotas"); if (bc) bc.classList.toggle("on", this.cotas);
    },
    /* Garante que SOMENTE os botões corretos estejam marcados (resolve o bug
       de todos aparecerem selecionados ao carregar/atualizar a página). */
    _syncBotoes: function () {
      const preset = this._presetAtual || "frontal";
      document.querySelectorAll("#cameraPresets button").forEach(b =>
        b.classList.toggle("on", b.dataset.cam === preset));
      document.querySelectorAll("#modeGroup button[data-mode]").forEach(b =>
        b.classList.toggle("on", b.dataset.mode === this.modo));
      const tog = (id, v) => { const el = $(id); if (el) el.classList.toggle("on", !!v); };
      tog("btnCotas", this.cotas);
      tog("btnFundo", this.fundoBranco);
      tog("btnExplosao", this.explosaoAtiva);
      tog("btnOpaco", this.vidroOpaco);
      if (this.controls) { const ba = $("btnAutoRotate"); if (ba) ba.classList.toggle("on", !!this.controls.autoRotate); }
    },
    _bindPointer: function () {
      const c = this.canvas;
      c.addEventListener("pointerdown", e => { this._pd = { x: e.clientX, y: e.clientY }; });
      c.addEventListener("pointerup", e => {
        const p = this._pd; this._pd = null;
        if (!p || this._gizmoHit) return;
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 5) this._click(e);
      });
    },
    _click: function (e) {
      const rect = this.canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, this.camera);
      const objs = [];
      Object.keys(this.itemGroups).forEach(id => {
        const it = this._itemPorId(id), d = it && V3.itemDef(it.tipo);
        if (it && it.visivel !== false && d && d.selecionavelNaCena !== false) objs.push(this.itemGroups[id].grp);
      });
      const hit = rc.intersectObjects(objs, true);
      if (hit.length) { let o = hit[0].object; while (o && !o.userData.itemId) o = o.parent; if (o) { this.selecionarItem(o.userData.itemId); return; } }
      if (this.selId) this._deselecionar();
    },

    /* ============================== TAMANHO ============================== */
    resize: function () {
      if (!this.ready) return;
      const c = this.canvas, w = c.clientWidth, h = c.clientHeight; if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.renderer.setPixelRatio(dpr); this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
      if (this.overlay) { this.overlay.width = Math.round(w * dpr); this.overlay.height = Math.round(h * dpr); this.overlay.style.width = w + "px"; this.overlay.style.height = h + "px"; }
      this._dirty = true;
    },

    /* ============================== SINCRONIA ============================== */
    render: function () { this._sync(); this._dirty = true; },

    _getAmb: function () {
      const st = this._getState ? this._getState() : null;
      return (st && st.ambientes) || [];
    },

    _sync: function () {
      if (!this.ready) return;
      const arr = this._getAmb(), has = arr.length > 0;
      if (this.msgEl) this.msgEl.style.display = has ? "none" : "block";
      if (!has) { this._limpar(this.grpMovel); this._limpar(this.grpAmb); this._limparItens(); this.amb = null; this.info = null; this._sigM = this._sigA = null; this.ambId = null; return; }
      if (this.ambIdx >= arr.length) this.ambIdx = 0;
      const amb = arr[this.ambIdx];
      if (this.ambId !== amb.id) { this.ambId = amb.id; this._sigM = this._sigA = null; this._deselecionar(true); this._limparItens(); this._fit = true; this._uiKey = null; }
      const cena = V3.garantirCena(amb); this.amb = amb; this.cena = cena;

      const rep = (k, v) => (typeof k === "string" && k[0] === "_") ? undefined : v;
      const ambSem = Object.assign({}, amb); delete ambSem.cena;
      const sigM = JSON.stringify([ambSem, V3.CAMADAS.map(c => (cena.camadas[c.id] || {}).cor || ""), cena.elevacao], rep);
      let rebuilt = false;
      if (sigM !== this._sigM) {
        this._sigM = sigM; this._limpar(this.grpMovel);
        const r = V3.construirMovel(amb, cena);
        this.grpMovel.add(r.group); this.mov = r.group; this.info = r.info; rebuilt = true;
        this._posLuz(); this._legenda();
      }
      if (!this.info) return;
      if (this._fit) { this._fit = false; this.setPreset(this._presetAtual || "iso"); }

      const i = this.info;
      const sigA = JSON.stringify([cena.paredes, cena.elevacao, i.L1, i.L2, i.P1, i.P2, i.A1, i.A2, i.isL]);
      if (sigA !== this._sigA) { this._sigA = sigA; this._limpar(this.grpAmb); this.grpAmb.add(V3.construirAmbiente(amb, cena, i)); rebuilt = true; }

      const mudouItens = this._syncItens(cena); if (mudouItens) rebuilt = true;

      const uiKey = amb.id + "|" + i.isL + "|" + cena.itens.map(x => x.id).join(",");
      if (uiKey !== this._uiKey) { this._uiKey = uiKey; if (this.hooks.ambiente) this.hooks.ambiente(); }

      V3.aplicarVisibilidade(this.mov, cena);
      const dk = this.modo + "|" + this.vidroOpaco;
      if (dk !== this._dispKey || rebuilt) { this._dispKey = dk; V3.display.modo = this.modo; V3.display.vidroOpaco = this.vidroOpaco; V3.aplicarDisplay(); }
      if (rebuilt || this.explosao !== this._explV) { this._explV = this.explosao; V3.aplicarExplosao(this.mov, this.explosao); }
      this._luzCena();
      if (this.selBox && this.selId) this.selBox.update();

      const hud = $("viewerHud");
      if (hud) hud.textContent = `${amb.nome || "Ambiente"} · ${i.isL ? "L" : "Reto"} · B1 ${Math.round(i.L1)}×${Math.round(i.A1)}×${Math.round(i.P1)}` + (i.isL ? ` · B2 ${Math.round(i.L2)}×${Math.round(i.A2)}×${Math.round(i.P2)}` : "");
    },

    _syncItens: function (cena) {
      let mudou = false; const ids = {};
      cena.itens.forEach(it => {
        ids[it.id] = 1;
        const key = JSON.stringify([it.tipo, it.params, it.cores, V3.recortesItem(it, this.info)]);
        let rec = this.itemGroups[it.id];
        if (!rec || rec.key !== key) {
          if (rec) { if (this.gizmo && this.gizmo.object === rec.grp) this.gizmo.detach(); this._descartar(rec.grp); }
          const grp = V3.construirItem(it, this.info); this.grpItens.add(grp);
          rec = this.itemGroups[it.id] = { grp, key }; mudou = true;
          if (this.selId === it.id) this._anexar(it.id);
        }
        const arrastando = this.gizmo && this.gizmo.dragging && this.gizmo.object === rec.grp;
        if (!arrastando) V3.aplicarTransform(rec.grp, it);
      });
      Object.keys(this.itemGroups).forEach(id => {
        if (!ids[id]) { if (this.selId === id) this._deselecionar(); this._descartar(this.itemGroups[id].grp); delete this.itemGroups[id]; mudou = true; }
      });
      return mudou;
    },
    _limparItens: function () { Object.keys(this.itemGroups).forEach(id => this._descartar(this.itemGroups[id].grp)); this.itemGroups = {}; },
    _descartar: function (grp) { if (this.gizmo && this.gizmo.object === grp) this.gizmo.detach(); grp.traverse(o => { if (o.geometry) o.geometry.dispose(); }); if (grp.parent) grp.parent.remove(grp); },
    _limpar: function (group) {
      while (group.children.length) { const c = group.children[0]; c.traverse(o => { if (o.geometry) o.geometry.dispose(); }); group.remove(c); }
    },

    /* ================================ LUZ ================================ */
    _posLuz: function () {
      const b = this.info.bbox, c = new THREE.Vector3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2).multiplyScalar(MM);
      const R = Math.max(2, Math.hypot(b.x1 - b.x0, b.z1 - b.z0) * MM * 0.7 + 2);
      this.key.position.set(c.x + R * 0.9, c.y + R * 1.3, c.z + R * 0.8); this.key.target.position.copy(c); this.key.target.updateMatrixWorld();
      const s = this.key.shadow.camera; s.left = -R * 1.5; s.right = R * 1.5; s.top = R * 1.5; s.bottom = -R * 1.5; s.near = 0.1; s.far = R * 6; s.updateProjectionMatrix();
      this.fill.position.set(c.x + R * 0.3, c.y + R * 0.8, c.z - R * 0.8); this.fill.target.position.copy(c); this.fill.target.updateMatrixWorld();
    },
    _luzCena: function () {
      const k = Math.min(2, Math.max(0.2, +this.cena.luz || 1));
      this.key.intensity = 2.0 * k; this.fill.intensity = 0.6 * k; this.hemi.intensity = 0.4 * k;
      const sh = this.cena.sombras !== false;
      if (this.key.castShadow !== sh) { this.key.castShadow = sh; V3.todosMateriais().forEach(m => { m.needsUpdate = true; }); }
    },

    /* ============================== CÂMERA ============================== */
    _fitDist: function (aspect, target, dir) {
      const b = this.info.bbox, pts = [];
      [b.x0, b.x1].forEach(x => [b.y0, b.y1 + 400].forEach(y => [b.z0, b.z1].forEach(z => pts.push(new THREE.Vector3(x * MM, y * MM, z * MM)))));
      const tmp = new THREE.PerspectiveCamera(this.camera.fov, aspect, 0.05, 200), v = new THREE.Vector3();
      let dist = 6;
      for (let n = 0; n < 8; n++) {
        tmp.position.copy(target).addScaledVector(dir, dist); tmp.lookAt(target); tmp.updateMatrixWorld();
        let m = 0.01; pts.forEach(p => { v.copy(p).project(tmp); m = Math.max(m, Math.abs(v.x), Math.abs(v.y)); });
        dist = Math.min(60, Math.max(0.6, dist * (m / 0.86)));
      }
      return dist;
    },
    _centro: function () { const b = this.info.bbox; return new THREE.Vector3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2).multiplyScalar(MM); },
    setPreset: function (nome) {
      this._presetAtual = nome;
      document.querySelectorAll("#cameraPresets button").forEach(b => b.classList.toggle("on", b.dataset.cam === nome));
      if (!this.ready || !this.info) return;
      const L = this.info.isL, c = this._centro();
      const D = { frontal: L ? [1, 0.12, 1] : [1, 0.1, 0], iso: L ? [1, 0.75, 1.2] : [1, 0.6, 0.9], superior: L ? [0.08, 1, 0.08] : [0.08, 1, 0], lateral: L ? [1, 0.1, 0.15] : [0.1, 0.1, 1] };
      const d = D[nome] || D.iso, dir = new THREE.Vector3(d[0], d[1], d[2]).normalize();
      const dist = this._fitDist(this.camera.aspect, c, dir);
      this.camera.position.copy(c).addScaledVector(dir, dist); this.controls.target.copy(c); this.camera.lookAt(c); this.controls.update(); this._dirty = true;
    },
    zoomBy: function (f) {
      const c = this.controls.target, v = this.camera.position.clone().sub(c);
      v.multiplyScalar(1 / f); v.setLength(Math.min(40, Math.max(0.4, v.length())));
      this.camera.position.copy(c).add(v); this.controls.update(); this._dirty = true;
    },
    reset: function () { this.setPreset("iso"); },

    /* ============================== BOTÕES ============================== */
    toggleAuto: function () { this.controls.autoRotate = !this.controls.autoRotate; const b = $("btnAutoRotate"); if (b) b.classList.toggle("on", this.controls.autoRotate); },
    toggleCotas: function () { this.cotas = !this.cotas; const b = $("btnCotas"); if (b) b.classList.toggle("on", this.cotas); this._dirty = true; },
    toggleFundo: function () { this.fundoBranco = !this.fundoBranco; this.canvas.style.background = this.fundoBranco ? "linear-gradient(#ffffff,#e6eaf0)" : ""; const b = $("btnFundo"); if (b) b.classList.toggle("on", this.fundoBranco); },
    toggleOpaco: function () {
      this.vidroOpaco = !this.vidroOpaco; const b = $("btnOpaco");
      if (b) { b.classList.toggle("on", this.vidroOpaco); b.textContent = this.vidroOpaco ? "💎 Opaco" : "💧 Transparente"; }
      this.render();
    },
    toggleExplosao: function () {
      this.explosaoAtiva = !this.explosaoAtiva; const s = $("explosaoSlider"), b = $("btnExplosao");
      if (s) s.disabled = !this.explosaoAtiva;
      if (!this.explosaoAtiva) { this.explosao = 0; if (s) s.value = 0; }
      if (b) b.classList.toggle("on", this.explosaoAtiva); this.render();
    },
    setExplosao: function (v) { this.explosao = +v || 0; this.render(); },

    _buildAmbTabs: function () {
      const el = $("viewerAmbTabs"); if (!el) return;
      const arr = this._getAmb();
      el.innerHTML = arr.map((a, i) => `<div class="tab ${i === this.ambIdx ? "on" : ""}" data-i="${i}">${esc(a.nome || ("Ambiente " + (i + 1)))}</div>`).join("");
      el.querySelectorAll(".tab").forEach(t => { t.onclick = () => { this.ambIdx = +t.dataset.i; this._buildAmbTabs(); this.render(); }; });
    },
    _legenda: function () {
      const el = $("viewerLegend"); if (!el || !this.amb) return;
      el.innerHTML = V3.legenda(this.amb).map(l => `<div class="vl-item"><span class="lg-cor" style="background:${l.hex}"></span>${esc(l.rotulo)}</div>`).join("");
    },

    /* ============================ ITENS / GIZMO ============================ */
    _itemPorId: function (id) { return ((this.cena && this.cena.itens) || []).find(i => i.id === id); },
    selecionarItem: function (id) {
      if (!this._itemPorId(id)) { this._deselecionar(); return; }
      this.selId = id; this._anexar(id); if (this.hooks.selecao) this.hooks.selecao(id);
    },
    _anexar: function (id) {
      const rec = this.itemGroups[id]; if (!rec) return;
      if (this.selBox) { this.scene.remove(this.selBox); this.selBox.geometry.dispose(); }
      this.selBox = new THREE.BoxHelper(rec.grp, 0xfbbf24); this.selBox.material.depthTest = false; this.selBox.renderOrder = 999;
      this.scene.add(this.selBox);
      if (this.gizmo && this.gizmoMode !== "off") { this.gizmo.attach(rec.grp); this._modoGizmo(); }
      this._dirty = true;
    },
    _deselecionar: function (silencioso) {
      this.selId = null; if (this.gizmo) this.gizmo.detach();
      if (this.selBox) { this.scene.remove(this.selBox); this.selBox.geometry.dispose(); this.selBox = null; }
      if (!silencioso && this.hooks.selecao) this.hooks.selecao(null); this._dirty = true;
    },
    setGizmoMode: function (m) {
      this.gizmoMode = m; if (!this.gizmo) return;
      if (m === "off") this.gizmo.detach(); else if (this.selId && this.itemGroups[this.selId]) { this.gizmo.attach(this.itemGroups[this.selId].grp); this._modoGizmo(); }
      this._dirty = true;
    },
    _modoGizmo: function () {
      const t = this.gizmo; if (!t) return;
      if (this.gizmoMode === "rotate") { t.setMode("rotate"); t.showX = false; t.showZ = false; t.showY = true; }
      else { t.setMode("translate"); t.showX = t.showY = t.showZ = true; }
    },
    _itemMovido: function () {
      const grp = this.gizmo && this.gizmo.object; if (!grp) return;
      const it = this._itemPorId(grp.userData.itemId); if (!it) return;
      const bc = V3.mundoParaBloco(it.bloco, grp.position.x / MM, grp.position.z / MM);
      it.u = Math.round(bc.u); it.w = Math.round(bc.w); it.y = Math.round(grp.position.y / MM);
      let rot = grp.rotation.y * 180 / Math.PI - V3.rotBase(it.bloco) * 180 / Math.PI;
      rot = ((rot + 180) % 360 + 360) % 360 - 180; it.rot = Math.round(rot);
      if (this.selBox) this.selBox.update();
      if (this.hooks.item) this.hooks.item(it); this._dirty = true;
    },
    _salvar: function () { try { if (this._onChange) this._onChange(); } catch (e) { console.warn(e); } },
    avisar: function (m, erro) { if (this._toast) this._toast(m, erro); else console.log(m); },

    /* ================================ LOOP ================================ */
    _loop: function () {
      requestAnimationFrame(() => this._loop());
      if (!this.ready || document.hidden || !this.canvas.offsetParent) return;
      const ch = this.controls.update();
      if (ch || this._dirty || this.controls.autoRotate) this._draw();
    },
    _draw: function () {
      this._dirty = false; this.renderer.render(this.scene, this.camera); this._overlay();
    },
    _overlay: function () {
      const o = this.overlay; if (!o) return;
      const ctx = o.getContext("2d"), dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, o.width, o.height);
      if (!this.cotas || !this.info || !this.amb) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this._desenharCotas(ctx, this.camera, o.width / dpr, o.height / dpr, 1);
    },
    _desenharCotas: function (ctx, cam, W, H, k) {
      const lista = V3.listarCotas(this.amb, this.info), v = new THREE.Vector3();
      const P = p => { v.set(p[0] * MM, p[1] * MM, p[2] * MM).project(cam); return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, ok: v.z < 1 }; };
      lista.forEach(c => {
        if (c.t === "linha") { const a = P(c.a), b = P(c.b); if (a.ok && b.ok) cotaLinha(ctx, a, b, c.label, c.pequena, k); }
        else if (c.texto) { const p = P(c.p); if (p.ok) cotaRotulo(ctx, p, c.texto, k); }
      });
    },

    /* ============================ IMAGEM / PNG ============================ */
    exportarPNG: function (over) {
      if (!this.ready || !this.info || !this.amb) return null;
      const o = Object.assign({}, this.opcoesFoto, over || {});
      if (o.formato === "jpeg" && o.fundo === "transparente") o.fundo = "claro";   // JPEG não tem transparência
      const wh = String(o.resolucao || "1920x1080").split("x").map(Number), W = wh[0] || 1920, H = wh[1] || 1080;
      const r = this.renderer, oldS = r.getSize(new THREE.Vector2()), oldPR = r.getPixelRatio();
      const cam = this.camera.clone(); cam.aspect = W / H;
      if (o.enquadrar) {
        const c = this._centro(), dir = this.camera.position.clone().sub(this.controls.target).normalize();
        cam.position.copy(c).addScaledVector(dir, this._fitDist(W / H, c, dir)); cam.lookAt(c);
      }
      cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      const gv = this.gizmo ? this.gizmo.visible : true, sv = this.selBox ? this.selBox.visible : true;
      if (this.gizmo) this.gizmo.visible = false; if (this.selBox) this.selBox.visible = false;
      r.setPixelRatio(1); r.setSize(W, H, false); r.render(this.scene, cam);

      const out = document.createElement("canvas"); out.width = W; out.height = H;
      const c2 = out.getContext("2d"), k = W / 1280, escuro = o.fundo === "escuro";
      if (o.fundo === "claro") { const gr = c2.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, "#ffffff"); gr.addColorStop(1, "#e6eaf0"); c2.fillStyle = gr; c2.fillRect(0, 0, W, H); }
      else if (o.fundo === "branco") { c2.fillStyle = "#ffffff"; c2.fillRect(0, 0, W, H); }
      else if (escuro) { const gr = c2.createRadialGradient(W * 0.3, H * 0.2, 0, W * 0.3, H * 0.2, W * 0.9); gr.addColorStop(0, "#1a2743"); gr.addColorStop(1, "#0a1526"); c2.fillStyle = gr; c2.fillRect(0, 0, W, H); }
      c2.drawImage(r.domElement, 0, 0, W, H);

      r.setSize(oldS.x, oldS.y, false); r.setPixelRatio(oldPR);
      if (this.gizmo) this.gizmo.visible = gv; if (this.selBox) this.selBox.visible = sv; this._dirty = true;

      if (o.cotas) this._desenharCotas(c2, cam, W, H, k);
      const txt = escuro ? "#ffffff" : "#1e293b";
      if (o.legenda) {
        let x = W * 0.02; const y = H - 30 * k; c2.font = `600 ${12 * k}px sans-serif`; c2.textBaseline = "middle";
        V3.legenda(this.amb).forEach(l => {
          const tw = c2.measureText(l.rotulo).width;
          c2.fillStyle = l.hex; c2.fillRect(x, y - 6 * k, 12 * k, 12 * k); c2.strokeStyle = "rgba(0,0,0,.35)"; c2.strokeRect(x, y - 6 * k, 12 * k, 12 * k);
          c2.fillStyle = txt; c2.textAlign = "left"; c2.fillText(l.rotulo, x + 18 * k, y); x += tw + 40 * k;
        });
      }
      if (o.titulo) {
        const st = this._getState ? this._getState() : null, cli = st && st.orcamento && st.orcamento.cliente;
        c2.font = `700 ${16 * k}px sans-serif`; c2.fillStyle = txt; c2.textAlign = "right"; c2.textBaseline = "middle";
        c2.fillText((this.amb.nome || "") + (cli ? " · " + cli : ""), W - W * 0.02, H - 30 * k);
      }
      const lg = this._logo;
      if (o.logo && lg && lg.complete && lg.naturalWidth) {
        const mh = Math.round(H * 0.09), sc = mh / lg.naturalHeight;
        c2.drawImage(lg, Math.round(W * 0.02), Math.round(H * 0.03), Math.round(lg.naturalWidth * sc), mh);
      }
      try { return o.formato === "jpeg" ? out.toDataURL("image/jpeg", 0.92) : out.toDataURL("image/png"); }
      catch (e) {
        if (o.logo) { this.avisar("Logo não incluído (abra o sistema pelo site, não direto do arquivo).", true); return this.exportarPNG(Object.assign({}, over || {}, { logo: false })); }
        console.error(e); return null;
      }
    },
    /** Foto (JPEG) de um ambiente qualquer, com a configuração de cena dele (camadas, itens, parede).
     *  Usada pela "Proposta com fotos". Restaura o ambiente e a câmera que estavam na tela. */
    fotoAmbiente: function (idx, over) {
      if (!this.ready) return null;
      const arr = this._getAmb(); if (!arr[idx]) return null;
      const old = { i: this.ambIdx, pos: this.camera.position.clone(), tgt: this.controls.target.clone(), preset: this._presetAtual };
      let url = null;
      try {
        this.ambIdx = idx; this._sync();
        if (this.info) {
          this.setPreset("iso");
          url = this.exportarPNG(Object.assign({ fundo: "claro", logo: false, cotas: false, legenda: true, titulo: false, enquadrar: true, resolucao: "1600x900", formato: "jpeg" }, over || {}));
        }
      } finally {
        this.ambIdx = old.i; this._sync();
        this.camera.position.copy(old.pos); this.controls.target.copy(old.tgt); this.controls.update();
        this._presetAtual = old.preset;
        document.querySelectorAll("#cameraPresets button").forEach(b => b.classList.toggle("on", b.dataset.cam === old.preset));
        this._dirty = true;
      }
      return url;
    },
    snapshot: function (paraPrint) {
      const over = paraPrint ? { fundo: this.opcoesFoto.fundo === "transparente" ? "branco" : this.opcoesFoto.fundo } : null;
      const url = this.exportarPNG(over);
      if (!url) { this.avisar("Não foi possível gerar a imagem.", true); return; }
      if (paraPrint) {
        const el = $("viewerSnapshot"); if (el) el.innerHTML = `<img src="${url}" style="width:100%;display:block">`;
      } else {
        const a = document.createElement("a"); a.href = url; a.download = "visualizacao-" + (this.amb && this.amb.nome ? this.amb.nome.replace(/[^\w\-]+/g, "_") : "movel") + ".png";
        document.body.appendChild(a); a.click(); a.remove(); this.avisar("Imagem gerada.");
      }
    }
  };
  viewer3D._getState = null;
  g.viewer3D = viewer3D;
})(window);
