/** Helpers shared by the fixture-backed fake sources. Fixtures use minutes-before-now offsets. */
export function minutesAgo(now, minutes) {
  return new Date(now.getTime() - minutes * 60000);
}

export function within(date, from, to) {
  return date >= from && date < to;
}
