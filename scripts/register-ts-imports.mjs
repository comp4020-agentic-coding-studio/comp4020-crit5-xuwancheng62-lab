// Registers ts-import-resolver.mjs so `node --import ./scripts/register-ts-imports.mjs <file>.ts`
// can follow this project's extensionless relative imports. See that file
// for why this exists.
import { register } from "node:module";

register("./ts-import-resolver.mjs", import.meta.url);
