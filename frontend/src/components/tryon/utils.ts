// ─── Number formatting ───────────────────────────────────────────────────────

export function r1(n: number) {
  return Math.round(n * 10) / 10;
}

// ─── Contract keying ─────────────────────────────────────────────────────────

export function contractKey(name: string) {
  return name.replace(/[^a-zA-Z0-9]+/g, '_');
}
