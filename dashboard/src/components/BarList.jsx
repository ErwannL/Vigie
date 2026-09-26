/**
 * Accessible horizontal bars: every bar has its value as text. Items whose value is null
 * (masked below k) show their label text without a bar.
 */
export function BarList({ items, label }) {
  const max = Math.max(1, ...items.map((i) => i.value ?? 0));
  return (
    <ul className="bars" aria-label={label}>
      {items.map((item) => (
        <li key={item.key}>
          <span className="bar-label">{item.label}</span>
          <span className="bar-track">
            {item.value !== null && (
              <span className="bar" style={{ width: `${(item.value / max) * 100}%` }} />
            )}
          </span>
          <span className="bar-value">{item.display}</span>
        </li>
      ))}
    </ul>
  );
}
