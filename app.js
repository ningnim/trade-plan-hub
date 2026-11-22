'use strict';

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) =>
  ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[character]
);
const number = (value) => value == null ? '—' : new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 4
}).format(Number(value));
const currencies = { CNY: '人民币', HKD: '港元', USD: '美元' };
const decisions = { watch: '等待机会', conditional: '有条件参与', avoid: '暂不买入', paused: '暂停执行', hold: '持有复核' };
const views = { overview: '计划总览', reviews: '复核清单', history: '变更记录' };
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', dateStyle: 'short' });
const fullDate = (iso) => new Date(iso).toLocaleString('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false
});
const age = (p) => Math.max(0, Math.floor(
  (Date.parse(day.format(new Date()) + 'T00:00:00+08:00') - Date.parse(p.planDate + 'T00:00:00+08:00')) / 86400000
));
const needsReview = (p) => age(p) >= 7 || p.decision === 'paused';
const state = { view: 'overview', filter: 'all', search: '', market: 'all', variant: 0, detail: null };
let ledger;

function badge(plan) {
  return `<span class="badge ${escapeHtml(plan.decision)}">${escapeHtml(decisions[plan.decision] || plan.decision)}</span>`;
}

function logo(plan) {
  return `<div class="company-logo">${escapeHtml(plan.name[0])}</div>`;
}

function heading(title, description) {
  return `<div class="page-heading"><div><h1>${title}</h1><p class="subtitle">${description}</p></div></div>`;
}

function priceBand(order) {
  return order.limitLow == null ? number(order.limitPrice) : `${number(order.limitLow)}–${number(order.limitPrice)}`;
}

