import fs from 'fs-extra';
import path from 'path';

/**
 * StateTracker — tracks generated files for rollbacks
 */
export class StateTracker {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.stateDir = path.join(projectRoot, '.loom');
    this.stateFile = path.join(this.stateDir, 'state.json');
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

  /**
   * Record a new generation event
   */
  async recordEvent(event) {
    const state = await this.loadState();
    const newEvent = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      ...event, // { action: 'generate', resource: 'User', files: [...] }
    };
    state.history.unshift(newEvent);
    // Keep only last 10 events
    if (state.history.length > 10) state.history.pop();
    await this.saveState(state);
    return newEvent.id;
  }

  /**
   * Get last event
   */
  async getLastEvent() {
    const state = await this.loadState();
    return state.history[0] || null;
  }

  /**
   * Remove event by ID
   */
  async removeEvent(id) {
    const state = await this.loadState();
    state.history = state.history.filter(e => e.id !== id);
    await this.saveState(state);
  }
}
