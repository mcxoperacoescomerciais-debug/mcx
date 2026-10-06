/**
 * Sobe o build de produção localmente, com banco embutido próprio e dados de
 * demonstração — para testar PWA/offline como no celular. NÃO usar em produção.
 *   npm run build && npm run start:demo
 */
import { spawn } from "node:child_process";

const env = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL ?? "pglite:./.data/pglite-demo",
  SESSION_SECRET: process.env.SESSION_SECRET ?? "demo-local-apenas-para-teste-0123456789abcdef",
};
const child = spawn("npx", ["next", "start", "-p", process.env.PORT ?? "3100"], { env, stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
