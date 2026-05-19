import fs from "fs-extra";
import path from "node:path";

/**
 * StateTracker — tracks generated files for rollbacks and amend definitions.
 */
export class StateTracker {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.stateDir = path.join(projectRoot, ".loom");
    this.stateFile = path.join(this.stateDir, "state.json");
    this.resourcesDir = path.join(this.stateDir, "resources");
  }

  async ensureStateDir() {
    await fs.ensureDir(this.stateDir);
  }

  async loadState() {
    if (!(await fs.pathExists(this.stateFile))) {
      return { history: [] };
    }
    try {
      return await fs.readJSON(this.stateFile);
    } catch {
      return { history: [] };
    }
  }

  async saveState(state) {
    await this.ensureStateDir();
    await fs.writeJSON(this.stateFile, state, { spaces: 2 });
  }

  /** Path to persisted resource definition JSON (kebab-case file name). */
  resourceDefinitionPath(resourceName) {
    const kebab = resourceName
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .replace(/[\s_]+/g, "-")
      .toLowerCase();
    return path.join(this.resourcesDir, `${kebab}.json`);
  }

  /** Load last saved definition for amend (`.loom/resources/<kebab>.json`). */
  async loadResourceDefinition(resourceName) {
    const file = this.resourceDefinitionPath(resourceName);
    if (await fs.pathExists(file)) {
      try {
        return await fs.readJSON(file);
      } catch {
        return null;
      }
    }
    const event = await this.findLastResourceEvent(resourceName);
    return event?.definition ?? null;
  }

  /** Persist definition snapshot for future `--amend` runs. */
  async saveResourceDefinition(resourceName, definition) {
    await fs.ensureDir(this.resourcesDir);
    await fs.writeJSON(this.resourceDefinitionPath(resourceName), definition, {
      spaces: 2,
    });
  }

  /**
   * Record a new generation event
   */
  async recordEvent(event) {
    const state = await this.loadState();
    const newEvent = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      ...event,
    };
    state.history.unshift(newEvent);
    if (state.history.length > 10) state.history.pop();
    await this.saveState(state);
    return newEvent.id;
  }

  async getLastEvent() {
    const state = await this.loadState();
    return state.history[0] || null;
  }

  /** Most recent generate/amend event for a resource (PascalCase name). */
  async findLastResourceEvent(resourceName) {
    const state = await this.loadState();
    const target = resourceName.trim();
    return (
      state.history.find(
        (e) =>
          e.resource === target &&
          (e.action === "generate" || e.action === "amend"),
      ) ?? null
    );
  }

  async removeEvent(id) {
    const state = await this.loadState();
    state.history = state.history.filter((e) => e.id !== id);
    await this.saveState(state);
  }
}
