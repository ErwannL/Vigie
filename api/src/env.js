import { AppError } from './errors.js';

/** The three Orqea environments Vigie watches. */
export const ENVS = Object.freeze(['dev', 'recette', 'prod']);

/** Environments Figura may run in. Prod is deliberately absent and cannot be added by config. */
export const FIGURA_TARGETS = Object.freeze(['dev', 'recette']);

export function isEnv(value) {
  return ENVS.includes(value);
}

/** Every read, insight and job takes an env; anything else is a programming or client error. */
export function assertEnv(value) {
  if (!isEnv(value)) throw new AppError('invalid_env', 400);
  return value;
}

export function assertFiguraTarget(value) {
  if (!FIGURA_TARGETS.includes(value)) throw new AppError('figura_target_forbidden', 400);
  return value;
}
