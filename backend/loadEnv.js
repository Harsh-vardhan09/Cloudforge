// Imported as the very first statement in server.js.
//
// ESM evaluates imported modules fully, in order, before the importing module's
// own body runs. dotenv.config() placed in the body of server.js therefore runs
// *after* every other module has already been evaluated, so any module that
// reads process.env at module scope sees nothing. Doing the load here, in a
// module that is imported first, makes the variables available to all of them.
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });
