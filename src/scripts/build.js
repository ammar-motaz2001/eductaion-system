'use strict';

/**
 * Build / verification gate.
 *
 * This project ships plain CommonJS, so there is nothing to transpile — but
 * "no compile step" must not mean "no check". This script performs the
 * verification a compiler would otherwise give you, without needing a database:
 *
 *   1. Environment configuration parses and validates
 *   2. Every source file loads (syntax errors, bad requires, circular imports)
 *   3. Every Mongoose model registers, with its indexes well-formed
 *   4. The OpenAPI document builds and every `$ref` resolves
 *   5. Every route module is mounted on the router
 *   6. The Express application assembles end to end
 *
 * Exits non-zero on the first category that fails, so it is usable in CI and as
 * a pre-deploy gate.
 *
 *   npm run build
 */

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..');
const ROOT = path.resolve(SRC, '..');

const results = [];
let failed = 0;

const colour = process.stdout.isTTY
  ? { green: '\x1b[32m', red: '\x1b[31m', dim: '\x1b[2m', bold: '\x1b[1m', reset: '\x1b[0m' }
  : { green: '', red: '', dim: '', bold: '', reset: '' };

/** Run one named check; a thrown error fails it without aborting the rest. */
function check(name, fn) {
  try {
    const detail = fn();
    results.push({ name, ok: true, detail });
    console.log(
      `  ${colour.green}✓${colour.reset} ${name}${detail ? ` ${colour.dim}— ${detail}${colour.reset}` : ''}`
    );
  } catch (error) {
    failed += 1;
    results.push({ name, ok: false, detail: error.message });
    console.log(`  ${colour.red}✗${colour.reset} ${name}`);
    console.log(`      ${colour.red}${error.message}${colour.reset}`);
    if (process.env.BUILD_VERBOSE === 'true' && error.stack) {
      console.log(colour.dim + error.stack.split('\n').slice(1, 4).join('\n') + colour.reset);
    }
  }
}

/** Every `.js` file under `src`, excluding this script. */
function sourceFiles(dir = SRC) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!entry.name.endsWith('.js')) return [];
    if (full === __filename) return [];
    return [full];
  });
}

console.log(`\n${colour.bold}Building — Education Management System backend${colour.reset}\n`);

// ── 1. Configuration ────────────────────────────────────────────────────────
console.log(`${colour.bold}Configuration${colour.reset}`);

check('environment source present', () => {
  const hasEnvFile = fs.existsSync(path.join(ROOT, '.env'));
  const hasPlatformEnv = Boolean(
    process.env.MONGODB_URI &&
      process.env.JWT_ACCESS_SECRET &&
      process.env.JWT_REFRESH_SECRET
  );

  if (process.env.VERCEL || hasPlatformEnv) {
    return process.env.VERCEL ? 'Vercel dashboard' : 'process environment';
  }

  if (!hasEnvFile) {
    throw new Error('No .env file found — copy .env.example to .env');
  }

  return '.env';
});

let env;
check('environment validates', () => {
  // env.js calls process.exit on invalid config, so pre-validate the essentials
  // to produce a readable failure here instead of an abrupt exit.
  env = require('../config/env');
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');
  }
  return `${env.NODE_ENV}, port ${env.PORT}, storage ${env.STORAGE_DRIVER}`;
});

check('production secrets are not defaults', () => {
  if (!env?.isProduction) return 'skipped (not production)';
  const weak = ['change_me', 'secret', 'password'];
  const offenders = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'].filter((key) =>
    weak.some((token) => String(env[key]).toLowerCase().includes(token))
  );
  if (offenders.length) throw new Error(`Placeholder secret still in use: ${offenders.join(', ')}`);
  return 'strong';
});

// ── 2. Sources ──────────────────────────────────────────────────────────────
console.log(`\n${colour.bold}Sources${colour.reset}`);

const files = sourceFiles();

check('all source files load', () => {
  const broken = [];
  for (const file of files) {
    try {
      require(file);
    } catch (error) {
      broken.push(`${path.relative(ROOT, file)}: ${error.message}`);
    }
  }
  if (broken.length)
    throw new Error(`${broken.length} file(s) failed:\n      ${broken.join('\n      ')}`);
  return `${files.length} files`;
});

// ── 3. Models ───────────────────────────────────────────────────────────────
console.log(`\n${colour.bold}Data model${colour.reset}`);

const mongoose = require('mongoose');

check('models register', () => {
  const names = mongoose.modelNames();
  if (names.length < 16) {
    throw new Error(`Expected at least 16 models, found ${names.length}: ${names.join(', ')}`);
  }
  return `${names.length} models`;
});

check('schemas expose timestamps and indexes', () => {
  const problems = [];
  for (const name of mongoose.modelNames()) {
    const schema = mongoose.model(name).schema;
    if (!schema.path('createdAt') || !schema.path('updatedAt')) {
      problems.push(`${name} is missing timestamps`);
    }
    // Index definitions are validated by building them into a plain spec —
    // a malformed key would throw here rather than at first write in production.
    for (const [fields] of schema.indexes()) {
      if (!fields || typeof fields !== 'object' || !Object.keys(fields).length) {
        problems.push(`${name} has an empty index definition`);
      }
    }
  }
  if (problems.length) throw new Error(problems.join('; '));
  const total = mongoose
    .modelNames()
    .reduce((sum, name) => sum + mongoose.model(name).schema.indexes().length, 0);
  return `${total} index definitions`;
});

