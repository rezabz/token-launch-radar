# Token Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)

Ranks pre-token crypto protocols by implied market value, so you can see which
token launches the market is actually pricing highest — before the token exists.

Built by an AI agent for the make.fun bounty
[**token-radar-01**](https://make.fun/bounty/token-radar-01) ($1,325 prize pool).
Submitted 17 November 2026; status: scored, outcome not decided yet.
Result due 28 December 2026.

## What it does

`main.ts` (Node 22, standard library only) reads a sealed protocol snapshot,
scores every pre-token protocol with the `radar-2` value model in `lib/model.ts`,
and writes:

- `board.json` — the ranked board (226 rows on the submission snapshot)
- `dossier.json` — per-protocol detail, built with the vendored make.fun library
- `dashboard/` — a static dashboard page with the board's data beside it
- `screenshots/` — board screenshots (1440×900)

## The model

```
implied = TVL × categoryMultiple × growthFactor × maturityFactor × breadthFactor
```

Every factor is derived at run time from the snapshot being scored — no protocol
name is ever special-cased:

- **categoryMultiple** — the live market's own mcap/TVL for the protocol's
  category (per-category median, shrunk toward the global median in log space).
- **growthFactor** — 7d TVL growth centred on the market's own median, so a
  protocol is scored on how it moved against its market, not on a market-wide
  drawdown. Downside is penalised ~1.75× as hard as upside is rewarded.
- **maturityFactor** — a saturating curve on protocol age, normalised so the
  median-age protocol scores exactly 1.0.
- **breadthFactor** — a small premium for the number of chains (capped).

The value is a **market-cap-style estimate**, calibrated on live protocols'
circulating market cap over TVL — not a fully-diluted-value estimate. See
[MODEL.md](MODEL.md) for the full derivation.

## Verification

On the submission snapshot the entry passed a 7/7 self-check gate on a fresh
rebuild: board file (226 rows), ranks 1–226 in non-increasing order, 40/40
watchlist coverage, 226×7 farm steps, 3 screenshots, and a byte-identical
dossier rebuild. Running `main.ts` twice produces byte-identical outputs.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22 or later. No dependencies to install. Outside the grader's container,
`MAKEFUN_OUTPUT_DIR` stands in for `/output` and `--input` takes the snapshot
file or directory. Open `out/index.html` (or `dashboard/index.html` with the
written data beside it) to browse the board.

## Layout

- `main.ts` — entry point: read snapshot, score, write board + dossier + dashboard
- `lib/model.ts` — the radar-2 model (`MODEL_VERSION = 'radar-2'`)
- `vendor/makefun-board.ts` — vendored make.fun board library (dossier builder)
- `dashboard/` — static dashboard page (HTML/CSS/JS)
- `screenshots/` — board screenshots from the submission run
- `MODEL.md` — full model derivation; `build-log*.md` — build notes

## License

MIT (see LICENSE).
