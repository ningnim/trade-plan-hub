'use strict';

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]
);
const numbers = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 });
const number = (value) => value == null ? '—' : numbers.format(Number(value));
const currencies = { CNY: '元', HKD: '港元', USD: '美元' };
const currencyNames = { ...currencies, CNY: '人民币' };
const decisions = { watch: '等待机会', conditional: '有条件参与', avoid: '暂不买入', paused: '暂停执行', hold: '持有复核' };
const views = { overview: '计划总览', reviews: '复核清单', history: '变更记录' };
const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', dateStyle: 'short' });
const fullDate = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short'
});
const palette = {
  zijin: 'copper', moutai: 'rose', cmb: 'rose', midea: 'indigo', byd: 'indigo',
  cypc: 'teal', nvidia: 'teal', micron: 'indigo', laopu: 'copper'
};
const state = { view: 'overview', filter: 'all', search: '', market: 'all', variant: 0, detail: null };
let ledger;
let toastTimer;
let detailTrigger;

function needsReview(plan) {
  const today = Date.parse(day.format(new Date()) + 'T00:00:00+08:00');
  const planned = Date.parse(plan.planDate + 'T00:00:00+08:00');
  return today - planned >= 7 * 86400000 || plan.decision === 'paused';
}

function badge(plan) {
  return `<span class="badge ${escapeHtml(plan.decision)}">${escapeHtml(decisions[plan.decision] || plan.decision)}</span>`;
}

function logo(plan) {
  const letter = plan.market === '美股' ? plan.ticker.slice(0, 2) : plan.name[0];
  return `<span class="company-logo ${palette[plan.id] || 'neutral'}" aria-hidden="true">${escapeHtml(letter)}</span>`;
}

function dateTime(iso) {
  return `<time datetime="${escapeHtml(iso)}">${fullDate.format(new Date(iso))}</time>`;
}

function heading(title, text) {
  return `<div class="page-heading"><h1>${title}</h1><p>${text}</p></div>`;
}

function priceBand(order) {
  const high = number(order.limitPrice);
  return order.limitLow == null ? high : `${number(order.limitLow)}–${high}`;
}

function planUrl(id, revision) {
  const hash = new URLSearchParams({ plan: id });
  if (revision != null) hash.set('v', revision);
  return '#' + hash;
}

function price(value, currency) {
  return `<span class="price"><strong>${value}</strong>${value === '—' ? '' : `<small>${escapeHtml(currencies[currency] || currency)}</small>`}</span>`;
}

function feature(plan) {
  const variant = plan.variants[0];
  const levels = variant?.orders.slice(0, 3);
  return `<article class="feature-panel ${plan.id === 'zijin' ? 'feature-mine' : ''}" aria-labelledby="featured-title">
    ${plan.id === 'zijin' ? '<img class="feature-image" src="./mine-cover.jpg" alt="" fetchpriority="high" decoding="async">' : ''}
    <div class="feature-content">
      <div class="feature-label"><span>重点跟踪</span><span>${escapeHtml(plan.sector)}</span></div>
      <h2 id="featured-title">${escapeHtml(plan.name)}</h2>
      <p class="feature-ticker">${escapeHtml(plan.ticker)}</p>
      <p class="feature-summary">${escapeHtml(plan.summary)}</p>
      <div class="feature-data">
        <div><span class="feature-data-label">参考价 · ${escapeHtml(plan.marketAsOf)}</span>${price(number(plan.referencePrice), plan.currency)}</div>
        ${levels?.length ? `<div><span class="feature-data-label">分批参考价</span><span class="feature-levels">${levels.map(priceBand).join(' / ')}</span></div>` : ''}
      </div>
      <div class="feature-actions">
        <a class="button feature-link" href="${planUrl(plan.id)}" data-plan="${escapeHtml(plan.id)}">查看交易计划</a>
        ${badge(plan)}
      </div>
    </div>
  </article>`;
}

