/* ==========================================================================
   ERBE · Central Comercial — interface
   Navegação, renderização das páginas e componentes reutilizáveis.
   O conteúdo (regras e scripts) vive em data.js.
   ========================================================================== */

/* ---------------------------------------------------------------- Helpers */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const symbol = (cls = '') => `<svg class="${cls}" viewBox="0 0 92 114" aria-hidden="true"><use href="#erbe-symbol"/></svg>`;
const wordmark = (cls = 'brand-lockup__word') => `<svg class="${cls}" viewBox="0 0 302.06 73" aria-hidden="true"><use href="#erbe-wordmark"/></svg>`;
const lockup = (variant = '', withDesc = true) => `
    <span class="brand-lockup ${variant}">
        ${symbol('brand-lockup__symbol')}
        <span class="brand-lockup__text">${wordmark()}${withDesc ? '<span class="brand-lockup__desc">Proteção e Patrimônio</span>' : ''}</span>
    </span>`;

/* ---------------------------------------------------------------- Navegação */
const SECTION_TITLES = { contratacao: "Contratação", vigencia: "Vigência", carencia: "Carência", documentacao: "Documentação", reajuste: "Reajuste", cancelamento: "Cancelamento", preco: "Preço", total: "Coparticipação Total", parcial: "Coparticipação Parcial", sem: "Sem Coparticipação", ambulatorial: "Ambulatorial", hospitalar: "Hospitalar", sob: "Sem Obstetrícia", cob: "Com Obstetrícia", completo: "Plano Completo", enfermaria: "Enfermaria (Coletivo)", apartamento: "Apartamento (Privativo)", diferencas: "Quadro Comparativo" };

const NAV = [
    { items: [{ id: 'dashboard', label: 'Início', icon: 'layout-dashboard' }] },
    {
        label: 'Modalidades de plano',
        items: [
            { key: 'pme', label: 'Plano Empresarial (PME)', icon: 'building-2', children: [['pme-contratacao', 'Contratação'], ['pme-vigencia', 'Vigência'], ['pme-carencia', 'Carência'], ['pme-documentacao', 'Documentação'], ['pme-reajuste', 'Reajuste'], ['pme-cancelamento', 'Cancelamento'], ['pme-preco', 'Análise de Preço']] },
            { key: 'adesao', label: 'Plano por Adesão', icon: 'users', children: [['adesao-contratacao', 'Contratação'], ['adesao-vigencia', 'Vigência'], ['adesao-carencia', 'Carência'], ['adesao-documentacao', 'Documentação'], ['adesao-reajuste', 'Reajuste'], ['adesao-cancelamento', 'Cancelamento'], ['adesao-preco', 'Preço']] },
            { key: 'individual', label: 'Plano Individual (PF)', icon: 'user', children: [['individual-contratacao', 'Contratação'], ['individual-vigencia', 'Vigência'], ['individual-carencia', 'Carência'], ['individual-documentacao', 'Documentação'], ['individual-reajuste', 'Reajuste'], ['individual-cancelamento', 'Cancelamento'], ['individual-preco', 'Preço']] },
            { key: 'atendimento', label: 'Tipos de Atendimento', icon: 'stethoscope', children: [['atendimento-ambulatorial', 'Ambulatorial'], ['atendimento-hospitalar', 'Hospitalar'], ['atendimento-sob', 'Amb. Hosp. Sem Obstetrícia'], ['atendimento-cob', 'Amb. Hosp. Com Obstetrícia'], ['atendimento-completo', 'Plano Completo']] },
            { key: 'acomodacao', label: 'Acomodação', icon: 'bed-double', children: [['acomodacao-enfermaria', 'Enfermaria (Coletivo)'], ['acomodacao-apartamento', 'Apartamento (Privativo)'], ['acomodacao-diferencas', 'Quadro Comparativo']] },
            { key: 'copart', label: 'Coparticipação', icon: 'chart-pie', children: [['copart-total', 'Coparticipação Total'], ['copart-parcial', 'Coparticipação Parcial'], ['copart-sem', 'Sem Coparticipação']] }
        ]
    },
    {
        label: 'Comercial',
        items: [
            { key: 'qualificacao', label: 'Qualificação', icon: 'user-search', children: [['qualificacao-avancada', 'Qualificação Avançada'], ['qualificacao-spin', 'Script SPIN Selling']] },
            { id: 'ganchos', label: 'Ganchos de Venda', icon: 'messages-square' },
            { id: 'followup', label: 'Estratégia Follow-up', icon: 'repeat' }
        ]
    },
    { label: 'Marca', items: [{ id: 'marca', label: 'Identidade ERBE', icon: 'shield' }] }
];

/** Localiza rótulos da página atual para breadcrumb e títulos. */
function findRoute(id) {
    for (const group of NAV) {
        for (const item of group.items) {
            if (item.id === id) return { group: group.label, item };
            const child = (item.children || []).find(([cid]) => cid === id);
            if (child) return { group: group.label, item, child };
        }
    }
    return null;
}

function renderNav() {
    document.getElementById('nav').innerHTML = NAV.map((group) => `
        <div class="nav-group">
            ${group.label ? `<p class="nav-group__label overline">${group.label}</p>` : ''}
            ${group.items.map((item) => item.children ? `
                <div>
                    <button type="button" class="nav-item" id="toggle-${item.key}" onclick="toggleSubmenu('${item.key}')" aria-expanded="false" aria-controls="sub-${item.key}">
                        ${icon(item.icon)}<span>${item.label}</span>${icon('chevron-right', 'icon--sm nav-item__chev')}
                    </button>
                    <div class="subnav" id="sub-${item.key}">
                        <div class="subnav__inner" inert>
                            <ul class="subnav__list">
                                ${item.children.map(([id, label]) => `<li><button type="button" class="subnav__link submenu-item" data-tab="${id}" onclick="navigateTo('${id}')">${label}</button></li>`).join('')}
                            </ul>
                        </div>
                    </div>
                </div>` : `
                <button type="button" class="nav-item" data-tab="${item.id}" onclick="navigateTo('${item.id}')">${icon(item.icon)}<span>${item.label}</span></button>`
            ).join('')}
        </div>`).join('');
}

