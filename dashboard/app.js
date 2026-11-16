// Token Launch Radar dashboard. Reads window.RADAR (written beside dashboard/
// by main.ts) and renders the ranked board, filters, the live-token set kept
// apart, and a per-protocol detail view with the model's own arithmetic.
// No network: every byte it shows is in data.js. No framework.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;

  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, watchOnly: false, tab: 'pre', sort: 'rank', dir: 1, selected: null };
  var $ = function (id) { return document.getElementById(id); };

  // ---- Formatting ---------------------------------------------------------
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtUsdFull(n) {
    return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y (' + days + 'd)';
    return days + 'd';
  }
  function fmtAgeShort(days) {
    if (days === null || days === undefined) return 'n/a';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return days + 'd';
  }

  // ---- The model, recomputed in the page ----------------------------------
  // impliedOf is the same arithmetic main.ts runs: TVL x the category
  // multiple (or the global median) x the clamped growth factor x the
  // log-scaled age factor. The detail view recomputes each row and checks
  // the number against the one board.json carries, so the page's code and
  // the board's data are visibly the same model.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null ? 0 : row.change_7d));
    var growthFactor = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days_used;
    var capped = Math.min(Math.max(age, 0), model.age_cap_days);
    var ageFactor = model.age_floor + model.age_range * (Math.log(1 + capped) / Math.log(1 + model.age_cap_days));
    return { implied: Math.max(1, Math.round(row.tvl_usd * row.multiple * growthFactor * ageFactor)), growthPct: growth, growthFactor: growthFactor, ageFactor: ageFactor };
  }

  // ---- Filtering and sorting ----------------------------------------------
  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchOnly && !r.watchlist) return false;
      if (state.minTvl > 0 && r.tvl_usd < state.minTvl) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort, dir = state.dir;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'category') { av = (a.category || 'Other').toLowerCase(); bv = (b.category || 'Other').toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.multiple; bv = b.multiple; }
      else if (key === 'implied') { av = a.implied_value_usd; bv = b.implied_value_usd; }
      else { av = a.rank; bv = b.rank; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  // ---- DOM helpers ----------------------------------------------------------
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // ---- Static panels --------------------------------------------------------
  function renderMeta() {
    $('meta-date').textContent = DATA.as_of;
    $('meta-model').textContent = DATA.model_version;
    $('hero-watch').textContent = String(DATA.watchlist_size);
    $('foot-date').textContent = DATA.as_of;
    $('foot-count').textContent = DATA.board_size + ' pre-token rows, ' + DATA.live_size + ' live-token protocols set aside';
    $('m-sample').textContent = String(DATA.model.min_category_sample);
    $('m-growth').textContent = DATA.model.growth_floor + '% to +' + DATA.model.growth_cap + '%';
    $('m-age').textContent = DATA.model.age_cap_days.toLocaleString('en-US') + ' days';
    var pricedCats = {};
    DATA.rows.forEach(function (r) { if (r.multiple_source === 'category') pricedCats[r.category] = true; });
    var pricedCount = Object.keys(pricedCats).length;
    $('strip-note').textContent = 'Category multiples are medians of market-cap/TVL among token protocols in the same category (n ≥ ' + DATA.model.min_category_sample + '). ' +
      pricedCount + ' categories on this board price from their own median; the rest use the global median of ×' + DATA.global_multiple.toFixed(3) +
      ' from ' + DATA.global_sample + ' token protocols.';
    $('excluded-note').textContent = 'On this snapshot, ' + DATA.excluded_total + ' of ' + DATA.pre_token_total +
      ' protocols recording no token were excluded as wrapped, staked, bridged or versioned products, and ' +
      (DATA.protocols_total - DATA.pre_token_total) + ' protocols recording a token were set aside.';
    var top = DATA.rows[0];
    var tiles = [
      { label: 'Watchlist covered', value: DATA.watchlist_size + ' / ' + DATA.watchlist_size, sub: 'floor $' + Math.round(DATA.floor_usd / 1e6) + 'M, every slug ranked', hot: true },
      { label: 'Board rows', value: String(DATA.board_size), sub: DATA.early_size + ' rows beyond the watchlist', hot: false },
      { label: 'Global median multiple', value: '×' + DATA.global_multiple.toFixed(3), sub: 'median mcap/TVL, ' + DATA.global_sample + ' token protocols', hot: false },
      { label: 'Top implied value', value: fmtUsd(top ? top.implied_value_usd : 0), sub: top ? top.name : '', hot: false }
    ];
    var wrap = $('tiles');
    wrap.textContent = '';
    tiles.forEach(function (t) {
      wrap.appendChild(el('div', { class: 'tile' + (t.hot ? ' hot' : '') }, el('span', { text: t.label }), el('b', { text: t.value }), el('em', { text: t.sub })));
    });
    var grid = $('mult-grid');
    grid.textContent = '';
    DATA.multiples.forEach(function (m) {
      if (!pricedCats[m.category]) return;
      grid.appendChild(el('div', { class: 'mult-cell' },
        el('span', { text: m.category }),
        el('span', null, el('b', { text: '×' + m.multiple.toFixed(3) }), ' ', el('small', { text: 'n=' + m.sample }))));
    });
    grid.appendChild(el('div', { class: 'mult-cell global' },
      el('span', { text: 'All other categories (global fallback)' }),
      el('span', null, el('b', { text: '×' + DATA.global_multiple.toFixed(3) }), ' ', el('small', { text: 'n=' + DATA.global_sample }))));
  }

  function renderSelects() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var catSel = $('category');
    cats.forEach(function (c) { catSel.appendChild(el('option', { value: c, text: c })); });
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var chainSel = $('chain');
    chains.forEach(function (c) { chainSel.appendChild(el('option', { value: c, text: c })); });
  }

  // ---- Board table ----------------------------------------------------------
  var SORT_LABELS = { rank: 'Rank', name: 'Protocol', category: 'Category', tvl: 'TVL', growth: '7d', age: 'Age', multiple: 'Multiple', implied: 'Implied value' };
  function renderSortHeaders() {
    Array.prototype.forEach.call(document.querySelectorAll('th button[data-sort]'), function (btn) {
      var key = btn.getAttribute('data-sort');
      var arrow = key === state.sort ? (state.dir === 1 ? ' ↑' : ' ↓') : '';
      btn.textContent = SORT_LABELS[key] + arrow;
      var th = btn.parentElement;
      if (th) th.setAttribute('aria-sort', key === state.sort ? (state.dir === 1 ? 'ascending' : 'descending') : 'none');
    });
  }

  function renderTable() {
    var list = sortedRows(visibleRows());
    var tbody = $('rows');
    tbody.textContent = '';
    var max = DATA.rows.length ? DATA.rows[0].implied_value_usd : 1;
    list.forEach(function (r) {
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var chains = (r.chains || []).slice(0, 3).join(', ') + ((r.chains || []).length > 3 ? ' +' + ((r.chains || []).length - 3) : '');
      var width = Math.max(3, Math.round(Math.sqrt(r.implied_value_usd / max) * 100));
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        class: r.rank <= 3 ? 'top3' : null,
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'rank', text: String(r.rank) }),
        el('td', { class: 'namecell' }, el('b', null, r.name, r.watchlist ? el('span', { class: 'star', title: 'On the snapshot watchlist', text: '★ watchlist' }) : null), el('span', { class: 'slug', text: r.slug })),
        el('td', { text: r.category || 'Other' }),
        el('td', { class: 'chains', text: chains || '—' }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAgeShort(r.age_days) }),
        el('td', { class: 'mult', text: '×' + r.multiple.toFixed(3) }, ' ', el('small', { text: r.multiple_source === 'category' ? 'cat' : 'glob' })),
        el('td', null, el('div', { class: 'implied' },
          el('span', { class: 'val', text: fmtUsd(r.implied_value_usd) }),
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + width + '%' }))
        ))
      );
      tbody.appendChild(tr);
    });
    $('empty').hidden = list.length !== 0;
    $('board-table').style.display = list.length === 0 ? 'none' : '';
    $('count').textContent = state.tab === 'pre'
      ? list.length + ' of ' + DATA.board_size + ' rows shown'
      : DATA.live_size + ' live-token protocols (set aside)';
    renderSortHeaders();
  }

  function renderLive() {
    var tbody = $('live-rows');
    tbody.textContent = '';
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'namecell' }, el('b', { text: r.name }), el('span', { class: 'slug', text: r.slug })),
        el('td', { text: r.category || 'Other' }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num ratio', text: '×' + r.mcap_tvl.toFixed(3) })
      ));
    });
  }

  // ---- Detail view ------------------------------------------------------------
  var dialog = $('detail');
  function breakdownRow(label, value, total) {
    return el('div', { class: 'row' + (total ? ' total' : '') }, el('span', { text: label }), el('b', { text: value }));
  }
  function fact(label, value) {
    return el('div', null, el('dt', { text: label }), el('dd', { text: value }));
  }
  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    var check = impliedOf(row, DATA.model);
    var standing = row.watchlist ? ' · ★ on the watchlist' : (row.tvl_usd >= DATA.floor_usd ? ' · above the floor, not on the watchlist' : ' · early row below the floor');
    $('detail-kicker').textContent = 'Rank ' + row.rank + ' of ' + DATA.board_size + standing;
    $('detail-title').textContent = row.name;
    $('detail-sub').textContent = (row.category || 'Other') + ' · ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'no chains listed');
    var bd = $('detail-breakdown');
    bd.textContent = '';
    bd.appendChild(breakdownRow('TVL (snapshot)', fmtUsdFull(row.tvl_usd)));
    bd.appendChild(breakdownRow(row.multiple_source === 'category' ? 'Category multiple (median, n=' + row.multiple_sample + ')' : 'Global multiple (median, n=' + row.multiple_sample + ')', '×' + row.multiple.toFixed(4)));
    bd.appendChild(breakdownRow('7d change → growth factor', fmtPct(row.change_7d) + ' → ×' + check.growthFactor.toFixed(4)));
    bd.appendChild(breakdownRow('Age with no token → age factor', (row.age_days === null ? 'unknown, median ' + row.age_days_used + 'd used' : fmtAge(row.age_days)) + ' → ×' + check.ageFactor.toFixed(4)));
    bd.appendChild(breakdownRow('Implied value', fmtUsdFull(row.implied_value_usd), true));
    $('detail-recheck').textContent = 'Recomputed in this page from the same figures: ' + fmtUsdFull(check.implied) +
      (check.implied === row.implied_value_usd ? ' — the same number board.json carries.' : ' — differs from the board value; the data would be stale.') +
      ' Model ' + DATA.model_version + '. An estimate, not a price; it never predicts a token will issue.';
    var facts = $('detail-facts');
    facts.textContent = '';
    facts.appendChild(fact('First listed', row.listed_at || 'not reported'));
    facts.appendChild(fact('Age at snapshot', fmtAge(row.age_days)));
    facts.appendChild(fact('Chains', String((row.chains || []).length)));
    facts.appendChild(fact('TVL vs $50M floor', row.tvl_usd >= DATA.floor_usd ? 'above the floor' : fmtUsd(DATA.floor_usd - row.tvl_usd) + ' below the floor'));
    facts.appendChild(fact('Token recorded', 'none: no market cap, no CoinGecko id, no symbol'));
    facts.appendChild(fact('Watchlist', row.watchlist ? 'yes' : 'no'));
    var steps = $('detail-steps');
    steps.textContent = '';
    row.farm_steps.forEach(function (s) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      steps.appendChild(el('li', null, el('span', { class: 'act', text: action }), el('span', { class: 'cost', text: tail })));
    });
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else if (typeof dialog.showModal !== 'function') dialog.setAttribute('open', '');
    try { window.history.replaceState(null, '', '#p=' + encodeURIComponent(slug)); } catch (e) { /* file URLs may refuse history */ }
    renderTable();
  }
  function closeDetail() {
    if (dialog.open) dialog.close();
  }
  dialog.addEventListener('close', function () {
    state.selected = null;
    try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) { /* ignore */ }
    renderTable();
  });
  $('detail-close').addEventListener('click', closeDetail);
  dialog.addEventListener('click', function (e) { if (e.target === dialog) closeDetail(); });

  // ---- Wiring -------------------------------------------------------------------
  function render() {
    var pre = state.tab === 'pre';
    $('board-panel').hidden = !pre;
    $('live-panel').hidden = pre;
    $('model-panel').style.display = pre ? '' : 'none';
    $('tab-pre').setAttribute('aria-pressed', pre ? 'true' : 'false');
    $('tab-live').setAttribute('aria-pressed', !pre ? 'true' : 'false');
    if (pre) renderTable();
    else { renderLive(); $('count').textContent = DATA.live_size + ' live-token protocols (set aside)'; }
  }
  $('q').addEventListener('input', function (e) { state.q = e.target.value; render(); });
  $('category').addEventListener('change', function (e) { state.category = e.target.value; render(); });
  $('chain').addEventListener('change', function (e) { state.chain = e.target.value; render(); });
  $('mintvl').addEventListener('change', function (e) { state.minTvl = Number(e.target.value); render(); });
  $('watchonly').addEventListener('change', function (e) { state.watchOnly = e.target.checked; render(); });
  $('tab-pre').addEventListener('click', function () { state.tab = 'pre'; render(); });
  $('tab-live').addEventListener('click', function () { state.tab = 'live'; render(); });
  $('clear-filters').addEventListener('click', function () {
    state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; state.watchOnly = false;
    $('q').value = ''; $('category').value = 'all'; $('chain').value = 'all'; $('mintvl').value = '0'; $('watchonly').checked = false;
    render();
  });
  Array.prototype.forEach.call(document.querySelectorAll('th button[data-sort]'), function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.getAttribute('data-sort');
      if (state.sort === key) { state.dir = -state.dir; }
      else { state.sort = key; state.dir = (key === 'rank' || key === 'name' || key === 'category') ? 1 : -1; }
      renderTable();
    });
  });

  renderMeta();
  renderSelects();
  render();
  var hash = window.location.hash.replace(/^#/, '');
  if (hash.indexOf('p=') === 0) {
    var slug = decodeURIComponent(hash.slice(2));
    if (slug) openDetail(slug);
  }
})();