function updates(excludedPlan) {
  const recent = [...ledger.plans]
    .filter((plan) => plan !== excludedPlan)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 3);
  if (!recent.length) return '';
  return `<section class="updates-panel" aria-labelledby="updates-title">
    <div class="updates-heading"><h2 id="updates-title">最近更新</h2><a href="#history">全部记录</a></div>
    <div class="update-list">${recent.map((plan) => {
      const revision = plan.history.at(-1);
      return `<a class="update-row" href="${planUrl(plan.id)}" data-plan="${escapeHtml(plan.id)}">
        ${logo(plan)}<div class="update-info"><div class="update-title"><strong>${escapeHtml(plan.name)}</strong><span>v${plan.revision}</span></div>
        <p>${escapeHtml(revision?.reason || plan.summary)}</p><time datetime="${escapeHtml(plan.updatedAt)}">${day.format(new Date(plan.updatedAt))}</time></div>
      </a>`;
    }).join('')}</div>
  </section>`;
}

function card(plan) {
  const variant = plan.variants[0];
  const first = variant?.orders[0];
  return `<article class="plan-card" aria-labelledby="card-${escapeHtml(plan.id)}">
    <div class="card-top">${logo(plan)}
      <div class="company-heading"><h3 id="card-${escapeHtml(plan.id)}">${escapeHtml(plan.name)}</h3>
      <p class="ticker">${escapeHtml(plan.ticker)} · ${escapeHtml(plan.market)}</p></div>
    </div>
    <p class="card-summary">${escapeHtml(plan.summary)}</p>
    <div class="card-prices">
      <div><span class="price-label">历史参考价</span>${price(number(plan.referencePrice), plan.currency)}</div>
      <div><span class="price-label">首档参考价</span>${price(first ? priceBand(first) : '—', variant?.currency)}</div>
    </div>
    <div class="card-footer"><div class="card-status">${badge(plan)}${needsReview(plan) ? '<span class="review-label">待复核</span>' : ''}</div>
      <a class="card-link" href="${planUrl(plan.id)}" data-plan="${escapeHtml(plan.id)}" aria-label="查看${escapeHtml(plan.name)}计划">查看计划</a></div>
    <div class="card-date"><span>${escapeHtml(plan.sector)}</span><span>行情 ${escapeHtml(plan.marketAsOf)}</span></div>
  </article>`;
}

function renderCards() {
  const container = $('#cards');
  if (!container) return;
  const query = state.search.trim().toLowerCase();
  const list = ledger.plans.filter((plan) =>
    (state.filter === 'all' || (state.filter === 'review' ? needsReview(plan) : state.filter === plan.decision)) &&
    (state.market === 'all' || state.market === plan.market) &&
    `${plan.name} ${plan.ticker} ${plan.sector}`.toLowerCase().includes(query)
  );
  $('#results-count').textContent = `${list.length} 家公司`;
  container.innerHTML = list.length ? list.map(card).join('') :
    '<div class="empty"><p>没有匹配的计划。</p><button class="button" type="button" data-reset>清除筛选</button></div>';
}

function overview() {
  const featured = ledger.plans.find((plan) => plan.id === 'zijin') || ledger.plans[0];
  const pending = ledger.plans.filter(needsReview).length;
  const markets = [...new Set(ledger.plans.map((plan) => plan.market))];
  const filters = { all: '全部', review: '待复核', ...decisions };
  const active = new Set(ledger.plans.map((plan) => plan.decision));
  return `<div class="home-intro">
    ${heading('公司研究与交易计划', '查阅 A 股、港股和美股的分批价位、执行条件与研究记录。')}
    <div class="intro-meta"><a href="#reviews">${pending} 份待复核</a><span>更新于 ${dateTime(ledger.updatedAt)}</span></div>
    </div>
    ${featured ? `<div class="feature-grid">${feature(featured)}${updates(featured)}</div>` : ''}
    <section class="catalog" aria-labelledby="catalog-title">
      <div class="catalog-heading"><div><h2 id="catalog-title">计划目录</h2><span id="results-count" aria-live="polite"></span></div>
        <div class="tools">
          <label class="search-field"><span class="search-mark" aria-hidden="true"></span><input id="search" type="search" placeholder="搜索公司或代码" aria-label="搜索公司或代码" value="${escapeHtml(state.search)}"></label>
          <label class="select-field"><select id="market-select" aria-label="筛选市场"><option value="all">全部市场</option>
          ${markets.map((market) => `<option value="${escapeHtml(market)}" ${state.market === market ? 'selected' : ''}>${escapeHtml(market)}</option>`).join('')}</select></label>
        </div>
      </div>
      <div class="filters" role="group" aria-label="筛选计划">
        ${Object.entries(filters).filter(([key]) => ['all', 'review'].includes(key) || active.has(key)).map(([key, label]) =>
          `<button class="filter" type="button" aria-pressed="${key === state.filter}" data-filter="${key}">${label}</button>`
        ).join('')}
      </div>
      <div class="cards" id="cards"></div>
    </section>`;
}

