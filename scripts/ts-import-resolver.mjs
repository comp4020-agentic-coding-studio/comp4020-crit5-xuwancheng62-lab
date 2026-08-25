// A tiny Node ESM resolve hook, just for running scripts/*.ts directly with
// plain `node`. Vite and tsc both resolve this project's extensionless
// relative imports (`./types`, not `./types.ts`) via "bundler" module
// resolution — that convention is deliberate (see tsconfig.json,
// allowImportingTsExtensions) and shouldn't change just to suit a side
// script. Plain Node's own ESM resolver has no such fallback, so this hook
// adds the one thing it's missing: if a relative specifier doesn't resolve
// as-is, retry with a `.ts` extension before giving up.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
    if (isRelative && error?.code === "ERR_MODULE_NOT_FOUND" && !specifier.endsWith(".ts")) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw error;
  }
}
