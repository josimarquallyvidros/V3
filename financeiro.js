/* =====================================================================
   financeiro.js  v1.0
   - Preço pela MARGEM LÍQUIDA desejada (substitui o BDI)
   - 5 cards do resultado + detalhamento gerencial + venda por ambiente
   - Proposta (cliente/interna) por ambiente, desconto com piso
   - Impressão: Proposta com fotos e Resumo financeiro
   - Parâmetros globais novos (financeiro, CNC e dados da empresa)
   Carregar DEPOIS do app.js (usa state, fmt, fmtData, escapeHtml, toast...).
   ===================================================================== */
(function (g) {
  "use strict";
  const $ = id => document.getElementById(id);
  const num = (v, d) => (v === undefined || v === null || v === "" || isNaN(+v)) ? d : +v;
  const esc = s => (typeof escapeHtml === "function") ? escapeHtml(s) : String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = v => (typeof fmt === "function") ? fmt(v) : "R$ " + (+v || 0).toFixed(2).replace(".", ",");
  const pct = v => (isFinite(v) ? v : 0).toFixed(1).replace(".", ",") + "%";
  const r2 = v => Math.round((+v + Number.EPSILON) * 100) / 100;
  const dataBR = d => (typeof fmtData === "function") ? fmtData(d) : (d || "—");

  /* ------------------------- PARÂMETROS NOVOS ------------------------- */
  const DEF = {
    margem: 25, imposto: 0, comissao: 0, maoObraM2: 0, pisoDesc: 10,
    cncFresa: 6, cncProf: 4.5, cncPasse: 2, cncAvanco: 3000, cncMergulho: 1000, cncRpm: 18000, cncZseg: 5,
    empNome: "", empCnpj: "", empTel: "", empEmail: "", empEnd: "", empCond: ""
  };
  const CAMPOS_NUM = { p_margem: "margem", p_comissao: "comissao", p_mo: "maoObraM2", p_piso: "pisoDesc", p_cnc_fresa: "cncFresa", p_cnc_prof: "cncProf", p_cnc_passe: "cncPasse", p_cnc_avanco: "cncAvanco", p_cnc_mergulho: "cncMergulho", p_cnc_rpm: "cncRpm", p_cnc_zseg: "cncZseg" };
  const CAMPOS_TXT = { p_emp_nome: "empNome", p_emp_cnpj: "empCnpj", p_emp_tel: "empTel", p_emp_email: "empEmail", p_emp_end: "empEnd", p_emp_cond: "empCond" };

  function params() {
    const p = state.params;
    Object.keys(DEF).forEach(k => { if (p[k] === undefined) p[k] = DEF[k]; });
    return p;
  }
  /** Preenche os campos novos da aba Materiais (chamar dentro de render()) */
  g.preencherParamsV2 = function () {
    const p = params();
    Object.keys(CAMPOS_NUM).forEach(id => { const el = $(id); if (el && document.activeElement !== el) el.value = p[CAMPOS_NUM[id]]; });
    Object.keys(CAMPOS_TXT).forEach(id => { const el = $(id); if (el && document.activeElement !== el) el.value = p[CAMPOS_TXT[id]] || ""; });
  };
  /** Lê os campos novos (chamar dentro de salvarParams()) */
  g.lerParamsV2 = function () {
    const p = params();
    Object.keys(CAMPOS_NUM).forEach(id => { const el = $(id); if (el) p[CAMPOS_NUM[id]] = num(el.value, DEF[CAMPOS_NUM[id]]); });
    Object.keys(CAMPOS_TXT).forEach(id => { const el = $(id); if (el) p[CAMPOS_TXT[id]] = (el.value || "").trim(); });
  };

  /* ---------------------------- ÁREA DE FRENTE ---------------------------- */
  /** m² de frente = soma de (largura x altura) de cada vão */
  function areaFrenteAmb(a) {
    const h1 = +a.altura || 0, h2 = +(a.altura_perna2 || a.altura) || 0;
    let mm2 = 0;
    (a.vaos || []).forEach(v => { const h = (v.tipo === "cristaleira" && +v.altura_propria) ? +v.altura_propria : h1; mm2 += (+v.largura || 0) * h; });
    if (a.tipo === "L") (a.vaos_perna2 || []).forEach(v => { const h = (v.tipo === "cristaleira" && +v.altura_propria) ? +v.altura_propria : h2; mm2 += (+v.largura || 0) * h; });
    return mm2 / 1e6;
  }
  g.areaFrenteAmb = areaFrenteAmb;

  /* ------------------------------- CÁLCULO ------------------------------- */
  /**
   * Chamado por calcularTudo(). Preço de venda por dentro:
   *   venda = (materiais + operacional) / (1 - imposto% - comissão% - margem%)
   * Desconto limitado ao piso: materiais x (1 + pisoDesc%).
   */
  g.aplicarFinanceiro = function (gl, custo, custoDireto) {
    const p = params(), orc = state.orcamento;
    const frente = state.ambientes.reduce((s, a) => s + areaFrenteAmb(a), 0);
    const maoObra = frente * num(p.maoObraM2, 0);
    const frete = num(p.frete, 0), inst = num(p.instalacao, 0);
    const operacional = frete + inst + maoObra;
    const base = custoDireto + operacional;
    const pImp = num(p.imposto, 0) / 100, pCom = num(p.comissao, 0) / 100, pMar = num(p.margem, 0) / 100;
    const divisor = Math.max(0.05, 1 - pImp - pCom - pMar);
    const vendaBruta = base / divisor;
    const piso = custoDireto * (1 + num(p.pisoDesc, 10) / 100);
    const descontoMax = Math.max(0, vendaBruta - piso);
    const pedido = Math.max(0, num(orc.desconto, 0));
    const desconto = Math.min(pedido, descontoMax);
    const total = vendaBruta - desconto;
    const impostoVal = total * pImp, comissaoVal = total * pCom;
    const lucro = total - base - impostoVal - comissaoVal;
    const lucroNoPiso = piso - base - piso * (pImp + pCom);   // lucro se o desconto chegar ao limite máximo

    gl.custo = custo; gl.custoDireto = custoDireto;
    gl.fin = {
      custoMateriais: custoDireto, frete, instalacao: inst, maoObra, frente, operacional, base,
      pImp, pCom, pMar, vendaBruta, piso, descontoMax, descontoPedido: pedido, desconto,
      descontoTravado: pedido > descontoMax + 0.004, total,
      impostoVal, comissaoVal, impostos: impostoVal + comissaoVal,
      lucro, lucroNoPiso, margemReal: total > 0 ? (lucro / total) * 100 : 0
    };
    // compatibilidade com trechos antigos do app.js
    gl.bdiValor = 0; gl.impostoVal = impostoVal + comissaoVal;
    gl.subtotal = vendaBruta; gl.total = total; gl.descontoAplicado = desconto;
    return gl;
  };

  /** Rateia a venda bruta entre os ambientes (soma exata = vendaBruta) */
  function distribuirVenda(gl) {
    const f = gl.fin, ams = state.ambientes, n = ams.length;
    if (!f || !n) return [];
    const pesos = ams.map(a => (gl.porAmbiente[a.id] && gl.porAmbiente[a.id].total) || 0);
    const somaP = pesos.reduce((s, x) => s + x, 0);
    const sh = i => somaP > 0 ? pesos[i] / somaP : 1 / n;
    const linhas = ams.map((a, i) => {
      const area = areaFrenteAmb(a), mat = f.custoMateriais * sh(i), mo = area * num(state.params.maoObraM2, 0), fi = (f.frete + f.instalacao) * sh(i);
      return { id: a.id, nome: a.nome, area, custoMat: mat, maoObra: mo, rateio: fi, custo: mat + mo + fi };
    });
    const somaB = linhas.reduce((s, l) => s + l.custo, 0);
    let acum = 0;
    linhas.forEach((l, i) => {
      l.venda = i === n - 1 ? r2(f.vendaBruta - acum) : r2(somaB > 0 ? f.vendaBruta * l.custo / somaB : f.vendaBruta / n);
      acum += l.venda;
      l.taxas = l.venda * (f.pImp + f.pCom);
      l.lucro = l.venda - l.custo - l.taxas;
    });
    return linhas;
  }
  g.distribuirVendaPorAmbiente = distribuirVenda;

  /* ---------------------------- TELA: RESULTADO ---------------------------- */
  g.renderFinanceiro = function (gl) {
    if (!gl || !gl.fin) return;
    const f = gl.fin, p = params();
    const box = $("finCards");
    if (box) {
      box.innerHTML = `<div class="fin-grid">
        <div class="fin-card c-warn"><div class="fl">1. Custo de materiais</div><div class="fv">${money(f.custoMateriais)}</div><div class="fs">Perfis + Vidros + ACM + Acessórios</div></div>
        <div class="fin-card c-acc"><div class="fl">2. Custo operacional</div><div class="fv">${money(f.operacional)}</div><div class="fs">Frete + Instalação + Mão de obra</div></div>
        <div class="fin-card c-err"><div class="fl">3. Impostos</div><div class="fv">${money(f.impostos)}</div><div class="fs">Impostos (${pct(f.pImp * 100)}) + Comissão (${pct(f.pCom * 100)})</div></div>
        <div class="fin-card c-ok"><div class="fl">4. Lucro real</div><div class="fv">${money(f.lucro)}</div><div class="fs">Margem líquida (${pct(f.margemReal)})</div></div>
        <div class="fin-card destaque"><div class="fl">5. Total venda</div><div class="fv big">${money(f.total)}</div><div class="fs">Preço final ao cliente${f.desconto > 0 ? " · desconto de " + money(f.desconto) : ""}</div></div>
      </div>`;
    }
    const det = $("detGerencial");
    if (det) {
      const base = f.base || 0, k = base > 0 ? f.vendaBruta / base : 0;
      const T0 = f.vendaBruta * (f.pImp + f.pCom), L0 = f.vendaBruta - f.base - T0;
      const cats = [
        ["🔩 Perfis", gl.custo.perfis], ["🪟 Vidros", gl.custo.vidros], ["🧱 ACM", gl.custo.acm], ["🔧 Acessórios", gl.custo.acess],
        ["🚚 Frete e instalação", f.frete + f.instalacao], ["👷 Mão de obra (" + f.frente.toFixed(2).replace(".", ",") + " m²)", f.maoObra]
      ];
      const linhas = cats.map(c => {
        const cu = c[1], im = base > 0 ? T0 * cu / base : 0, lu = base > 0 ? L0 * cu / base : 0;
        return `<tr><td>${c[0]}</td><td class="r">${money(cu)}</td><td class="r neg">${money(im)}</td><td class="r pos">${money(lu)}</td><td class="r b">${money(cu * k)}</td></tr>`;
      }).join("");
      const dist = distribuirVenda(gl);
      const linhasAmb = dist.map(d => `<tr><td>🏠 ${esc(d.nome)}</td><td class="r">${d.area.toFixed(2).replace(".", ",")} m²</td><td class="r">${money(d.custo)}</td><td class="r neg">${money(d.taxas)}</td><td class="r pos">${money(d.lucro)}</td><td class="r b">${money(d.venda)}</td></tr>`).join("");
      det.innerHTML = `
        <div class="fin-box">
          <div class="fin-tit">🔍 Detalhamento gerencial (a matemática do lucro)</div>
          <table class="fin-tab"><thead><tr><th>Categoria</th><th class="r">Custo real</th><th class="r">Impostos + comissão</th><th class="r">Lucro</th><th class="r">Venda do item</th></tr></thead><tbody>
            ${linhas}
            <tr class="ftot"><td>TOTAL (antes do desconto)</td><td class="r">${money(f.base)}</td><td class="r neg">${money(T0)}</td><td class="r pos">${money(L0)}</td><td class="r b">${money(f.vendaBruta)}</td></tr>
            <tr><td>(−) Desconto concedido</td><td></td><td></td><td></td><td class="r neg">- ${money(f.desconto)}</td></tr>
            <tr class="ftot"><td>TOTAL FINAL</td><td class="r">${money(f.base)}</td><td class="r neg">${money(f.impostos)}</td><td class="r pos">${money(f.lucro)}</td><td class="r b">${money(f.total)}</td></tr>
          </tbody></table>
          <div class="fin-nota">Preço = (materiais + operacional) ÷ (1 − impostos ${pct(f.pImp * 100)} − comissão ${pct(f.pCom * 100)} − margem ${pct(f.pMar * 100)}). Impostos e comissão incidem sobre o preço final. Desconto máximo: ${money(f.descontoMax)} (preço mínimo = materiais + ${pct(num(p.pisoDesc, 10))} = ${money(f.piso)}).</div>
        </div>
        <div class="fin-box">
          <div class="fin-tit">🏠 Venda por ambiente (antes do desconto)</div>
          <table class="fin-tab"><thead><tr><th>Ambiente</th><th class="r">Frente</th><th class="r">Custo</th><th class="r">Impostos + comissão</th><th class="r">Lucro</th><th class="r">Venda</th></tr></thead><tbody>${linhasAmb || '<tr><td colspan="6" class="small">Sem ambientes.</td></tr>'}</tbody></table>
        </div>`;
    }
  };

  /* ---------------------------- TELA: PROPOSTA ---------------------------- */
  function descAmb(a) {
    let m = `Bloco 1: ${Math.round(a.largura)}×${Math.round(a.altura)}×${Math.round(a.profundidade)} mm`;
    if (a.tipo === "L") m += ` · Bloco 2: ${Math.round(a.largura_perna2)}×${Math.round(a.altura_perna2)}×${Math.round(a.profundidade_perna2)} mm`;
    return m + ` · Perfil ${a.corPerfil || "—"} · Vidro/ACM ${a.corVidro || "—"}`;
  }
  g.renderPropostaV2 = function (gl) {
    const box = $("propostaV2"); if (!box || !gl || !gl.fin) return;
    const f = gl.fin, orc = state.orcamento, p = params();
    const dist = distribuirVenda(gl);
    const validade = num(orc.validade, 15), base = orc.data ? new Date(orc.data + "T12:00:00") : new Date();
    const dtVal = new Date(base.getTime() + validade * 86400000).toISOString().slice(0, 10);
    const info = $("descInfo");
    if (info) info.innerHTML = `Desconto máximo: <b>${money(f.descontoMax)}</b> <span class="small">(preço mínimo = materiais + ${pct(num(p.pisoDesc, 10))} = ${money(f.piso)})</span>` +
      `<br><span class="small" style="color:${f.lucroNoPiso < 0 ? "var(--err)" : "var(--muted)"}">No limite máximo o lucro seria ${money(f.lucroNoPiso)}${f.lucroNoPiso < 0 ? " (prejuízo: o piso cobre só materiais + " + pct(num(p.pisoDesc, 10)) + ")" : ""}.</span>` +
      (f.descontoTravado ? `<br><span style="color:var(--err)">⚠️ O desconto pedido (${money(f.descontoPedido)}) passa do limite e foi reduzido para ${money(f.desconto)}.</span>` : "");
    const descEl = $("desc"); if (descEl && document.activeElement !== descEl) descEl.value = f.desconto || 0;

    box.innerHTML = `
    <div class="client-box" style="border:1px solid var(--line);border-radius:10px;padding:20px;background:var(--panel2)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;flex-wrap:wrap">
        <div>
          <h2 style="margin:0 0 4px 0;color:var(--acc2)">${esc(p.empNome || "Proposta Comercial")}</h2>
          <p style="margin:0;color:var(--muted);font-size:12px">${[p.empCnpj && "CNPJ " + p.empCnpj, p.empTel, p.empEmail].filter(Boolean).map(esc).join(" · ")}</p>
          <p style="margin:6px 0 0;color:var(--muted);font-size:12px">Proposta nº ${esc(orc.numero || "—")} · ${dataBR(orc.data)}</p>
        </div>
        <div style="text-align:right;font-size:12px">
          <div><b>Validade:</b> ${dataBR(dtVal)}</div>
          <div><b>Vendedor:</b> ${esc(orc.vendedor || "—")}</div>
        </div>
      </div>
      <hr style="border-color:var(--line);margin:16px 0">
      <table>
        <tr><td><b>Cliente:</b></td><td>${esc(orc.cliente || "—")}</td></tr>
        <tr><td><b>Telefone:</b></td><td>${esc(orc.telefone || "—")}</td></tr>
        <tr><td><b>Endereço:</b></td><td>${esc(orc.endereco || "—")}</td></tr>
      </table>
      <h3 style="margin-top:16px;color:var(--gold)">Ambientes</h3>
      <table><thead><tr><th>Ambiente</th><th>Descrição</th><th style="text-align:right">Valor de venda</th></tr></thead><tbody>
      ${dist.map((d, i) => `<tr><td><b>${esc(d.nome)}</b>${state.ambientes[i].tipo === "L" ? ' <span class="pill warn">Em L</span>' : ""}</td><td class="small">${esc(descAmb(state.ambientes[i]))}</td><td style="text-align:right"><b>${money(d.venda)}</b></td></tr>`).join("") || '<tr><td colspan="3">Sem ambientes</td></tr>'}
      </tbody></table>
      <div style="margin-top:16px;text-align:right;font-size:15px">
        <div>Subtotal: <b>${money(f.vendaBruta)}</b></div>
        <div>Desconto: <b>- ${money(f.desconto)}</b></div>
        <div style="font-size:22px;color:var(--ok);margin-top:6px"><b>Total: ${money(f.total)}</b></div>
      </div>
      ${p.empCond ? `<p style="margin-top:16px"><b>Condições de pagamento:</b><br>${esc(p.empCond).replace(/\n/g, "<br>")}</p>` : ""}
      ${orc.obs ? `<p style="margin-top:10px"><b>Observações:</b> ${esc(orc.obs)}</p>` : ""}
    </div>
    <div class="internal-box" style="display:none;border:1px dashed var(--warn);border-radius:10px;padding:20px;margin-top:16px">
      <h3 style="color:var(--warn)">Análise interna</h3>
      <table>
        <tr><td>Custo de materiais</td><td style="text-align:right">${money(f.custoMateriais)}</td></tr>
        <tr><td>Frete + instalação</td><td style="text-align:right">${money(f.frete + f.instalacao)}</td></tr>
        <tr><td>Mão de obra (${f.frente.toFixed(2).replace(".", ",")} m² × ${money(num(p.maoObraM2, 0))})</td><td style="text-align:right">${money(f.maoObra)}</td></tr>
        <tr><td>Impostos (${pct(f.pImp * 100)}) + comissão (${pct(f.pCom * 100)})</td><td style="text-align:right">${money(f.impostos)}</td></tr>
        <tr><td>Desconto</td><td style="text-align:right">- ${money(f.desconto)}</td></tr>
        <tr><td><b>Total venda</b></td><td style="text-align:right"><b>${money(f.total)}</b></td></tr>
        <tr><td>Lucro real</td><td style="text-align:right">${money(f.lucro)} (${pct(f.margemReal)})</td></tr>
      </table>
    </div>`;
  };

  /** Desconto com trava (chamado pelo campo da aba Proposta) */
  g.setDescontoV2 = function (v) {
    let val = Math.max(0, num(v, 0));
    const gl = calcularTudo(), max = gl && gl.fin ? gl.fin.descontoMax : Infinity;
    if (val > max + 0.004) { val = Math.floor(max * 100) / 100; toast("⚠️ Desconto limitado ao piso: " + money(val), true); }
    setOrc("desconto", val);
  };

  /* ------------------------------ IMPRESSÃO ------------------------------ */
  const CSS_PRINT = `
    @page{size:A4;margin:14mm 14mm 14mm}
    *{box-sizing:border-box}
    body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:12px;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    table.pagina{width:100%;border-collapse:collapse}
    table.pagina>tfoot>tr>td,table.pagina>tbody>tr>td{padding:0}
    .cab{display:flex;align-items:center;gap:14px;border-bottom:2px solid #1f2937;padding-bottom:10px;margin-bottom:12px}
    .cab .logo{height:58px;max-width:150px;object-fit:contain}
    .cab .emp{flex:1}.cab .emp h1{margin:0;font-size:18px}.cab .sub{color:#555;font-size:11px;margin-top:2px}
    .cab .info{text-align:right;font-size:11px;line-height:1.5}
    .cli{border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;margin-bottom:12px;line-height:1.5}
    h2.sec{font-size:13px;margin:14px 0 6px;color:#1f2937;text-transform:uppercase;letter-spacing:.5px}
    .amb{border:1px solid #d1d5db;border-radius:8px;padding:10px;margin:0 0 12px;page-break-inside:avoid;break-inside:avoid}
    .amb-h{display:flex;justify-content:space-between;align-items:baseline;font-size:14px;font-weight:700;margin-bottom:8px}
    .amb-h .val{color:#047857;font-size:16px}
    .amb img.foto{display:block;width:100%;max-height:100mm;object-fit:contain;border:1px solid #e5e7eb;border-radius:4px;background:#f8fafc}
    .amb .semfoto{padding:30px;text-align:center;color:#888;border:1px dashed #ccc;border-radius:4px}
    .amb-d{font-size:11px;color:#444;margin-top:6px;line-height:1.5}
    .fim{page-break-inside:avoid;break-inside:avoid}
    .tot{margin-top:10px;margin-left:auto;width:60%;font-size:13px}
    .tot div{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #eee}
    .tot .grande{font-size:18px;font-weight:700;color:#047857;border-bottom:2px solid #047857;margin-top:4px}
    .cond{margin-top:12px;font-size:11px;line-height:1.5}
    .ass{margin-top:46px;text-align:center}
    .ass .linha{border-top:1px solid #111;width:62%;margin:0 auto 4px}
    .ass .dt{margin-top:12px;font-size:11px}
    .rodape{border-top:1px solid #9ca3af;margin-top:10px;padding-top:6px;font-size:10px;color:#555;text-align:center;line-height:1.5}
    .fin-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:8px 0 14px}
    .fin-card{border:2px solid #9ca3af;border-radius:6px;padding:8px}
    .fin-card .fl{font-size:9px;text-transform:uppercase;color:#555}.fin-card .fv{font-size:15px;font-weight:700;margin:3px 0}.fin-card .fs{font-size:9px;color:#555}
    .fin-card.c-warn{border-color:#d97706}.fin-card.c-acc{border-color:#0891b2}.fin-card.c-err{border-color:#dc2626}.fin-card.c-ok{border-color:#16a34a}
    .fin-card.destaque{border-color:#16a34a;background:#ecfdf5}
    table.fin-tab{width:100%;border-collapse:collapse;margin:6px 0 10px;font-size:11px}
    table.fin-tab th,table.fin-tab td{border-bottom:1px solid #e5e7eb;padding:5px 6px;text-align:left}
    table.fin-tab th{background:#f3f4f6;font-size:10px;text-transform:uppercase}
    table.fin-tab .r{text-align:right}.fin-tab tr.ftot td{font-weight:700;background:#f9fafb}
    .fin-tit{font-weight:700;margin:12px 0 4px}.fin-nota{font-size:10px;color:#555;margin-top:4px;line-height:1.4}
  `;
  function abrirJanela(titulo, corpo) {
    const w = window.open("", "_blank");
    if (!w) { toast("⚠️ Libere os pop-ups do navegador para imprimir", true); return null; }
    w.document.open();
    w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${CSS_PRINT}</style></head><body>${corpo}</body></html>`);
    w.document.close();
    const imgs = Array.from(w.document.images);
    Promise.all(imgs.map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; }))).then(() => setTimeout(() => { w.focus(); w.print(); }, 250));
    return w;
  }
  const logoUrl = () => { try { return new URL("logo.png", location.href).href; } catch (e) { return "logo.png"; } };
  function cabecalho(titulo) {
    const p = params(), orc = state.orcamento;
    const sub = [p.empCnpj && "CNPJ " + p.empCnpj, p.empTel, p.empEmail].filter(Boolean).map(esc).join(" · ");
    return `<div class="cab"><img class="logo" src="${logoUrl()}" onerror="this.style.display='none'"><div class="emp"><h1>${esc(p.empNome || titulo)}</h1><div class="sub">${sub}</div></div>
      <div class="info"><div><b>${esc(titulo)}</b></div><div>Orçamento nº ${esc(orc.numero || "—")}</div><div>${dataBR(orc.data)}</div></div></div>`;
  }
  function rodape() {
    const p = params(), l1 = [p.empNome, p.empCnpj && "CNPJ " + p.empCnpj].filter(Boolean).map(esc).join(" · "), l2 = [p.empTel, p.empEmail, p.empEnd].filter(Boolean).map(esc).join(" · ");
    return `<div class="rodape">${l1 ? "<b>" + l1 + "</b><br>" : ""}${l2}</div>`;
  }

  function fotoAmbiente(i) {
    try { if (typeof viewer3D !== "undefined" && viewer3D.fotoAmbiente) return viewer3D.fotoAmbiente(i); } catch (e) { console.error("foto 3D:", e); }
    return null;
  }

  /** Proposta para o cliente: 1 bloco por ambiente (foto 3D + valor), depois subtotal, desconto, total, assinatura e rodapé */
  g.imprimirPropostaFotos = function () {
    if (!state.ambientes.length) { toast("Adicione ambientes primeiro", true); return; }
    toast("📸 Gerando as fotos dos ambientes...");
    const gl = calcularTudo(), f = gl.fin, orc = state.orcamento, p = params();
    const dist = distribuirVenda(gl);
    const fotos = state.ambientes.map((a, i) => fotoAmbiente(i));
    const validade = num(orc.validade, 15), base = orc.data ? new Date(orc.data + "T12:00:00") : new Date();
    const dtVal = new Date(base.getTime() + validade * 86400000).toISOString().slice(0, 10);

    const blocos = state.ambientes.map((a, i) => `<div class="amb">
      <div class="amb-h"><span>${esc(a.nome)}${a.tipo === "L" ? " <small>(em L)</small>" : ""}</span><span class="val">${money(dist[i].venda)}</span></div>
      ${fotos[i] ? `<img class="foto" src="${fotos[i]}">` : '<div class="semfoto">Imagem 3D indisponível</div>'}
      <div class="amb-d">${esc(descAmb(a))}</div></div>`).join("");

    const corpo = `<table class="pagina"><tfoot><tr><td>${rodape()}</td></tr></tfoot><tbody><tr><td>
      ${cabecalho("Proposta Comercial")}
      <div class="cli"><b>Cliente:</b> ${esc(orc.cliente || "—")} &nbsp;·&nbsp; <b>Telefone:</b> ${esc(orc.telefone || "—")}<br><b>Endereço:</b> ${esc(orc.endereco || "—")}<br><b>Vendedor:</b> ${esc(orc.vendedor || "—")} &nbsp;·&nbsp; <b>Validade da proposta:</b> ${dataBR(dtVal)}</div>
      <h2 class="sec">Ambientes</h2>
      ${blocos}
      <div class="fim">
        <div class="tot"><div><span>Subtotal</span><b>${money(f.vendaBruta)}</b></div><div><span>Desconto</span><b>- ${money(f.desconto)}</b></div><div class="grande"><span>TOTAL</span><span>${money(f.total)}</span></div></div>
        ${p.empCond ? `<div class="cond"><b>Condições de pagamento:</b><br>${esc(p.empCond).replace(/\n/g, "<br>")}</div>` : ""}
        ${orc.obs ? `<div class="cond"><b>Observações:</b> ${esc(orc.obs)}</div>` : ""}
        <div class="ass"><div class="linha"></div><div><b>${esc(orc.cliente || "Cliente")}</b></div><div style="font-size:10px;color:#555">Assinatura do cliente · de acordo com esta proposta</div><div class="dt">Data: ____ / ____ / ________</div></div>
      </div>
    </td></tr></tbody></table>`;
    abrirJanela("Proposta " + (orc.numero || ""), corpo);
  };

  /** Resumo financeiro (uso interno): 5 indicadores, detalhamento e venda por ambiente */
  g.imprimirResumoFinanceiro = function () {
    const gl = calcularTudo(), f = gl.fin, p = params(); if (!f) return;
    const base = f.base || 0, k = base > 0 ? f.vendaBruta / base : 0, T0 = f.vendaBruta * (f.pImp + f.pCom), L0 = f.vendaBruta - f.base - T0;
    const cats = [["Perfis", gl.custo.perfis], ["Vidros", gl.custo.vidros], ["ACM", gl.custo.acm], ["Acessórios", gl.custo.acess], ["Frete e instalação", f.frete + f.instalacao], ["Mão de obra (" + f.frente.toFixed(2).replace(".", ",") + " m²)", f.maoObra]];
    const linhas = cats.map(c => `<tr><td>${c[0]}</td><td class="r">${money(c[1])}</td><td class="r">${money(base > 0 ? T0 * c[1] / base : 0)}</td><td class="r">${money(base > 0 ? L0 * c[1] / base : 0)}</td><td class="r"><b>${money(c[1] * k)}</b></td></tr>`).join("");
    const dist = distribuirVenda(gl);
    const linhasAmb = dist.map(d => `<tr><td>${esc(d.nome)}</td><td class="r">${d.area.toFixed(2).replace(".", ",")} m²</td><td class="r">${money(d.custo)}</td><td class="r">${money(d.taxas)}</td><td class="r">${money(d.lucro)}</td><td class="r"><b>${money(d.venda)}</b></td></tr>`).join("");
    const corpo = `<table class="pagina"><tfoot><tr><td>${rodape()}</td></tr></tfoot><tbody><tr><td>
      ${cabecalho("Resumo Financeiro (uso interno)")}
      <div class="cli"><b>Cliente:</b> ${esc(state.orcamento.cliente || "—")} &nbsp;·&nbsp; <b>Vendedor:</b> ${esc(state.orcamento.vendedor || "—")}</div>
      <div class="fin-grid">
        <div class="fin-card c-warn"><div class="fl">1. Custo de materiais</div><div class="fv">${money(f.custoMateriais)}</div><div class="fs">Perfis + Vidros + ACM + Acessórios</div></div>
        <div class="fin-card c-acc"><div class="fl">2. Custo operacional</div><div class="fv">${money(f.operacional)}</div><div class="fs">Frete + Instalação + Mão de obra</div></div>
        <div class="fin-card c-err"><div class="fl">3. Impostos</div><div class="fv">${money(f.impostos)}</div><div class="fs">Impostos + Comissão</div></div>
        <div class="fin-card c-ok"><div class="fl">4. Lucro real</div><div class="fv">${money(f.lucro)}</div><div class="fs">Margem líquida (${pct(f.margemReal)})</div></div>
        <div class="fin-card destaque"><div class="fl">5. Total venda</div><div class="fv">${money(f.total)}</div><div class="fs">Preço final ao cliente</div></div>
      </div>
      <div class="fin-tit">Detalhamento gerencial</div>
      <table class="fin-tab"><thead><tr><th>Categoria</th><th class="r">Custo real</th><th class="r">Impostos + comissão</th><th class="r">Lucro</th><th class="r">Venda do item</th></tr></thead><tbody>${linhas}
        <tr class="ftot"><td>TOTAL (antes do desconto)</td><td class="r">${money(f.base)}</td><td class="r">${money(T0)}</td><td class="r">${money(L0)}</td><td class="r">${money(f.vendaBruta)}</td></tr>
        <tr><td>(−) Desconto concedido</td><td></td><td></td><td></td><td class="r">- ${money(f.desconto)}</td></tr>
        <tr class="ftot"><td>TOTAL FINAL</td><td class="r">${money(f.base)}</td><td class="r">${money(f.impostos)}</td><td class="r">${money(f.lucro)}</td><td class="r">${money(f.total)}</td></tr></tbody></table>
      <div class="fin-tit">Venda por ambiente (antes do desconto)</div>
      <table class="fin-tab"><thead><tr><th>Ambiente</th><th class="r">Frente</th><th class="r">Custo</th><th class="r">Impostos + comissão</th><th class="r">Lucro</th><th class="r">Venda</th></tr></thead><tbody>${linhasAmb}</tbody></table>
      <div class="fin-nota"><b>Parâmetros:</b> margem líquida ${pct(f.pMar * 100)} · impostos ${pct(f.pImp * 100)} · comissão ${pct(f.pCom * 100)} · mão de obra ${money(num(p.maoObraM2, 0))}/m² · piso do preço = materiais + ${pct(num(p.pisoDesc, 10))} (desconto máximo ${money(f.descontoMax)}).<br>
      Preço = (materiais + operacional) ÷ (1 − impostos − comissão − margem).</div>
    </td></tr></tbody></table>`;
    abrirJanela("Resumo financeiro", corpo);
  };
})(window);