function reviews() {
  const sorted = [...ledger.plans].sort((a, b) => Number(needsReview(b)) - Number(needsReview(a)) || a.planDate.localeCompare(b.planDate));
  return heading('复核清单', '研究满七天或计划暂停时，列为待复核。') +
    `<div class="entry-list">${sorted.map((plan) => `<article class="entry">
      ${logo(plan)}<div class="entry-content"><h2>${escapeHtml(plan.name)} ${needsReview(plan) ? '<span class="badge review">待复核</span>' : ''}</h2>
      <p>${escapeHtml(plan.review)}</p><span class="entry-meta">研究日期 ${escapeHtml(plan.planDate)}</span></div>
      <a class="button" href="${planUrl(plan.id)}" data-plan="${escapeHtml(plan.id)}" aria-label="查看${escapeHtml(plan.name)}计划">查看计划</a>
    </article>`).join('') || '<p class="empty">暂无复核记录。</p>'}</div>`;
}

function historyView() {
  const entries = ledger.plans.flatMap((plan) => plan.history.map((version) => ({ plan, version })));
  entries.sort((a, b) => b.version.updatedAt.localeCompare(a.version.updatedAt));
  return heading('变更记录', '回看历次发布的研究条件与参考价位。') +
    `<div class="entry-list history-list">${entries.map(({ plan, version }) => `<article class="entry">
      ${logo(plan)}<div class="entry-content"><h2>${escapeHtml(plan.name)} <span class="version">v${version.revision}</span></h2>
      <p>${escapeHtml(version.reason)}</p><span class="entry-meta">${dateTime(version.updatedAt)}</span></div>
      <a class="button" href="${planUrl(plan.id, version.revision)}" data-plan="${escapeHtml(plan.id)}" data-revision="${version.revision}" aria-label="查看${escapeHtml(plan.name)}第${version.revision}版">查看当时计划</a>
    </article>`).join('') || '<p class="empty">暂无变更记录。</p>'}</div>`;
}

