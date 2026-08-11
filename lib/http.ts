// Shared by every module that calls out to Sleeper or FantasyCalc, so a
// slow/unresponsive upstream times out instead of hanging the request (and
// the loading UI) indefinitely, and every caller can tell "doesn't exist"
// (404) apart from "something's actually wrong" (any other failure) without
// each duplicating its own fetch+error logic.
const DEFAULT_TIMEOUT_MS = 12000;

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

// True for "the resource genuinely doesn't exist" (e.g. a bad league ID).
// False for everything else — timeouts, 5xx, network failures — which
// callers should let bubble up to an error boundary rather than treat as
// not-found.
export function isNotFound(error: unknown): boolean {
  return error instanceof HttpError && error.status === 404;
}

// True for "this resource exists but you may not see it" — ESPN returns 401
// for a private league, which is a genuinely different answer from 404 ("no
// such league") and deserves different copy. Sleeper has no equivalent case;
// this exists for lib/espn/client.ts.
export function isUnauthorized(error: unknown): boolean {
  return error instanceof HttpError && error.status === 401;
}

// A timeout throws a DOMException ("TimeoutError"); a network failure
// throws its own TypeError. Neither is an HttpError, so isNotFound() is
// correctly false for both and callers' catch blocks fall through to their
// generic "something went wrong" handling instead of treating it as 404.
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) });
  if (!res.ok) {
    throw new HttpError(res.status, `Request failed (${res.status}): ${url}`);
  }
  return res.json() as Promise<T>;
}
