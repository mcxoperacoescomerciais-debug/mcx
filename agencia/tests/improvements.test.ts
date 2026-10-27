/** Sugestões de melhoria: validação do envio e da análise devolvida pelo Claude. */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { checkImprovementInput, parseAnalysis } from "../src/lib/improvements";

describe("sugestão de melhoria", () => {
  test("exige título e uma descrição mínima", () => {
    assert.equal(checkImprovementInput({ title: "Oi", description: "Algo melhor aqui" }).ok, false);
    assert.equal(checkImprovementInput({ title: "Foto do depois", description: "curto" }).ok, false);
    assert.equal(checkImprovementInput({ title: "Foto do depois", description: "Avisar quando faltar a foto do depois." }).ok, true);
  });

  test("análise válida é aceita e listas são limpas", () => {
    const a = parseAnalysis({
      resumo: " Avisar falta de foto ",
      fazSentido: "sim",
      justificativa: "Evita retrabalho.",
      quemSeBeneficia: "Gestor",
      jaExiste: "",
      impacto: "medio",
      esforco: "pequeno",
      riscos: ["", "Mais notificações no celular"],
      perguntas: [],
      recomendacao: "Fazer.",
    });
    assert.equal(a?.resumo, "Avisar falta de foto");
    assert.deepEqual(a?.riscos, ["Mais notificações no celular"]);
  });

  test("análise fora do formato é recusada", () => {
    assert.equal(parseAnalysis(null), null);
    assert.equal(parseAnalysis({ resumo: "x", fazSentido: "talvez", impacto: "medio", esforco: "pequeno" }), null);
    assert.equal(parseAnalysis({ resumo: "", fazSentido: "sim", impacto: "medio", esforco: "pequeno" }), null);
  });
});