function render() {
  document.querySelectorAll('[data-view]').forEach((link) => {
    if (link.dataset.view === state.view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  $('#content').innerHTML = { overview, reviews, history: historyView }[state.view]();
  renderCards();
}

function showDetail() {
  const { plan, revision } = state.detail;
  const variant = plan.variants[state.variant];
  const currentLabel = revision == null ? '当前版本' : '历史版本';
  const details = [['投资逻辑', 'thesis'], ['风险与暂停条件', 'risk'], ['退出评估', 'exit'], ['下次复核', 'review']];
  $('#dialog-body').innerHTML = `
    <header class="dialog-head">${logo(plan)}<div class="dialog-title-block"><h2 id="dialog-title">${escapeHtml(plan.name)}</h2>
    <p>${escapeHtml(plan.ticker)} · ${currentLabel} v${revision ?? plan.revision}</p></div>
    <button class="icon-button" id="close-dialog" type="button" aria-label="关闭计划" autofocus>×</button></header>
    <div class="dialog-content">
      <section class="detail-overview" aria-label="计划摘要">
        <div><div class="detail-meta">${badge(plan)}<span>研究日期 ${escapeHtml(plan.planDate)}</span>${needsReview(plan) ? '<span class="review-label">待复核</span>' : ''}</div>
        <p>${escapeHtml(plan.summary)}</p></div>
        <div class="detail-quote"><span class="price-label">历史参考价</span>${price(number(plan.referencePrice), plan.currency)}
        <time datetime="${escapeHtml(plan.marketAsOf)}">${escapeHtml(plan.marketAsOf)}</time></div>
      </section>
      <div class="detail-grid">
        <section class="detail-orders" aria-labelledby="orders-heading">
          <h3 id="orders-heading">分批参考价位</h3>
          ${plan.variants.length > 1 ? `<div class="variant-tabs" role="group" aria-label="选择研究方案">
            ${plan.variants.map((item, index) => `<button class="filter" type="button" aria-pressed="${index === state.variant}" data-variant="${index}">${escapeHtml(currencyNames[item.currency] || item.currency)} · ${index === 0 ? '主方案' : '替代方案'}</button>`).join('')}
          </div>` : ''}
          <ol class="orders">
            ${variant?.orders.map((order, index) => `<li class="order"><div class="order-number">第 ${index + 1} 档</div>
              ${price(priceBand(order), variant.currency)}<p>${escapeHtml(order.condition)}</p></li>`).join('') || '<li class="empty">暂无参考价位。</li>'}
          </ol>
        </section>
        <div class="detail-notes">
          ${details.map(([label, field]) => `<section><h3>${label}</h3><p>${escapeHtml(plan[field])}</p></section>`).join('')}
          ${plan.sourceUrl?.startsWith('https://') ? `<a class="button" href="${escapeHtml(plan.sourceUrl)}" target="_blank" rel="noopener noreferrer">阅读公司公告</a>` : ''}
        </div>
      </div>
    </div>`;
  if (!$('#plan-dialog').open) $('#plan-dialog').showModal();
}

function openPlan(id, revision, trigger) {
  const current = ledger.plans.find((plan) => plan.id === id);
  if (!current) return false;
  const version = current.history.find((entry) => entry.revision === revision);
  state.detail = { plan: version?.snapshot ?? current, revision: version?.revision };
  state.variant = 0;
  detailTrigger = trigger;
  history.replaceState(null, '', planUrl(id, version?.revision));
  showDetail();
  return true;
}

function applyRoute() {
  const route = location.hash.slice(1);
  const params = new URLSearchParams(route);
  if (params.has('plan') && openPlan(params.get('plan'), Number(params.get('v')))) return;
  if (route === 'main') return;
  if ($('#plan-dialog').open) $('#plan-dialog').close();
  state.detail = null;
  state.view = Object.hasOwn(views, route) ? route : 'overview';
  render();
}

function closeDetail() {
  $('#plan-dialog').close();
  state.detail = null;
  history.replaceState(null, '', '#' + state.view);
  if (detailTrigger?.isConnected) detailTrigger.focus();
  detailTrigger = null;
}

async function copyLink() {
  const toast = $('#toast');
  try {
    await navigator.clipboard.writeText(location.origin + location.pathname);
    toast.textContent = '网站链接已复制';
  } catch {
    toast.textContent = '可从地址栏复制网站链接';
  }
  clearTimeout(toastTimer);
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

document.addEventListener('click', (event) => {
  const action = event.target.closest('button, a[data-plan]');
  if (!action) return;
  if (action.dataset.plan && ledger && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) {
    event.preventDefault();
    openPlan(action.dataset.plan, Number(action.dataset.revision), action);
  }
  if (action.dataset.filter) {
    state.filter = action.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((item) =>
      item.setAttribute('aria-pressed', String(item.dataset.filter === state.filter))
    );
    renderCards();
  }
  if (action.hasAttribute('data-reset')) {
    Object.assign(state, { search: '', market: 'all', filter: 'all' });
    render();
    $('#search').focus();
  }
  if (action.dataset.variant !== undefined) {
    state.variant = Number(action.dataset.variant);
    showDetail();
    document.querySelector(`[data-variant="${state.variant}"]`)?.focus();
  }
  if (action.id === 'close-dialog') closeDetail();
  if (action.id === 'copy-link') copyLink();
});

$('#plan-dialog').addEventListener('cancel', (event) => { event.preventDefault(); closeDetail(); });
document.addEventListener('input', (event) => {
  if (event.target.id === 'search') { state.search = event.target.value; renderCards(); }
});
document.addEventListener('change', (event) => {
  if (event.target.id === 'market-select') { state.market = event.target.value; renderCards(); }
});
window.addEventListener('hashchange', () => { if (ledger) applyRoute(); });

async function loadPlans() {
  try {
    const response = await fetch('./plans.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('data unavailable');
    const data = await response.json();
    if (data.schemaVersion !== 2 || !Array.isArray(data.plans)) throw new Error('unexpected data format');
    ledger = data;
    render();
    applyRoute();
  } catch (error) {
    $('#content').innerHTML = '<p class="error" role="alert">暂时无法读取计划，请稍后刷新。</p>';
  } finally {
    $('#loading').hidden = true;
  }
}

loadPlans();
