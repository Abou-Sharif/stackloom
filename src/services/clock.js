/**
 * Clock — an injectable time source.
 *
 * Generation records timestamps (marker headers, rollback state). Routing them
 * through a Clock keeps those deterministic in tests instead of depending on
 * the wall clock.
 */
export class Clock {
  now() {
    return new Date();
  }

  iso() {
    return new Date().toISOString();
  }
}

/** A Clock frozen at a fixed instant — for tests and reproducible runs. */
export class FixedClock {
  constructor(iso = "2026-01-01T00:00:00.000Z") {
    this._iso = iso;
  }

  now() {
    return new Date(this._iso);
  }

  iso() {
    return this._iso;
  }
}
