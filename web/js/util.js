/* =====================================================================
   ATOS SISTEMA — util.js
   Utilitários de DOM, formatação, componentes de interface (modal,
   drawer, toast, confirmação, formulários, tabelas) e ícones.
   ===================================================================== */
(function (global) {
  'use strict';

  // ------------------------------------------------------------------
  // DOM
  // ------------------------------------------------------------------
  function h(tag, attrs, ...children) {
    const el = tag === 'frag' ? document.createDocumentFragment() : document.createElement(tag);
    if (attrs && tag !== 'frag') {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
        else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sv === null || sv === undefined) continue; if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'value' && (tag === 'input' || tag === 'textarea' || tag === 'select')) el.value = v;
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    append(el, children);
    return el;
  }
  function append(el, children) {
    for (const c of children.flat(Infinity)) {
      if (c === null || c === undefined || c === false || c === '') continue;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  // append nativo ignorando null/undefined/false (evita textos "null" na tela)
  if (!Element.prototype.__atosAppend) {
    const nativo = Element.prototype.append;
    Element.prototype.append = function (...a) { return nativo.apply(this, a.flat(Infinity).filter(x => x !== null && x !== undefined && x !== false && x !== '')); };
    Element.prototype.__atosAppend = true;
  }
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ------------------------------------------------------------------
  // Formatação (pt-BR)
  // ------------------------------------------------------------------
  const nfMoney = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const nfMoney0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const nfInt = new Intl.NumberFormat('pt-BR');
  const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const fmt = {
    money: v => v === null || v === undefined || v === '' ? '—' : nfMoney.format(Number(v)),
    money0: v => v === null || v === undefined || v === '' ? '—' : nfMoney0.format(Number(v)),
    moneyShort(v) {
      if (v === null || v === undefined) return '—';
      const n = Number(v);
      if (Math.abs(n) >= 1e6) return 'R$ ' + nf1.format(n / 1e6) + ' mi';
      if (Math.abs(n) >= 1e4) return 'R$ ' + nf1.format(n / 1e3) + ' mil';
      return nfMoney0.format(n);
    },
    int: v => v === null || v === undefined ? '—' : nfInt.format(Number(v)),
    num: v => v === null || v === undefined ? '—' : nf1.format(Number(v)),
    pct: v => v === null || v === undefined ? '—' : nf1.format(Number(v)) + '%',
    date(v) {
      if (!v) return '—';
      const d = toDate(v);
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    },
    dateShort(v) { if (!v) return '—'; return toDate(v).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', ''); },
    datetime(v) {
      if (!v) return '—';
      const d = new Date(v);
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    },
    time(v) { return v ? new Date(v).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'; },
    rel(v) {
      if (!v) return '—';
      const diff = (Date.now() - new Date(v).getTime()) / 1000;
      const fut = diff < 0, a = Math.abs(diff);
      let s;
      if (a < 60) s = 'agora';
      else if (a < 3600) s = Math.round(a / 60) + ' min';
      else if (a < 86400) s = Math.round(a / 3600) + ' h';
      else if (a < 86400 * 30) s = Math.round(a / 86400) + ' d';
      else if (a < 86400 * 365) s = Math.round(a / (86400 * 30)) + ' mês' + (Math.round(a / (86400 * 30)) > 1 ? 'es' : '');
      else s = Math.round(a / (86400 * 365)) + ' a';
      if (s === 'agora') return s;
      return fut ? 'em ' + s : 'há ' + s;
    },
    hours(hh) {
      if (hh === null || hh === undefined) return '—';
      if (hh < 1) return '< 1 h';
      if (hh < 48) return Math.round(hh) + ' h';
      return Math.round(hh / 24) + ' d';
    },
    minutes(m) {
      if (m === null || m === undefined) return '—';
      m = Number(m);
      if (m < 60) return nf1.format(m) + ' min';
      if (m < 60 * 48) return nf1.format(m / 60) + ' h';
      return nf1.format(m / 1440) + ' d';
    },
    phone(v) {
      const d = String(v || '').replace(/\D/g, '');
      if (!d) return '—';
      const x = d.length > 11 && d.startsWith('55') ? d.slice(2) : d;
      if (x.length === 11) return `(${x.slice(0, 2)}) ${x.slice(2, 7)}-${x.slice(7)}`;
      if (x.length === 10) return `(${x.slice(0, 2)}) ${x.slice(2, 6)}-${x.slice(6)}`;
      return v;
    },
    cpf(v) { const d = String(v || '').replace(/\D/g, ''); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : (v || '—'); },
    cnpj(v) { const d = String(v || '').replace(/\D/g, ''); return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : (v || '—'); },
    doc(v) { const d = String(v || '').replace(/\D/g, ''); return d.length === 14 ? fmt.cnpj(d) : d.length === 11 ? fmt.cpf(d) : (v || '—'); },
    month(ym) { const [y, m] = ym.split('-'); return new Date(+y, +m - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') + '/' + y.slice(2); },
    monthLong(d) { const x = toDate(d); return x.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); },
    initials(n) { return String(n || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase(); },
  };

  // ------------------------------------------------------------------
  // Datas
  // ------------------------------------------------------------------
  function toDate(v) {
    if (v instanceof Date) return v;
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d); }
    return new Date(v);
  }
  const pad = n => String(n).padStart(2, '0');
  const dates = {
    iso(d = new Date()) { d = toDate(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; },
    today() { return dates.iso(new Date()); },
    addDays(d, n) { const x = new Date(toDate(d)); x.setDate(x.getDate() + n); return dates.iso(x); },
    startOfMonth(d = new Date()) { d = toDate(d); return dates.iso(new Date(d.getFullYear(), d.getMonth(), 1)); },
    endOfMonth(d = new Date()) { d = toDate(d); return dates.iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)); },
    startOfWeek(d = new Date()) { d = new Date(toDate(d)); const w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return dates.iso(d); },
    addMonths(d, n) { d = toDate(d); return dates.iso(new Date(d.getFullYear(), d.getMonth() + n, 1)); },
    localInput(v) { if (!v) return ''; const d = new Date(v); return `${dates.iso(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; },
    fromLocalInput(v) { return v ? new Date(v).toISOString() : null; },
    periodos() {
      const t = dates.today();
      return {
        hoje: [t, t], semana: [dates.startOfWeek(), t], mes: [dates.startOfMonth(), t],
        mes_anterior: [dates.addMonths(t, -1), dates.addDays(dates.startOfMonth(), -1)],
        trimestre: [dates.addMonths(t, -2), t], ano: [`${new Date().getFullYear()}-01-01`, t],
        '90d': [dates.addDays(t, -89), t], '30d': [dates.addDays(t, -29), t],
      };
    },
  };

  // ------------------------------------------------------------------
  // Diversos
  // ------------------------------------------------------------------
  function debounce(fn, ms = 250) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  function digits(v) { return String(v || '').replace(/\D/g, ''); }
  function waLink(phone, text) {
    let d = digits(phone); if (!d) return null;
    if (!d.startsWith('55')) d = '55' + d;
    return `https://wa.me/${d}${text ? '?text=' + encodeURIComponent(text) : ''}`;
  }
  function groupBy(arr, fn) { const m = new Map(); for (const x of arr) { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; }
  function sum(arr, fn = x => x) { return arr.reduce((a, x) => a + (Number(fn(x)) || 0), 0); }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem('atos.' + k)); localStorage.setItem('atos.' + k, JSON.stringify(v)); } catch (e) { return null; } }

  // ------------------------------------------------------------------
  // Ícones (traço 1.75, 24px)
  // ------------------------------------------------------------------
  const P = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    kanban: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 7v7M12 7v4M16 7v9"/>',
    leads: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    clients: '<path d="M20 7h-4V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2H4a1 1 0 0 0-1 1v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a1 1 0 0 0-1-1Z"/><path d="M8 7V5M16 7V5M3 13h18"/>',
    sales: '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    tasks: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m9 12 2 2 4-4"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
    package: '<path d="m7.5 4.27 9 5.15M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18M7 6h1v4M16.71 13.88l.7.71-2.82 2.82"/>',
    team: '<circle cx="12" cy="7" r="3"/><circle cx="5" cy="10" r="2.2"/><circle cx="19" cy="10" r="2.2"/><path d="M7.5 21v-2.5A4.5 4.5 0 0 1 12 14a4.5 4.5 0 0 1 4.5 4.5V21M1.5 20v-1.2A3.3 3.3 0 0 1 5 15.5M22.5 20v-1.2A3.3 3.3 0 0 0 19 15.5"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 16v-5M12 16V8M17 16v-8"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    whatsapp: '<path d="M3 21l1.65-3.8A9 9 0 1 1 7.8 20.4L3 21"/><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
    wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    arrowRight: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
    clip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>',
    shuffle: '<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4M2 6h1.9c1.5 0 2.9.9 3.6 2.2M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/>',
    note: '<path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v6h6"/>',
    pinFill: '<path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65M22 12.65l-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    swap: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  };
  function icon(name, size = 18, cls = '') {
    const span = document.createElement('span');
    span.className = 'ic ' + cls;
    span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.more}</svg>`;
    return span;
  }

  // ------------------------------------------------------------------
  // Toast
  // ------------------------------------------------------------------
  function toast(msg, type = 'ok', ms = 3600) {
    let wrap = $('#toasts');
    if (!wrap) { wrap = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.appendChild(wrap); }
    const t = h('div', { class: 'toast toast-' + type }, icon(type === 'ok' ? 'check' : type === 'err' ? 'alert' : 'bell', 16), h('span', null, msg));
    wrap.appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, ms);
  }

  // ------------------------------------------------------------------
  // Modal / Drawer / Confirmação
  // ------------------------------------------------------------------
  const stack = [];
  function openLayer(kind, { title, subtitle, body, footer, size = 'md', onClose } = {}) {
    const close = () => { layer.classList.remove('in'); setTimeout(() => layer.remove(), 180); const i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1); onClose && onClose(); };
    const panel = h('div', { class: `${kind} ${kind}-${size}`, role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: kind + '-head' },
        h('div', { class: 'grow' }, h('h2', null, title || ''), subtitle ? h('div', { class: 'sub' }, subtitle) : null),
        h('button', { class: 'icon-btn', 'aria-label': 'Fechar', onclick: close }, icon('x'))),
      h('div', { class: kind + '-body' }, body),
      footer ? h('div', { class: kind + '-foot' }, footer) : null);
    const layer = h('div', { class: 'layer layer-' + kind, onmousedown: e => { if (e.target === layer) close(); } }, panel);
    document.body.appendChild(layer);
    requestAnimationFrame(() => layer.classList.add('in'));
    const first = panel.querySelector('input:not([type=hidden]),select,textarea');
    if (first) setTimeout(() => first.focus(), 60);
    const api = { close, panel, layer, setBody(b) { clear(panel.querySelector('.' + kind + '-body')); append(panel.querySelector('.' + kind + '-body'), [b]); } };
    stack.push(api);
    return api;
  }
  const modal = o => openLayer('modal', o);
  const drawer = o => openLayer('drawer', { size: 'lg', ...o });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && stack.length) stack[stack.length - 1].close(); });

  function confirmDialog({ title = 'Confirmar', message, confirm = 'Confirmar', danger = false } = {}) {
    return new Promise(res => {
      let done = false;
      const m = modal({
        title, size: 'sm', body: h('p', { class: 'confirm-msg' }, message),
        footer: [h('button', { class: 'btn ghost', onclick: () => { done = true; m.close(); res(false); } }, 'Cancelar'),
                 h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => { done = true; m.close(); res(true); } }, confirm)],
        onClose: () => { if (!done) res(false); },
      });
    });
  }

  // ------------------------------------------------------------------
  // Formulários declarativos
  // campo: {name, label, type, options:[{value,label}], required, placeholder, span, hint, min, max, step, rows}
  // ------------------------------------------------------------------
  function field(f, value) {
    const id = 'f_' + f.name;
    let input;
    const common = { id, name: f.name, required: f.required || null, placeholder: f.placeholder || null, disabled: f.disabled || null };
    if (f.type === 'select') {
      const semValor = value === null || value === undefined || value === '';
      input = h('select', common, f.required ? (semValor ? h('option', { value: '', disabled: true, selected: true }, 'Selecione…') : null) : h('option', { value: '' }, f.empty || '—'),
        (f.options || []).map(o => h('option', { value: o.value, selected: (!semValor && String(o.value) === String(value)) || null }, o.label)));
    } else if (f.type === 'textarea') {
      input = h('textarea', { ...common, rows: f.rows || 3 }, value ?? '');
    } else if (f.type === 'checkbox') {
      input = h('label', { class: 'check' }, h('input', { type: 'checkbox', id, name: f.name, checked: value ? true : null }), h('span', null, f.checkLabel || f.label));
      return h('div', { class: 'field field-check ' + (f.span ? 'span-' + f.span : '') }, input, f.hint ? h('div', { class: 'hint' }, f.hint) : null);
    } else {
      let v = value ?? '';
      if (f.type === 'datetime-local') v = dates.localInput(value);
      input = h('input', { ...common, type: f.type || 'text', value: v, min: f.min ?? null, max: f.max ?? null, step: f.step ?? null, inputmode: f.inputmode || null, autocomplete: f.autocomplete || 'off' });
      if (f.mask) input.addEventListener('input', () => { input.value = masks[f.mask](input.value); });
    }
    return h('div', { class: 'field ' + (f.span ? 'span-' + f.span : '') },
      h('label', { for: id }, f.label, f.required ? h('span', { class: 'req' }, ' *') : null), input,
      f.hint ? h('div', { class: 'hint' }, f.hint) : null);
  }
  function form(fields, values = {}, { cols = 2 } = {}) {
    const el = h('form', { class: 'form cols-' + cols, onsubmit: e => e.preventDefault(), novalidate: true },
      fields.map(f => f.section ? h('div', { class: 'form-section span-all' }, f.section) : field(f, values[f.name])));
    el.values = () => {
      const out = {};
      for (const f of fields) {
        if (f.section) continue;
        const inp = el.querySelector('#f_' + f.name);
        if (!inp) continue;
        let v = f.type === 'checkbox' ? inp.checked : inp.value;
        if (f.type === 'number' || f.type === 'money') v = v === '' ? null : Number(String(v).replace(',', '.'));
        else if (f.type === 'datetime-local') v = dates.fromLocalInput(v);
        else if (typeof v === 'string') { v = v.trim(); if (v === '') v = null; }
        out[f.name] = v;
      }
      return out;
    };
    el.validate = () => {
      let ok = true;
      el.querySelectorAll('.field.invalid').forEach(x => x.classList.remove('invalid'));
      for (const f of fields) {
        if (!f.required) continue;
        const inp = el.querySelector('#f_' + f.name);
        if (inp && !String(inp.value || '').trim()) { inp.closest('.field').classList.add('invalid'); ok = false; }
      }
      if (!ok) toast('Preencha os campos obrigatórios', 'err');
      return ok;
    };
    return el;
  }
  const masks = {
    phone(v) { const d = digits(v).slice(0, 11); if (d.length <= 2) return d; if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`; if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`; return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; },
    cpf(v) { const d = digits(v).slice(0, 11); return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); },
    cnpj(v) { const d = digits(v).slice(0, 14); return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2'); },
    cep(v) { const d = digits(v).slice(0, 8); return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d; },
  };

  // ------------------------------------------------------------------
  // Componentes visuais
  // ------------------------------------------------------------------
  function badge(text, color, cls = '') {
    return h('span', { class: 'badge ' + cls, style: color ? { '--c': color } : null }, text);
  }
  function avatar(name, size = 28) {
    const hue = [...String(name || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
    return h('span', { class: 'avatar', style: { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.38) + 'px', '--h': hue } }, fmt.initials(name));
  }
  function empty(title, text, action) {
    return h('div', { class: 'empty' }, h('div', { class: 'empty-mark' }, icon('layers', 22)), h('div', { class: 'empty-title' }, title), text ? h('div', { class: 'empty-text' }, text) : null, action || null);
  }
  function skeleton(rows = 6) {
    return h('div', { class: 'skel-wrap' }, Array.from({ length: rows }, (_, i) => h('div', { class: 'skel', style: { width: (70 + (i * 37) % 30) + '%' } })));
  }
  const TEMP = { quente: { label: 'Quente', color: '#F0524F', icon: 'flame' }, morno: { label: 'Morno', color: '#F2A93B', icon: 'flame' }, frio: { label: 'Frio', color: '#39C6F4', icon: 'flame' } };
  function tempChip(t) { const x = TEMP[t] || TEMP.morno; return h('span', { class: 'temp', style: { '--c': x.color }, title: 'Temperatura: ' + x.label }, icon('flame', 13), x.label); }

  /**
   * Tabela
   * cols: [{key, label, render(row), align, width, sort}]
   */
  function table(cols, rows, { onRow, selectable, selected, onSelect, dense, emptyText = 'Nenhum registro encontrado', sortState, onSort } = {}) {
    const sel = selected || new Set();
    const head = h('tr', null,
      selectable ? h('th', { class: 'col-sel' }, h('input', { type: 'checkbox', 'aria-label': 'Selecionar todos', checked: rows.length && rows.every(r => sel.has(r.id)) ? true : null,
        onchange: e => { rows.forEach(r => e.target.checked ? sel.add(r.id) : sel.delete(r.id)); onSelect && onSelect(sel); } })) : null,
      cols.map(c => h('th', { class: [c.align ? 'a-' + c.align : '', c.sort && onSort ? 'sortable' : ''], style: c.width ? { width: c.width } : null,
        onclick: c.sort && onSort ? () => onSort(c.sort) : null },
        c.label, sortState && c.sort && sortState[0] === c.sort ? h('span', { class: 'sort-ind' }, sortState[1] ? ' ↑' : ' ↓') : null)));
    const body = rows.length ? rows.map(r => h('tr', { class: onRow ? 'clickable' : '', onclick: onRow ? e => { if (e.target.closest('a,button,input,select,.no-row')) return; onRow(r); } : null },
      selectable ? h('td', { class: 'col-sel no-row' }, h('input', { type: 'checkbox', 'aria-label': 'Selecionar', checked: sel.has(r.id) ? true : null,
        onchange: e => { e.target.checked ? sel.add(r.id) : sel.delete(r.id); onSelect && onSelect(sel); } })) : null,
      cols.map(c => h('td', { class: c.align ? 'a-' + c.align : '' }, c.render ? c.render(r) : (r[c.key] ?? '—')))))
      : [h('tr', null, h('td', { colspan: cols.length + (selectable ? 1 : 0), class: 'td-empty' }, emptyText))];
    return h('div', { class: 'table-wrap' + (dense ? ' dense' : '') }, h('table', { class: 'tbl' }, h('thead', null, head), h('tbody', null, body)));
  }

  function pager(page, size, total, onPage) {
    const pages = Math.max(1, Math.ceil(total / size));
    return h('div', { class: 'pager' },
      h('span', { class: 'muted' }, total ? `${fmt.int(page * size + 1)}–${fmt.int(Math.min(total, (page + 1) * size))} de ${fmt.int(total)}` : '0 registros'),
      h('div', { class: 'pager-btns' },
        h('button', { class: 'icon-btn', disabled: page <= 0 || null, onclick: () => onPage(page - 1), 'aria-label': 'Anterior' }, icon('chevronLeft', 16)),
        h('span', { class: 'pager-n' }, `${page + 1} / ${pages}`),
        h('button', { class: 'icon-btn', disabled: page >= pages - 1 || null, onclick: () => onPage(page + 1), 'aria-label': 'Próxima' }, icon('chevronRight', 16))));
  }

  function tabs(items, active, onChange) {
    return h('div', { class: 'tabs', role: 'tablist' }, items.map(t => h('button', { class: 'tab' + (t.key === active ? ' active' : ''), role: 'tab', 'aria-selected': t.key === active ? 'true' : 'false', onclick: () => onChange(t.key) },
      t.label, t.count !== undefined && t.count !== null ? h('span', { class: 'tab-count' }, t.count) : null)));
  }

  function menu(anchor, items) {
    document.querySelectorAll('.popmenu').forEach(m => m.remove());
    const r = anchor.getBoundingClientRect();
    const m = h('div', { class: 'popmenu', role: 'menu' }, items.filter(Boolean).map(it => it === '-' ? h('div', { class: 'popmenu-sep' }) :
      h('button', { class: 'popmenu-item' + (it.danger ? ' danger' : ''), role: 'menuitem', onclick: () => { m.remove(); it.onClick(); } }, it.icon ? icon(it.icon, 16) : null, it.label)));
    document.body.appendChild(m);
    const w = m.offsetWidth;
    m.style.top = Math.min(window.innerHeight - m.offsetHeight - 8, r.bottom + 6) + 'px';
    m.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
    setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off); } }), 0);
    return m;
  }

  // Exportação CSV
  function toCSV(cols, rows) {
    const q = v => { const s = v === null || v === undefined ? '' : String(v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return '﻿' + [cols.map(c => q(c.label)).join(';'), ...rows.map(r => cols.map(c => q(c.value ? c.value(r) : r[c.key])).join(';'))].join('\n');
  }
  function download(name, content, mime = 'text/csv;charset=utf-8') {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) return res();
      const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Falha ao carregar ' + src));
      document.head.appendChild(s);
    });
  }

  /** reduz uma imagem enviada (logotipo) para no máximo `max` px e devolve um data URL leve */
  function imagemReduzida(file, max = 160) {
    return new Promise((res, rej) => {
      if (!file || !/^image\//.test(file.type)) return rej(new Error('Escolha um arquivo de imagem (PNG, JPG, SVG ou WEBP).'));
      if (file.type === 'image/svg+xml' && file.size < 150000) { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); return; }
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        let out = c.toDataURL('image/png'); if (out.length > 180000) out = c.toDataURL('image/webp', 0.85);
        res(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Não foi possível ler a imagem.')); };
      img.src = url;
    });
  }
  /** anima um número de `de` até `ate` dentro de el (formatando com fmtFn) */
  function contar(el, de, ate, fmtFn, ms = 900) {
    if (de === ate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmtFn(ate); return; }
    const t0 = performance.now();
    const step = t => { const k = Math.min(1, (t - t0) / ms); const e = 1 - Math.pow(1 - k, 3); el.textContent = fmtFn(de + (ate - de) * e); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  global.U = { imagemReduzida, contar, h, append, $, $$, clear, esc, fmt, dates, toDate, debounce, digits, waLink, groupBy, sum, store, icon, toast, modal, drawer, confirmDialog,
    form, field, masks, badge, avatar, empty, skeleton, TEMP, tempChip, table, pager, tabs, menu, toCSV, download, loadScript };
})(window);
