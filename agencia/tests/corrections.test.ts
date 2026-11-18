/** Correção do gestor (leitura dos campos) e confirmação de validade já vencida no app. */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { correctionSummary, parseCorrectionDate, parseCorrectionPrice, parseCorrectionQuantity } from "../src/lib/corrections";
import { expiredNeedsConfirm, nextYearIso } from "../src/lib/validity";

describe("correção do gestor: campos do formulário", () => {
  test("data: só datas reais", () => {
    assert.equal(parseCorrectionDate("2027-11-20"), "2027-11-20");
    assert.equal(parseCorrectionDate("2027-02-30"), null);
    assert.equal(parseCorrectionDate("20/11/2027"), null);
    assert.equal(parseCorrectionDate(""), null);
  });

  test("quantidade: inteiro a partir do mínimo", () => {
    assert.equal(parseCorrectionQuantity("2", 1), 2);
    assert.equal(parseCorrectionQuantity("0", 1), null);
    assert.equal(parseCorrectionQuantity("0", 0), 0);
    assert.equal(parseCorrectionQuantity("2,5", 1), null);
    assert.equal(parseCorrectionQuantity("-1", 0), null);
  });

  test("preço: vírgula brasileira, ponto decimal, vazio = sem preço", () => {
    assert.equal(parseCorrectionPrice("12,90"), 12.9);
    assert.equal(parseCorrectionPrice("1.234,56"), 1234.56);
    assert.equal(parseCorrectionPrice("12.9"), 12.9);
    assert.equal(parseCorrectionPrice("R$ 8,00"), 8);
    assert.equal(parseCorrectionPrice(""), null);
    assert.equal(parseCorrectionPrice("abc"), undefined);
  });

  test("resumo traz só o que mudou", () => {
    assert.equal(correctionSummary([["validade", "20/11/2026", "20/11/2027"], ["quantidade", "2", "2"]]), "validade 20/11/2026 → 20/11/2027");
    assert.equal(correctionSummary([["quantidade", "2", "2"]]), null);
  });
});

describe("app: validade já vencida pede confirmação", () => {
  test("data anterior à visita pede confirmação; confirmada ou futura não", () => {
    assert.equal(expiredNeedsConfirm("2026-11-10", "2026-11-18", false), true);
    assert.equal(expiredNeedsConfirm("2026-11-10", "2026-11-18", true), false);
    assert.equal(expiredNeedsConfirm("2026-11-18", "2026-11-18", false), false);
    assert.equal(expiredNeedsConfirm("2027-11-10", "2026-11-18", false), false);
  });

  test("sugestão: a mesma data no ano seguinte", () => {
    assert.equal(nextYearIso("2026-11-10"), "2027-11-10");
    assert.equal(nextYearIso("2024-02-29"), null);
  });
});
