/**
 * Global single-run lock for the k6 web dashboard.
 *
 * Because the k6 dashboard binds a single fixed port (5665) there can only
 * ever be one active run at a time. This module tracks that exclusively so
 * concurrent POST /api/run requests are rejected (HTTP 409) rather than racing
 * to kill each other, which previously left the port briefly bound and caused
 * the second run's dashboard to fail.
 *
 * This is a plain in-process singleton which is valid because Next.js
 * (standalone) runs as a single Node.js process inside the Docker container.
 */

export interface RunStatus {
  running: boolean;
  script: string | null;
  startedAt: number | null;
  activeRunners: number;
  capacity: 1;
}

let _running = false;
let _script: string | null = null;
let _startedAt: number | null = null;

/** Attempt to acquire the lock for `script`. Returns `true` on success. */
export function tryAcquire(script: string): boolean {
  if (_running) return false;
  _running = true;
  _script = script;
  _startedAt = Date.now();
  return true;
}

/** Release the lock. No-op if already released. */
export function release(): void {
  _running = false;
  _script = null;
  _startedAt = null;
}

/** Current lock status, safe to expose over HTTP. */
export function getStatus(): RunStatus {
  return {
    running: _running,
    script: _script,
    startedAt: _startedAt,
    activeRunners: _running ? 1 : 0,
    capacity: 1,
  };
}

/** Reset all state (test helper only). */
export function _reset(): void {
  _running = false;
  _script = null;
  _startedAt = null;
}
