/** Google Agenda na aba do Notion: leitura do que a pessoa cola e o link de incorporação. */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { embedUrl, normalizeCalendarConfig, parseCalendarId, parseCalendarLines, parseMode } from "../src/lib/google-calendar";

describe("Google Agenda", () => {
  test("aceita e-mail, ID de grupo, link de incorporação e iframe", () => {
    assert.equal(parseCalendarId(" Maria@Gmail.com "), "maria@gmail.com");
    assert.equal(parseCalendarId("abc123@group.calendar.google.com"), "abc123@group.calendar.google.com");
    assert.equal(parseCalendarId("https://calendar.google.com/calendar/embed?src=maria%40gmail.com&ctz=America%2FSao_Paulo"), "maria@gmail.com");
    assert.equal(parseCalendarId('<iframe src="https://calendar.google.com/calendar/embed?src=x%40group.calendar.google.com&amp;ctz=America" style="border: 0"></iframe>'), "x@group.calendar.google.com");
    assert.equal(parseCalendarId(`https://calendar.google.com/calendar/u/0?cid=${Buffer.from("tainara@gmail.com").toString("base64")}`), "tainara@gmail.com");
    assert.equal(parseCalendarId("pt-br.brazilian#holiday@group.v.calendar.google.com"), "pt-br.brazilian#holiday@group.v.calendar.google.com");
    assert.equal(parseCalendarId("minha agenda"), null);
    assert.equal(parseCalendarId("https://exemplo.com"), null);
  });

  test("uma linha por agenda, com nome; repetida não entra; inválida é apontada", () => {
    const r = parseCalendarLines("Maria: maria@gmail.com\n\ntainara@gmail.com\nMARIA@gmail.com\nqualquer coisa");
    assert.deepEqual(r.calendars, [
      { id: "maria@gmail.com", label: "Maria" },
      { id: "tainara@gmail.com", label: "tainara" },
    ]);
    assert.deepEqual(r.invalid, ["qualquer coisa"]);
  });

  test("link de incorporação em português, com as agendas e o modo", () => {
    assert.equal(embedUrl([]), null);
    const url = new URL(embedUrl([{ id: "maria@gmail.com", label: "Maria" }, { id: "b@group.calendar.google.com", label: "B" }], "MONTH")!);
    assert.equal(url.origin + url.pathname, "https://calendar.google.com/calendar/embed");
    assert.deepEqual(url.searchParams.getAll("src"), ["maria@gmail.com", "b@group.calendar.google.com"]);
    assert.equal(url.searchParams.get("mode"), "MONTH");
    assert.equal(url.searchParams.get("ctz"), "America/Sao_Paulo");
    assert.equal(url.searchParams.get("hl"), "pt_BR");
    assert.equal(parseMode("x"), "WEEK");
  });

  test("configuração salva estranha não quebra a tela", () => {
    assert.deepEqual(normalizeCalendarConfig(null), { calendars: [] });
    assert.deepEqual(normalizeCalendarConfig({ calendars: [{ id: "nada" }, { id: "a@b.com", label: "" }] }), { calendars: [{ id: "a@b.com", label: "a" }] });
  });
});
