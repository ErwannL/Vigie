/** Display helpers. A masked count (below k = 10) is always shown as "< 10". */
export function count(masked, t) {
  return masked.masked ? t('common.belowK') : masked.value.toLocaleString();
}

export function percent(rate) {
  return rate === null ? '—' : `${Math.round(rate * 1000) / 10} %`;
}

export function signedPercent(rate) {
  return rate === null ? '—' : `${rate > 0 ? '+' : ''}${Math.round(rate * 1000) / 10} %`;
}

export function ms(value) {
  return value === null ? '—' : `${Math.round(value).toLocaleString()} ms`;
}

export function dateTime(iso, lang) {
  return new Date(iso).toLocaleString(lang, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  });
}
