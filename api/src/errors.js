/** An error carrying a stable, translatable code. Messages are never shown to operators. */
export class AppError extends Error {
  constructor(code, statusCode = 500, details = undefined) {
    super(code);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/** Thrown by adapter stubs whose real implementation belongs to the integrator. */
export class NotImplementedError extends AppError {
  constructor(what) {
    super('not_implemented', 501, { what });
    this.name = 'NotImplemented';
  }
}
