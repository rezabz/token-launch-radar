Build log — token-radar-01 value model + farm plans (radar-2)
Session: 2026-11-17, ~13:31–14:10 Tehran. Agent: model subagent (parent orchestrator).
Scope: entry/lib/model.ts, entry/MODEL.md, this log. No submission, no account created,
wallet file never touched (not read, not printed).

WHAT WAS DONE
1. Read the starter model (starter/lib/model.ts) in full, plus kit.json, starter/main.ts and
   starter/dashboard/app.js (to see which ModelConstants fields the dashboard reads).
2. Analysed the snapshot (input/snapshot.json, 758 protocols, as_of 2026-11-14) with throwaway
   Node scripts in /tmp (analyze.mjs, analyze2.mjs, mult.mjs, diag.mjs, verify.mjs, check2.mjs,
   check3.mjs). Key findings:
   - 133 live protocols with mcap + TVL; global median mcap/TVL 0.186 incl. zeros, 0.246 excl.
     zeros. 15 protocols report mcap exactly $0 (incl. Multichain, Orbit Bridge); excluded from
     calibration (a $0 mcap is not a market valuation). 119 live protocols used.
   - Per-category medians from n=1..15, heavy-tailed (max 400x) -> log-space shrinkage needed.
   - Growth: pre-token median -6.82%, rankable median -5.61%, 79% negative, p1 -29%, p99 +161%,
     max +4448% -> market-centred, clamped relative growth.
   - Age: rankable median 483.5d, p25 201, p75 740, max 1851 -> saturating curve, tau 540.
   - Chains: 65% single-chain; max 176 (Gate, a CEX) -> breadth capped at 10 extra chains.
   - Board population: 289 rankable, 40 watchlist (all rankable), 186 rankable below the $50M
     floor -> board 226. 12 rankable categories had no live multiple with zeros included; with
     zeros excluded, 11 of the 34 board categories fall back to the global median.
3. Design review by Gemini 4 Hydrogen (custom.gemini connector, gemini_chat.py, ~19s). It
   recommended three fixes, all adopted: (a) log-space shrinkage instead of linear (linear
   shrinkage lets an n=1 400x outlier hit the clamp at 8x the global median); (b) centre growth
   on the market median instead of 0% (a market-wide drawdown should not depress the whole
   cohort); (c) normalise maturity at the median age so the typical protocol scores 1.0 (the
   unanchored 0.55-0.98 haircut biased every row ~20% down). It also flagged the mcap-vs-FDV
   mismatch -> the value is labelled market-cap-style in MODEL.md, not FDV.
4. GLM 5.3-flash (custom.zai connector, zai_chat.py) drafted farm-action variants: first call
   burned its 1500-token budget on reasoning and returned nothing; retry at 4000 tokens returned
   20 one-sentence variants (2 per category family) that fed the ACTIONS table in the model.
5. Wrote entry/lib/model.ts fresh (834 lines, file tools only, no copy of the starter). Kept the
   starter's exported interface stable: Snapshot, SnapshotProtocol, ModelConstants, MODEL,
   MODEL_VERSION, BoardRow, RadarRow, LiveRow, RadarData, BoardSummary, FarmStep, ageDays,
   impliedValue, isPreToken, isRankable, buildBoard, liveRows, radarRow, buildRadar,
   parseSnapshot, boardIssue, dataScript, stepText, farmSteps; EARLY_ROWS=186, LIVE_ROWS=24.
   Additions: buildModelContext + ModelContext (runtime-derived multiples/medians), and two
   extra fields on BoardRow.model (growth_relative_pct, breadth_multiplier) and one on RadarRow
   (breadth_multiplier).
6. Wrote entry/MODEL.md (design note with formula, derivation, full category-multiples table,
   row-count choice, farm-plan approach, starter comparison, top 5, open dashboard item).
7. Verified with Node (node /tmp/verify.mjs, imports the real model.ts, builds the board from
   the real snapshot). See VERIFICATION below.

DECISIONS
- Category multiples computed AT RUNTIME from the snapshot's live protocols (not hardcoded), so
  the model re-derives itself for any replacement snapshot.
