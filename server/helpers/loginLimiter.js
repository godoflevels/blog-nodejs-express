/**
 * Tiny in-memory brute-force guard for the admin login.
 * After MAX failed attempts from one IP the login answers 429 until the
 * window passes. A successful login clears the counter. Process-local on
 * purpose: this app runs as a single pm2 process.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED = 10;
const attempts = new Map();

function prune(now) {
  for (const [key, entry] of attempts) {
    if (now - entry.first > WINDOW_MS) attempts.delete(key);
  }
}

function isBlocked(key, now = Date.now()) {
  prune(now);
  const entry = attempts.get(key);
  return Boolean(entry && entry.count >= MAX_FAILED);
}

function recordFailure(key, now = Date.now()) {
  const entry = attempts.get(key);
  if (!entry || now - entry.first > WINDOW_MS) attempts.set(key, { count: 1, first: now });
  else entry.count += 1;
}

function reset(key) {
  attempts.delete(key);
}

module.exports = { isBlocked, recordFailure, reset, MAX_FAILED, WINDOW_MS };
