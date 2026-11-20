/** Build de produção local com banco embutido de demonstração. NÃO usar em produção. */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL ?? "pglite:./.data/pglite-demo",
  OPS_LOCAL_UPLOADS: "demo",
  SESSION_SECRET: process.env.SESSION_SECRET ?? "ops-demo-local-apenas-para-teste-0123456789abcdef",
};
const child = spawn(`npx next start -p ${Number(process.env.PORT ?? 3800)}`, { env, cwd: root, stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