function card(plan) {
  const variant = plan.variants[0];
  const first = variant?.orders[0];
  const quoteDate = plan.referencePrice == null ? '历史报价未录入' : `${escapeHtml(plan.marketAsOf)} · 历史行情`;
  return `<article class="plan-card ${plan.id === 'zijin' ? 'featured' : ''}" aria-label="${escapeHtml(plan.name)}交易计划">
    <div class="card-top">${logo(plan)}<div><h3 class="company-name">${escapeHtml(plan.name)}</h3><div class="ticker">${escapeHtml(plan.ticker)} · ${escapeHtml(plan.market)}</div></div>${badge(plan)}</div>
    <p class="card-summary">${escapeHtml(plan.summary)}</p>
    <div class="price-area">
      <div><div class="price-label">历史参考价</div><div class="price">${number(plan.referencePrice)}<small>${escapeHtml(currencies[plan.currency])}</small></div><div class="price-meta">${quoteDate}</div></div>
      <div><div class="price-label">首档参考区间</div><div class="price entry">${first ? priceBand(first) : '—'}<small>${escapeHtml(currencies[variant?.currency])}</small></div><div class="price-meta">涉及复核条件</div></div>
    </div>
    ${variant ? `<div class="order-bars" aria-label="分批参考价位">${variant.orders.map((order) => `<div class="order-step">${priceBand(order)}</div>`).join('')}</div>` : ''}
    <div class="card-meta"><span>研究日期 ${escapeHtml(plan.planDate)}</span><span>${escapeHtml(plan.sector)}</span></div>
    <div class="card-footer">${needsReview(plan) ? '<span class="badge review">待复核</span>' : '<span></span>'}<button class="button" data-plan="${escapeHtml(plan.id)}">查看计划</button></div>
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
  container.innerHTML = list.length ? list.map(card).join('') : '<p class="empty">没有匹配的计划。</p>';
}

function overview() {
  const pending = ledger.plans.filter(needsReview).length;
  const markets = [...new Set(ledger.plans.map((plan) => plan.market))];
  const filters = { all: '全部计划', review: '待复核', ...decisions };
  const active = new Set(ledger.plans.map((plan) => plan.decision));
  return heading('公司研究与交易计划', '查看分批参考价、启用条件与经营风险。') +
    `<div class="notice"><span class="notice-icon">i</span><div>各公司参考价取自原研究日期。先核对最新公告与报价，再评估价位是否适用。</div></div>
    <section aria-label="交易计划">
      <div class="section-row"><h2>${ledger.plans.length} 家公司</h2><span class="section-note">${pending} 份待复核 · 更新于 ${fullDate(ledger.updatedAt)}</span></div>
      <div class="toolbar">
        <div class="filters" role="group" aria-label="筛选计划">
          ${Object.entries(filters).filter(([key]) => ['all', 'review'].includes(key) || active.has(key)).map(([key, label]) =>
            `<button class="filter ${key === state.filter ? 'active' : ''}" data-filter="${key}">${label}</button>`
          ).join('')}
        </div>
        <div class="tools">
          <label><input class="search" id="search" type="search" placeholder="搜索公司或代码" aria-label="搜索公司或代码" value="${escapeHtml(state.search)}"></label>
          <select id="market-select" aria-label="筛选市场"><option value="all">全部市场</option>
          ${markets.map((market) => `<option ${state.market === market ? 'selected' : ''}>${escapeHtml(market)}</option>`).join('')}</select>
        </div>
      </div>
      <div class="cards" id="cards"></div>
    </section>`;
}

function reviews() {
  const sorted = [...ledger.plans].sort((a, b) => Number(needsReview(b)) - Number(needsReview(a)) || a.planDate.localeCompare(b.planDate));
  return heading('复核清单', '研究满七天或计划暂停时，列为待复核。') +
    `<div class="reviews-list">${sorted.map((plan) => `<article class="review-card">${logo(plan)}<div class="review-main">
      <h2>${escapeHtml(plan.name)} ${needsReview(plan) ? '<span class="badge review">待复核</span>' : ''}</h2>
      <p>${escapeHtml(plan.review)}</p><span class="section-note">研究日期 ${escapeHtml(plan.planDate)}</span>
      </div><button class="button" data-plan="${escapeHtml(plan.id)}">查看计划</button></article>`).join('')}</div>`;
}

function historyView() {
  const entries = ledger.plans.flatMap((plan) => plan.history.map((version) => ({ plan, version })));
  entries.sort((a, b) => b.version.updatedAt.localeCompare(a.version.updatedAt));
  return heading('变更记录', '回看历次发布的研究条件与参考价位。') +
    `<div class="timeline">${entries.map(({ plan, version }) => `<article class="timeline-item">
      <div class="section-row"><h3>${escapeHtml(plan.name)} <span class="badge watch">v${version.revision}</span></h3>
      <time datetime="${escapeHtml(version.updatedAt)}">${fullDate(version.updatedAt)}</time></div>
      <p>${escapeHtml(version.reason)}</p><button class="text-button" data-plan="${escapeHtml(plan.id)}" data-revision="${version.revision}">查看当时计划</button>
    </article>`).join('')}</div>`;
}

function render() {
  $('#breadcrumb-current').textContent = views[state.view];
  $('#nav-count').textContent = ledger.plans.length;
  document.querySelectorAll('[data-view]').forEach((button) => {
    const active = button.dataset.view === state.view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  $('#content').innerHTML = { overview, reviews, history: historyView }[state.view]();
  $('#company-nav').innerHTML = ledger.plans.map((plan) =>
    `<button class="company-link" data-plan="${escapeHtml(plan.id)}">${escapeHtml(plan.name)}</button>`
  ).join('');
  renderCards();
}

function showDetail() {
  const { plan, revision } = state.detail;
  const variant = plan.variants[state.variant];
  const currentLabel = revision == null ? '当前版本' : '历史版本';
  $('#dialog-body').innerHTML = `
    <div class="dialog-head">${logo(plan)}<div><h2 id="dialog-title">${escapeHtml(plan.name)}</h2>
      <div class="view-heading-meta">${escapeHtml(plan.ticker)} · ${currentLabel} v${revision ?? plan.revision}</div></div>
      <button class="icon-button close-dialog" id="close-dialog" aria-label="关闭计划">×</button>
    </div>
    <div class="dialog-content">
      <div class="notice"><span class="notice-icon">i</span><div>研究日期 ${escapeHtml(plan.planDate)} ${needsReview(plan) ? ' · 待复核' : ''}</div></div>
      <p class="dialog-summary">${escapeHtml(plan.summary)}</p>
      ${plan.variants.length > 1 ? `<div class="variant-tabs" role="group" aria-label="选择研究方案">
        ${plan.variants.map((item, index) => `<button class="variant-tab ${index === state.variant ? 'active' : ''}" data-variant="${index}">
          ${escapeHtml(currencies[item.currency])}${index > 0 ? ' · 替代方案' : ' · 主方案'}</button>`).join('')}</div>` : ''}
      ${variant ? `<section class="detail-section"><h3>分批参考价位</h3><div class="table-wrap"><table><thead><tr><th>批次</th><th>参考区间 / ${escapeHtml(currencies[variant.currency])}</th><th>启用条件</th></tr></thead><tbody>
        ${variant.orders.map((order, index) => `<tr><td>第 ${index + 1} 档</td><td><strong>${priceBand(order)}</strong></td><td>${escapeHtml(order.condition)}</td></tr>`).join('')}
      </tbody></table></div></section>` : ''}
      ${[['投资逻辑', 'thesis'], ['风险与暂停条件', 'risk'], ['退出评估', 'exit'], ['下次复核', 'review']].map(([label, field]) =>
        `<section class="detail-section"><h3>${label}</h3><p>${escapeHtml(plan[field])}</p></section>`
      ).join('')}
      ${plan.sourceUrl ? `<a class="button" href="${escapeHtml(plan.sourceUrl)}" target="_blank" rel="noopener noreferrer">阅读公司公告</a>` : ''}
    </div>`;
  if (!$('#plan-dialog').open) $('#plan-dialog').showModal();
}

function openPlan(id, revision) {
  const current = ledger.plans.find((plan) => plan.id === id);
  if (!current) return;
  const version = current.history.find((entry) => entry.revision === revision);
  state.detail = { plan: version?.snapshot ?? current, revision: version?.revision };
  state.variant = 0;
  if (!version) history.replaceState(null, '', '#plan=' + encodeURIComponent(id));
  showDetail();
}

function applyRoute() {
  const route = location.hash.slice(1);
  if (route.startsWith('plan=')) {
    openPlan(route.slice(5));
    return;
  }
  if ($('#plan-dialog').open) $('#plan-dialog').close();
  state.view = Object.hasOwn(views, route) ? route : 'overview';
  render();
}

function closeDetail() {
  $('#plan-dialog').close();
  state.detail = null;
  history.replaceState(null, '', '#' + state.view);
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.view) location.hash = button.dataset.view;
  if (button.dataset.filter) {
    state.filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((item) => item.classList.toggle('active', item.dataset.filter === state.filter));
    renderCards();
  }
  if (button.dataset.plan) openPlan(button.dataset.plan, Number(button.dataset.revision));
  if (button.dataset.variant !== undefined) {
    state.variant = Number(button.dataset.variant);
    showDetail();
    document.querySelector(`[data-variant="${state.variant}"]`)?.focus();
  }
  if (button.id === 'close-dialog') closeDetail();
  if (button.id === 'copy-link') {
    const toast = $('#toast');
    try {
      await navigator.clipboard.writeText(location.origin + location.pathname);
      toast.textContent = '链接已复制';
    } catch {
      toast.textContent = '可从地址栏复制网站链接';
    }
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }
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
    $('#content').innerHTML = '<p class="error">暂时无法读取计划，请稍后刷新。</p>';
  } finally {
    $('#loading').hidden = true;
  }
}
loadPlans();
