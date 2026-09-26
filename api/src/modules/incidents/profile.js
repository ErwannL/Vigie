const round2 = (n) => Number(n.toFixed(2));

function shares(rows, dim) {
  const known = rows.filter((r) => r.dim === dim && r.value !== null);
  const total = known.reduce((sum, r) => sum + r.n, 0);
  return known
    .map((r) => ({ value: r.value, share: round2(r.n / total) }))
    .sort((a, b) => b.share - a.share || (a.value < b.value ? -1 : 1));
}

/**
 * Turns profile rows ({ dim, value, n, first_at }) into who-is-affected facts:
 * device/plan shares ("mostly mobile, free plan"), features involved, and version markers.
 * `versionsBefore` lists versions seen before the window; a new one becomes `sinceVersion`.
 */
export function summarizeProfile(rows, versionsBefore) {
  const versions = rows
    .filter((r) => r.dim === 'app_version' && r.value !== null)
    .sort((a, b) => new Date(a.first_at) - new Date(b.first_at));
  const before = new Set(versionsBefore);
  const fresh = versionsBefore.length > 0 ? versions.filter((v) => !before.has(v.value)) : [];
  return {
    segments: { device: shares(rows, 'device').slice(0, 3), plan: shares(rows, 'plan').slice(0, 3) },
    features: shares(rows, 'feature')
      .filter((f) => f.share >= 0.1)
      .map((f) => f.value),
    appVersion: versions.length > 0 ? versions[versions.length - 1].value : null,
    sinceVersion: fresh.length > 0 ? fresh[0].value : null,
  };
}
