/**
 * Services — the CLI's injectable collaborators.
 *
 * Commands and the generation engine receive these rather than reaching for
 * `console` / `process` / the wall clock directly. That keeps the core logic
 * testable with fakes (composition over globals) and is the seam the
 * transactional pipeline builds on.
 */
import { Reporter } from "./reporter.js";
import { Clock } from "./clock.js";

export { Reporter } from "./reporter.js";
export { Clock, FixedClock } from "./clock.js";

/**
 * Build a service container. Pass overrides for tests; otherwise sensible
 * real-world defaults are constructed.
 * @param {object} [options]
 * @param {Reporter} [options.reporter]
 * @param {Clock} [options.clock]
 * @param {object} [options.reporterOptions] - forwarded to `new Reporter(...)`
 * @returns {{ reporter: Reporter, clock: Clock }}
 */
export function createServices(options = {}) {
  return {
    reporter: options.reporter ?? new Reporter(options.reporterOptions ?? {}),
    clock: options.clock ?? new Clock(),
  };
}

/**
 * Build a Reporter from a command's parsed global options (commander style).
 * `--no-color` arrives as `color: false`; CI/non-TTY still auto-quiets.
 * @param {{ quiet?: boolean, json?: boolean, debug?: boolean, color?: boolean }} [opts]
 */
export function reporterFromOptions(opts = {}) {
  return new Reporter({
    quiet: Boolean(opts.quiet),
    json: Boolean(opts.json),
    debug: Boolean(opts.debug),
    color: opts.color,
  });
}
