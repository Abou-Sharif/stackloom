# Programmatic API

The CLI's subsystems are plain ES modules — you can drive generation from your
own scripts. Everything below is `import`-able from `src/`.

## Blueprint — the architecture contract

```js
import { blueprintLoader } from "./src/blueprint/index.js";

const blueprint = await blueprintLoader.load(projectRoot);
// 3-tier resolution: <project>/.loom/blueprint.json → ~/.loom/blueprint.json → built-in default

blueprint.resolveRoot("backend", projectRoot);          // → "backend" (detected dir name)
blueprint.resolvePath("backend.modules", projectRoot);  // → absolute path
blueprint.renderTemplate("{@backend.modules}/{kebab}/{Name}.js", projectRoot, { kebab, Name });
blueprint.getAnchor("backend.routes");                  // → { file, strategy, pattern }
blueprint.usesTypeScript(projectRoot);                  // → boolean
```

A malformed `blueprint.json` is rejected on load with a path-pointed error.

## Recipe — the declarative manifest

```js
import { recipeLoader } from "./src/recipes/index.js";

const recipe = await recipeLoader.load("resource", blueprint);
const plan = recipe.plan({
  context: { withFrontend: true, architecture: "moderate", formMode: "modal" },
  blueprint,
  projectRoot,
  vars: { kebab: "order", Name: "Order" },
});
// → { recipe, context, files: [{template, out}], inject: [{anchor, template}], requires: [...] }
```

`when` conditions on files/injects/requires are evaluated by a safe expression
evaluator (`evaluateCondition`) — no `eval`.

## Engine — the transactional pipeline

```js
import { createGenerationPipeline } from "./src/engine/index.js";

const pipeline = createGenerationPipeline({
  renderer: (templatePath, ctx) => templateLoader.render(templatePath, ctx, projectRoot),
});

const result = await pipeline.run({
  projectRoot, recipe, blueprint,
  recipeContext: { withFrontend: true },
  vars: { kebab: "order", Name: "Order" },
  templateContext: { resource, blueprint, options, project, utils },
  dryRun: false,
});
// plan → render → inject → validate → commit. Atomic: rolls back on any failure.
```

Lower-level building blocks are also exported: `Pipeline`, `defineStep`,
`FileTransaction`, `Validator`, `scanDelimiters`, `Injector`.

## Services — injectable collaborators

```js
import { createServices, Reporter, reporterFromOptions } from "./src/services/index.js";

const { reporter, clock } = createServices({ reporterOptions: { quiet, json } });
// Reporter replaces console/chalk/ora — honors --quiet/--json/--no-color, auto-quiets in CI.
```

## Schemas — input validation

```js
import { validateResourceDefinition, validateGenerateOptions } from "./src/schemas/index.js";

validateResourceDefinition(raw);   // → { success, data } | { success: false, issues: string[] }
validateGenerateOptions(options);  // → { success, issues }
```

## Branding — rebrandable identity

```js
import { branding, loadBrandingFrom, saveBrandingTo } from "./src/branding/index.js";
// `branding` is the effective identity (binName, displayName, description, ...).
```

## Legacy

`Generator` (`src/core/generator.js`) and `ResourceDefinition`
(`src/core/resource-definition.js`) remain for the older `make:resource` path.
New work should use the recipe + engine API above.
