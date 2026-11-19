# Build log — Token Radar dashboard (token-radar-01)
Date: 2026-11-17 (Asia/Tehran)
Author: dashboard subagent (Muse)

## What was built
Files (written by hand with the file tools, NOT copied from the starter):
- entry/dashboard/index.html  (1,569 bytes)
- entry/dashboard/app.css     (12,274 bytes)
- entry/dashboard/app.js      (29,814 bytes)
- TOTAL: 43,657 bytes (cap 60,000 for the dossier text; gate is also <=4 MiB / <=400 files — 3 files, well inside)

index.html loads ../data.js then app.js, same pattern as the starter.

## Design decisions
- Dark "radar" theme, deliberately distinct from the starter's light/plain look:
  deep ink-navy background (#070d1d) with subtle radial glows, panels #101c36,
  one amber/gold accent (#f2b33d) for brand, implied value, rank highlights and
  the radar pulse dot; green (#3ddc97) / red (#ff6b6b) ONLY for 7d growth
  direction and match/mismatch states. System font stack only, no external
  assets, no network at render.
- Header: brand + tagline, then a 6-cell stat strip (watchlist, board rows,
  early radar, live set aside, TOTAL implied value = sum of all board rows,
  snapshot date/source/model version).
- Top-3 podium row (gold/silver/bronze medals, clickable to open the detail
  drawer for that protocol).
- Model explainer card: the formula in plain words + the model's own constants
  rendered from data.js (base_multiple, growth_weight, growth clamp, maturity
  floor/range/days, unknown age, model version) as chips, so the page can never
  disagree with the snapshot's model.
- Board: sortable table (rank, protocol, category+chains, TVL, 7d, age, implied
  value with a proportional bar, token status). Rank badges: 1 gold, 2 silver,
  3 bronze, 4-10 amber outline. Rows are clickable (Enter/Space too).
- Controls: text search, category filter, chain filter, min-TVL filter
  (Any / >=$50M / >=$100M / >=$500M / >=$1B), pre-token / already-trading
  toggle, clear-filters button, live row count.
- Live section: separate table, sorted by market cap, clearly labelled
  "Already trading — set aside from the ranking"; market cap shown as a market
  fact, no implied value, no farm plan, never mixed into the ranking.
- Detail drawer (right side, with scrim, Escape closes): protocol facts grid,
  model breakdown for THAT protocol (TVL x base multiple, clamped 7d change ->
  growth multiplier, age -> maturity multiplier, recomputed implied value vs
  the board value, with a match/mismatch note), and a full farm plan:
  6 steps, each with per-step cost and time, plus a totals line (capital at
  risk, gas estimate, hold days, active minutes). Farm plan regenerated per
  protocol from its own fields using the model's documented rules: category
  decides the action, TVL tier decides the capital ($250 / $150 / $100 / $50),
  age decides the hold (60 / 45 / 30 days, 30 if unknown). No protocol is
  special-cased.
- Footer: methodology (watchlist floor, early radar, live separation), data
  source (DefiLlama, as-of date), and the two disclaimers: protocols "record
  no token" (the DefiLlama record is not proof no token exists), and implied
  value is this entry's own model claim — not a price, prediction, or make.fun
  figure. Wording "records no token" used everywhere; "has no token" nowhere.
- Robustness: if window.RADAR is missing or malformed, the page renders a
  clear "Snapshot data not loaded" error panel instead of a blank page.
  All rendering is from data.js; the JS is dependency-free.

## Screenshot URLs / hashes (relative to entry/dashboard/index.html)
Served from the entry folder (data.js sits next to dashboard/), e.g.
  file or server path: .../entry/dashboard/index.html
(a) Full board (default state):
    index.html
(b) Detail view open (rank 1 — works without knowing any slug; slug form
    also works):
    index.html#detail=1
    index.html#detail=<slug>   e.g. index.html#detail=<top-row slug from data.js>
(c) Filtered view (TVL >= $1B — works regardless of category names):
    index.html#minTvl=1000000000
    Other supported hashes: #category=<category name> (alias #filter=<name>),
    #chain=<chain>, #q=<search text>, #tab=live (already-trading view),
    #sort=<rank|name|tvl|growth|age|implied>, #p=<slug> (starter alias).
    Hash state is written back as the user interacts (search/filters/sort/
    detail), so any on-screen state is shareable via the URL bar.

## Verification (all run 2026-11-17)
1. node --check app.js -> OK (no syntax errors).
2. grep -r -c 'https\?://' index.html app.css app.js -> 0 hits in all three
   files (no http:// or https:// substring anywhere in the dashboard).
3. Byte total: index.html 1,569 + app.css 12,274 + app.js 29,814 = 43,657
   bytes, under the 60,000-byte dossier cap.
4. Node smoke test (/tmp/radar-smoke.js — minimal DOM stub + fake RADAR
   with 3 pre-token rows + 2 live rows, implied values computed with the
   model's own formula):
   - Full render: stats (watchlist 40, as-of 2026-11-14), podium, model
     formula + constants, all 3 board rows, "records no token" wording,
     footer disclaimers. Total implied $597,027,397; rank-1 implied
     $475,000,000. PASSED.
   - Missing-data path: window.RADAR absent -> "Snapshot data not loaded"
     error state renders, no blank page. PASSED.
   - Hash states: #detail=1 opens the rank-1 drawer (facts + model
     breakdown + farm plan + totals line). #detail=beta-dex opens by slug.
     #tab=live shows the live panel (Live One present) and hides the board.
     #minTvl=1000000000 and #category=Lending filter the board correctly.
     All PASSED. (Two early harness failures were harness assertions that
     assumed the full board visible under a filter/live tab — the app
     behaviour was correct in both cases; assertions were fixed.)
   Note: the smoke test is a DOM-stub simulation, not a real browser render.
   Real 1440x900 screenshots still need to be taken once data.js exists.

## Gemini code review — NOT done (blocked, optional step)
- Read custom.gemini CONNECTOR.md first; probe call failed with HTTP 503
  (Service Unavailable) from the Gemini API; one retry hung for >2 minutes
  and was killed. No review was obtained. The dashboard was verified by
  the static checks and smoke tests above instead. Retry the review later
  if desired — it is not required for the build.

## Open items / notes for the parent agent
- entry/data.js does not exist yet at build time (model subagent still to
  write it). The dashboard was verified against fake RADAR data matching
  the documented shape; re-run the smoke test or take real screenshots
  once the real data.js lands, and confirm the top-row slug for the
  #detail=<slug> screenshot form.
- Real-browser 1440x900 screenshots (a/b/c above) still need to be taken;
  the hash mechanisms for all three states are implemented and stub-tested.
- No submission made, no account created, wallet file never touched.
