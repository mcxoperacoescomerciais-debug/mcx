import assert from "node:assert/strict";
import { test } from "node:test";
import { validarInteresse } from "../src/lib/formulario";
import { mensagemInteresse, montarLinkWhatsApp, normalizarNumero } from "../src/lib/whatsapp";

test("normaliza números brasileiros com e sem DDI", () => {
  assert.equal(normalizarNumero("+55 (11) 91234-5678"), "5511912345678");
  assert.equal(normalizarNumero("11 91234-5678"), "5511912345678");
  assert.equal(normalizarNumero("(11) 3456-7890"), "551134567890");
});

test("recusa número vazio ou incompleto", () => {
  assert.equal(normalizarNumero(""), null);
  assert.equal(normalizarNumero(undefined), null);
  assert.equal(normalizarNumero("12345"), null);
  assert.equal(normalizarNumero("55119"), null);
});

test("não gera link sem número configurado", () => {
  assert.equal(montarLinkWhatsApp("", "Olá"), null);
});

test("codifica a mensagem para a URL", () => {
  const link = montarLinkWhatsApp("5511912345678", 'Olá! Solução "Controles financeiros" & mais\nlinha 2');
  assert.equal(
    link,
    "https://wa.me/5511912345678?text=Ol%C3%A1!%20Solu%C3%A7%C3%A3o%20%22Controles%20financeiros%22%20%26%20mais%0Alinha%202",
  );
  assert.equal(new URL(link!).searchParams.get("text"), 'Olá! Solução "Controles financeiros" & mais\nlinha 2');
});

test("mensagem do formulário omite a necessidade quando vazia", () => {
  const msg = mensagemInteresse({ nome: " Ana ", empresa: "Empresa X", servico: "Suporte administrativo", necessidade: "  " });
  assert.ok(msg.includes("Nome: Ana\n"));
  assert.ok(!msg.includes("Necessidade"));
});

test("valida campos obrigatórios e limites", () => {
  assert.deepEqual(Object.keys(validarInteresse({ nome: "", empresa: "", servico: "", necessidade: "" })), [
    "nome",
    "empresa",
    "servico",
  ]);
  assert.deepEqual(validarInteresse({ nome: "Ana", empresa: "X Ltda", servico: "Outro", necessidade: "a".repeat(500) }), {});
  assert.ok(validarInteresse({ nome: "Ana", empresa: "X Ltda", servico: "Outro", necessidade: "a".repeat(501) }).necessidade);
});
