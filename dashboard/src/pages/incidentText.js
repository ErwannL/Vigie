/** Translated label of an incident, built from its kinds and key (never from the English title). */
export function incidentLabel(incident, t) {
  const subject = incident.key.slice(incident.key.indexOf(':') + 1);
  return `${incident.kinds.map((k) => t(`kind.${k}`)).join(' + ')} · ${subject}`;
}

/** "mostly mobile (86 %)"-style summary of the segments holding at least half the events. */
export function segmentSummary(segments, t) {
  const parts = ['device', 'plan']
    .map((dim) => segments[dim][0])
    .filter((top) => top && top.share >= 0.5)
    .map((top) => `${top.value} (${Math.round(top.share * 100)} %)`);
  return parts.length > 0 ? t('incident.mostly', { values: parts.join(', ') }) : '—';
}

export const REPLAYABLE = ['open', 'reopened', 'confirmed', 'not_reproduced'];
