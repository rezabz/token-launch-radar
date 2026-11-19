// Token Radar dashboard. Reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked pre-token board, the already-trading list set aside from
// it, and a per-protocol detail drawer with the model breakdown and farm plan.
// No network: everything shown comes from data.js. No dependencies.
(function () {
  'use strict';

  var app = document.getElementById('app');
  var DATA = window.RADAR || null;

  // ---- formatting -----------------------------------------------------------
  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---- the model, recomputed from the row's own stored factors ----------------
  // radar-2: implied = round(tvl x categoryMultiple x growthMult x maturityMult x breadthMult)
  // Each row carries its own full-precision factors in data.js: base_multiple is the row's own
  // category multiple (the live market's mcap/TVL for its category, NOT the global fallback),
  // and the three multipliers are the exact values the board was scored with. Recomputing in
  // this order, with Math.round and a floor of 1, matches the board value exactly.
  function factors(row, m) {
    var base = row.base_multiple === undefined || row.base_multiple === null ? m.base_multiple : row.base_multiple;
    var growthMult = row.growth_multiplier;
    var maturity = row.maturity_multiplier;
    var breadth = row.breadth_multiplier;
    var implied = Math.max(1, Math.round(row.tvl_usd * base * growthMult * maturity * breadth));
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    return { base: base, growthMult: growthMult, maturity: maturity, breadth: breadth, implied: implied, age: age, ageKnown: row.age_days !== null && row.age_days !== undefined, change: row.change_7d };
  }

  // ---- farm totals ------------------------------------------------------------
  // The farm steps themselves come from the row (the model's real 7 steps, carried in
  // data.js) and are shown verbatim. Only the totals line is computed here, from the same
  // capital and hold rules the model uses: TVL tier decides the capital, age decides the hold.
  // Gas and active time add up the model's own step costs and times: setup $3 + $8/$4 gas,
  // second action $3 gas, $2 of gas a week, 5 + 15 + 10 + 10 a week + 10 + 5 active minutes.
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function farmTotals(p) {
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var setupGas = capital >= 150 ? 8 : 4;
    var weeks = Math.max(1, Math.ceil(hold / 7));
    var gas = 3 + setupGas + 3 + 2 * weeks;
    var activeMin = 5 + 15 + 10 + 10 * weeks + 10 + 5;
    return { capital: capital, hold: hold, gas: gas, activeMin: activeMin };
  }

  // ---- state + hash ---------------------------------------------------------
  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('filter')) state.category = params.get('filter'); // alias
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('minTvl')) state.minTvl = parseFloat(params.get('minTvl')) || 0;
    if (params.get('tab')) state.tab = params.get('tab') === 'live' ? 'live' : 'pre-token';
    if (params.get('sort')) state.sort = params.get('sort');
    if (params.get('detail')) state.selected = params.get('detail');
    if (params.get('p')) state.selected = params.get('p'); // starter alias
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.minTvl > 0) params.set('minTvl', String(state.minTvl));
    if (state.tab === 'live') params.set('tab', 'live');
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.selected) params.set('detail', state.selected);
    var next = params.toString();
    var url = next ? '#' + next : window.location.pathname + window.location.search;
    if (window.location.hash !== (next ? '#' + next : '')) window.history.replaceState(null, '', url);
  }
  function findRow(sel) {
    if (!sel) return null;
    var bySlug = DATA.rows.filter(function (r) { return r.slug === sel; })[0];
    if (bySlug) return bySlug;
    var n = parseInt(sel, 10);
    if (!isNaN(n)) return DATA.rows.filter(function (r) { return r.rank === n; })[0] || null;
    return null;
  }

  // ---- tiny DOM helper ------------------------------------------------------
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
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

  // ---- error state (data.js missing or malformed) ---------------------------
  function renderError(msg) {
    app.setAttribute('aria-busy', 'false');
    var main = document.getElementById('main');
    if (main) main.innerHTML = '';
    var box = el('div', { class: 'panel' },
      el('div', { class: 'empty' },
        el('h2', { text: 'Snapshot data not loaded' }),
        el('p', { text: msg }),
        el('p', { class: 'sub', text: 'This page reads its data from data.js next to the dashboard folder. Put the snapshot file in place and reload.' })
      ));
    if (main) main.appendChild(box);
  }
  if (!DATA || !Array.isArray(DATA.rows) || !DATA.model) {
    renderError('window.RADAR is missing or incomplete — no rows or model constants were found.');
    return;
  }

  // ---- filtering / sorting --------------------------------------------------
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (state.minTvl > 0 && r.tvl_usd < state.minTvl) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'rank') { av = a.rank; bv = b.rank; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : 1;
    });
  }
  function totalImplied() {
    return DATA.rows.reduce(function (s, r) { return s + (r.implied_value_usd || 0); }, 0);
  }

  // ---- sections -------------------------------------------------------------
  function renderStats() {
    var host = document.getElementById('stats');
    host.textContent = '';
    var cells = [
      ['Watchlist', String(DATA.watchlist_size), 'TVL floor ' + fmtUsd(DATA.floor_usd)],
      ['Board rows', String(DATA.board_size), 'pre-token, scored'],
      ['Early radar', String(DATA.early_size), 'below the floor'],
      ['Live set aside', String(DATA.live_size), 'already trading'],
      ['Total implied value', fmtUsd(totalImplied()), 'sum of all board rows'],
      ['Snapshot', DATA.as_of, (DATA.source || 'DefiLlama') + ' · ' + DATA.model_version]
    ];
    cells.forEach(function (c, i) {
      host.appendChild(el('div', { class: 'stat' },
        el('div', { class: 'k', text: c[0] }),
        el('div', { class: 'v' + (i === 4 ? ' amber' : ''), text: c[1] }),
        el('div', { class: 'd', text: c[2] })));
    });
  }

  function renderPodium() {
    var host = document.getElementById('podium');
    host.textContent = '';
    var top = DATA.rows.slice().sort(function (a, b) { return a.rank - b.rank; }).slice(0, 3);
    var medals = ['1', '2', '3'];
    top.forEach(function (r, i) {
      host.appendChild(el('button', { class: 'pod m' + (i + 1), type: 'button', onclick: function () { openDetail(r.slug); } },
        el('span', { class: 'medal', text: medals[i] }),
        el('span', null,
          el('span', { class: 'nm', text: r.name }),
          el('span', { class: 'ct', text: (r.category || 'Other') + ' · ' + fmtUsd(r.tvl_usd) + ' TVL' })),
        el('span', { class: 'iv', html: esc(fmtUsd(r.implied_value_usd)) + '<small>implied value</small>' })));
    });
  }

  function renderModel() {
    var m = DATA.model;
    var host = document.getElementById('model');
    host.textContent = '';
    host.appendChild(el('div', { class: 'panel-head' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { text: 'One formula scores every protocol from the snapshot figures. No name is special-cased and no row is hand-picked — the page recomputes each row and checks it against the board.' })));
    var body = el('div', { class: 'model-body' });
    body.appendChild(el('div', { class: 'formula', text:
      'implied = round( TVL x category multiple x growth factor x maturity factor x breadth factor )' }));
    var consts = el('div', { class: 'consts' });
    [['global fallback multiple', m.base_multiple], ['growth upside weight', m.growth_weight], ['growth downside weight', m.growth_down_weight],
      ['growth clamp', m.growth_floor + ' … ' + m.growth_cap], ['relative growth clamp', m.growth_rel_floor + ' … ' + m.growth_rel_cap],
      ['maturity floor', m.maturity_floor], ['maturity range', m.maturity_range], ['maturity tau', m.maturity_days + 'd'],
      ['category clamp', m.category_floor + ' … ' + m.category_cap], ['shrink prior', m.shrink_prior],
      ['breadth per chain', m.breadth_per_chain], ['breadth cap', m.breadth_max_chains + ' chains'],
      ['unknown age', m.unknown_age_days + 'd'], ['model', DATA.model_version]].forEach(function (c) {
      consts.appendChild(el('span', { class: 'chip', html: esc(c[0]) + ' <b>' + esc(String(c[1])) + '</b>' }));
    });
    body.appendChild(consts);
    body.appendChild(el('p', { text: 'Each protocol carries its own category multiple: the live market\u2019s median market-cap/TVL for its category, shrunk toward the global fallback multiple in log space (prior ' + m.shrink_prior + ') and clamped to ' + m.category_floor + '–' + m.category_cap + '; a category with no live protocol falls back to the global multiple. Growth is measured against the market, not against zero: the snapshot\u2019s median seven-day growth is subtracted first, the relative move is clamped to ' + m.growth_rel_floor + '…' + m.growth_rel_cap + '%, and upside counts at ' + m.growth_weight + ' per point while downside counts at ' + m.growth_down_weight + ' per point. Maturity is a saturating curve (' + m.maturity_floor + ' + ' + m.maturity_range + ' x (1 − exp(−age/' + m.maturity_days + 'd))) normalised so the median-age protocol scores 1.0; an unlisted age uses ' + m.unknown_age_days + ' days. Breadth adds ' + m.breadth_per_chain + ' per extra chain, capped at ' + m.breadth_max_chains + ' extra chains.' }));
    body.appendChild(el('p', { text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed — the best record of how long it has run while recording no token. The early radar is every pre-token protocol below the watchlist floor, and the live-token protocols are set aside with their market caps shown instead of a model value.' }));
    host.appendChild(body);
  }

  var TVL_TIERS = [[0, 'Any TVL'], [5e7, '≥ $50M'], [1e8, '≥ $100M'], [5e8, '≥ $500M'], [1e9, '≥ $1B']];
  function renderControls() {
    var host = document.getElementById('controls');
    host.textContent = '';
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (a, r) { return a.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); renderBoard(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); }));
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); renderBoard(); });
    var chn = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); }));
    chn.addEventListener('change', function () { state.chain = chn.value; writeHash(); renderBoard(); });
    var tvl = el('select', { id: 'minTvl', 'aria-label': 'Minimum TVL' },
      TVL_TIERS.map(function (t) { return el('option', { value: String(t[0]), text: t[1], selected: state.minTvl === t[0] ? 'selected' : null }); }));
    tvl.addEventListener('change', function () { state.minTvl = parseFloat(tvl.value) || 0; writeHash(); renderBoard(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token board', onclick: function () { state.tab = 'pre-token'; writeHash(); renderBoard(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Already trading', onclick: function () { state.tab = 'live'; writeHash(); renderBoard(); } });
    host.appendChild(el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search));
    host.appendChild(el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat));
    host.appendChild(el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chn));
    host.appendChild(el('div', { class: 'field' }, el('label', { for: 'minTvl', text: 'Min TVL' }), tvl));
    host.appendChild(el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)));
    host.appendChild(el('button', { class: 'btn', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; writeHash(); render(); } }));
    host.appendChild(el('span', { class: 'count', id: 'count' }));
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } writeHash(); renderBoard(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ↓' : ' ↑' }) : null));
  }
  function rankBadge(rank) {
    var cls = 'rank-badge' + (rank === 1 ? ' r1' : rank === 2 ? ' r2' : rank === 3 ? ' r3' : rank <= 10 ? ' r10' : '');
    return el('span', { class: cls, text: String(rank) });
  }
  function chainLabel(r) {
    return (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') : '—');
  }

  function renderBoard() {
    var wrap = document.getElementById('table-wrap');
    var livePanel = document.getElementById('live-panel');
    var boardPanel = document.getElementById('board-panel');
    renderControls();
    var count = document.getElementById('count'); // after renderControls: it rebuilds #count
    if (state.tab === 'live') {
      boardPanel.hidden = true;
      livePanel.hidden = false;
      livePanel.textContent = '';
      livePanel.appendChild(el('div', { class: 'panel-head' },
        el('h2', { text: 'Already trading — set aside from the ranking' }),
        el('p', { text: 'These ' + DATA.live.length + ' protocols record a token and already trade. Their market cap is a market fact, not a model estimate, so they are never mixed into the pre-token ranking.' })));
      livePanel.appendChild(el('p', { class: 'live-note', text: 'Live rows are shown for separation only: no implied value is computed for them and no farm plan applies.' }));
      var lt = el('div', { class: 'table-wrap' });
      var ltbody = el('tbody');
      DATA.live.slice().sort(function (a, b) { return (b.mcap_usd || 0) - (a.mcap_usd || 0); }).forEach(function (r) {
        ltbody.appendChild(el('tr', null,
          el('td', null, el('span', { class: 'pill live', text: 'Live token' })),
          el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + chainLabel(r) }))),
          el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
          el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d !== undefined && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
          el('td', { class: 'num', text: fmtUsd(r.mcap_usd) })));
      });
      lt.appendChild(el('table', null,
        el('thead', null, el('tr', null,
          el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }),
          el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }))),
        ltbody));
      livePanel.appendChild(lt);
      if (count) count.textContent = DATA.live.length + ' live protocols';
      return;
    }
    livePanel.hidden = true;
    boardPanel.hidden = false;
    wrap.textContent = '';
    var list = sortedRows(filteredRows());
    var max = list.length ? (list[0].implied_value_usd || 1) : 1;
    if (count) count.textContent = list.length + ' of ' + DATA.board_size + ' rows shown';
    if (list.length === 0) {
      wrap.appendChild(el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or loosen a filter to see the board again.' }),
        el('button', { class: 'btn', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; writeHash(); render(); } })));
      return;
    }
    var tbody = el('tbody');
    list.forEach(function (r) {
      var g = r.change_7d === null || r.change_7d === undefined ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', null, rankBadge(r.rank)),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + chainLabel(r) }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + g, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }))),
        el('td', null, el('span', { class: 'pill', text: 'records no token' })));
      tbody.appendChild(tr);
    });
    wrap.appendChild(el('table', null,
      el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan.' }),
      el('thead', null, el('tr', null,
        sortHeader('rank', 'Rank'), sortHeader('name', 'Protocol'), sortHeader('tvl', 'TVL'),
        sortHeader('growth', '7d'), sortHeader('age', 'Age'), sortHeader('implied', 'Implied value'),
        el('th', { scope: 'col', text: 'Token' }))),
      tbody));
  }

  function renderFoot() {
    var host = document.getElementById('foot');
    host.textContent = '';
    host.appendChild(el('h2', { text: 'Methodology and disclaimers' }));
    host.appendChild(el('p', { text: 'Watchlist: every protocol in the ' + (DATA.source || 'DefiLlama') + ' index with at least ' + fmtUsd(DATA.floor_usd) + ' of TVL that records no token, as of ' + DATA.as_of + '. The early radar adds pre-token protocols below that floor, ranked the same way. Implied value is this entry\u2019s own model claim — it is not a price, a prediction, or a figure from make.fun — and it is computed from TVL, its category\u2019s live market multiple, seven-day growth against the market, age since listing and chain count. Live-token protocols are listed separately with market caps and never enter the ranking.' }));
    host.appendChild(el('p', { class: 'disc', text: '“Records no token” means the DefiLlama record for the protocol lists no token; that record is not proof that no token exists. Farm plans are generic derivations from category, TVL tier and age — they are not investment advice, and airdrops are never guaranteed. Data source: ' + (DATA.source || 'DefiLlama') + ', snapshot ' + DATA.as_of + '. Model ' + DATA.model_version + '.' }));
  }

  // ---- detail drawer --------------------------------------------------------
  var drawer = document.getElementById('drawer');
  var scrim = document.getElementById('scrim');
  function closeDetail() {
    state.selected = null;
    drawer.hidden = true;
    scrim.hidden = true;
    writeHash();
    renderBoard();
  }
  scrim.addEventListener('click', closeDetail);

  function openDetail(sel) {
    var row = findRow(sel);
    if (!row) return;
    state.selected = row.slug;
    writeHash();
    var m = DATA.model;
    var f = factors(row, m);
    var totals = farmTotals(row);
    var match = f.implied === row.implied_value_usd;
    drawer.textContent = '';
    drawer.appendChild(el('div', { class: 'drawer-head' },
      el('div', null,
        el('span', { class: 'rankline', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · records no token' }),
        el('h2', { id: 'drawer-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + ((row.chains || []).join(', ') || 'an unnamed chain') + (row.listed_at ? ' · listed ' + row.listed_at : '') })),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: closeDetail })));
    var facts = el('div', { class: 'facts-grid' });
    [['TVL', fmtUsd(row.tvl_usd)], ['Market cap', 'n/a — pre-token'], ['7-day growth', fmtPct(row.change_7d)],
      ['Age', fmtAge(row.age_days) + (f.ageKnown ? '' : ' (assumed ' + m.unknown_age_days + 'd)')],
      ['Chains', (row.chains || []).join(', ') || '—'], ['Category', row.category || 'Other']].forEach(function (c) {
      facts.appendChild(el('div', { class: 'fact' }, el('div', { class: 'k', text: c[0] }), el('div', { class: 'v', text: c[1] })));
    });
    drawer.appendChild(el('section', { class: 'dsec' }, el('h3', { text: 'Protocol facts' }), facts));
    var eq = el('div', { class: 'eq' });
    eq.appendChild(el('div', null, el('span', { text: 'TVL x category multiple (' + f.base.toFixed(4) + ')' }), el('b', { text: fmtUsd(row.tvl_usd * f.base) })));
    eq.appendChild(el('div', null, el('span', { text: '7d change ' + fmtPct(f.change) + ' → growth factor (vs the market median)' }), el('b', { text: 'x ' + f.growthMult.toFixed(4) })));
    eq.appendChild(el('div', null, el('span', { text: 'Age ' + f.age + 'd → maturity factor' }), el('b', { text: 'x ' + f.maturity.toFixed(4) })));
    eq.appendChild(el('div', null, el('span', { text: (row.chains || []).length + ' chain' + ((row.chains || []).length === 1 ? '' : 's') + ' → breadth factor' }), el('b', { text: 'x ' + f.breadth.toFixed(4) })));
    eq.appendChild(el('div', { class: 'total' }, el('span', { text: 'Implied value (recomputed)' }), el('b', { text: fmtUsd(f.implied) })));
    eq.appendChild(el('div', null, el('span', { text: 'Board value' }), el('b', { text: fmtUsd(row.implied_value_usd) })));
    drawer.appendChild(el('section', { class: 'dsec' }, el('h3', { text: 'Model breakdown' }), eq,
      el('p', null, match
        ? el('span', { class: 'match-ok', text: '✓ Recomputed value matches the board exactly.' })
        : el('span', { class: 'match-bad', text: '⚠ Recomputed value differs from the board — the snapshot data may be stale.' })),
      el('p', { text: 'Implied value is this entry\u2019s claim from the snapshot figures, not a price and not a make.fun figure.' })));
    var ol = el('ol', { class: 'steps' });
    (row.farm_steps || []).forEach(function (s) {
      ol.appendChild(el('li', null, el('span', { text: s })));
    });
    drawer.appendChild(el('section', { class: 'dsec' }, el('h3', { text: 'Farm plan' }), ol,
      el('div', { class: 'totals', html:
        'Totals — capital at risk: <b>$' + totals.capital + '</b> · gas ≈ <b>$' + totals.gas + '</b> · hold: <b>' + totals.hold + ' days</b> · active time ≈ <b>' + totals.activeMin + ' min</b>' }),
      el('p', { text: 'Capital is set by the TVL tier, the hold by the protocol\u2019s age, the action by its category. Airdrops are never guaranteed.' })));
    drawer.hidden = false;
    scrim.hidden = false;
    renderBoard();
  }

  // ---- boot -----------------------------------------------------------------
  function render() {
    app.setAttribute('aria-busy', 'false');
    renderStats();
    renderPodium();
    renderModel();
    renderBoard();
    renderFoot();
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('hashchange', function () { readHash(); render(); });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !drawer.hidden) closeDetail(); });
})();
