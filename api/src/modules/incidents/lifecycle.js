import { AppError } from '../../errors.js';

export const STATUSES = Object.freeze([
  'open',
  'reproducing',
  'confirmed',
  'not_reproduced',
  'resolved',
  'reopened',
]);

const TRANSITIONS = {
  open: ['reproducing', 'resolved'],
  reopened: ['reproducing', 'resolved'],
  reproducing: ['confirmed', 'not_reproduced', 'open', 'reopened'],
  confirmed: ['reproducing', 'resolved'],
  not_reproduced: ['reproducing', 'resolved'],
  resolved: ['reopened'],
};

export function canTransition(from, to) {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) throw new AppError('invalid_transition', 409, { from, to });
}

const HISTORY_LIMIT = 50;

/** Appends a history entry, keeping the most recent 50. */
export function withHistory(history, at, event, details = {}) {
  return [...history, { at: at.toISOString(), event, ...details }].slice(-HISTORY_LIMIT);
}

/** Figura run state → incident status. `failed` returns to the status before the replay. */
export function statusAfterReplay(state, previousStatus) {
  if (state === 'reproduced') return 'confirmed';
  if (state === 'not_reproduced') return 'not_reproduced';
  return previousStatus;
}
