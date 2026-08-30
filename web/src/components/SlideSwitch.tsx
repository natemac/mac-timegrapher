/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

/*
   Two choices that are one thing seen two ways, not two separate commands — a
   sliding indicator says that, where one button lighting up and another going
   dark says the opposite.

   Built from real buttons rather than a styled div, so it is reachable by
   keyboard and announces its state. The travelling thumb is positioned from
   the selected index rather than from the value, so the control does not have
   to know what it is switching between.
*/
export interface SlideOption<T extends string> {
  id: T;
  label: string;
}

export function SlideSwitch<T extends string>({
  value, options, onChange, label, className,
}: {
  value: T;
  options: readonly SlideOption<T>[];
  onChange: (v: T) => void;
  /** Names the group for a screen reader — the options alone do not say what they choose. */
  label: string;
  className?: string;
}) {
  const index = Math.max(0, options.findIndex((o) => o.id === value));

  return (
    <div
      className={className ? `switch ${className}` : 'switch'}
      data-index={index}
      style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
      role="group"
      aria-label={label}
    >
      {/* Purely decorative: the buttons carry the state for anything that is
          not looking at it. */}
      <span
        className="switch__thumb"
        aria-hidden="true"
        style={{
          width: `calc(${100 / options.length}% - ${4 / options.length}px)`,
          left: `calc(${(index * 100) / options.length}% + 2px)`,
        }}
      />
      {options.map((o) => (
        <button
          key={o.id}
          className="switch__option"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
