/**
 * Reporter — the CLI's single output channel.
 *
 * Replaces scattered console.log / chalk / ora. Every command writes through a
 * Reporter, so output respects --quiet, --json, --no-color and CI/non-TTY
 * auto-detection uniformly. It is injectable: tests pass fake streams + env, so
 * output is asserted, never captured from the real console.
 *
 * Behaviour:
 *   - normal      → info+ to stdout, success/step shown, ANSI colour on a TTY
 *   - --quiet     → only warnings + errors (to stderr); also auto-on for CI / non-TTY
 *   - --json      → no human lines at all; structured events collected, emitted by flush()
 *   - --debug     → debug lines shown (also via LOOM_DEBUG=true)
 *
 * Colour uses inline ANSI — no chalk dependency — keeping the CLI lightweight.
 */

const ANSI = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
};

export class Reporter {
  /**
   * @param {object} [options]
   * @param {NodeJS.WritableStream} [options.stdout]
   * @param {NodeJS.WritableStream} [options.stderr]
   * @param {boolean} [options.quiet]   - errors + warnings only
   * @param {boolean} [options.json]    - structured output mode
   * @param {boolean} [options.debug]   - show debug lines
   * @param {boolean} [options.color]   - force colour on/off (default: auto)
   * @param {boolean} [options.isTTY]   - override TTY detection (default: auto)
   * @param {Record<string,string>} [options.env]
   */
  constructor({
    stdout = process.stdout,
    stderr = process.stderr,
    quiet = false,
    json = false,
    debug = false,
    color,
    isTTY,
    env = process.env,
  } = {}) {
    this.stdout = stdout;
    this.stderr = stderr;
    this.jsonMode = Boolean(json);
    this.events = [];
    this._result = null;

    const ci = Boolean(env.CI && env.CI !== "false");
    this.isTTY = isTTY ?? Boolean(stdout && stdout.isTTY);
    // Quiet when asked, in JSON mode, under CI, or when piped (non-TTY).
    this.quiet = this.jsonMode || quiet || ci || !this.isTTY;
    this.debugEnabled = Boolean(debug) || env.LOOM_DEBUG === "true";
    this.color = color ?? (!this.jsonMode && this.isTTY && !env.NO_COLOR);
  }

  _paint(code, text) {
    return this.color ? `${code}${text}${ANSI.reset}` : text;
  }

  _line(stream, text) {
    if (!this.jsonMode) stream.write(`${text}\n`);
  }

  _record(type, message, data) {
    this.events.push({
      type,
      ...(message !== undefined ? { message } : {}),
      ...(data !== undefined ? { data } : {}),
    });
  }

  /** Plain human-readable line (bypasses quiet suppression for explain/ls-style commands). */
  log(message) {
    if (!this.jsonMode) this._line(this.stdout, message ?? "");
  }

  /** A section heading — bold-formatted, always shown in human mode. */
  heading(message) {
    if (!this.jsonMode) {
      this._line(this.stdout, "");
      this._line(this.stdout, this._paint(ANSI.blue, message));
      this._line(this.stdout, this._paint(ANSI.gray, "─".repeat(Math.min(message.length, 60))));
    }
  }

  /** A subsection label. */
  section(message) {
    if (!this.jsonMode) {
      this._line(this.stdout, this._paint(ANSI.blue, `▸ ${message}`));
    }
  }

  /** Normal informational output. Hidden in quiet/json mode. */
  info(message, data) {
    this._record("info", message, data);
    if (!this.quiet) this._line(this.stdout, `${this._paint(ANSI.blue, "i")} ${message}`);
  }

  /** A positive outcome. Hidden in quiet/json mode. */
  success(message, data) {
    this._record("success", message, data);
    if (!this.quiet) this._line(this.stdout, `${this._paint(ANSI.green, "✓")} ${message}`);
  }

  /** A progress step. Hidden in quiet/json mode. */
  step(message, data) {
    this._record("step", message, data);
    if (!this.quiet) this._line(this.stdout, `${this._paint(ANSI.gray, "→")} ${message}`);
  }

  /** A warning — shown even in quiet mode (suppressed visually only in json mode). */
  warn(message, data) {
    this._record("warn", message, data);
    this._line(this.stderr, `${this._paint(ANSI.yellow, "!")} ${message}`);
  }

  /** An error — shown even in quiet mode (suppressed visually only in json mode). */
  error(message, data) {
    this._record("error", message, data);
    this._line(this.stderr, `${this._paint(ANSI.red, "✗")} ${message}`);
  }

  /** Diagnostic detail — shown only when debug is enabled. */
  debug(message, data) {
    this._record("debug", message, data);
    if (this.debugEnabled && !this.quiet) {
      this._line(this.stderr, this._paint(ANSI.gray, `· ${message}`));
    }
  }

  /** Record a structured event with no human-facing line. */
  event(type, data) {
    this._record(type, undefined, data);
  }

  /** Set the command's final structured result (the payload for --json consumers). */
  result(data) {
    this._result = data;
    this._record("result", undefined, data);
  }

  /** In --json mode, emit the collected structured output. Call once at command end. */
  flush() {
    if (this.jsonMode) {
      this.stdout.write(
        `${JSON.stringify({ events: this.events, result: this._result }, null, 2)}\n`,
      );
    }
  }
}
