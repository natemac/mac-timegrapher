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
   The wizard's face.

   Deliberately a panel in the flow rather than a sheet over it. The operator
   has to watch the reading settle — covering the numbers with the instructions
   about the numbers would be its own kind of useless.
*/
interface Props {
  state: WizardState;
  /** Nothing can be measured until the audio is running. */
  capturing: boolean;
  settling: Settling;
  valid: boolean;
  /** Seconds since Go. Restarts with the average, so it measures this step. */
  seconds: number;
  auto: boolean;
  onAutoChange: (auto: boolean) => void;
  onGo: () => void;
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
  state, capturing, settling, valid, seconds, auto, onAutoChange,
  onGo, onCapture, onSkip, onNext, onRetry, onFinish, onRestart, onOpenSummary, onJump,
}: Props) {
  const position = positionAt(state.step);
  const settled = settling === 'settled';
  const stalled = state.stage === 'measuring' && !settled && seconds >= STALL_SECONDS;

  if (state.stage === 'done') {
    const missed = skipped(state);
    return (
      <div className="panel panel--tight wizard">
        <div className="wizard__row">
          <div className="wizard__text">
            <div className="eyebrow">Run complete</div>
            <p className="wizard__line">
              {state.recorded.length} of {WIZARD_ORDER.length} positions recorded
              {missed.length > 0 && `, ${missed.length} skipped`}.
            </p>
          </div>
          <div className="wizard__actions">
            <button className="secondary" onClick={onRestart}>Run again</button>
            <button onClick={onOpenSummary}>Summary</button>
          </div>
        </div>
        <div className="wizard__foot">
          <Dots state={state} onJump={onJump} />
        </div>
      </div>
    );
  }

  if (!position) return null;

  return (
    <div className="panel panel--tight wizard">
      <div className="wizard__row">
        <div className="wizard__text">
          {/* "1/6" rather than "Position 1 of 6": the column beside the
              buttons is narrow, and the long form wrapped onto a second line
              that pushed the trace down for no information. */}
          <div className="eyebrow">
            {state.step + 1}/{WIZARD_ORDER.length} · {positionName(position)}
          </div>

          {/* No placement instruction: the position is named right above, and
              "Dial up" already tells a watchmaker what to do with the watch. */}
          {state.stage === 'prompt' && !capturing && (
            <p className="wizard__line">Press Start above to begin.</p>
          )}

          {state.stage === 'measuring' && (
            <p className="wizard__line">
              {stalled
                ? 'Still moving after a minute. Check the watch is in firm contact — or record it as it is.'
                : settled
                  ? auto
                    ? 'Settled. Recording…'
                    : 'Settled. Record when ready.'
                  : `Listening… ${seconds.toFixed(0)}s. Keep hands off the watch.`}
            </p>
          )}

          {state.stage === 'captured' && (
            <p className="wizard__line wizard__line--good">
              {positionName(position)} recorded.
            </p>
          )}
        </div>

        <div className="wizard__actions">
          {state.stage === 'prompt' && (
            <>
              <button className="secondary" onClick={onSkip} disabled={!capturing}>Skip</button>
              <button onClick={onGo} className="wizard__go" disabled={!capturing}>Go</button>
            </>
          )}

          {state.stage === 'measuring' && (
            <>
              <button className="secondary" onClick={onSkip}>Skip</button>
              <button
                onClick={onCapture}
                /* Enabled once stalled even though it is not settled: at that
                   point refusing to record is just a dead end, and the operator
                   can see the spread and judge for themselves. */
                disabled={!valid || (!settled && !stalled)}
                title={settled || stalled ? undefined : 'Wait for the reading to settle'}
              >
                Record
              </button>
            </>
          )}

          {state.stage === 'captured' && (
            <>
              <button className="secondary" onClick={onRetry}>Redo</button>
              <button onClick={onNext}>
                {state.step + 1 >= WIZARD_ORDER.length ? 'Finish' : 'Next'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="wizard__foot">
        <Dots state={state} onJump={onJump} />

        <label className="wizard__auto">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => onAutoChange(e.target.checked)}
          />
          {/* The operator's hands are on a watch, not the screen. With this on,
              the only thing they touch between positions is Go. */}
          <span>Record automatically</span>
        </label>

        {state.recorded.length > 0 && (
          <button className="wizard__finish" onClick={onFinish}>
            Finish early
          </button>
        )}
      </div>
    </div>
  );
}
