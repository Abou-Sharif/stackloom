import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import ejs from 'ejs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOME = os.homedir();

/**
 * TemplateLoader — resolves and renders templates from 3 locations:
 *   1. ./<project>/.loom/templates/<template-path>   (project-specific — highest priority)
 *   2. ~/.loom/templates/<template-path>             (user-global overrides)
 *   3. built-in/packages/cli/src/templates/         (shipped defaults)
 */
export class TemplateLoader {
  constructor() {
    this.cache = new Map(); // cacheKey → { compiled, mtime }
    this.projectRoot = process.cwd(); // default, can be overridden per call
  }

  /**
   * Resolve template file path from template identifier
   * @param {string} templatePath - e.g., 'resource/model.js.ejs'
   * @param {string} projectRoot - root of the Stackloom project
   * @returns {string} absolute path to template file
   */
  resolve(templatePath, projectRoot = this.projectRoot) {
    const locations = [
      path.join(projectRoot, '.loom', 'templates', templatePath),
      path.join(HOME, '.loom', 'templates', templatePath),
      path.join(__dirname, '..', '..', 'src', 'templates', templatePath),
    ];

    for (const loc of locations) {
      if (fs.existsSync(loc)) {
        return loc;
      }
    }

    // Not found anywhere — helpful error
    const relativePath = templatePath;
    throw new Error(
      `Template not found: ${relativePath}\n` +
      `Searched in:\n` +
      locations.map(l => `  ${l}`).join('\n') + '\n' +
      `Run 'loom template list' to see available templates.`
    );
  }

  /**
   * Render a template with given context
   * @param {string} templatePath - template identifier
   * @param {object} context - variables available in template
   * @param {string} projectRoot - Stackloom project root
   * @returns {string} rendered content
   */
  async render(templatePath, context = {}, projectRoot = this.projectRoot) {
    const fullPath = this.resolve(templatePath, projectRoot);
    
    // Build cache key: file path + resource name (so cache invalidation is per-resource)
    const cacheKey = `${fullPath}:${context.resource?.name || 'global'}`;
    
    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      const currentMtime = (await fs.stat(fullPath)).mtimeMs;
      if (currentMtime === cached.mtime) {
        return cached.compiled(context);
      }
    }

    const source = await fs.readFile(fullPath, 'utf-8');
    
    // Compile with EJS.
    // rmWhitespace MUST stay false — it strips every line's leading whitespace,
    // flattening generated code to column 0. Templates instead control output
    // whitespace explicitly with the `-%>` slurp tag.
    const compiled = ejs.compile(source, {
      filename: fullPath,
      cache: false, // we manage our own cache
      rmWhitespace: false,
    });

    // Verify compilation works
    try {
      const result = compiled(context);
      
      // Cache it
      const mtime = (await fs.stat(fullPath)).mtimeMs;
      this.cache.set(cacheKey, { compiled, mtime, path: fullPath });
      
      return result;
    } catch (err) {
      const lineInfo = this.getErrorLine(err, source);
      throw new Error(
        `Template render error in ${templatePath}${lineInfo ? ` (line ${lineInfo})` : ''}:\n` +
        `${err.message}\n` +
        `Available context keys: ${Object.keys(context).join(', ')}`
      );
    }
  }

  getErrorLine(err, source) {
    const match = err.stack?.match(/\((\d+):(\d+)\)$/);
    if (match) return match[1];
    return null;
  }

  /**
   * List all built-in templates
   * @returns {Array<{relativePath: string, fullPath: string, size: number}>}
   */
  async listBuiltIn() {
    const builtInDir = path.join(__dirname, '..', '..', 'src', 'templates');
    return this.listTemplatesRecursive(builtInDir, '');
  }

  listTemplatesRecursive(dir, prefix) {
    const entries = [];
    const items = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const item of items) {
      const relPath = prefix ? `${prefix}/${item.name}` : item.name;
      const fullPath = path.join(dir, item.name);
      
      if (item.isDirectory()) {
        entries.push(...this.listTemplatesRecursive(fullPath, relPath));
      } else if (item.isFile() && (item.name.endsWith('.ejs') || item.name.endsWith('.js') || item.name.endsWith('.jsx'))) {
        const stat = fs.statSync(fullPath);
        entries.push({
          relativePath: relPath.replace(/\.ejs$/, ''), // strip .ejs for display
          fullPath,
          size: stat.size,
        });
      }
    }
    
    return entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  /**
   * Clear cache (useful for tests or after template edits)
   */
  clearCache() {
    this.cache.clear();
  }
}

/**
 * Helper functions available in all templates
 */
export const templateHelpers = {
  pascal: (s) => s.charAt(0).toUpperCase() + s.slice(1),
  camel: (s) => s.charAt(0).toLowerCase() + s.slice(1),
  snake: (s) => s.replace(/[A-Z]/g, m => '_' + m.toLowerCase()),
  kebab: (s) => s.replace(/[A-Z]/g, m => '-' + m.toLowerCase()),
  quote: (str) => JSON.stringify(str),
  indent: (str, n = 2) => str.split('\n').map(l => ' '.repeat(n) + l).join('\n'),
  pluralize: (word) => word + 's', // simplistic
};
