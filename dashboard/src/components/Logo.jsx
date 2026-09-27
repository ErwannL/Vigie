/**
 * The Vigie logo: a watchtower (« vigie » = lookout) whose lantern sends telemetry waves.
 * Same drawing as `public/favicon.svg` (still) and `public/logo-animated.svg` (animated);
 * a test keeps them in sync through the constants below.
 *
 * `mode`: `static` (still), `hover` (the waves pulse while the logo or a `.vg-hover` parent is
 * hovered), `loop` (they pulse continuously — the loading indicator). Motion stops under
 * `prefers-reduced-motion` (styles.css).
 */
export const COLORS = Object.freeze({ tile: '#0f1419', tower: '#7cc4ff', lamp: '#ffd166' });
export const TOWER = Object.freeze({
  roof: 'M23 22 L32 13 L41 22 Z',
  legs: 'M27 33 L23 54 M37 33 L41 54 M26.5 40 L38 47 M37.5 40 L26 47 M19 54 H45',
});
export const WAVES = Object.freeze([
  'M45 19 q4 7 0 14',
  'M50 15 q7 11 0 22',
  'M19 19 q-4 7 0 14',
  'M14 15 q-7 11 0 22',
]);

export function Logo({ size = 32, mode = 'static', title }) {
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': 'true' };
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={`vg-logo vg-logo--${mode}`}
      {...a11y}
    >
      <rect x="2" y="2" width="60" height="60" rx="14" fill={COLORS.tile} />
      <path d={TOWER.roof} fill={COLORS.tower} />
      <rect x="26" y="22" width="12" height="8" rx="1.5" fill={COLORS.tower} />
      <circle className="vg-lamp" cx="32" cy="26" r="2.5" fill={COLORS.lamp} />
      <rect x="22" y="30" width="20" height="3" rx="1.5" fill={COLORS.tower} />
      <path
        d={TOWER.legs}
        fill="none"
        stroke={COLORS.tower}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <g fill="none" stroke={COLORS.tower} strokeWidth="2.5" strokeLinecap="round">
        {WAVES.map((d, i) => (
          <path key={d} d={d} className={`vg-wave vg-wave-${i % 2}`} />
        ))}
      </g>
    </svg>
  );
}
