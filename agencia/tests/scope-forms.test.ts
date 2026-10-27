/** Escopos de clientes: editor (seções e itens) e conferência da resposta. */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { checkResponse, itemsFromLines, normalizeSections, SCOPE_TEMPLATE_ADMIN, type ResponseInput } from "../src/lib/scope-forms";

const base: ResponseInput = { answers: {}, generalNote: "", signerName: "Ana", signerRole: "Diretora", signerEmail: "", agree: true };

describe("editor de escopo", () => {
  test("um item por linha, sem marcadores nem linhas vazias", () => {
    assert.deepEqual(itemsFromLines("☐  Primeiro\n\n- Segundo\n3. Terceiro\n  Quarto  "), ["Primeiro", "Segundo", "Terceiro", "Quarto"]);
  });

  test("normaliza seções: numera ids, descarta seções vazias e tipo desconhecido vira checklist", () => {
    const out = normalizeSections([
      { title: " Pessoal ", kind: "checklist", items: ["A", " ", "B"] },
      { title: "", items: [] },
      { title: "Dúvidas", kind: "questions", items: ["Quantos promotores?"] },
      { title: "Outra", kind: "xyz", items: ["C"] },
    ]);
    assert.deepEqual(
      out.map((s) => [s.id, s.title, s.kind, s.items.map((i) => i.id)]),
      [
        ["s1", "Pessoal", "checklist", ["s1-1", "s1-2"]],
        ["s2", "Dúvidas", "questions", ["s2-1"]],
        ["s3", "Outra", "checklist", ["s3-1"]],
      ],
    );
  });

  test("modelo administrativo traz as 9 seções do documento", () => {
    const secs = normalizeSections(SCOPE_TEMPLATE_ADMIN.sections);
    assert.equal(secs.length, 9);
    assert.equal(secs.reduce((n, s) => n + s.items.length, 0), 56);
  });
});

describe("resposta do cliente", () => {
  const sections = normalizeSections([
    { title: "Pessoal", kind: "checklist", items: ["A", "B"] },
    { title: "Dúvidas", kind: "questions", items: ["Pergunta?"] },
  ]);

  test("todo item do checklist precisa de escolha e toda ressalva de comentário", () => {
    const r = checkResponse(sections, { ...base, answers: { "s1-1": { choice: "ok" }, "s1-2": { choice: "reservation", note: "  " } } });
    assert.equal(r.ok, false);
    assert.deepEqual(!r.ok && r.missing, ["s1-2"]);
  });

  test("perguntas são opcionais; aceite, nome e cargo são obrigatórios", () => {
    const answers = { "s1-1": { choice: "ok" }, "s1-2": { choice: "reservation", note: "Só a partir de março" } };
    assert.equal(checkResponse(sections, { ...base, answers, agree: false }).ok, false);
    assert.equal(checkResponse(sections, { ...base, answers, signerRole: "" }).ok, false);
    assert.equal(checkResponse(sections, { ...base, answers, signerEmail: "x@" }).ok, false);
    const r = checkResponse(sections, { ...base, answers: { ...answers, "s1-1": { choice: "ok", note: "ignorado" } } });
    assert.ok(r.ok);
    assert.deepEqual(
      r.ok && r.answers.map((a) => [a.itemId, a.choice, a.note]),
      [
        ["s1-1", "ok", ""],
        ["s1-2", "reservation", "Só a partir de março"],
        ["s2-1", null, ""],
      ],
    );
  });
});
