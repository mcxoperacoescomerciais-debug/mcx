/** Recursos liberados por agência (equipe MCX): registro único, padrão, menu e páginas escondidas. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { AGENCY_MODULES, hiddenPanels, hiddenPaths, isHiddenPath, mergeSettings, modulesFromForm, resolveModules } from "../src/lib/settings";

test("agência que já existe continua com tudo o que tinha: recursos novos vêm ligados", () => {
  const st = mergeSettings({ modules: { tastings: true, finance: false, sistematica: true } });
  assert.deepEqual(st.modules, { stock: true, damage: true, tastings: true, finance: false, sistematica: true });
  assert.deepEqual(mergeSettings({}).modules, { stock: true, damage: true, tastings: true, finance: true, sistematica: false });
  assert.deepEqual(hiddenPaths(st), []);
  assert.deepEqual(hiddenPanels(st), ["financeiro"]);
});

test("registro único: todo recurso tem chave, nome e padrão; valor inválido é ignorado", () => {
  assert.equal(new Set(AGENCY_MODULES.map((m) => m.key)).size, AGENCY_MODULES.length);
  assert.ok(AGENCY_MODULES.every((m) => m.label && m.group && typeof m.on === "boolean"));
  assert.equal(resolveModules({ stock: "não" as never }).stock, true);
  assert.equal(resolveModules({ stock: false }).stock, false);
});

test("formulário da equipe MCX: caixa marcada liga, desmarcada desliga", () => {
  const fd = new Map<string, unknown>([
    ["tastings", "on"],
    ["finance", "on"],
  ]);
  assert.deepEqual(modulesFromForm(fd), { stock: false, damage: false, tastings: true, finance: true, sistematica: false });
});

test("agência de degustação: sem estoque/ruptura/validade e sem avarias, o painel e as páginas somem", () => {
  const st = mergeSettings({ modules: { stock: false, damage: false } });
  assert.ok(hiddenPanels(st).includes("estoque"));
  const hidden = hiddenPaths(st);
  for (const p of ["/painel/estoque", "/painel/rupturas", "/painel/validades", "/painel/avarias", "/painel/indicadores"]) assert.ok(isHiddenPath(p, hidden), p);
  assert.ok(isHiddenPath("/painel/rupturas/abc", hidden));
  assert.equal(isHiddenPath("/painel/fotos", hidden), false);
  assert.equal(isHiddenPath("/painel/estoquex", hidden), false);
});

test("só avarias ligado: o painel fica, as três páginas de produto somem e Avarias continua", () => {
  const st = mergeSettings({ modules: { stock: false, damage: true } });
  assert.equal(hiddenPanels(st).includes("estoque"), false);
  const hidden = hiddenPaths(st);
  assert.ok(isHiddenPath("/painel/validades", hidden));
  assert.equal(isHiddenPath("/painel/avarias", hidden), false);
  assert.equal(isHiddenPath("/painel/indicadores", hidden), false);
});
