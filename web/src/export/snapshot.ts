/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import type { Spread } from '../timegrapher/stability';
import { positionName, type PositionId } from '../timegrapher/session';

/*
   A shareable image of what is on screen right now.

   Drawn onto a canvas rather than photographed off the DOM. Screenshotting the
   page would need a rasteriser in the bundle, on top of a 580 KB WebAssembly
   module, and it would faithfully reproduce things nobody wants in a shared
   image — the device dropdown, the level meter, the settings cog. Drawing it
   means the card carries what identifies the reading (movement, position,
   reference, time) rather than the furniture around it.

   PNG, not JPEG. The card is hairlines and small tabular figures, which is
   exactly what JPEG's chroma subsampling and ringing spoil; the file is a few
   hundred kilobytes either way and shares to Photos identically.
*/

export interface SnapshotInput {
  rate: number;
  amplitude: number;
  beatError: number;
  bph: number;
  spreads: {
    rate: Spread | null;
    amplitude: Spread | null;
    beatError: Spread | null;
  };
  movementName: string | null;
  position: PositionId | null;
  reference: string;
  at: Date;
}

export interface SnapshotRow {
  label: string;
  value: string;
  unit: string;
  /** The ± figure, or '' when there is nothing trustworthy to say. */
  sub: string;
}

/** An em dash, not a zero: an undetermined reading must not look measured. */
const DASH = '—';

/**
 * The four readings as they appear on the card.
 *
 * Amplitude of 0 is the core saying it could not determine amplitude, which is
 * a different statement from a movement that barely swings — so it prints as a
 * dash here exactly as it does on screen and on the certificate.
 */
export function snapshotRows(input: SnapshotInput): SnapshotRow[] {
  const hasAmplitude = input.amplitude > 0;
  return [
    {
      label: 'Rate',
      value: `${input.rate >= 0 ? '+' : ''}${input.rate.toFixed(1)}`,
      unit: 's/day',
      sub: input.spreads.rate ? `±${input.spreads.rate.plusMinus.toFixed(1)}` : '',
    },
    {
      label: 'Amplitude',
      value: hasAmplitude ? input.amplitude.toFixed(0) : DASH,
      unit: hasAmplitude ? 'degrees' : '',
      sub: hasAmplitude && input.spreads.amplitude
        ? `±${input.spreads.amplitude.plusMinus.toFixed(0)}`
        : '',
    },
    {
      label: 'Beat error',
      value: input.beatError.toFixed(1),
      unit: 'ms',
      sub: input.spreads.beatError ? `±${input.spreads.beatError.plusMinus.toFixed(2)}` : '',
    },
    {
      label: 'Beat rate',
      value: input.bph > 0 ? input.bph.toLocaleString('en-US') : DASH,
      unit: input.bph > 0 ? 'bph' : '',
      sub: '',
    },
  ];
}

/** What the card says it is describing, above the readings. */
export function snapshotSubject(input: SnapshotInput): string {
  const parts = [
    input.movementName,
    input.position ? positionName(input.position) : null,
  ].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(' · ') : 'Timing reading';
}

/**
 * A filename that sorts and identifies. Reference first when there is one,
 * because a bench looking for one job's images wants them adjacent.
 */
export function snapshotFilename(input: SnapshotInput): string {
  const stamp = [
    input.at.getFullYear(),
    String(input.at.getMonth() + 1).padStart(2, '0'),
    String(input.at.getDate()).padStart(2, '0'),
    '-',
    String(input.at.getHours()).padStart(2, '0'),
    String(input.at.getMinutes()).padStart(2, '0'),
  ].join('');

  const parts = [
    input.reference.trim() || null,
    input.position ? positionName(input.position) : null,
    stamp,
  ].filter(Boolean) as string[];

  const slug = parts
    .join('-')
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  return `timegrapher-${slug || 'reading'}.png`;
}

/**
 * Decode a `data:` URL's base64 payload.
 *
 * Kept synchronous on purpose. iOS Safari only honours `navigator.share` while
 * it can still see the user's tap, and an awaited `canvas.toBlob` is enough of
 * a gap to lose that — the share sheet then silently never opens. Going via
 * `toDataURL`, which returns immediately, keeps the whole export inside the
 * gesture.
 */
export function dataUrlToBytes(dataUrl: string): Uint8Array<ArrayBuffer> {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('Not a data URL');
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const W = 1000;
const H = 540;
const PAD = 56;

const SANS = 'system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';
const MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';

/*
   Light, like the certificate, so a shop's images look like one set of
   documents rather than two. The palette is fixed rather than read from the
   page's theme: an image shared into a message thread has no theme, and a
   dark card printed or pasted into a build record looks like a mistake.
*/
const INK = '#16181c';
const DIM = '#6b7078';
const FAINT = '#9aa0a8';
const LINE = '#dcd8d0';
const PAPER = '#faf9f6';

function line(ctx: CanvasRenderingContext2D, y: number) {
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, y + 0.5);
  ctx.lineTo(W - PAD, y + 0.5);
  ctx.stroke();
}

