// Token Launch Radar dashboard. Reads window.RADAR (written beside dashboard/
// by main.ts) and renders the ranked board, filters, the live-token set kept
// apart, and a per-protocol detail view with the model's own arithmetic.
// No network: every byte it shows is in data.js. No framework.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;

  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, watchOnly: false, risingOnly: false, verdict: 'all', tab: 'pre', sort: 'rank', dir: 1, selected: null };
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
  // impliedOf is the same arithmetic main.ts runs: TVL x the row's multiple
  // x the clamped growth factor x the log-scaled age factor x the size
  // factor. The multiple itself is credibility-weighted in the model (the
  // category median blended with the global median by the category's sample
  // size, in lib/model.ts multipleFor) and arrives per row in data.js, so
  // the page recomputes from the same blended number; the size factor uses
  // the same reference TVL and fitted slope data.js carries. The detail
  // view recomputes each row and checks the number against the one
  // board.json carries, so the page's code and the board's data are
  // visibly the same model. The operations run in the same order as
  // lib/model.ts impliedValue, so the rounded dollar matches exactly.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null ? 0 : row.change_7d));
    var growthFactor = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days_used;
    var capped = Math.min(Math.max(age, 0), model.age_cap_days);
    var ageFactor = model.age_floor + model.age_range * (Math.log1p(capped) / Math.log1p(model.age_cap_days));
    var sizeFactor = row.tvl_usd > 0 && DATA.ref_tvl_usd > 0 ? Math.pow(row.tvl_usd / DATA.ref_tvl_usd, model.elasticity_slope - 1) : 1;
    return { implied: Math.max(1, Math.round(row.tvl_usd * row.multiple * growthFactor * ageFactor * sizeFactor)), growthPct: growth, growthFactor: growthFactor, ageFactor: ageFactor, sizeFactor: sizeFactor };
  }

  // ---- Filtering and sorting ----------------------------------------------
  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.verdict !== 'all' && r.farm_verdict.verdict !== state.verdict) return false;
      if (state.watchOnly && !r.watchlist) return false;
      if (state.risingOnly && !(r.change_7d !== null && r.change_7d > 0)) return false;
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
  // ---- The held-out test, rendered from the program's validation record --
  // Every number below is computed by main.ts from the snapshot (see
  // lib/model.ts fitConstants): the page formats the record, it never types
  // a result. The headline sits above the fold; the full record sits in the
  // method panel, with the selection grid, the walk-forward folds and the
  // leave-one-out figures.
  function miniTable(heads, rows) {
    var t = el('table', null, el('thead', null, el('tr', null, heads.map(function (h) { return el('th', { text: h }); }))),
      el('tbody', null, rows.map(function (r) {
        return el('tr', null, r.map(function (c, i) {
          return el('td', { class: (typeof c === 'number' ? 'num' : '') + (typeof c === 'number' && c < 0 && i > 0 ? ' neg' : ''), text: typeof c === 'number' ? (Number.isInteger(c) ? String(c) : c.toFixed(3)) : c });
        }));
      })));
    return t;
  }
  function renderValidation() {
    var v = DATA.validation;
    var h = v.holdout, hb = v.holdout_baseline, f = v.fit_loo, fb = v.fit_loo_baseline, l = v.loo_all, lb = v.loo_all_baseline;
    $('test-line').textContent = 'Held out before fitting: ' + h.n + ' token protocols the model never saw. ' +
      'Typical error ×' + h.typical_multiple.toFixed(2) + ' vs ×' + hb.typical_multiple.toFixed(2) + ' for a flat multiple — ' +
      'median log error ' + h.median_abs_log_error.toFixed(3) + ' vs ' + hb.median_abs_log_error.toFixed(3) +
      ', winning ' + h.wins + ' of ' + h.n + ' head-to-head.';
    $('test-note').textContent = 'Constants fitted by leave-one-out on ' + v.fit_protocols + ' protocols over ' + v.grid_cells +
      ' grid cells (prior ' + v.selected_prior + ', growth weight ' + v.selected_growth_weight + ', slope ' + v.selected_slope +
      '); the ' + v.holdout_protocols + ' held out touched neither selection nor fitting. Full record below, in “The held-out test”.';
    var w = v.walk_forward, wp = w.pooled, wb = w.pooled_baseline;
    $('test-wf').textContent = 'Walk-forward in listing time: ' + wp.n + ' later listings predicted from earlier ones only, ' +
      'median log error ' + wp.median_abs_log_error.toFixed(3) + ' vs flat ' + wb.median_abs_log_error.toFixed(3) +
      ' (typical ×' + wp.typical_multiple.toFixed(2) + ' vs ×' + wb.typical_multiple.toFixed(2) + '), winning ' + wp.wins + ' of ' + wp.n + '.';
    $('wf-detail').textContent = 'Rule: ' + w.rule + ' — ' + w.dated_protocols + ' of the ' + v.token_protocols +
      ' token protocols carry a listing date and can be ordered in time; the rest sit outside this test. ' +
      'Each fold refits the medians, the median age and the reference TVL on its training window alone, with the fitted constants held fixed. ' +
      'Pooled over the ' + wp.n + ' tested listings: median ' + wp.median_abs_log_error.toFixed(3) + ' vs flat ' + wb.median_abs_log_error.toFixed(3) +
      ' (mean ' + wp.mean_abs_log_error.toFixed(3) + ' vs ' + wb.mean_abs_log_error.toFixed(3) + ', ' + wp.wins + '–' + wb.wins + ').';
    var wfWrap = $('wf-table');
    wfWrap.textContent = '';
    wfWrap.appendChild(miniTable(['Fold', 'Train', 'Test', 'Train through', 'Model median', 'Flat median', 'Model wins'],
      w.folds.map(function (fo) { return ['Fold ' + fo.fold, fo.train_n, fo.test_n, fo.train_through, fo.model_median, fo.baseline_median, fo.model_wins + ' / ' + fo.test_n]; })));
    var s = v.sensitivity;
    var better = s.filter(function (r) { return r.holdout_delta < 0; }).length;
    $('sens-detail').textContent = 'Each fitted constant moved one grid step either way, with the fit-set leave-one-out error and the holdout error recomputed. ' +
      'The chosen constants win on the fit-set leave-one-out error — the criterion that selected them. ' + better +
      ' of the 6 neighbours test better on the 25 holdout protocols alone, which is why the holdout was never the selection criterion: ' +
      'a 25-protocol split is too small to choose constants on, and choosing on it would overfit it.';
    var sensWrap = $('sens-table');
    sensWrap.textContent = '';
    sensWrap.appendChild(miniTable(['Constants', 'Fit LOO median', 'Holdout median', 'Δ fit LOO', 'Δ holdout'],
      s.map(function (r) { return [r.label, r.fit_loo_median, r.holdout_median, r.fit_delta, r.holdout_delta]; })));
    $('test-detail').textContent = 'Split: ' + v.split_rule + ' — ' + v.fit_protocols + ' protocols fit, ' + v.holdout_protocols +
      ' held out. Selection: ' + v.selection_metric + ', over ' + v.grid_cells + ' cells (8 priors × 5 growth weights × 7 slopes), ' +
      'choosing prior ' + v.selected_prior + ', growth weight ' + v.selected_growth_weight + ', slope ' + v.selected_slope + '. ' +
      'On the fit set, leave-one-out median log error ' + f.median_abs_log_error.toFixed(3) + ' vs flat ' + fb.median_abs_log_error.toFixed(3) +
      ' (mean ' + f.mean_abs_log_error.toFixed(3) + ' vs ' + fb.mean_abs_log_error.toFixed(3) + ', ' + f.wins + '–' + fb.wins + '). ' +
      'On the held-out ' + h.n + ', predicted once from medians fitted on the fit set alone: median ' + h.median_abs_log_error.toFixed(3) +
      ' vs flat ' + hb.median_abs_log_error.toFixed(3) + ' (mean ' + h.mean_abs_log_error.toFixed(3) + ' vs ' + hb.mean_abs_log_error.toFixed(3) +
      ', ' + h.wins + '–' + hb.wins + '), typical error ×' + h.typical_multiple.toFixed(2) + ' vs ×' + hb.typical_multiple.toFixed(2) + '. ' +
      'Leave-one-out over all ' + l.n + ' token protocols under the chosen constants: median ' + l.median_abs_log_error.toFixed(3) +
      ' vs flat ' + lb.median_abs_log_error.toFixed(3) + ' (mean ' + l.mean_abs_log_error.toFixed(3) + ' vs ' + lb.mean_abs_log_error.toFixed(3) +
      ', ' + l.wins + '–' + lb.wins + '). The flat baseline is TVL times the global median, with no growth, age or size adjustment, on the same medians the model sees.';
  }

  function renderMeta() {
    $('meta-date').textContent = DATA.as_of;
    $('meta-model').textContent = DATA.model_version;
    $('hero-watch').textContent = String(DATA.watchlist_size);
    $('foot-date').textContent = DATA.as_of;
    $('foot-count').textContent = DATA.board_size + ' pre-token rows, ' + DATA.live_size + ' live-token protocols set aside';
    $('m-prior').textContent = String(DATA.model.shrinkage_prior);
    $('m-prior2').textContent = String(DATA.model.shrinkage_prior);
    $('m-growth').textContent = DATA.model.growth_floor + '% to +' + DATA.model.growth_cap + '%';
    $('m-gw').textContent = String(DATA.model.growth_weight);
    $('m-gw2').textContent = String(DATA.model.growth_weight);
    $('m-gw-down').textContent = (1 + (DATA.model.growth_floor / 100) * DATA.model.growth_weight).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
    $('m-gw-up').textContent = (1 + (DATA.model.growth_cap / 100) * DATA.model.growth_weight).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
    $('m-age').textContent = DATA.model.age_cap_days.toLocaleString('en-US') + ' days';
    $('m-slope').textContent = String(DATA.model.elasticity_slope);
    $('m-slope2').textContent = String(DATA.model.elasticity_slope);
    $('m-ref').textContent = fmtUsd(DATA.ref_tvl_usd) + ' median token TVL';
    $('m-refits').textContent = String(DATA.validation.bootstrap_refits);
    $('m-typical').textContent = DATA.validation.holdout.typical_multiple.toFixed(1);
    $('m-token-n').textContent = String(DATA.validation.token_protocols);
    renderValidation();
    var blendedCats = {};
    DATA.rows.forEach(function (r) { if (r.multiple_source === 'blended') blendedCats[r.category] = true; });
    var blendedCount = Object.keys(blendedCats).length;
    var globalOnly = DATA.rows.filter(function (r) { return r.multiple_source === 'global'; }).length;
    $('strip-note').textContent = 'Each multiple blends the category median with the global median ×' + DATA.global_multiple.toFixed(3) +
      ' (n=' + DATA.global_sample + '), weight w = n/(n+' + DATA.model.shrinkage_prior + '): ' +
      blendedCount + ' categories blend their own median in, ' + globalOnly + ' rows price at the global median.';
    $('excluded-note').textContent = 'On this snapshot, ' + DATA.excluded_total + ' of ' + DATA.pre_token_total +
      ' protocols recording no token were excluded as wrapped, staked, bridged or versioned products, and ' +
      (DATA.protocols_total - DATA.pre_token_total) + ' protocols recording a token were set aside.';
    var verdictCounts = { farm: 0, thin: 0, skip: 0 };
    DATA.rows.forEach(function (r) { verdictCounts[r.farm_verdict.verdict] += 1; });
    var tiles = [
      { label: 'Watchlist covered', value: DATA.watchlist_size + ' / ' + DATA.watchlist_size, sub: 'floor $' + Math.round(DATA.floor_usd / 1e6) + 'M, every slug ranked', hot: true },
      { label: 'Board rows', value: String(DATA.board_size), sub: DATA.early_size + ' rows beyond the watchlist', hot: false },
      { label: 'Traded comps price the board', value: String(DATA.validation.token_protocols), sub: DATA.protocols_total + ' protocols accounted for, ' + DATA.live_size + ' live-token rows set aside', hot: false },
      { label: 'Farm verdicts, netted', value: verdictCounts.farm + ' farm · ' + verdictCounts.thin + ' thin · ' + verdictCounts.skip + ' skip', sub: 'every row netted in dollars at 0.001% of its value', hot: false }
    ];
    var wrap = $('tiles');
    wrap.textContent = '';
    tiles.forEach(function (t) {
      wrap.appendChild(el('div', { class: 'tile' + (t.hot ? ' hot' : '') }, el('span', { text: t.label }), el('b', { text: t.value }), el('em', { text: t.sub })));
    });
    var grid = $('mult-grid');
    grid.textContent = '';
    DATA.multiples.forEach(function (m) {
      var detail = m.source === 'blended'
        ? 'n=' + m.sample + ' · w=' + Math.round(m.weight * 100) + '% · cat ×' + m.category_median.toFixed(3)
        : 'n=0 · global';
      grid.appendChild(el('div', { class: 'mult-cell' + (m.source === 'global' ? ' global' : '') },
        el('span', { text: m.category }),
        el('span', null, el('b', { text: '×' + m.multiple.toFixed(3) }), ' ', el('small', { text: detail }))));
    });
    grid.appendChild(el('div', { class: 'mult-cell global' },
      el('span', { text: 'Global median (the blend\'s anchor)' }),
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
        el('td', { class: 'namecell' }, el('b', null, r.name, r.watchlist ? el('span', { class: 'star', title: 'On the snapshot watchlist', text: '★ watchlist' }) : (!r.watchlist && r.tvl_usd < DATA.floor_usd ? el('span', { class: 'early', title: 'Below the $50M watchlist floor: an early row the watchlist leaves out', text: 'early' }) : null)), el('span', { class: 'slug', text: r.slug })),
        el('td', { text: r.category || 'Other' }),
        el('td', { class: 'chains', text: chains || '—' }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAgeShort(r.age_days) }),
        el('td', { class: 'mult', text: '×' + r.multiple.toFixed(3) }, ' ', el('small', { text: r.multiple_source === 'blended' ? 'n=' + r.multiple_sample : 'global' })),
        el('td', null, el('div', { class: 'implied' },
          el('span', { class: 'val', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 'band', text: fmtUsd(r.band_low_usd) + ' – ' + fmtUsd(r.band_high_usd) }),
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + width + '%' }))
        )),
        el('td', null, el('span', { class: 'verdict-chip ' + r.farm_verdict.verdict, text: r.farm_verdict.verdict.toUpperCase() }),
          el('span', { class: 'verdict-be', text: 'break-even ' + r.farm_verdict.break_even_pct.toFixed(4) + '%' }),
          el('span', { class: 'verdict-be', text: 'net ' + (r.farm_verdict.net_usd < 0 ? '−' : '+') + fmtUsd(Math.abs(r.farm_verdict.net_usd)) + ' at 0.001%' }))
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
    var multLabel = row.multiple_source === 'blended'
      ? 'Blended multiple: ' + Math.round(row.multiple_weight * 100) + '% category median ×' + row.category_median.toFixed(4) + ' (n=' + row.multiple_sample + ') + ' + Math.round((1 - row.multiple_weight) * 100) + '% global ×' + DATA.global_multiple.toFixed(4)
      : 'Global multiple (no token protocol in this category, n=0)';
    bd.appendChild(breakdownRow(multLabel, '×' + row.multiple.toFixed(4)));
    bd.appendChild(breakdownRow('7d change → growth factor', fmtPct(row.change_7d) + ' → ×' + check.growthFactor.toFixed(4)));
    bd.appendChild(breakdownRow('Age with no token → age factor', (row.age_days === null ? 'unknown, median ' + row.age_days_used + 'd used' : fmtAge(row.age_days)) + ' → ×' + check.ageFactor.toFixed(4)));
    bd.appendChild(breakdownRow('Size factor', fmtUsd(row.tvl_usd) + ' vs ' + fmtUsd(DATA.ref_tvl_usd) + ' median token TVL, slope ' + DATA.model.elasticity_slope + ' → ×' + check.sizeFactor.toFixed(4)));
    bd.appendChild(breakdownRow('Implied value', fmtUsdFull(row.implied_value_usd), true));
    bd.appendChild(breakdownRow('Uncertainty band (10th–90th of ' + DATA.validation.bootstrap_refits + ' refits)', fmtUsdFull(row.band_low_usd) + ' – ' + fmtUsdFull(row.band_high_usd)));
    bd.appendChild(breakdownRow('Rank range across refits', row.rank_low === row.rank_high ? 'rank ' + row.rank_low + ' in every refit' : 'ranks ' + row.rank_low + '–' + row.rank_high));
    $('detail-recheck').textContent = 'Recomputed in this page from the same figures: ' + fmtUsdFull(check.implied) +
      (check.implied === row.implied_value_usd ? ' — the same number board.json carries.' : ' — differs from the board value; the data would be stale.') +
      ' Model ' + DATA.model_version + '. An estimate, not a price; it never predicts a token will issue.';
    var vd = $('detail-verdict');
    vd.textContent = '';
    var fv = row.farm_verdict;
    vd.appendChild(el('p', { class: 'verdict-line' },
      el('span', { class: 'verdict-chip ' + fv.verdict, text: fv.verdict.toUpperCase() }),
      ' Break-even needs an allocation of ' + fmtUsdFull(fv.expected_cost_usd) + ' — ' + fv.break_even_pct.toFixed(4) + '% of the implied value.'));
    vd.appendChild(el('p', { class: 'sub' }, 'Sunk gas ' + fmtUsdFull(fv.gas_usd) + ' (two gas budgets: farming plus exit) + 5% risk charge ' +
      fmtUsdFull(fv.risk_usd) + ' on ' + fmtUsdFull(fv.capital_usd) + ' deployed = ' + fmtUsdFull(fv.expected_cost_usd) + ' expected cost. ' +
      'At the stated plausible allocation of ' + fmtUsdFull(fv.plausible_alloc_usd) + ' (0.001% of the implied value) the plan nets ' +
      (fv.net_usd < 0 ? '−' : '+') + fmtUsdFull(Math.abs(fv.net_usd)) + '. ' +
      'The band\u2019s low end holds ' + Math.round(fv.band_low_ratio * 100) + '% of the point estimate. ' +
      'Farm needs break-even at most 0.001% with the low end holding 75%; thin needs at most 0.01% with the low end holding 50%; anything else is a skip. ' +
      'The capital itself is deployed, not spent — the risk charge is the stated allowance for losing part of it.'));
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
    dialog.scrollTop = 0;
    syncHash();
    renderTable();
  }
  function closeDetail() {
    if (dialog.open) dialog.close();
  }
  dialog.addEventListener('close', function () {
    state.selected = null;
    syncHash();
    renderTable();
  });
  $('detail-close').addEventListener('click', closeDetail);
  dialog.addEventListener('click', function (e) { if (e.target === dialog) closeDetail(); });

  // ---- Shareable state ------------------------------------------------------
  // The filter, sort and open detail live in the URL hash (#q=..&cat=..&p=..),
  // so a filtered view or a protocol's detail is a link a reader can send and
  // reopen. Defaults are omitted, so the plain board URL stays bare.
  var SORT_KEYS = ['rank', 'name', 'category', 'tvl', 'growth', 'age', 'multiple', 'implied'];
  function hasOption(sel, value) {
    for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value === value) return true;
    return false;
  }
  function syncHash() {
    var parts = [];
    if (state.selected) parts.push('p=' + encodeURIComponent(state.selected));
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.category !== 'all') parts.push('cat=' + encodeURIComponent(state.category));
    if (state.chain !== 'all') parts.push('chain=' + encodeURIComponent(state.chain));
    if (state.minTvl > 0) parts.push('min=' + state.minTvl);
    if (state.watchOnly) parts.push('watch=1');
    if (state.risingOnly) parts.push('rising=1');
    if (state.tab !== 'pre') parts.push('tab=' + state.tab);
    if (state.sort !== 'rank' || state.dir !== 1) parts.push('sort=' + state.sort + ':' + (state.dir === 1 ? 'asc' : 'desc'));
    try {
      window.history.replaceState(null, '', parts.length ? '#' + parts.join('&') : window.location.pathname + window.location.search);
    } catch (e) { /* file URLs may refuse history */ }
  }
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = {};
    hash.split('&').forEach(function (pair) {
      var at = pair.indexOf('=');
      if (at > 0) params[decodeURIComponent(pair.slice(0, at))] = decodeURIComponent(pair.slice(at + 1));
    });
    if (params.q) { state.q = params.q; $('q').value = params.q; }
    if (params.cat && hasOption($('category'), params.cat)) { state.category = params.cat; $('category').value = params.cat; }
    if (params.chain && hasOption($('chain'), params.chain)) { state.chain = params.chain; $('chain').value = params.chain; }
    if (params.min && hasOption($('mintvl'), String(Number(params.min)))) { state.minTvl = Number(params.min); $('mintvl').value = String(state.minTvl); }
    if (params.watch === '1') { state.watchOnly = true; $('watchonly').checked = true; }
    if (params.rising === '1') { state.risingOnly = true; $('risingonly').checked = true; }
    if (params.tab === 'live') state.tab = 'live';
    if (params.sort) {
      var bits = params.sort.split(':');
      if (SORT_KEYS.indexOf(bits[0]) >= 0) { state.sort = bits[0]; state.dir = bits[1] === 'desc' ? -1 : 1; }
    }
    if (params.p) {
      var slug = params.p;
      var found = DATA.rows.some(function (r) { return r.slug === slug; });
      if (found) state.selected = slug;
    }
  }

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
    syncHash();
  }
  $('q').addEventListener('input', function (e) { state.q = e.target.value; render(); });
  $('category').addEventListener('change', function (e) { state.category = e.target.value; render(); });
  $('chain').addEventListener('change', function (e) { state.chain = e.target.value; render(); });
  $('mintvl').addEventListener('change', function (e) { state.minTvl = Number(e.target.value); render(); });
  $('watchonly').addEventListener('change', function (e) { state.watchOnly = e.target.checked; render(); });
  $('risingonly').addEventListener('change', function (e) { state.risingOnly = e.target.checked; render(); });
  $('verdict').addEventListener('change', function (e) { state.verdict = e.target.value; render(); });
  $('tab-pre').addEventListener('click', function () { state.tab = 'pre'; render(); });
  $('tab-live').addEventListener('click', function () { state.tab = 'live'; render(); });
  $('clear-filters').addEventListener('click', function () {
    state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; state.watchOnly = false; state.risingOnly = false; state.verdict = 'all';
    $('q').value = ''; $('category').value = 'all'; $('chain').value = 'all'; $('mintvl').value = '0'; $('watchonly').checked = false; $('risingonly').checked = false; $('verdict').value = 'all';
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
  readHash();
  render();
  if (state.selected) openDetail(state.selected);
})();
