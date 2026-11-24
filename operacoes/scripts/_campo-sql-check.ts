/**
 * Verificação local (não roda em produção nem nos testes): executa as consultas
 * de src/server/campo-readonly.ts contra uma CÓPIA do banco de demonstração do
 * Campo (PGlite), para conferir nomes de tabelas/colunas e a sintaxe.
 * Uso: npx tsx --tsconfig tsconfig.scripts.json scripts/_campo-sql-check.ts <pasta-da-cópia> <pglite-module>
 */
const [dataDir, pgliteModule] = process.argv.slice(2);
const FRAG = Symbol("frag");
type Frag = { [FRAG]: true; strings: TemplateStringsArray; vals: unknown[] } & PromiseLike<unknown[]>;

async function main() {
  const { PGlite } = await import(pgliteModule);
  const db = new PGlite(dataDir);
  const roleSql = process.argv[4];
  if (roleSql) {
    const { readFileSync } = await import("node:fs");
    await db.exec(readFileSync(roleSql, "utf8").replace("TROQUE_ESTA_SENHA", "senhaDeTesteLocal123"));
    await db.exec("set role mcx_leitura");
    const tryWrite = async (label: string, q: string) => {
      try {
        await db.query(q);
        console.log("ERRO: conseguiu", label);
      } catch (e) {
        console.log("bloqueado:", label, "-", String((e as Error).message).slice(0, 80));
      }
    };
    await tryWrite("ler password_hash", "select password_hash from users limit 1");
    await tryWrite("ler telefone", "select phone from users limit 1");
    await tryWrite("gravar", "update agencies set name = name");
    await tryWrite("ler fotos", "select * from photos limit 1");
  }
  const build = (f: Frag, params: unknown[]): string =>
    f.strings.reduce((acc, s, i) => {
      if (i === 0) return s;
      const v = f.vals[i - 1];
      if (v && typeof v === "object" && FRAG in (v as object)) return acc + build(v as Frag, params) + s;
      params.push(v);
      return `${acc}$${params.length}${s}`;
    }, "");
  const sql = (strings: TemplateStringsArray, ...vals: unknown[]): Frag => {
    const frag = {
      [FRAG]: true as const,
      strings,
      vals,
      then(res: (v: unknown[]) => unknown, rej: (e: unknown) => unknown) {
        const params: unknown[] = [];
        const text = build(frag as Frag, params);
        return db.query(text, params).then((r: { rows: unknown[] }) => r.rows).then(res, rej);
      },
    };
    return frag as Frag;
  };
  process.env.CAMPO_READONLY_DATABASE_URL = "postgres://verificacao-local";
  (globalThis as { __campoRo?: unknown }).__campoRo = { begin: (_mode: string, fn: (s: typeof sql) => Promise<unknown>) => fn(sql) };
  const campo = await import("../src/server/campo-readonly");
  const f = { from: "2026-01-01", to: "2026-12-31", limit: 3 };
  console.log("RESUMO", JSON.stringify(await campo.campoSummary(f)).slice(0, 900));
  for (const kind of campo.CAMPO_DETAILS) {
    const rows = (await campo.campoDetail(kind, f)) as unknown[];
    console.log(kind, rows.length, JSON.stringify(rows[0] ?? null).slice(0, 300));
  }
  const ag = await campo.campoDetail("rupturas", { ...f, agency: "AF", brand: "Bravo" });
  console.log("filtro agencia+marca", (ag as unknown[]).length);
  await db.close();
}
main().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