function toggleSubmenu(id, force) {
    const sub = document.getElementById(`sub-${id}`);
    const btn = document.getElementById(`toggle-${id}`);
    if (!sub || !btn) return;
    const open = typeof force === 'boolean' ? force : !sub.classList.contains('is-open');
    sub.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', String(open));
    sub.querySelector('.subnav__inner').inert = !open;
}

function syncNav(id) {
    document.querySelectorAll('[data-tab]').forEach((el) => {
        if (el.getAttribute('data-tab') === id) el.setAttribute('aria-current', 'page');
        else el.removeAttribute('aria-current');
    });
    NAV.forEach((g) => g.items.forEach((item) => {
        if (!item.children) return;
        const has = item.children.some(([cid]) => cid === id);
        document.getElementById(`toggle-${item.key}`).classList.toggle('has-active', has);
        if (has) toggleSubmenu(item.key, true);
    }));
    const route = findRoute(id);
    const crumbs = document.getElementById('crumbs');
    if (!route || id === 'dashboard') { crumbs.innerHTML = '<strong>Central Comercial</strong>'; return; }
    const parts = [route.group, route.child ? route.item.label : null, route.child ? route.child[1] : route.item.label].filter(Boolean);
    crumbs.innerHTML = parts.map((p, i) => i === parts.length - 1 ? `<strong>${p}</strong>` : `<span>${p}</span>${icon('chevron-right', 'icon--xs')}`).join('');
}

/* ---------------------------------------------------------------- Gaveta (mobile/tablet) */
const sidebar = () => document.getElementById('sidebar');
function setDrawer(open) {
    sidebar().classList.toggle('is-open', open);
    document.querySelector('.scrim').classList.toggle('is-visible', open);
    document.getElementById('mobile-toggle').setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) sidebar().querySelector('.sidebar__close').focus({ preventScroll: true });
}
const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches;

/* ---------------------------------------------------------------- Componentes de página */
const pageHeader = ({ eyebrow, title, lead, actions = '' }) => `
    <header class="page-header">
        <div>
            ${eyebrow ? `<p class="page-header__eyebrow overline">${eyebrow}</p>` : ''}
            <h1 class="page-header__title">${title}</h1>
            ${lead ? `<p class="page-header__lead">${lead}</p>` : ''}
        </div>
        ${actions}
    </header>`;

const scriptItem = (text) => `
    <button type="button" class="script" data-copy="${esc(text)}" aria-label="Copiar: ${esc(text)}">
        <span class="script__text">“${esc(text)}”</span>
        <span class="script__copy">${icon('copy', 'icon--sm')}</span>
    </button>`;

const footer = () => `
    <footer class="site-footer">
        <div class="site-footer__brand">${lockup('brand-lockup--compact', false)}<span class="site-footer__claim">Proteger o que continua.</span></div>
        <p>ERBE Proteção e Patrimônio · Central Comercial · Uso interno</p>
    </footer>`;

