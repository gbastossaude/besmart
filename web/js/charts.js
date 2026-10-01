/* =====================================================================
   ATOS SISTEMA — charts.js
   Gráficos leves em SVG/HTML (sem bibliotecas), coloridos pelos tokens.
   ===================================================================== */
(function (global) {
  'use strict';
  const { h, fmt } = global.U;
  const NS = 'http://www.w3.org/2000/svg';
  const s = (tag, attrs = {}, ...kids) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, v); kids.flat().forEach(k => k && el.appendChild(typeof k === 'string' ? document.createTextNode(k) : k)); return el; };

  function niceMax(v) {
    if (!v || v <= 0) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
  }

  /**
   * Colunas verticais com linha opcional (ex.: vendas por mês × meta)
   * data: [{label, value, line}]
   */
  function columns(data, { height = 220, format = fmt.int, axisFormat, color = 'var(--blue)', lineColor = 'var(--cyan)', lineLabel, barLabel, highlightLast = true } = {}) {
    const W = 640, H = height, L = 52, R = 12, T = 14, B = 28;
    const iw = W - L - R, ih = H - T - B;
    const max = niceMax(Math.max(...data.map(d => Math.max(d.value || 0, d.line || 0)), 0));
    const y = v => T + ih - (v / max) * ih;
    const bw = iw / data.length;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-label': barLabel || 'Gráfico de colunas' });
    const af = axisFormat || format;
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i, yy = y(v);
      svg.appendChild(s('line', { x1: L, x2: W - R, y1: yy, y2: yy, class: 'grid' }));
      svg.appendChild(s('text', { x: L - 8, y: yy + 4, class: 'axis', 'text-anchor': 'end' }, af(v)));
    }
    data.forEach((d, i) => {
      const x = L + i * bw + bw * 0.18, w = bw * 0.64, yy = y(d.value || 0);
      const last = highlightLast && i === data.length - 1;
      const g = s('g', { class: 'bar-g' });
      g.appendChild(s('rect', { x, y: yy, width: w, height: Math.max(0, T + ih - yy), rx: 3, fill: color, 'fill-opacity': last ? 1 : 0.55, class: 'bar' }));
      g.appendChild(s('title', {}, `${d.label}: ${format(d.value || 0)}${d.line != null ? ` · ${lineLabel || 'linha'}: ${format(d.line)}` : ''}`));
      svg.appendChild(g);
      svg.appendChild(s('text', { x: L + i * bw + bw / 2, y: H - 8, class: 'axis', 'text-anchor': 'middle' }, d.label));
      if (last && d.value) svg.appendChild(s('text', { x: L + i * bw + bw / 2, y: yy - 6, class: 'val', 'text-anchor': 'middle' }, format(d.value)));
    });
    if (data.some(d => d.line != null)) {
      const pts = data.map((d, i) => d.line == null ? null : [L + i * bw + bw / 2, y(d.line)]).filter(Boolean);
      svg.appendChild(s('polyline', { points: pts.map(p => p.join(',')).join(' '), fill: 'none', stroke: lineColor, 'stroke-width': 2, 'stroke-dasharray': '5 4', 'stroke-linejoin': 'round' }));
      pts.forEach(p => svg.appendChild(s('circle', { cx: p[0], cy: p[1], r: 3.2, fill: 'var(--panel)', stroke: lineColor, 'stroke-width': 2 })));
    }
    const legend = (barLabel || lineLabel) ? h('div', { class: 'legend' },
      barLabel ? h('span', null, h('i', { class: 'sw', style: { background: color } }), barLabel) : null,
      lineLabel && data.some(d => d.line != null) ? h('span', null, h('i', { class: 'sw dash', style: { borderColor: lineColor } }), lineLabel) : null) : null;
    return h('div', { class: 'chart' }, svg, legend);
  }

  /** Barras horizontais (ranking, operadora, origem) — HTML para rótulos legíveis */
  function hbars(data, { format = fmt.int, color = 'var(--blue)', sub, max, onClick, empty = 'Sem dados no período' } = {}) {
    if (!data.length) return h('div', { class: 'chart-empty' }, empty);
    const m = max || Math.max(...data.map(d => d.value || 0), 1);
    return h('div', { class: 'hbars' }, data.map((d, i) => h('div', { class: 'hbar' + (onClick ? ' clickable' : ''), onclick: onClick ? () => onClick(d) : null },
      h('div', { class: 'hbar-top' },
        h('span', { class: 'hbar-label' }, h('span', { class: 'hbar-rank' }, i + 1), d.label),
        h('span', { class: 'hbar-val' }, format(d.value), sub ? h('span', { class: 'hbar-sub' }, sub(d)) : null)),
      h('div', { class: 'hbar-track' }, h('div', { class: 'hbar-fill', style: { width: Math.max(1.5, 100 * (d.value || 0) / m) + '%', background: d.color || color } })))));
  }

  /** Funil comercial com taxa de passagem entre etapas */
  function funnel(data, { onClick } = {}) {
    if (!data.length || !data[0].qtd) return h('div', { class: 'chart-empty' }, 'Nenhum lead no período');
    const top = data[0].qtd || 1;
    return h('div', { class: 'funnel' }, data.map((d, i) => {
      const prev = i ? data[i - 1].qtd : null;
      const pass = prev ? Math.round(100 * d.qtd / prev) : null;
      return h('div', { class: 'fn-row' + (onClick ? ' clickable' : ''), onclick: onClick ? () => onClick(d) : null },
        h('div', { class: 'fn-name' }, d.nome),
        h('div', { class: 'fn-track' }, h('div', { class: 'fn-bar', style: { width: Math.max(2, 100 * d.qtd / top) + '%', '--c': d.cor } }, h('span', null, fmt.int(d.qtd)))),
        h('div', { class: 'fn-pass' }, pass === null ? '' : pass + '%'));
    }));
  }

  /** Anel de progresso (meta) */
  function ring(pct, { size = 112, label, sub } = {}) {
    const r = 44, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct || 0));
    const col = pct >= 100 ? 'var(--ok)' : pct >= 70 ? 'var(--blue)' : pct >= 40 ? 'var(--warn)' : 'var(--bad)';
    const svg = s('svg', { viewBox: '0 0 110 110', width: size, height: size, class: 'ring', role: 'img', 'aria-label': `${fmt.pct(pct)} da meta` },
      s('circle', { cx: 55, cy: 55, r, fill: 'none', stroke: 'var(--line)', 'stroke-width': 9 }),
      s('circle', { cx: 55, cy: 55, r, fill: 'none', stroke: col, 'stroke-width': 9, 'stroke-linecap': 'round', 'stroke-dasharray': `${(c * p) / 100} ${c}`, transform: 'rotate(-90 55 55)' }),
      s('text', { x: 55, y: 56, 'text-anchor': 'middle', class: 'ring-val' }, pct == null ? '—' : Math.round(pct) + '%'),
      s('text', { x: 55, y: 72, 'text-anchor': 'middle', class: 'ring-sub' }, sub || 'da meta'));
    return h('div', { class: 'ring-wrap' }, svg, label ? h('div', { class: 'ring-label' }, label) : null);
  }

  /** Mini linha (tendência) */
  function spark(values, { color = 'var(--blue)', w = 120, hgt = 32 } = {}) {
    if (!values.length) return h('span');
    const max = Math.max(...values, 1), min = Math.min(...values, 0);
    const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * (w - 4) + 2, hgt - 3 - ((v - min) / Math.max(1, max - min)) * (hgt - 6)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const svg = s('svg', { viewBox: `0 0 ${w} ${hgt}`, width: w, height: hgt, class: 'spark', 'aria-hidden': 'true' },
      s('path', { d: d + ` L${pts[pts.length - 1][0]} ${hgt} L${pts[0][0]} ${hgt} Z`, fill: color, 'fill-opacity': 0.12 }),
      s('path', { d, fill: 'none', stroke: color, 'stroke-width': 1.8, 'stroke-linejoin': 'round' }),
      s('circle', { cx: pts[pts.length - 1][0], cy: pts[pts.length - 1][1], r: 2.6, fill: color }));
    return svg;
  }

  /** Barras empilhadas horizontais simples (distribuição por categoria) */
  function stack(parts, { format = fmt.int } = {}) {
    const tot = parts.reduce((a, p) => a + (p.value || 0), 0) || 1;
    return h('div', { class: 'stackbar-wrap' },
      h('div', { class: 'stackbar' }, parts.map(p => h('div', { class: 'stackbar-seg', title: `${p.label}: ${format(p.value)}`, style: { width: (100 * (p.value || 0) / tot) + '%', background: p.color } }))),
      h('div', { class: 'legend' }, parts.map(p => h('span', null, h('i', { class: 'sw', style: { background: p.color } }), `${p.label} · ${format(p.value)}`))));
  }

  global.Charts = { columns, hbars, funnel, ring, spark, stack, niceMax };
})(window);
