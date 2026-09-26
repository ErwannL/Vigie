const SEVERITY_ORDER = ['low', 'medium', 'high'];

export function maxSeverity(a, b) {
  return SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b;
}

/**
 * Correlation key of a signal: its route template first, then its error fingerprint, then
 * the page element, then the funnel step. Signals sharing a key become one incident.
 */
export function signalKey(signal) {
  if (signal.route) return `route:${signal.route}`;
  if (signal.fingerprint) return `error:${signal.fingerprint}`;
  if (signal.element) return `element:${signal.page}#${signal.element}`;
  return `funnel:${signal.funnel}/${signal.step}`;
}

/** The events filter used to profile and replay an incident with this key. */
export function filterForKey(key) {
  const [kind, rest] = key.split(/:(.*)/s);
  if (kind === 'route') return { route: rest };
  if (kind === 'error') return { fingerprint: rest };
  if (kind === 'element') {
    const [page, element] = rest.split('#');
    return { page, element };
  }
  return null;
}

const addTo = (set, value) => {
  if (value) set.add(value);
};

/** Groups signals by key into incident candidates. */
export function correlate(signals) {
  const groups = new Map();
  for (const s of signals) {
    const key = signalKey(s);
    const g = groups.get(key) ?? {
      key,
      severity: 'low',
      kinds: new Set(),
      routes: new Set(),
      pages: new Set(),
      fingerprints: new Set(),
      signals: [],
    };
    g.severity = maxSeverity(g.severity, s.severity);
    g.kinds.add(s.kind);
    addTo(g.routes, s.route);
    addTo(g.pages, s.page);
    addTo(g.fingerprints, s.fingerprint);
    g.signals.push(s);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({
    key: g.key,
    severity: g.severity,
    kinds: [...g.kinds].sort(),
    routes: [...g.routes].sort(),
    pages: [...g.pages].sort(),
    fingerprints: [...g.fingerprints].sort(),
    signals: g.signals,
  }));
}

const KIND_LABELS = {
  latency: 'Slow',
  error_spike: 'Error spike on',
  funnel_drop: 'Funnel drop at',
  rage_click: 'Rage clicks on',
  quick_exit: 'Quick exits after error on',
};

/** English title for the issue board (the dashboard builds its own translated label). */
export function incidentTitle(candidate) {
  const subject = candidate.key.split(/:(.*)/s)[1];
  return `${candidate.kinds.map((k) => KIND_LABELS[k]).join(' + ')} ${subject}`;
}