/* ---------------------------------------------------------------- Páginas */
const views = {
    dashboard: () => {
        const shortcuts = [
            ['pme-contratacao', 'building-2', 'Empresarial PME', 'Regras, carência e documentação por CNPJ'],
            ['adesao-contratacao', 'users', 'Por Adesão', 'Entidades de classe e vigências fixas'],
            ['individual-contratacao', 'user', 'Individual PF', 'Contratação direta por CPF'],
            ['qualificacao-avancada', 'user-search', 'Qualificação', 'Diagnóstico antes de qualquer proposta']
        ];
        const tools = [
            ['ganchos', 'messages-square', 'Ganchos de Venda', 'Aberturas por perfil de cliente'],
            ['followup', 'repeat', 'Estratégia Follow-up', 'Cadência D0 a D7, pronta para copiar'],
            ['qualificacao-spin', 'list-checks', 'Script SPIN Selling', 'Situação, problema, implicação, necessidade'],
            ['marca', 'shield', 'Identidade ERBE', 'Marca, cores, tipografia e aplicações']
        ];
        const tile = ([id, ic, title, text], chip = '') => `
            <button type="button" class="card card--interactive tile" onclick="navigateTo('${id}')">
                <span class="icon-chip ${chip}">${icon(ic)}</span>
                <span><h3 class="tile__title">${title}</h3><p class="tile__text">${text}</p></span>
                <span class="tile__arrow">${icon('arrow-right')}</span>
            </button>`;
        return `
        <div class="page fade-in">
            <section class="hero">
                <svg class="hero__mark" viewBox="0 0 92 114" aria-hidden="true"><use href="#erbe-symbol"/></svg>
                <p class="hero__eyebrow overline">Central Comercial ERBE</p>
                <h1 class="hero__title">Estudar antes de <span>indicar.</span></h1>
                <p class="hero__lead">A estrutura técnica completa de vendas para PME, Adesão e Individual — com os scripts e a cadência que sustentam cada recomendação.</p>
                <div class="hero__actions">
                    <button type="button" class="btn btn--inverse btn--lg" onclick="navigateTo('qualificacao-avancada')">Começar pela qualificação ${icon('arrow-right', 'icon--sm')}</button>
                    <button type="button" class="btn btn--outline-inverse btn--lg" onclick="navigateTo('pme-contratacao')">Ver modalidades</button>
                </div>
                <dl class="hero__meta">
                    <div><dt>3</dt><dd>modalidades de contratação</dd></div>
                    <div><dt>${hookGroups.length}</dt><dd>famílias de gancho</dd></div>
                    <div><dt>D0–D7</dt><dd>cadência de follow-up</dd></div>
                </dl>
            </section>

            <section class="section">
                <div class="section__head"><div><p class="overline">Modalidades e diagnóstico</p><h2 class="section__title mt-2">Por onde começar</h2></div></div>
                <div class="grid grid--4">${shortcuts.map((s) => tile(s)).join('')}</div>
            </section>

            <section class="section">
                <div class="section__head"><div><p class="overline">Conversa comercial</p><h2 class="section__title mt-2">Ferramentas</h2></div></div>
                <div class="grid grid--4">${tools.map((s) => tile(s, 'icon-chip--dark')).join('')}</div>
            </section>

            <section class="section">
                <div class="section__head"><div><p class="overline">Padrão ERBE</p><h2 class="section__title mt-2">O que guia cada atendimento</h2></div></div>
                <ol class="principles">
                    <li class="principle"><span class="principle__n">01</span><div><h3>Estudo antes de indicação</h3><p>Nenhuma recomendação sai sem comparação documentada.</p></div></li>
                    <li class="principle"><span class="principle__n">02</span><div><h3>Sem letra miúda</h3><p>Carência, coparticipação, exclusão e reajuste são apresentados antes, não depois.</p></div></li>
                    <li class="principle"><span class="principle__n">03</span><div><h3>Presença no dia do uso</h3><p>O dia do sinistro é o dia do teste. É quando se responde mais rápido.</p></div></li>
                </ol>
            </section>
            ${footer()}
        </div>`;
    },

    ganchos: () => `
        <div class="page fade-in">
            ${pageHeader({ eyebrow: 'Comercial', title: 'Ganchos de Venda', lead: 'Scripts de abertura por perfil de cliente. Toque em qualquer frase para copiar.' })}
            <div class="grid grid--2">
                ${hookGroups.map((group) => `
                    <article class="card hook">
                        <div class="hook__head">
                            <span class="icon-chip">${icon(group.icon)}</span>
                            <div><h2 class="hook__title">${group.title}</h2><p class="hook__sub overline">${group.subtitle}</p></div>
                        </div>
                        <div class="script-list">${group.questions.map(scriptItem).join('')}</div>
                        <div class="hook__foot"><span class="tag tag--brand">${icon('target', 'icon--xs')} Objetivo: ${group.objective}</span></div>
                    </article>`).join('')}
            </div>
            ${footer()}
        </div>`,

    followup: () => `
        <div class="page fade-in">
            ${pageHeader({ eyebrow: 'Comercial', title: 'Estratégia Follow-up', lead: 'Onde o dinheiro realmente é feito: uma cadência de cinco contatos, do envio da proposta à despedida elegante.' })}
            <div class="callout callout--brand">
                <span class="icon-chip">${icon('info')}</span>
                <div><p class="callout__title overline">Regra de ouro</p><p>“O dinheiro está no acompanhamento, não no primeiro contato. Quem não faz follow-up organizado, vive de sorte.”</p></div>
            </div>
            <ol class="timeline mt-8">
                ${followupStages.map((stage) => `
                    <li class="timeline__item">
                        <span class="timeline__day">${stage.day}</span>
                        <div class="card timeline__body">
                            <div>
                                <p class="overline">${stage.subtitle}</p>
                                <h2 class="timeline__title mt-2">${stage.title}</h2>
                                <span class="tag mt-4">${icon('target', 'icon--xs')} ${stage.objective}</span>
                            </div>
                            <div class="script-list">${stage.messages.map(scriptItem).join('')}</div>
                        </div>
                    </li>`).join('')}
            </ol>
            ${footer()}
        </div>`,

    'qualificacao-spin': () => {
        const tones = [['var(--verde-50)', 'var(--verde-700)'], ['var(--verde-100)', 'var(--verde-800)'], ['var(--verde-600)', 'var(--branco)'], ['var(--onix)', 'var(--verde-300)']];
        return `
        <div class="page fade-in">
            ${pageHeader({ eyebrow: 'Qualificação', title: 'Script SPIN Selling', lead: 'A arte de conduzir o cliente ao fechamento — da situação atual à necessidade declarada.' })}
            <div class="grid grid--2">
                ${spinData.map((item, i) => `
                    <article class="card">
                        <div class="spin__head">
                            <span class="spin__letter" style="background:${tones[i][0]};color:${tones[i][1]}">${item.id}</span>
                            <div><h2 class="spin__title">${item.title}</h2><p class="overline mt-2">${item.subtitle}</p></div>
                        </div>
                        <div class="script-list">${item.questions.map(scriptItem).join('')}</div>
                    </article>`).join('')}
            </div>
            ${footer()}
        </div>`;
    },

    'qualificacao-avancada': () => `
        <div class="page fade-in">
            ${pageHeader({ eyebrow: 'Qualificação', title: 'Qualificação Avançada', lead: 'Diagnóstico ERBE: nove perguntas que definem modalidade, rede e preço antes de qualquer proposta.' })}
            <div class="layout-aside">
                <ol class="qlist">
                    ${questions.map((q, i) => `
                        <li><button type="button" class="qitem" data-copy="${esc(q)}" aria-label="Copiar pergunta ${i + 1}">
                            <span class="qitem__n">${String(i + 1).padStart(2, '0')}</span><span>${esc(q)}</span><span class="qitem__copy">${icon('copy', 'icon--sm')}</span>
                        </button></li>`).join('')}
                </ol>
                <aside class="card card--inverse">
                    <p class="overline" style="color:var(--verde-300)">Dicas</p>
                    <ul class="tips">
                        <li>${icon('check', 'icon--sm')}Não faça tudo de uma vez.</li>
                        <li>${icon('check', 'icon--sm')}Conduza como conversa natural.</li>
                        <li>${icon('check', 'icon--sm')}Escute mais do que fala.</li>
                    </ul>
                    <button type="button" class="btn btn--outline-inverse btn--block mt-8" onclick="navigateTo('qualificacao-spin')">Ir para o SPIN ${icon('arrow-right', 'icon--sm')}</button>
                </aside>
            </div>
            ${footer()}
        </div>`,

    marca: () => renderBrand()
};