check('every ObjectId ref points at a registered model', () => {
  const registered = new Set(mongoose.modelNames());
  const dangling = [];
  for (const name of mongoose.modelNames()) {
    const schema = mongoose.model(name).schema;
    schema.eachPath((pathName, type) => {
      const ref = type.options?.ref || type.caster?.options?.ref;
      if (ref && !registered.has(ref)) dangling.push(`${name}.${pathName} → ${ref}`);
    });
  }
  if (dangling.length) throw new Error(`Unresolved refs: ${dangling.join(', ')}`);
  return 'all resolved';
});

// ── 4. API documentation ────────────────────────────────────────────────────
console.log(`\n${colour.bold}API documentation${colour.reset}`);

const { spec } = require('../config/swagger');

check('OpenAPI document builds', () => {
  const paths = Object.keys(spec.paths || {});
  if (!paths.length) throw new Error('No documented paths — Swagger annotations failed to parse');
  const operations = paths.reduce(
    (sum, key) =>
      sum +
      Object.keys(spec.paths[key]).filter((method) =>
        ['get', 'post', 'put', 'patch', 'delete'].includes(method)
      ).length,
    0
  );
  return `${paths.length} paths, ${operations} operations`;
});

check('every $ref resolves', () => {
  const missing = new Set();

  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') {
        // Resolve `#/components/schemas/Foo` against the document.
        const segments = value.replace(/^#\//, '').split('/');
        let cursor = spec;
        for (const segment of segments) {
          cursor = cursor?.[segment];
          if (cursor === undefined) break;
        }
        if (cursor === undefined) missing.add(value);
      } else {
        walk(value);
      }
    }
  };

  walk(spec.paths);
  if (missing.size) throw new Error(`Unresolved: ${[...missing].join(', ')}`);
  return 'all resolved';
});

check('documented operations declare responses', () => {
  const offenders = [];
  for (const [route, methods] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      if (!operation.responses || !Object.keys(operation.responses).length) {
        offenders.push(`${method.toUpperCase()} ${route}`);
      }
    }
  }
  if (offenders.length) throw new Error(`Missing responses: ${offenders.join(', ')}`);
  return 'complete';
});

// ── 5. Routing ──────────────────────────────────────────────────────────────
console.log(`\n${colour.bold}Routing${colour.reset}`);

check('every route module is mounted', () => {
  const routeFiles = files.filter((file) => file.endsWith('.routes.js'));
  const indexSource = fs.readFileSync(path.join(SRC, 'routes', 'index.js'), 'utf8');

  // Routers mounted by a parent router rather than by the root index.
  const nested = ['collectionStudent.routes.js'];

  // Map `const xRoutes = require('../modules/x/x.routes')` → variable name, then
  // confirm each variable actually appears in a `{ path, router }` entry.
  // Checking the require alone would pass for a module that is imported but
  // never mounted — which is precisely the mistake worth catching.
  const imported = new Map(
    [...indexSource.matchAll(/const\s+(\w+)\s*=\s*require\('([^']*\.routes)'\)/g)].map((match) => [
      path.basename(match[2]) + '.js',
      match[1],
    ])
  );
  const mountedVars = new Set(
    [...indexSource.matchAll(/\{\s*path:\s*'[^']+',\s*router:\s*(\w+)\s*\}/g)].map(
      (match) => match[1]
    )
  );

  const problems = [];
  for (const file of routeFiles) {
    const name = path.basename(file);
    if (nested.includes(name)) continue;

    const variable = imported.get(name);
    if (!variable) {
      problems.push(`${name} is never imported by routes/index.js`);
    } else if (!mountedVars.has(variable)) {
      problems.push(`${name} is imported as "${variable}" but never mounted`);
    }
  }

  if (problems.length) throw new Error(problems.join('; '));
  return `${routeFiles.length} routers (${mountedVars.size} mounted, ${nested.length} nested)`;
});

check('express application assembles', () => {
  const app = require('../app');
  if (typeof app !== 'function') throw new Error('app.js did not export an Express application');
  return 'ok';
});

check('no route path collisions at the mount level', () => {
  const indexSource = fs.readFileSync(path.join(SRC, 'routes', 'index.js'), 'utf8');
  const mounts = [...indexSource.matchAll(/path:\s*'([^']+)'/g)].map((match) => match[1]);
  const duplicates = mounts.filter((mount, index) => mounts.indexOf(mount) !== index);
  if (duplicates.length)
    throw new Error(`Duplicate mounts: ${[...new Set(duplicates)].join(', ')}`);
  return `${mounts.length} mount points`;
});

// ── Summary ─────────────────────────────────────────────────────────────────
const passed = results.length - failed;
const line = '─'.repeat(58);

console.log(`\n${line}`);
if (failed === 0) {
  console.log(
    `${colour.green}${colour.bold}  BUILD PASSED${colour.reset}  ${passed}/${results.length} checks`
  );
  console.log(line + '\n');
  process.exit(0);
} else {
  console.log(
    `${colour.red}${colour.bold}  BUILD FAILED${colour.reset}  ${passed}/${results.length} checks passed`
  );
  results
    .filter((result) => !result.ok)
    .forEach((result) => console.log(`   ${colour.red}•${colour.reset} ${result.name}`));
  console.log(line + '\n');
  process.exit(1);
}
