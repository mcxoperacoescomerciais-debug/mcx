/**
 * REGRA Nº 1: o MCX Campo não pode ser afetado.
 * Falha se esta branch alterar qualquer arquivo de agencia/ em relação à main,
 * ou se o Operações importar código do Campo.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { looksLikeCampo } from "../scripts/campo-guard";

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (name === "node_modules" || name === ".next" || name === ".data") return [];
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe("guarda do MCX Campo", () => {
  test("nenhum arquivo de agencia/ alterado nesta branch (commits e alterações locais)", () => {
    const root = git("rev-parse", "--show-toplevel");
    const base = ["origin/main", "main"].find((ref) => {
      try {
        git("-C", root, "rev-parse", "--verify", "--quiet", ref);
        return true;
      } catch {
        return false;
      }
    });
    assert.ok(base, "não encontrei a branch main para comparar");
    const committed = git("-C", root, "diff", "--name-only", `${base}...HEAD`, "--", "agencia");
    const local = git("-C", root, "status", "--porcelain", "--", "agencia");
    assert.equal(committed, "", `arquivos de agencia/ alterados em commits:\n${committed}`);
    assert.equal(local, "", `arquivos de agencia/ alterados localmente:\n${local}`);
  });

  test("o Operações não importa código de agencia/", () => {
    const offenders = ["src", "scripts", "tests"]
      .flatMap((d) => walk(d))
      .filter((f) => /\.(ts|tsx|mjs)$/.test(f) && !f.endsWith("guarda-campo.test.ts"))
      .filter((f) => /from\s+["'][^"']*agencia\//.test(readFileSync(f, "utf8")));
    assert.deepEqual(offenders, []);
  });

  test("a migration recusa o banco do Campo", () => {
    assert.equal(looksLikeCampo(["users", "visits", "attendances"]), true);
    assert.equal(looksLikeCampo(["users", "clients", "demands"]), false);
  });
});
