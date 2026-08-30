/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { positionName } from '../timegrapher/session';
import {
  WIZARD_ORDER, STALL_SECONDS, positionAt, skipped, type WizardState,
} from '../timegrapher/wizard';
import type { Settling } from '../timegrapher/stability';

/*
   The inspection run, as one instruction at a time.

   It reads as an information panel rather than a control panel because there is
   only ever one thing to do, and the button that does it is Start at the top of
   the screen. An earlier version had its own Go button beside that Start, which
   left two controls that both looked like the way to begin and only one that
   was — pressing Start appeared to do nothing at all.

   So: Start is the only trigger. It runs one position, stops on its own once
   the reading is recorded, and the panel says which position is next. The
   operator's loop is turn the watch, press Start, wait.
*/
interface Props {
  state: WizardState;
  /** Whether audio is running. Start and Stop live in the setup panel. */
  capturing: boolean;
  settling: Settling;
  valid: boolean;
  /** Seconds since the reading began counting. */
  seconds: number;
  /** Seconds left of the get-clear grace, while the stage is 'countdown'. */
  countdown: number;
  auto: boolean;
  onAutoChange: (auto: boolean) => void;
  onCapture: () => void;
  onSkip: () => void;
  onNext: () => void;
  onRetry: () => void;
  onFinish: () => void;
  onRestart: () => void;
  onOpenSummary: () => void;
  onJump: (step: number) => void;
}

/*
   Progress, and a way back into it. Tapping a dot jumps to that position, which
   is how a single reading gets re-measured — otherwise a watch that moved
   during one position would mean running the whole set again.
*/
function Dots({ state, onJump }: { state: WizardState; onJump: (step: number) => void }) {
  return (
    <div className="wizard__dots">
      {WIZARD_ORDER.map((p, i) => (
        <button
          key={p}
          className="wizard__dot"
          onClick={() => onJump(i)}
          aria-label={`Measure ${positionName(p)}`}
          aria-current={i === state.step && state.stage !== 'done' ? 'step' : undefined}
          data-state={
            state.recorded.includes(p)
              ? 'done'
              : i === state.step && state.stage !== 'done'
                ? 'current'
                : 'pending'
          }
        />
      ))}
    </div>
  );
}

export function InspectionWizard({
  state, capturing, settling, valid, seconds, countdown, auto, onAutoChange,
  onCapture, onSkip, onNext, onRetry, onFinish, onRestart, onOpenSummary, onJump,
}: Props) {
  const position = positionAt(state.step);
  const settled = settling === 'settled';
  const stalled = state.stage === 'measuring' && !settled && seconds >= STALL_SECONDS;

  if (state.stage === 'done') {
    const missed = skipped(state);
    return (
      <div className="panel wizard wizard--done">
        <div className="eyebrow">Run complete</div>
        <div className="wizard__headline">
          {state.recorded.length} of {WIZARD_ORDER.length} recorded
        </div>
        <p className="wizard__line">
          {missed.length > 0 ? `${missed.length} skipped.` : 'Every position measured.'}
        </p>
        <div className="wizard__actions">
          <button className="secondary" onClick={onRestart}>Run again</button>
          <button onClick={onOpenSummary}>Summary</button>
        </div>
        <Dots state={state} onJump={onJump} />
      </div>
    );
  }

  if (!position) return null;

  const name = positionName(position);

  return (
    <div className="panel wizard" data-stage={state.stage}>
      <div className="eyebrow">
        Position {state.step + 1} of {WIZARD_ORDER.length}
      </div>

      {/* The position is the largest thing on the panel. It is what the
          operator has to act on, and they are looking at a watch. */}
      <div className="wizard__headline">
        {state.stage === 'captured' ? `${name} recorded` : `${name} position`}
      </div>

      {state.stage === 'prompt' && (
        <p className="wizard__line wizard__line--call">
          Press <strong>START</strong> to begin
        </p>
      )}

      {state.stage === 'countdown' && (
        <p className="wizard__line wizard__line--call">
          Hands off — starting in <strong>{countdown}</strong>
        </p>
      )}

      {state.stage === 'measuring' && (
        <p className="wizard__line">
          {stalled
            ? 'Still moving after a minute. Check contact — or record it as it is.'
            : settled
              ? auto ? 'Settled. Recording…' : 'Settled. Record when ready.'
              : `Listening… ${seconds.toFixed(0)}s`}
        </p>
      )}

      {state.stage === 'captured' && (
        <p className="wizard__line wizard__line--good">
          {state.step + 1 >= WIZARD_ORDER.length ? 'Last position.' : 'Turn the watch for the next one.'}
        </p>
      )}

      <div className="wizard__foot">
        <Dots state={state} onJump={onJump} />

        {/* Only while a reading is actually running: an inspection that has not
            started has nothing to record and nothing to record automatically. */}
        {(state.stage === 'countdown' || state.stage === 'measuring') && (
          <label className="wizard__auto">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => onAutoChange(e.target.checked)}
            />
            <span>Auto</span>
          </label>
        )}

        {/* The manual alternative, and only when automatic is off — two ways to
            do the same thing side by side is one too many. */}
        {state.stage === 'measuring' && !auto && (
          <button
            className="wizard__record"
            onClick={onCapture}
            /* Enabled once stalled even though it is not settled: at that point
               refusing to record is a dead end, and the operator can see the
               spread and judge for themselves. */
            disabled={!valid || (!settled && !stalled)}
            title={settled || stalled ? undefined : 'Wait for the reading to settle'}
          >
            Record
          </button>
        )}

        {state.stage === 'captured' && (
          <>
            <button className="wizard__link" onClick={onRetry}>Redo</button>
            <button className="wizard__record" onClick={onNext}>
              {state.step + 1 >= WIZARD_ORDER.length ? 'Finish' : 'Next'}
            </button>
          </>
        )}

        {state.stage === 'prompt' && !capturing && (
          <button className="wizard__link" onClick={onSkip}>Skip</button>
        )}

        {state.recorded.length > 0 && state.stage === 'prompt' && (
          <button className="wizard__link" onClick={onFinish}>Finish early</button>
        )}
      </div>
    </div>
  );
}
