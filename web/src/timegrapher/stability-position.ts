/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { SETTLED_BOUNDS, type Settling, type Spread } from './stability';

/*
   Where the cursor sits on the stability bar.

   The bar says one thing: how much the readings are still moving. Left is a
   reading swinging about; right is one holding still. The green oval at the
   right-hand end is the range the app is willing to call settled, and the
   cursor entering it *is* the verdict — not a separate judgement drawn beside
   it.

   That last point is the whole design of this module. An earlier version drove
   the cursor from the rate spread alone and then clamped it short of the oval
   whenever the verdict happened to disagree, which meant the bar and the words
   beside it were two opinions kept in line by hand. Here the bar is computed
   from the same four things `settling()` decides on, so they cannot disagree:

     - rate spread, against its bound. The criterion.
     - beat error spread, against its bound. A sanity bound.
     - amplitude spread, against its bound. A sanity bound, and only when the
       core produced an amplitude at all.
     - how long the reading has been running, against the minimum.

   The cursor shows the *worst* of them, because that is what is holding the
   verdict up. A watch whose rate is rock steady but whose amplitude is still
   swinging sixteen degrees is not nearly settled, and a bar that said so would
   be lying about which thing to wait for.

   Approaching, and inside, are two different scales:

     - Outside the bounds the cursor travels the first three quarters of the
       track. The useful range spans a factor of three — the same factor
       `settling()` uses to call a reading "nearly there" — and a linear scale
       would spend most of that distance on readings that are all equally
       hopeless, so it is logarithmic. Each halving of the spread moves the
       cursor the same distance right.
     - Inside them the cursor is in the oval, and its position there is how much
       margin is left over: at the bound it is just inside, and it reaches the
       far end only for a reading that has stopped moving altogether.
*/

/** Where the green oval begins, as a fraction of the track. */
export const LOCKED_FROM = 0.76;

/** How far outside the bounds the track's left edge sits. Matches `settling()`. */
const OUTER_FACTOR = 3;

/**
 * Seconds of reading before a settled verdict is offered.
 *
 * Mirrors `settling()`, which will not say settled before this however still
 * the figures look. Repeated here rather than imported because `stability.ts`
 * expresses it inline; if that changes, this has to change with it, and the
 * test named for it will say so.
 */
export const SETTLED_AFTER_SECONDS = 20;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export interface StabilityFacts {
  /** The verdict, which decides which side of the oval the cursor is on. */
  settling: Settling;
  /** Seconds of reading so far. */
  seconds: number;
  rate: Spread | null;
  beatError: Spread | null;
  /*
     Null when the core produced no amplitude — on a quartz movement, or on a
     capture route where amplitude cannot be read. `settling()` leaves it out of
     the verdict in that case, so the bar leaves it out too rather than pinning
     the cursor at the left for a figure nobody is waiting on.
  */
  amplitude: Spread | null;
}

/** 0 at three times the bound, 1 at the bound. */
function approach(spread: Spread | null, bound: number): number | null {
  if (spread === null || !Number.isFinite(spread.plusMinus)) return null;
  const s = Math.max(spread.plusMinus, 0);
  if (s <= bound) return 1;
  return clamp(Math.log((OUTER_FACTOR * bound) / s) / Math.log(OUTER_FACTOR), 0, 1);
}

/** 0 at the bound, 1 at a reading that has stopped moving. */
function margin(spread: Spread | null, bound: number): number | null {
  if (spread === null || !Number.isFinite(spread.plusMinus)) return null;
  return clamp(1 - Math.max(spread.plusMinus, 0) / bound, 0, 1);
}

function worst(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v !== null);
  return known.length === 0 ? null : Math.min(...known);
}

/**
 * The cursor position, 0 to 1, or null when there is nothing to place.
 *
 * Null rather than zero: zero is the left end of a real scale, and a reading
 * that has not arrived yet is not a reading pinned at its worst.
 */
export function stabilityPosition(facts: StabilityFacts): number | null {
  const { settling, seconds, rate, beatError, amplitude } = facts;
  if (rate === null) return null;

  if (settling === 'settled') {
    /* Inside the oval. How far in is how much room is left against the
       tightest of the bounds — the one that would be first to fail. */
    const room = worst([
      margin(rate, SETTLED_BOUNDS.rate),
      margin(beatError, SETTLED_BOUNDS.beatError),
      margin(amplitude, SETTLED_BOUNDS.amplitude),
    ]) ?? 0;
    return LOCKED_FROM + (1 - LOCKED_FROM) * room;
  }

  /*
     Short of it. Time counts as one of the criteria because it genuinely is
     one: a reading can be well inside every bound and still not be settled,
     and without this the cursor would sit against the oval for twenty seconds
     looking stuck rather than looking nearly done.
  */
  const closeness = worst([
    approach(rate, SETTLED_BOUNDS.rate),
    approach(beatError, SETTLED_BOUNDS.beatError),
    approach(amplitude, SETTLED_BOUNDS.amplitude),
    clamp(seconds / SETTLED_AFTER_SECONDS, 0, 1),
  ]) ?? 0;

  /* Never quite touching the oval. Reaching it means settled, and settled is
     the branch above; a cursor resting on the line under a lit MOVING label
     reads as a broken instrument. */
  return Math.min(closeness, 1) * LOCKED_FROM * 0.985;
}

/** Which criterion the cursor is currently reporting on. */
export type Limiter = 'rate' | 'beatError' | 'amplitude' | 'time' | null;

/**
 * What is holding the verdict up, for the reading the cursor describes.
 *
 * Not decoration: "still moving" is not advice, and which of the four is
 * lagging is the difference between waiting a few more seconds, pressing the
 * watch down harder, and having a movement worth investigating.
 */
export function stabilityLimiter(facts: StabilityFacts): Limiter {
  const { settling, seconds, rate, beatError, amplitude } = facts;
  if (rate === null || settling === 'settled') return null;

  const candidates: { id: Exclude<Limiter, null>; value: number }[] = [];
  const push = (id: Exclude<Limiter, null>, value: number | null) => {
    if (value !== null) candidates.push({ id, value });
  };
  push('rate', approach(rate, SETTLED_BOUNDS.rate));
  push('beatError', approach(beatError, SETTLED_BOUNDS.beatError));
  push('amplitude', approach(amplitude, SETTLED_BOUNDS.amplitude));
  push('time', clamp(seconds / SETTLED_AFTER_SECONDS, 0, 1));

  if (candidates.length === 0) return null;
  /* Ties go to the earlier entry, so rate — the criterion — is named ahead of
     the sanity bounds when they are equally far off, and time is named last of
     all: it resolves itself by waiting. */
  return candidates.reduce((a, b) => (b.value < a.value ? b : a)).id;
}

/** The bar's own state, which drives its colour and the label that lights. */
export type StabilityState = 'idle' | 'moving' | 'locked' | 'paused';

/**
 * What the bar is showing.
 *
 * `paused` is a reading that was taken and then stopped — the figures stay on
 * screen because they are what the operator stopped in order to read, and the
 * bar has to say that they are no longer live without wiping them.
 */
export function stabilityState(
  capturing: boolean,
  hasReading: boolean,
  settling: Settling,
): StabilityState {
  if (!capturing) return hasReading ? 'paused' : 'idle';
  if (settling === 'settled') return 'locked';
  if (settling === 'waiting') return 'idle';
  return 'moving';
}