- Log-space shrinkage, prior weight 4, clamp [0.03, 1.25]; global median 0.246 on this snapshot.
- Growth centred on the rankable median (-5.61%), relative clamp [-40, +80], asymmetric slopes
  0.004 up / 0.007 down. Null change_7d -> category median growth, else population median.
- Maturity saturating exp curve (tau 540), normalised at median age; null listed_at -> median
  age (scores 1.0). MODEL.unknown_age_days = 484 (rounded median).
- Breadth 1 + 0.02*min(chains-1, 10), capped 1.20 (kept small: bridges already carry high
  category multiples partly for being multi-chain).
- Board 226 = 40 watchlist + all 186 early (EARLY_ROWS=186 equals the whole below-floor
  population; starter dropped 26 early rows).
- Farm plans: 7 steps/row, category-specific (13 action families, 2 variants each, slug-hash
  pick -> all 226 core actions distinct), second-chain step for the 83 multi-chain rows,
  hold 60/45/30 days by age, capital $50/$100/$150/$250 by TVL tier, claim-safety step naming
  only the protocol's own published link, never pay to claim.
- Zero-mcap protocols excluded from calibration; sensitivity stated in MODEL.md (global median
  0.246 vs 0.186, Bridge 0.40 vs 0.11).

BUGS FOUND AND FIXED DURING VERIFICATION
- Farm step 2 rendered "$$150": the action template already contains "$" before "{capital}" and
  the replace inserted another "$". Fixed to replace "{capital}" with the bare number.
- MODEL.base_multiple was initially 0.186 (median incl. zero-mcap protocols); corrected to
  0.246 after the zero-mcap exclusion was decided.
- MODEL.md first said 72 multi-chain board rows (that was the >=3-chain rankable count);
  corrected to 83 (>=2 chains on the board).

VERIFICATION (node /tmp/verify.mjs, run 2026-11-17 ~14:05 Tehran, after all fixes)
- MODEL_VERSION radar-2, EARLY_ROWS 186, LIVE_ROWS 24
- Context: globalMultiple 0.2460, medianGrowth -5.61, medianAge 483.5, maturityNorm 0.8162,
  33 categories with live multiples
- boardIssue: null (PASS)
- Board size 226 (40 watchlist + 186 early), live 24
- Watchlist covered 40/40; ranks 1..N true; implied non-increasing true; not all identical;
  all positive whole integers; all slugs in snapshot; all rows pre-token (verified separately:
  board.every pre-token === true)
- Farm step violations 0; 7 steps/row; step length 137-269 chars (gate 20-600)
- Distinct step-2 action texts 226/226; distinct step-3 texts 226/226
- Factor ranges on board: growthMult 0.720-1.320, maturityMult 0.676-1.207,
  breadthMult 1.00-1.20, categoryMult 0.067-1.079
- Null handling: 2 null-change rows use category-median growth; 11 null-age rows score
  maturity 1.0
- Implied distribution: min $397K, median $4.2M, max $1.39B; 1 row shares the top value
- Top 10: 1 steakhouse-financial $1.39B (TVL $2.75B, g -2.2%, age 543, mult 0.405);
  2 gauntlet $820.0M; 3 usdd $243.4M; 4 veda $176.8M; 5 nonce-capital $148.0M;
  6 rockawayx $122.7M; 7 hyperithm $108.9M; 8 k3-capital $97.6M; 9 hive-protocol $88.0M;
  10 bittensor-dtao $85.3M

OPEN ITEMS (for the parent / dashboard owner)
- starter/dashboard/app.js lines 32-36 and 290 recompute the STARTER formula from the model
  constants and print it as the model. They must be updated to the radar-2 formula (per-row
  category multiple is already in row.model.base_multiple; growth_relative_pct and
  breadth_multiplier are in the row too), or the dashboard's sandbox display will disagree
  with the board. ModelConstants field names were kept so nothing crashes; only the formula
  text and the recompute are stale. Noted in MODEL.md as well.
- main.ts / dashboard / screenshots are outside this task's scope and were not built here;
  entry/lib and entry/dashboard are otherwise still the empty scaffold (only vendor/ was
  present).
- The "all pre-token" line in the verify script's stdout renders as <redacted> in the tool
  output (the boolean prints fine in a separate check: true). No data issue; noted only so
  nobody re-runs it wondering about the redaction.