function createGenericView(title, content, mod, section = null) {
    const route = findRoute(`${mod}-${section}`);
    const siblings = route && route.item.children ? route.item.children : [];
    return `
        <div class="page page--narrow fade-in">
            ${pageHeader({ eyebrow: technicalData[mod] ? technicalData[mod].title : '', title })}
            ${siblings.length ? `<nav class="segmented" aria-label="Seções">${siblings.map(([id, label]) => `<button type="button" class="segmented__item" data-tab="${id}" onclick="navigateTo('${id}')">${label}</button>`).join('')}</nav>` : ''}
            <article class="card card--flush doc">
                <div class="doc__body">${esc(content)}</div>
                <div class="doc__actions">
                    <p class="doc__hint">${icon('message-circle', 'icon--sm')} Formatado para colar no WhatsApp</p>
                    <button type="button" onclick="handleManualCopy('${mod}', ${section ? `'${section}'` : 'null'})" class="btn btn--primary">${icon('copy', 'icon--sm')} Copiar informação</button>
                </div>
            </article>
            ${footer()}
        </div>`;
}

/* ---------------------------------------------------------------- Identidade ERBE (manual vivo) */
function renderBrand() {
    const L = 'brand/logo/';
    const spec = (file, bg, title, desc) => `
        <figure>
            <div class="specimen ${bg}"><img src="${L}${file}.svg" alt="${title}" loading="lazy"></div>
            <figcaption class="specimen-caption"><span><strong>${title}</strong> · ${desc}</span><a href="${L}${file}.svg" download>SVG</a></figcaption>
        </figure>`;
    const swatch = (name, hex, rgb, role, bg, fg, border = '') => `
        <div class="swatch">
            <div class="swatch__color" style="background:${bg};color:${fg};${border}">${name}</div>
            <div class="swatch__meta"><strong>${hex}</strong><span>RGB ${rgb}</span><span>${role}</span></div>
        </div>`;
    const ramp = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
    const grafite = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
    const icons = ['shield-check', 'heart-pulse', 'building-2', 'users', 'file-text', 'scale', 'clock', 'phone', 'mail', 'map-pin', 'briefcase', 'layers', 'target', 'message-circle', 'clipboard-check'];
    return `
    <div class="page fade-in">
        ${pageHeader({ eyebrow: 'Marca', title: 'Identidade ERBE', lead: 'Sistema de marca v2 — símbolo, assinaturas, cores, tipografia, componentes e aplicações. Toda peça da ERBE nasce destas regras.' })}

        <!-- Conceito -->
        <section class="concept">
            <div class="concept__art">
                ${symbol('')}
            </div>
            <div class="stack-4">
                <p class="overline">O símbolo</p>
                <h2 class="section__title">Um escudo que é, ao mesmo tempo, o E de ERBE.</h2>
                <p class="text-muted">O escudo herdado da primeira versão foi mantido — é ele que diz <em>proteção</em>. As três colunas internas viraram duas fendas que desenham o E: os três braços são as três linhas da casa (Saúde, Seguros e Patrimônio), e a base, a parte mais larga, é a fundação sobre a qual tudo continua.</p>
                <ul class="do-dont do-dont--yes mt-6">
                    <li>${icon('shield-check', 'icon--sm')}<span><strong>Proteção</strong> — a silhueta do escudo, sem efeitos.</span></li>
                    <li>${icon('layers', 'icon--sm')}<span><strong>Três linhas, uma casa</strong> — o braço central é mais curto, como no lettering.</span></li>
                    <li>${icon('building-2', 'icon--sm')}<span><strong>Fundação</strong> — a base pesada dá estabilidade e leitura em 16 px.</span></li>
                </ul>
            </div>
        </section>

        <!-- Arquitetura -->
        <section class="section">
            <div class="section__head"><div><p class="overline">Arquitetura da marca</p><h2 class="section__title mt-2">Versões</h2><p class="section__lead">Uma só marca, sempre o mesmo desenho. Escolha a versão pelo espaço disponível, nunca por gosto.</p></div></div>
            <div class="grid grid--3">
                ${spec('erbe-principal-positivo', '', '1 · Principal', 'vertical, com descritor')}
                ${spec('erbe-horizontal-positivo', '', '2 · Horizontal', 'site, documentos, e-mail')}
                ${spec('erbe-simbolo-positivo', 'specimen--white', '3 · Símbolo', 'avatar, selo, marca-d’água')}
                ${spec('erbe-reduzido-positivo', 'specimen--white', '4 · Reduzida', 'abaixo de 160 px de largura')}
                ${spec('erbe-horizontal-negativo', 'specimen--dark', '6 · Negativa', 'sobre Ônix e fotos escuras')}
                ${spec('erbe-horizontal-sobre-verde', 'specimen--green', 'Sobre o Verde ERBE', 'peças de campanha')}
                ${spec('erbe-horizontal-mono-preto', 'specimen--white', '7 · Monocromática', 'carimbo, fax, gravação')}
                ${spec('erbe-principal-mono-branco', 'specimen--dark', '7 · Mono branca', 'bordado, vinil, transparências')}
                <figure>
                    <div class="specimen specimen--white"><div class="flex-wrap-gap" style="justify-content:center;gap:1.5rem">
                        <img src="brand/icons/app-icon.svg" alt="Ícone do aplicativo" style="width:5rem;border-radius:22%">
                        <img src="brand/icons/favicon.svg" alt="Favicon 32 px" style="width:32px">
                        <img src="brand/icons/favicon.svg" alt="Favicon 16 px" style="width:16px">
                    </div></div>
                    <figcaption class="specimen-caption"><span><strong>8 · App icon e favicon</strong> · versão de traço aberto</span><a href="brand/icons/app-icon.svg" download>SVG</a></figcaption>
                </figure>
            </div>
            <p class="mt-6 text-sm text-muted">Versão <strong>5 · Positiva</strong> = Verde ERBE + Ônix sobre fundos claros (versões 1 a 4). Área de proteção: metade da altura do símbolo em todos os lados. Tamanho mínimo: símbolo 16 px · horizontal com descritor 160 px · reduzida 88 px.</p>
        </section>

        <!-- Cores -->
        <section class="section">
            <div class="section__head"><div><p class="overline">Sistema de cores</p><h2 class="section__title mt-2">Ônix e Verde ERBE</h2><p class="section__lead">Preto esverdeado como base, um jade profundo como assinatura. Longe do verde de banco, de farmácia e de operadora de saúde.</p></div></div>
            <div class="grid grid--4">
                ${swatch('Ônix', '#0B0F0E', '11 15 14', 'Primária · base institucional', 'var(--onix)', 'var(--papel)')}
                ${swatch('Verde ERBE', '#17664D', '23 102 77', 'Secundária · ação e marca', 'var(--verde-600)', 'var(--branco)')}
                ${swatch('Jade', '#7BBB9F', '123 187 159', 'Destaque · somente sobre escuro', 'var(--verde-300)', 'var(--onix)')}
                ${swatch('Champanhe', '#C6AE7A', '198 174 122', 'Herança · detalhe em documentos', 'var(--champanhe)', 'var(--onix)')}
                ${swatch('Papel', '#F6F5F0', '246 245 240', 'Fundo claro institucional', 'var(--papel)', 'var(--onix)', 'border-bottom:1px solid var(--color-border)')}
                ${swatch('Grafite 900', '#1A201E', '26 32 30', 'Superfície escura elevada', 'var(--grafite-900)', 'var(--papel)')}
                ${swatch('Grafite 600', '#5E6863', '94 104 99', 'Texto secundário', 'var(--grafite-600)', 'var(--branco)')}
                ${swatch('Grafite 50', '#F4F4F1', '244 244 241', 'Fundo de interface', 'var(--grafite-50)', 'var(--onix)', 'border-bottom:1px solid var(--color-border)')}
            </div>
            <div class="mt-8 stack-4">
                <p class="overline">Escala Verde ERBE</p>
                <div class="ramp">${ramp.map((s, i) => `<span style="background:var(--verde-${s});color:${i < 5 ? 'var(--verde-900)' : 'var(--verde-50)'}">${s}</span>`).join('')}</div>
                <p class="overline">Escala Grafite</p>
                <div class="ramp">${grafite.map((s, i) => `<span style="background:var(--grafite-${s});color:${i < 5 ? 'var(--grafite-900)' : 'var(--grafite-50)'}">${s}</span>`).join('')}</div>
                <p class="overline">Proporção em peça</p>
                <div class="proportion"><span style="flex:55;background:var(--onix)"></span><span style="flex:30;background:var(--papel);border:1px solid var(--color-border)"></span><span style="flex:12;background:var(--verde-600)"></span><span style="flex:3;background:var(--champanhe)"></span></div>
                <p class="text-sm text-muted">55 Ônix/grafite · 30 Papel/branco · 12 Verde ERBE · 3 destaque. Estados: sucesso <code>#17664D</code> · aviso <code>#8A5A0B</code> · erro <code>#B42318</code> · informação <code>#2D5A73</code>.</p>
            </div>
        </section>

        <!-- Tipografia -->
        <section class="section">
            <div class="section__head"><div><p class="overline">Tipografia</p><h2 class="section__title mt-2">Sora para presença, Inter para leitura</h2></div></div>
            <div class="card">
                <div class="type-specimen">
                    <div class="type-specimen__meta"><span>Display · Sora SemiBold</span><span>56/58 · −2,5%</span></div>
                    <p style="font-family:var(--font-display);font-weight:600;font-size:var(--text-display);line-height:1.04;letter-spacing:var(--tracking-display)">Proteger o que continua.</p>
                </div>
                <div class="type-specimen">
                    <div class="type-specimen__meta"><span>Título · Sora SemiBold</span><span>40 · 28 · 20</span></div>
                    <p style="font-family:var(--font-display);font-weight:600;font-size:var(--text-h1);letter-spacing:var(--tracking-display);line-height:1.1">A gente estuda antes de indicar.</p>
                    <p style="font-family:var(--font-display);font-weight:600;font-size:var(--text-h2);letter-spacing:var(--tracking-heading)">Você entende antes de assinar.</p>
                </div>
                <div class="type-specimen">
                    <div class="type-specimen__meta"><span>Texto · Inter Regular/Medium</span><span>16/25 · 14/22</span></div>
                    <p style="max-width:40rem">Comparamos três opções para o perfil da sua empresa. Você recebe por escrito o que cada uma cobre, o que não cobre e o motivo da nossa recomendação.</p>
                    <p class="text-sm text-muted" style="max-width:40rem">Carência, coparticipação e reajuste são apresentados antes da assinatura — nunca depois.</p>
                </div>
                <div class="type-specimen" style="border-bottom:0;padding-bottom:0">
                    <div class="type-specimen__meta"><span>Lettering ERBE · desenhado em curvas</span><span>base Sora SemiBold · E próprio · espaçamento óptico 0,5 versal</span></div>
                    <div class="flex-wrap-gap" style="gap:2rem">${wordmark('mark-word')}<p class="overline">Proteção e Patrimônio · Sora Medium · +14%</p></div>
                </div>
            </div>
        </section>

        <!-- Componentes -->
        <section class="section">
            <div class="section__head"><div><p class="overline">Componentes</p><h2 class="section__title mt-2">Botões, campos e cartões</h2></div></div>
            <div class="grid grid--2">
                <div class="card stack-4">
                    <p class="overline">Botões</p>
                    <div class="flex-wrap-gap"><button type="button" class="btn btn--primary">Solicitar estudo</button><button type="button" class="btn btn--dark">Falar com a ERBE</button><button type="button" class="btn btn--secondary">Ver comparação</button><button type="button" class="btn btn--ghost">Cancelar</button></div>
                    <div class="flex-wrap-gap"><button type="button" class="btn btn--primary btn--sm">Pequeno</button><button type="button" class="btn btn--secondary btn--sm">${icon('download', 'icon--sm')} Baixar PDF</button><button type="button" class="btn btn--secondary btn--icon" aria-label="Copiar">${icon('copy', 'icon--sm')}</button><button type="button" class="btn btn--primary" disabled>Desativado</button></div>
                    <div class="flex-wrap-gap" style="background:var(--onix);padding:1rem;border-radius:var(--radius-md)"><button type="button" class="btn btn--inverse">Sobre escuro</button><button type="button" class="btn btn--outline-inverse">Secundário</button></div>
                    <p class="overline mt-6">Tags e avisos</p>
                    <div class="flex-wrap-gap"><span class="tag tag--brand">${icon('check', 'icon--xs')} Recomendado</span><span class="tag">Carência 30 dias</span><span class="tag">Coparticipação</span></div>
                    <div class="callout"><span class="icon-chip icon-chip--line">${icon('info')}</span><div><p class="callout__title overline">O que não está coberto</p><p>Toda proposta ERBE traz uma página dizendo o que fica de fora. Assinada junto.</p></div></div>
                </div>
                <form class="card form" id="demo-form" novalidate>
                    <div><p class="overline">Formulário</p><h3 class="mt-2" style="font-size:var(--text-h3)">Solicitar um estudo</h3><p class="text-sm text-muted mt-2">Resposta em até 2 horas úteis.</p></div>
                    <div class="form__row form__row--2">
                        <label class="field"><span class="field__label">Nome</span><input class="input" name="nome" placeholder="Como podemos te chamar?" required><span class="field__error">${icon('circle-alert', 'icon--xs')} Informe seu nome.</span></label>
                        <label class="field"><span class="field__label">WhatsApp</span><input class="input" name="whats" inputmode="tel" placeholder="(11) 90000-0000" required><span class="field__error">${icon('circle-alert', 'icon--xs')} Informe um número para contato.</span></label>
                    </div>
                    <label class="field"><span class="field__label">O que você quer proteger?</span>
                        <select class="select" name="linha"><option>Saúde — empresa, MEI ou família</option><option>Seguros — vida, empresarial, residencial, auto</option><option>Patrimônio — consórcio de imóvel ou veículo</option></select>
                    </label>
                    <label class="field"><span class="field__label">Conte o essencial <small>(opcional)</small></span><textarea class="textarea" name="msg" placeholder="Quantas vidas, quais hospitais não podem faltar…"></textarea><span class="field__hint">Não envie dados de saúde por aqui.</span></label>
                    <label class="check"><input type="checkbox" name="lgpd" required><span>Autorizo o contato da ERBE conforme a política de privacidade.</span></label>
                    <button type="submit" class="btn btn--primary btn--lg">Solicitar estudo ${icon('arrow-right', 'icon--sm')}</button>
                </form>
            </div>
        </section>

        <!-- Ícones e elementos -->
        <section class="section">
            <div class="section__head"><div><p class="overline">Iconografia e elementos gráficos</p><h2 class="section__title mt-2">Linha única, sem enfeite</h2><p class="section__lead">Ícones lineares de 1,6 px, cantos arredondados, sempre monocromáticos. O elemento gráfico próprio são as <strong>linhas de continuidade</strong> — os três braços do E, com o central mais curto.</p></div></div>
            <div class="grid grid--2">
                <div class="card"><div class="icon-grid">${icons.map((n) => `<div>${icon(n, 'icon--lg')}<span>${n}</span></div>`).join('')}</div></div>
                <div class="grid" style="grid-template-columns:1fr 1fr">
                    <div class="specimen specimen--dark" style="min-height:10rem;color:var(--verde-300)"><span class="lines-motif"><span></span><span></span><span></span></span></div>
                    <div class="specimen" style="min-height:10rem;color:var(--onix)"><span class="lines-motif" style="width:5rem"><span></span><span></span><span></span></span></div>
                    <div class="specimen specimen--dark" style="min-height:10rem;position:relative;overflow:hidden">${symbol('mark-symbol')}</div>
                    <div class="specimen specimen--green" style="min-height:10rem;color:var(--papel)"><span class="overline" style="color:inherit">Linha Saúde</span></div>
                </div>
            </div>
            <div class="grid grid--2 mt-8">
                <div class="card"><p class="overline">Fotografia — sim</p><ul class="do-dont do-dont--yes mt-4">
                    <li>${icon('circle-check', 'icon--sm')}Pessoas reais em contexto de trabalho e família, luz natural.</li>
                    <li>${icon('circle-check', 'icon--sm')}Enquadramento próximo, cor levemente dessaturada, tons quentes.</li>
                    <li>${icon('circle-check', 'icon--sm')}Muito respiro: a foto ocupa um lado, o texto o outro.</li>
                </ul></div>
                <div class="card"><p class="overline">Fotografia e layout — não</p><ul class="do-dont do-dont--no mt-4">
                    <li>${icon('circle-x', 'icon--sm')}Aperto de mão, gráfico subindo, família ao pôr do sol, guarda-chuva.</li>
                    <li>${icon('circle-x', 'icon--sm')}Gradientes, sombras longas, mais de duas cores por peça.</li>
                    <li>${icon('circle-x', 'icon--sm')}Logo sobre foto sem área de proteção, distorcido ou recolorido.</li>
                </ul></div>
            </div>
        </section>

        <!-- Aplicações -->
        <section class="section">
            <div class="section__head"><div><p class="overline">Aplicações</p><h2 class="section__title mt-2">A mesma marca em todo ponto de contato</h2></div></div>
            <div class="grid grid--3">
                <figure>
                    <div class="mock-post mock-post--dark">
                        <svg class="mock-post__mark" viewBox="0 0 92 114" aria-hidden="true" style="color:var(--papel)"><use href="#erbe-symbol"/></svg>
                        <div class="mock-post__top">${lockup('brand-lockup--inverse', false)}<span style="color:var(--grafite-400)">@erbeprotecao</span></div>
                        <p class="mock-post__eyebrow" style="color:var(--verde-300)">Linha Saúde</p>
                        <p class="mock-post__title">Coparticipação não é desconto. É troca.</p>
                        <div class="mock-post__foot"><span style="color:var(--grafite-400)">A gente estuda antes de indicar.</span>${icon('arrow-right', 'icon--sm')}</div>
                    </div>
                    <figcaption class="mock-label"><strong>Social · feed 4:5</strong> — peça escura</figcaption>
                </figure>
                <figure>
                    <div class="mock-post mock-post--light">
                        <svg class="mock-post__mark" viewBox="0 0 92 114" aria-hidden="true" style="color:var(--verde-600)"><use href="#erbe-symbol"/></svg>
                        <div class="mock-post__top">${lockup('', false)}<span style="color:var(--grafite-500)">@erbeprotecao</span></div>
                        <p class="mock-post__eyebrow" style="color:var(--verde-600)">Linha Patrimônio</p>
                        <p class="mock-post__title">O que você construiu continua.</p>
                        <div class="mock-post__foot"><span style="color:var(--grafite-600)">Consórcio não é financiamento.</span>${icon('arrow-right', 'icon--sm')}</div>
                    </div>
                    <figcaption class="mock-label"><strong>Social · feed 4:5</strong> — peça clara (alternar na grade)</figcaption>
                </figure>
                <figure>
                    <div class="mock-doc">
                        <div class="mock-doc__cover">
                            ${lockup('', true)}
                            <p class="mock-doc__kicker">Estudo comparativo · Saúde PME</p>
                            <p class="mock-doc__title">Plano de saúde para a Vale Contábil — 14 vidas</p>
                            <span class="mock-doc__rule"></span>
                        </div>
                        <div class="mock-doc__body"><i></i><i></i><i></i><div class="mock-doc__table"><b></b><b></b><b></b></div><i></i><i></i></div>
                    </div>
                    <figcaption class="mock-label"><strong>Proposta / documento</strong> — capa Ônix, miolo branco, recomendação em verde</figcaption>
                </figure>
                <figure>
                    <div class="mock-phone"><div class="mock-phone__screen">
                        ${['Agenda', 'Fotos', 'Mapas'].map((n) => `<span class="mock-phone__app"><i></i>${n}</span>`).join('')}
                        <span class="mock-phone__app"><img src="brand/icons/app-icon.svg" alt="">ERBE</span>
                        ${['Notas', 'Banco', 'Clima', 'Música', 'Câmera', 'Relógio', 'Saúde', 'Ajustes'].map((n) => `<span class="mock-phone__app"><i></i>${n}</span>`).join('')}
                    </div></div>
                    <figcaption class="mock-label" style="text-align:center"><strong>Ícone do aplicativo</strong> — Ônix + símbolo Papel</figcaption>
                </figure>
                <figure>
                    <div class="mock-chat">
                        <div class="mock-chat__bar"><img src="brand/social/erbe-avatar.svg" alt=""><div><strong class="text-sm">ERBE Proteção e Patrimônio</strong><small>Conta comercial</small></div></div>
                        <div class="mock-chat__body">
                            <p class="mock-chat__msg">Oi, Carlos. Recebi o reajuste da operadora. Te mando a análise ainda hoje.</p>
                            <p class="mock-chat__msg mock-chat__msg--out">Perfeito, obrigado!</p>
                            <p class="mock-chat__msg">Pronto: três opções lado a lado e o que não está coberto em cada uma.</p>
                        </div>
                    </div>
                    <figcaption class="mock-label"><strong>WhatsApp / avatar</strong> — símbolo centralizado, legível no círculo</figcaption>
                </figure>
                <figure class="stack-4">
                    <div class="mock-card mock-card--front">${lockup('', true)}</div>
                    <div class="mock-card mock-card--back">
                        <div>${symbol('brand-lockup__symbol')}</div>
                        <div><strong>Guilherme Bastos</strong><span>Consultor de proteção · ERBE</span></div>
                    </div>
                    <figcaption class="mock-label"><strong>Cartão de visita</strong> — 90 × 50 mm, frente Ônix só com a marca</figcaption>
                </figure>
            </div>
            <div class="grid grid--2 mt-8">
                <div class="mock-signature">
                    <p class="mock-signature__name">Guilherme Bastos</p>
                    <p class="mock-signature__role">Consultor de proteção · Saúde, Seguros e Patrimônio</p>
                    <hr>
                    <img src="${L}erbe-horizontal-positivo.svg" alt="ERBE Proteção e Patrimônio" style="height:2.5rem;width:auto">
                    <p class="mock-label">Assinatura de e-mail — duas linhas + horizontal pequena. Sem banner.</p>
                </div>
                <div class="card card--inverse" style="display:flex;flex-direction:column;justify-content:space-between;gap:2rem">
                    ${lockup('brand-lockup--inverse', true)}
                    <p style="font-family:var(--font-display);font-size:var(--text-h2);font-weight:600;letter-spacing:var(--tracking-heading);color:var(--papel)">Proteção de verdade é alguém do seu lado quando o contrato precisa valer.</p>
                    <p class="overline" style="color:var(--grafite-500)">Área institucional · manifesto</p>
                </div>
            </div>
        </section>

        <!-- Tokens -->
        <section class="section">
            <div class="section__head"><div><p class="overline">Design system</p><h2 class="section__title mt-2">Tokens</h2><p class="section__lead">Definidos uma vez em <code>assets/css/tokens.css</code>. Nenhum valor solto no código.</p></div></div>
            <div class="card table-scroll">
                <table class="token-table">
                    <thead><tr><th>Grupo</th><th>Tokens</th><th>Uso</th></tr></thead>
                    <tbody>
                        <tr><td>Espaço</td><td><code>4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80 · 96</code></td><td>Base 4. Seções separadas por 64; cartões por 16–24.</td></tr>
                        <tr><td>Raio</td><td><code>4 · 6 · 10 · 14 · 20 · pill</code></td><td>Botão 10 · cartão 14 · hero 20. Nunca bolhas acima de 20.</td></tr>
                        <tr><td>Sombra</td><td><code>xs · sm · md · lg</code></td><td>Só em hover, toast e gaveta. Profundidade vem do contraste.</td></tr>
                        <tr><td>Grid</td><td><code>1152 máx · 832 leitura · gutter 16→40 · gap 16→24</code></td><td>1 coluna no celular, 2 no tablet, 3–4 no desktop.</td></tr>
                        <tr><td>Breakpoints</td><td><code>640 · 768 · 1024 · 1280</code></td><td>Abaixo de 1024: gaveta + barra inferior própria do mobile.</td></tr>
                        <tr><td>Movimento</td><td><code>120 · 200 · 360 ms · ease-out</code></td><td>Respeita “reduzir movimento” do sistema.</td></tr>
                    </tbody>
                </table>
            </div>
        </section>
        ${footer()}
    </div>`;
}