/**
 * Draw the card. `logo` may be null — a failed image load must not be able to
 * stop an export, so the wordmark is drawn as text instead.
 */
export function drawSnapshot(
  canvas: HTMLCanvasElement,
  input: SnapshotInput,
  logo: HTMLImageElement | null,
): void {
  // Two device pixels per unit: the figures are the point of the card and they
  // should stay crisp when it is opened full screen.
  const scale = 2;
  canvas.width = W * scale;
  canvas.height = H * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get a drawing context.');
  ctx.scale(scale, scale);

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = 'alphabetic';

  // --- Masthead -----------------------------------------------------------
  let y = PAD + 8;
  if (logo && logo.naturalWidth > 0) {
    const h = 46;
    const w = (logo.naturalWidth / logo.naturalHeight) * h;
    ctx.drawImage(logo, PAD, y - h + 10, w, h);
  } else {
    ctx.fillStyle = INK;
    ctx.font = `600 26px ${SANS}`;
    ctx.fillText('MAC BESPOKE', PAD, y);
  }

  ctx.fillStyle = FAINT;
  ctx.font = `500 13px ${MONO}`;
  ctx.textAlign = 'right';
  ctx.fillText('TIMEGRAPHER', W - PAD, y);
  ctx.textAlign = 'left';

  y += 26;
  line(ctx, y);

  // --- Subject ------------------------------------------------------------
  y += 46;
  ctx.fillStyle = INK;
  ctx.font = `600 30px ${SANS}`;
  ctx.fillText(snapshotSubject(input), PAD, y);

  // --- Readings -----------------------------------------------------------
  const rows = snapshotRows(input);
  const colW = (W - PAD * 2) / 2;
  const rowH = 132;
  const gridTop = y + 44;

  rows.forEach((row, i) => {
    const x = PAD + (i % 2) * colW;
    const top = gridTop + Math.floor(i / 2) * rowH;

    ctx.fillStyle = FAINT;
    ctx.font = `500 13px ${MONO}`;
    ctx.fillText(row.label.toUpperCase(), x, top);

    ctx.fillStyle = INK;
    ctx.font = `500 58px ${MONO}`;
    ctx.fillText(row.value, x, top + 60);
    const valueWidth = ctx.measureText(row.value).width;

    if (row.unit) {
      ctx.fillStyle = DIM;
      ctx.font = `400 18px ${SANS}`;
      ctx.fillText(row.unit, x + valueWidth + 12, top + 60);
    }

    if (row.sub) {
      ctx.fillStyle = FAINT;
      ctx.font = `400 17px ${MONO}`;
      ctx.fillText(row.sub, x, top + 88);
    }
  });

  // --- Footer -------------------------------------------------------------
  const footY = H - PAD - 22;
  line(ctx, footY - 26);

  ctx.fillStyle = DIM;
  ctx.font = `400 15px ${SANS}`;
  const stamp = input.at.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const left = input.reference.trim() ? `${input.reference.trim()} · ${stamp}` : stamp;
  ctx.fillText(left, PAD, footY);

  ctx.fillStyle = FAINT;
  ctx.textAlign = 'right';
  ctx.fillText('macwatches.com', W - PAD, footY);
  ctx.textAlign = 'left';
}

/**
 * Load the positive mark for the card. Resolves to null rather than rejecting:
 * the export is worth more than the logo on it.
 */
export function loadSnapshotLogo(baseUrl: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `${baseUrl}mac-logo-pos.png`;
  });
}

export type SnapshotOutcome = 'shared' | 'downloaded';

/**
 * Hand the image to the operator by whichever route the device has.
 *
 * Share first: on a phone that puts it into Photos, Messages or AirDrop, which
 * is where a bench image is actually going. A download on iOS lands in Files
 * and takes several taps to get anywhere useful.
 */
export async function deliverSnapshot(
  file: File,
  outcome: { onShareUnavailable?: () => void } = {},
): Promise<SnapshotOutcome> {
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };

  if (nav.canShare?.({ files: [file] }) && nav.share) {
    await nav.share({ files: [file] });
    return 'shared';
  }

  outcome.onShareUnavailable?.();

  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on a later turn of the event loop: revoking synchronously can beat
  // the browser to the download in Safari and produce an empty file.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
