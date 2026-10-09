// Node loader for the reports engine: '@/x' → project root, extensionless
// relative imports → .ts/.json, and utils/i18n (React Native) → ./shim-i18n.ts.
import { registerHooks, createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const ROOT = '/Users/animesh/Developer/projects/astropedia/';
const SHIM = new URL('./shim-i18n.ts', import.meta.url).href;
function fix(p) {
  if (/\.(ts|json|js|mjs)$/.test(p)) return p;
  for (const ext of ['.ts', '.js', '.json', '/index.ts']) if (existsSync(p + ext)) return p + ext;
  return p;
}
registerHooks({
  resolve(specifier, context, next) {
    const parent = context.parentURL ?? '';
    const inApp = parent.includes('/astropedia/') && !parent.includes('/node_modules/');
    let abs = null;
    if (specifier.startsWith('@/')) abs = ROOT + specifier.slice(2);
    else if (inApp && /^\.\.?\//.test(specifier)) abs = new URL(specifier, parent).pathname;
    else if (specifier.startsWith(ROOT)) abs = specifier;
    if (abs) {
      if (/\/astropedia\/utils\/i18n(\.ts)?$/.test(abs)) return next(SHIM, context);
      abs = fix(abs);
      return next(context.conditions?.includes('require') ? abs : 'file://' + abs, context);
    }
    return next(specifier, context);
  },
});
globalThis.require = createRequire(ROOT + 'package.json');