/* ---------------------------------------------------------------- Roteamento */
function resolveView(id) {
    if (views[id]) return views[id]();
    if (id.includes('-')) {
        const [mod, section] = id.split('-');
        if (technicalData[mod] && technicalData[mod][section]) {
            return createGenericView(SECTION_TITLES[section], technicalData[mod][section], mod, section);
        }
    }
    return null;
}

function navigateTo(id, { push = true } = {}) {
    const html = resolveView(id);
    if (html === null) { if (id !== 'dashboard') navigateTo('dashboard', { push: false }); return; }
    const area = document.getElementById('content-area');
    area.innerHTML = html;
    syncNav(id);
    if (push && location.hash.slice(1) !== id) history.pushState(null, '', `#${id}`);
    document.title = id === 'dashboard' ? 'ERBE · Central Comercial' : `${(findRoute(id)?.child?.[1]) || findRoute(id)?.item.label || 'ERBE'} · ERBE`;
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (!isDesktop()) setDrawer(false);
    const form = document.getElementById('demo-form');
    if (form) bindDemoForm(form);
}

function bindDemoForm(form) {
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        let ok = true;
        form.querySelectorAll('.field').forEach((f) => {
            const input = f.querySelector('[required]');
            const bad = input && !input.value.trim();
            f.classList.toggle('is-invalid', !!bad);
            if (bad) ok = false;
        });
        if (ok) { showToast('Exemplo de envio — nenhum dado foi enviado.'); form.reset(); }
    });
}

