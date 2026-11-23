[![make.fun](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/wildanfadhil888-collab/btc-race-24h-20261123-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/wildanfadhil888-collab/btc-race-24h-20261123-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)

# btc-race-24h-20261123-0511 — DipBounceTrader

A cbBTC trading bot for the [make.fun bounty](https://make.fun/bounty/btc-race-24h-20261123-0511):
race a BTC bot live for 24 hours on 1-minute on-chain prices, $1,000 paper start,
long only.

## Strategy

Dip buyer with bounce confirmation — it waits for one green minute after a
sharp washout instead of catching the knife mid-fall, then rides the bounce
with a trailing exit. Two entries:

- **FLUSH** — 5-min drop ≥ 80 bps or 60-min drop ≥ 200 bps, confirmed by a
  green latest minute.
- **PULLBACK** — 5-min dip ≥ 60 bps inside an intact uptrend (60-min return
  ≥ +50 bps), also confirmed by a green minute.

One position at a time, 95% of cash. Exits: trailing stop once up > 30 bps
(sell on a ≥ 50 bps pullback from the post-entry high), a wide −300 bps stop,
and a 180-bar time cap. 20-bar rest after a sale. If nothing has traded by
bar 1200 the entry bars loosen once (50 / 120 bps) so the window cannot end
with zero trades.

All maths is integer (`bigint` closes, bps by integer division). No clock, no
randomness, no network, no files outside the repo — two runs on the same bars
answer identically.

## Local grades (grade-local, process driver)

| window | BTC move | net PnL | trades | max DD |
| --- | --- | --- | --- | --- |
| 20261123-0511 dev | +3.63% | **+$17.74** | 4 fills (2 round trips) | 1.05% |
| 20261115-0828 dev | −4.00% | +$31.55 | 2 fills (1 round trip) | 1.40% |
| 20261113-2314 dev | −4.92% | −$1.13 | 2 fills (1 round trip) | 1.60% |

Determinism verified: two grade-local runs on the dev window produce
byte-identical action logs.

## Layout

- `main.ts` — the bot (Node 22, erasable TypeScript).
- `vendor/makefun-bars.ts` — the kit SDK shim, byte-for-byte.
- `LICENSE` — MIT.
