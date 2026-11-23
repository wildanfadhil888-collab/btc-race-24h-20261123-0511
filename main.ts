// DipBounceTrader — a cbBTC dip buyer for the make.fun 24h BTC race.
//
// Idea: BTC rarely falls in a straight line. After a sharp washout the tape
// usually pauses, prints one green minute, and then bounces. This bot waits
// for that green minute instead of catching the knife mid-fall, then rides
// the bounce with a trailing exit. Two ways in:
//
//   FLUSH   — the market just fell hard (5-min drop >= 80 bps or 60-min
//             drop >= 200 bps) AND the latest minute closed up.
//   PULLBACK — a smaller 5-min dip (>= 60 bps) inside an intact uptrend
//             (60-min return >= +50 bps), again confirmed by a green minute.
//
// One position at a time, 95% of cash. Exits: a trailing stop once the trade
// is up > 30 bps (sell on a >= 50 bps pullback from the post-entry high),
// a wide -300 bps stop, and a 240-bar time cap. After a sale the bot rests
// 20 bars. If nothing has traded by bar 1200 the entry bars are loosened
// once (50 / 120 bps) so the window cannot end with zero trades.
//
// All maths is integer (bigint closes, bps by integer division). No clock,
// no randomness, no network, no files outside the repo: two runs on the
// same bars answer identically.

import { runBars } from "./vendor/makefun-bars.ts";
import type { BarsState, Batch, OrderInput } from "./vendor/makefun-bars.ts";

const SYMBOL = "CBBTC";

// Entry bars (basis points).
const FLUSH_FIVE = 80;
const FLUSH_HOUR = 200;
const PULLBACK_FIVE = 60;
const PULLBACK_TREND = 50;
const LOOSE_FIVE = 50;
const LOOSE_HOUR = 120;

// Exit bars.
const TRAIL_ARM = 30;
const TRAIL_GIVEBACK = 50;
const STOP_LOSS = -300;
const MAX_HOLD_BARS = 240;
const REST_BARS = 20;

// Insurance + late-window guard.
const INSURANCE_BAR = 1200;
const LAST_ENTRY_BAR = 1320;

// How much of the cash a buy spends, in percent, and the slippage cap.
const BUY_PCT = 95n;
const SLIP_BPS = 100;

function bpsMove(from: bigint, to: bigint): bigint {
  if (from <= 0n) return 0n;
  return ((to - from) * 10000n) / from;
}

class DipBounceTrader {
  // Rolling window of closes, oldest first; capped a little past 61 bars.
  private closes: bigint[] = [];
  private boughtAtBar = -1;
  private boughtAtPrice = 0n;
  private bestSinceBuy = 0n;
  private restUntilBar = -1;
  private everBought = false;

  private remember(close: bigint): void {
    this.closes.push(close);
    if (this.closes.length > 64) this.closes.shift();
  }

  private closeBarsAgo(n: number): bigint | null {
    const idx = this.closes.length - 1 - n;
    return idx < 0 ? null : this.closes[idx]!;
  }

  onBatch(state: BarsState, batch: Batch): OrderInput[] | void {
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return;
    const close = BigInt(bar.c);
    this.remember(close);
    const seq = batch.seq;

    const held = state.positions.get(SYMBOL);
    const holding = held !== undefined && held.qty > 0n;

    if (holding) {
      if (close > this.bestSinceBuy) this.bestSinceBuy = close;
      const gain = bpsMove(this.boughtAtPrice, close);
      const giveback = bpsMove(close, this.bestSinceBuy);
      const heldBars = seq - this.boughtAtBar;
      const stopHit = gain <= BigInt(STOP_LOSS);
      const trailHit = gain > BigInt(TRAIL_ARM) && giveback >= BigInt(TRAIL_GIVEBACK);
      const stale = heldBars >= MAX_HOLD_BARS;
      if (stopHit || trailHit || stale) {
        this.restUntilBar = seq + REST_BARS;
        return [
          {
            side: "sell",
            symbol: SYMBOL,
            qty: held.qty,
            max_slippage_bps: SLIP_BPS,
          },
        ];
      }
      return;
    }

    if (state.warmingUp) return;
    if (seq < this.restUntilBar) return;
    if (seq > LAST_ENTRY_BAR) return;
    if (this.closes.length < 61) return;

    const fiveAgo = this.closeBarsAgo(5)!;
    const hourAgo = this.closeBarsAgo(60)!;
    const prevClose = this.closeBarsAgo(1)!;
    const dropFive = -bpsMove(fiveAgo, close);
    const dropHour = -bpsMove(hourAgo, close);
    const trendHour = bpsMove(hourAgo, close);
    const greenMinute = close > prevClose;

    const loosened = seq >= INSURANCE_BAR && !this.everBought;
    const flushFive = loosened ? LOOSE_FIVE : FLUSH_FIVE;
    const flushHour = loosened ? LOOSE_HOUR : FLUSH_HOUR;

    const flush = (dropFive >= BigInt(flushFive) || dropHour >= BigInt(flushHour)) && greenMinute;
    const pullback =
      dropFive >= BigInt(PULLBACK_FIVE) && trendHour >= BigInt(PULLBACK_TREND) && greenMinute;

    if (!flush && !pullback) return;

    const spend = (state.cash * BUY_PCT) / 100n;
    if (spend < BigInt(state.hello.fees.min_notional_quote_units)) return;
    this.boughtAtBar = seq;
    this.boughtAtPrice = close;
    this.bestSinceBuy = close;
    this.everBought = true;
    return [
      {
        side: "buy",
        symbol: SYMBOL,
        notional_quote_units: spend,
        max_slippage_bps: SLIP_BPS,
      },
    ];
  }
}

await runBars(new DipBounceTrader());