/* ---------------------------------------------------------------- Copiar */
function handleManualCopy(mod, section) {
    const text = section ? technicalData[mod][section] : '';
    if (text) handleCopy(text);
}

let toastTimer;
function showToast(message) {
    const notif = document.getElementById('notif');
    notif.lastElementChild.textContent = message;
    notif.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => notif.classList.remove('is-visible'), 2500);
}

function handleCopy(text, source) {
    const done = () => {
        showToast('Informação pronta para o WhatsApp!');
        if (source) { source.classList.add('is-copied'); setTimeout(() => source.classList.remove('is-copied'), 1600); }
    };
    const fallback = () => {
        const el = document.createElement('textarea');
        el.value = text; el.setAttribute('readonly', ''); el.style.position = 'fixed'; el.style.opacity = '0';
        document.body.appendChild(el); el.select();
        try { document.execCommand('copy'); } catch (e) { /* sem suporte: apenas avisa */ }
        document.body.removeChild(el);
        done();
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
}

/* ---------------------------------------------------------------- Inicialização */
document.addEventListener('click', (e) => {
    const copy = e.target.closest('[data-copy]');
    if (copy) { handleCopy(copy.getAttribute('data-copy'), copy); return; }
    if (e.target.closest('[data-drawer-open]')) { setDrawer(true); return; }
    if (e.target.closest('[data-drawer-close]')) setDrawer(false);
});
document.getElementById('mobile-toggle').addEventListener('click', () => setDrawer(!sidebar().classList.contains('is-open')));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sidebar().classList.contains('is-open')) setDrawer(false); });
window.matchMedia('(min-width: 1024px)').addEventListener('change', (m) => { if (m.matches) setDrawer(false); });
window.addEventListener('popstate', () => navigateTo(location.hash.slice(1) || 'dashboard', { push: false }));

renderNav();
navigateTo(location.hash.slice(1) || 'dashboard', { push: false });
