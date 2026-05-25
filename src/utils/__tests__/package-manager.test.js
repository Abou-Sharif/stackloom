import { describe, it, expect } from "vitest";
import {
  normalizePm,
  installCmd,
  addCmd,
  removeCmd,
  runCmd,
  runInDir,
  runInDirBare,
  convertRootScripts,
  packageManagerField,
} from "../package-manager.js";

describe("normalizePm", () => {
  it("normalizes pnpm", () => expect(normalizePm("pnpm")).toBe("pnpm"));
  it("normalizes npm", () => expect(normalizePm("npm")).toBe("npm"));
  it("normalizes yarn", () => expect(normalizePm("yarn")).toBe("yarn"));
  it("normalizes bun", () => expect(normalizePm("bun")).toBe("bun"));
  it("defaults to pnpm for unknown values", () => {
    expect(normalizePm("unknown")).toBe("pnpm");
    expect(normalizePm("")).toBe("pnpm");
    expect(normalizePm(null)).toBe("pnpm");
    expect(normalizePm(undefined)).toBe("pnpm");
  });
  it("is case-insensitive", () => {
    expect(normalizePm("NPM")).toBe("npm");
    expect(normalizePm("Yarn")).toBe("yarn");
    expect(normalizePm("BUN")).toBe("bun");
  });
  it("trims whitespace", () => {
    expect(normalizePm("  pnpm  ")).toBe("pnpm");
  });
});

describe("installCmd", () => {
  it("returns correct install command for each PM", () => {
    expect(installCmd("pnpm")).toBe("pnpm install");
    expect(installCmd("npm")).toBe("npm install");
    expect(installCmd("yarn")).toBe("yarn install");
    expect(installCmd("bun")).toBe("bun install");
  });
});

describe("addCmd", () => {
  it("returns correct add command for each PM", () => {
    expect(addCmd("pnpm")).toBe("pnpm add");
    expect(addCmd("npm")).toBe("npm install");
    expect(addCmd("yarn")).toBe("yarn add");
    expect(addCmd("bun")).toBe("bun add");
  });
});

describe("removeCmd", () => {
  it("returns correct remove command for each PM", () => {
    expect(removeCmd("pnpm")).toBe("pnpm remove");
    expect(removeCmd("npm")).toBe("npm uninstall");
    expect(removeCmd("yarn")).toBe("yarn remove");
    expect(removeCmd("bun")).toBe("bun remove");
  });
});

describe("runCmd", () => {
  it("returns correct run command for each PM", () => {
    expect(runCmd("pnpm", "dev")).toBe("pnpm dev");
    expect(runCmd("npm", "dev")).toBe("npm run dev");
    expect(runCmd("yarn", "dev")).toBe("yarn dev");
    expect(runCmd("bun", "dev")).toBe("bun dev");
  });

  it("handles scripts with arguments", () => {
    expect(runCmd("npm", "test -- --watch")).toBe("npm run test -- --watch");
    expect(runCmd("pnpm", "test -- --run")).toBe("pnpm test -- --run");
  });

  it("handles multiple script arguments", () => {
    expect(runCmd("npm", "lint -- --fix --dir src")).toBe("npm run lint -- --fix --dir src");
  });

  it("handles colon-separated script names", () => {
    expect(runCmd("yarn", "test:coverage")).toBe("yarn test:coverage");
  });
});

describe("runInDir", () => {
  it("returns correct subdir run command (quoted)", () => {
    expect(runInDir("pnpm", "backend", "dev")).toBe('pnpm -C "backend" dev');
    expect(runInDir("npm", "backend", "dev")).toBe('npm --prefix "backend" run dev');
    expect(runInDir("yarn", "backend", "dev")).toBe('yarn --cwd "backend" dev');
    expect(runInDir("bun", "backend", "dev")).toBe('bun --cwd "backend" dev');
  });

  it("handles paths with spaces", () => {
    expect(runInDir("npm", "my project/backend", "dev")).toBe('npm --prefix "my project/backend" run dev');
    expect(runInDir("pnpm", "my project/backend", "dev")).toBe('pnpm -C "my project/backend" dev');
  });

  it("handles scripts with arguments", () => {
    expect(runInDir("npm", "backend", "test -- --watch")).toBe('npm --prefix "backend" run test -- --watch');
    expect(runInDir("pnpm", "backend", "test -- --run")).toBe('pnpm -C "backend" test -- --run');
  });

  it("handles deep nested paths", () => {
    expect(runInDir("pnpm", "packages/my-pkg/src", "build")).toBe('pnpm -C "packages/my-pkg/src" build');
  });
});

describe("runInDirBare", () => {
  it("returns correct subdir run command (unquoted)", () => {
    expect(runInDirBare("pnpm", "backend", "dev")).toBe("pnpm -C backend dev");
    expect(runInDirBare("npm", "backend", "dev")).toBe("npm --prefix backend run dev");
    expect(runInDirBare("yarn", "backend", "dev")).toBe("yarn --cwd backend dev");
    expect(runInDirBare("bun", "backend", "dev")).toBe("bun --cwd backend dev");
  });

  it("handles scripts with arguments", () => {
    expect(runInDirBare("npm", "backend", "test -- --coverage")).toBe("npm --prefix backend run test -- --coverage");
    expect(runInDirBare("yarn", "frontend", "lint --fix")).toBe("yarn --cwd frontend lint --fix");
  });
});

