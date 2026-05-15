import { describe, it, expect } from "vitest";
import { Reporter, Clock, FixedClock, createServices, reporterFromOptions } from "../index.js";

const fakeStream = () => ({
  chunks: [],
  isTTY: true,
  write(s) {
    this.chunks.push(s);
    return true;
  },
  get text() {
    return this.chunks.join("");
  },
});

describe("Reporter", () => {
  it("writes info to stdout and errors to stderr in normal mode", () => {
    const out = fakeStream();
    const err = fakeStream();
    const r = new Reporter({ stdout: out, stderr: err, isTTY: true, env: {} });
    expect(r.quiet).toBe(false);
    r.info("hello");
    r.success("done");
    r.error("boom");
    expect(out.text).toMatch(/hello/);
    expect(out.text).toMatch(/done/);
    expect(err.text).toMatch(/boom/);
  });

  it("suppresses info/success in quiet mode but keeps warn/error", () => {
    const out = fakeStream();
    const err = fakeStream();
    const r = new Reporter({ stdout: out, stderr: err, quiet: true, isTTY: true, env: {} });
    r.info("hidden");
    r.success("hidden");
    r.warn("careful");
    r.error("boom");
    expect(out.text).toBe("");
    expect(err.text).toMatch(/careful/);
    expect(err.text).toMatch(/boom/);
  });

  it("auto-enables quiet under CI and when piped (non-TTY)", () => {
    expect(new Reporter({ stdout: fakeStream(), isTTY: true, env: { CI: "true" } }).quiet).toBe(true);
    expect(new Reporter({ stdout: fakeStream(), isTTY: false, env: {} }).quiet).toBe(true);
  });

  it("emits structured output only through flush() in json mode", () => {
    const out = fakeStream();
    const err = fakeStream();
    const r = new Reporter({ stdout: out, stderr: err, json: true, isTTY: true, env: {} });
    r.info("hello");
    r.error("boom");
    r.result({ files: 3 });
    expect(out.text).toBe("");
    expect(err.text).toBe("");
    r.flush();
    const parsed = JSON.parse(out.text);
    expect(parsed.result).toEqual({ files: 3 });
    expect(parsed.events.some((e) => e.type === "info" && e.message === "hello")).toBe(true);
    expect(parsed.events.some((e) => e.type === "error")).toBe(true);
  });

  it("colours for a TTY but not for NO_COLOR, json, or explicit off", () => {
    expect(new Reporter({ stdout: fakeStream(), isTTY: true, env: {} }).color).toBe(true);
    expect(new Reporter({ stdout: fakeStream(), isTTY: true, env: { NO_COLOR: "1" } }).color).toBe(false);
    expect(new Reporter({ stdout: fakeStream(), isTTY: true, json: true, env: {} }).color).toBe(false);
    expect(new Reporter({ stdout: fakeStream(), isTTY: true, color: false, env: {} }).color).toBe(false);
  });

  it("shows debug lines only when debug is enabled", () => {
    const off = fakeStream();
    new Reporter({ stdout: fakeStream(), stderr: off, isTTY: true, env: {} }).debug("trace");
    expect(off.text).toBe("");
    const on = fakeStream();
    new Reporter({ stdout: fakeStream(), stderr: on, isTTY: true, debug: true, env: {} }).debug("trace");
    expect(on.text).toMatch(/trace/);
  });
});

describe("Clock", () => {
  it("Clock.now() returns a Date; FixedClock is frozen", () => {
    expect(new Clock().now()).toBeInstanceOf(Date);
    expect(new FixedClock("2026-05-14T00:00:00.000Z").iso()).toBe("2026-05-14T00:00:00.000Z");
  });
});

describe("service container", () => {
  it("createServices builds a reporter + clock", () => {
    const svc = createServices({ reporterOptions: { isTTY: true, env: {} } });
    expect(svc.reporter).toBeInstanceOf(Reporter);
    expect(svc.clock).toBeInstanceOf(Clock);
  });

  it("reporterFromOptions maps commander-style flags", () => {
    expect(reporterFromOptions({ json: true }).jsonMode).toBe(true);
  });
});
