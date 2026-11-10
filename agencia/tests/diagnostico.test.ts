import assert from "node:assert/strict";
import { test } from "node:test";
import { PERGUNTAS, PILARES, calcularResultado, formatarNota, mensagemResultado, type Respostas } from "../src/lib/diagnostico";

const todas = (pontos: number): Respostas => Object.fromEntries(PERGUNTAS.map((q) => [q.id, pontos]));

test("seis pilares, cada um com perguntas de 4 alternativas valendo 0 a 3", () => {
  assert.equal(PILARES.length, 6);
  for (const p of PILARES) assert.ok(PERGUNTAS.some((q) => q.pilar === p.id), p.id);
  for (const q of PERGUNTAS) assert.deepEqual(q.alternativas.map((a) => a.pontos), [0, 1, 2, 3]);
});

test("nota vai de 0 a 10 conforme as respostas", () => {
  assert.equal(calcularResultado(todas(0)).nota, 0);
  assert.equal(calcularResultado(todas(3)).nota, 10);
  assert.equal(calcularResultado(todas(2)).nota, 6.7);
  assert.equal(calcularResultado(todas(0)).nivel.titulo, "Operação em risco");
  assert.equal(calcularResultado(todas(3)).nivel.titulo, "Operação de referência");
});

test("gargalos são os três pilares mais fracos, com achados das respostas fracas", () => {
  const r = todas(3);
  r.comprovacao = 0;
  r.roteiro = 1;
  r.solicitacoes = 1;
  r["busca-informacao"] = 1;
  r.ausencia = 2;
  const res = calcularResultado(r);
  assert.deepEqual(res.gargalos.map((g) => g.id), ["campo", "demandas", "processos"]);
  assert.equal(res.gargalos[0].percentual, 17);
  assert.equal(res.gargalos[0].achados.length, 2);
  assert.equal(res.gargalos[2].achados.length, 0);
  assert.equal(res.plano.length, 4);
  assert.ok(res.plano[0].acoes[0].includes("roteiro"));
});

test("empate mantém a ordem dos pilares", () => {
  assert.deepEqual(calcularResultado(todas(1)).gargalos.map((g) => g.id), ["administrativo", "demandas", "campo"]);
});

test("nota e mensagem no formato brasileiro, com o novo nome", () => {
  assert.equal(formatarNota(6.4), "6,4");
  const msg = mensagemResultado(calcularResultado(todas(2)));
  assert.match(msg, /MCX Soluções Operacionais/);
  assert.match(msg, /6,7 de 10/);
});
