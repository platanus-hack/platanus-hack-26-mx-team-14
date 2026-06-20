/** Domain errors. `retryable` drives whether the queue/agent should retry. */
export class AppError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly meta?: Record<string, unknown>;
  constructor(
    code: string,
    message: string,
    opts: { retryable?: boolean; meta?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message, { cause: opts.cause });
    this.name = "AppError";
    this.code = code;
    this.retryable = opts.retryable ?? false;
    this.meta = opts.meta;
  }
}

export class CaptchaError extends AppError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super("captcha_failed", message, { retryable: true, meta });
  }
}

export class AuthError extends AppError {
  constructor(message: string, meta?: Record<string, unknown>) {
    // Bad credentials are NOT retryable; surface to the user.
    super("auth_failed", message, { retryable: false, meta });
  }
}

export class ScrapeError extends AppError {
  constructor(message: string, opts: { retryable?: boolean; step?: string; meta?: Record<string, unknown> } = {}) {
    super("scrape_failed", message, {
      retryable: opts.retryable ?? true,
      meta: { step: opts.step, ...opts.meta },
    });
  }
}