describe("convertRootScripts", () => {
  const pnpmScripts = {
    dev: 'concurrently "pnpm -C backend dev" "pnpm -C frontend dev"',
    build: "pnpm -C frontend build",
    lint: "pnpm -C backend lint && pnpm -C frontend lint",
    test: 'concurrently "pnpm -C backend test" "pnpm -C frontend test"',
    "test:coverage": 'concurrently "pnpm -C backend test:coverage" "pnpm -C frontend test:coverage"',
    "install:all": "pnpm install",
  };

  it("returns scripts unchanged for pnpm", () => {
    expect(convertRootScripts("pnpm", pnpmScripts)).toEqual(pnpmScripts);
  });

  it("converts scripts for npm", () => {
    const result = convertRootScripts("npm", pnpmScripts);
    expect(result.dev).toContain('npm --prefix backend run dev');
    expect(result.dev).toContain('npm --prefix frontend run dev');
    expect(result.build).toBe("npm --prefix frontend run build");
    expect(result.lint).toContain("npm --prefix backend run lint");
    expect(result["install:all"]).toBe("npm install");
  });

  it("converts scripts for yarn", () => {
    const result = convertRootScripts("yarn", pnpmScripts);
    expect(result.dev).toContain('yarn --cwd backend dev');
    expect(result.dev).toContain('yarn --cwd frontend dev');
    expect(result.build).toBe("yarn --cwd frontend build");
    expect(result["install:all"]).toBe("yarn install");
  });

  it("converts scripts for bun", () => {
    const result = convertRootScripts("bun", pnpmScripts);
    expect(result.dev).toContain('bun --cwd backend dev');
    expect(result.dev).toContain('bun --cwd frontend dev');
    expect(result.build).toBe("bun --cwd frontend build");
    expect(result["install:all"]).toBe("bun install");
  });

  it("handles scripts with no pnpm commands (unchanged)", () => {
    const scripts = { start: "node server.js", custom: "echo hello" };
    for (const pm of ["npm", "yarn", "bun"]) {
      expect(convertRootScripts(pm, scripts)).toEqual(scripts);
    }
  });

  it("handles empty scripts object", () => {
    expect(convertRootScripts("npm", {})).toEqual({});
    expect(convertRootScripts("yarn", {})).toEqual({});
  });

  it("handles scripts with pnpm quoted paths with spaces", () => {
    const scripts = { dev: 'pnpm -C "my app/backend" dev' };
    const result = convertRootScripts("npm", scripts);
    expect(result.dev).toBe('npm --prefix "my app/backend" run dev');
  });

  it("handles scripts with pnpm install (bare)", () => {
    const scripts = { install: "pnpm install" };
    for (const target of ["npm", "yarn", "bun"]) {
      const result = convertRootScripts(target, scripts);
      expect(result.install).toBe(`${target} install`);
    }
  });

  it("preserves non-pnpm scripts unchanged", () => {
    const scripts = {
      prebuild: "node scripts/prebuild.mjs",
      lint: "pnpm -C backend lint",
      postinstall: "husky",
    };
    const result = convertRootScripts("npm", scripts);
    expect(result.prebuild).toBe("node scripts/prebuild.mjs");
    expect(result.lint).toBe("npm --prefix backend run lint");
    expect(result.postinstall).toBe("husky");
  });

  it("handles concurrently-wrapped pnpm commands", () => {
    const scripts = { dev: 'concurrently "pnpm -C a dev" "pnpm -C b dev -- --port 3000"' };
    const npmResult = convertRootScripts("npm", scripts);
    expect(npmResult.dev).toContain('npm --prefix a run dev');
    expect(npmResult.dev).toContain('npm --prefix b run dev -- --port 3000');
  });

  it("handles scripts with pnpm install (bare)", () => {
    const scripts = { install: "pnpm install" };
    for (const target of ["npm", "yarn", "bun"]) {
      const result = convertRootScripts(target, scripts);
      expect(result.install).toBe(`${target} install`);
    }
  });

  it("preserves non-pnpm scripts unchanged", () => {
    const scripts = {
      prebuild: "node scripts/prebuild.mjs",
      lint: "pnpm -C backend lint",
      postinstall: "husky",
    };
    const result = convertRootScripts("npm", scripts);
    expect(result.prebuild).toBe("node scripts/prebuild.mjs");
    expect(result.lint).toBe("npm --prefix backend run lint");
    expect(result.postinstall).toBe("husky");
  });

  it("handles concurrently-wrapped pnpm commands", () => {
    const scripts = { dev: 'concurrently "pnpm -C a dev" "pnpm -C b dev -- --port 3000"' };
    const npmResult = convertRootScripts("npm", scripts);
    expect(npmResult.dev).toContain('npm --prefix a run dev');
    expect(npmResult.dev).toContain('npm --prefix b run dev -- --port 3000');
  });
});

describe("packageManagerField", () => {
  it("returns versioned field for each PM", () => {
    expect(packageManagerField("pnpm")).toMatch(/^pnpm@/);
    expect(packageManagerField("npm")).toMatch(/^npm@/);
    expect(packageManagerField("yarn")).toMatch(/^yarn@/);
    expect(packageManagerField("bun")).toMatch(/^bun@/);
  });

  it("returns pnpm-based field for unknown PM fallback", () => {
    const result = packageManagerField("invalid");
    expect(result).toMatch(/^pnpm@/);
  });
});
