/** Posição da loja aprendida no 1º check-in. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldLearnLocation } from "../src/server/store-location";

const gps = { status: "captured", lat: -20.1426, lng: -44.8846, accuracy: 25 };

test("loja sem posição: o 1º check-in com GPS bom define onde ela fica", () => {
  assert.equal(shouldLearnLocation({ lat: null, lng: null, geoSource: null }, gps), true);
});

test("GPS ruim ou ausente não define a posição", () => {
  assert.equal(shouldLearnLocation({ lat: null, lng: null, geoSource: null }, { ...gps, accuracy: 400 }), false);
  assert.equal(shouldLearnLocation({ lat: null, lng: null, geoSource: null }, { ...gps, accuracy: null }), false);
  assert.equal(shouldLearnLocation({ lat: null, lng: null, geoSource: null }, { status: "denied", lat: null, lng: null, accuracy: null }), false);
  assert.equal(shouldLearnLocation({ lat: null, lng: null, geoSource: null }, null), false);
});

test("posição aproximada (só a rua) é corrigida por check-in perto; longe, não", () => {
  assert.equal(shouldLearnLocation({ lat: -20.1466, lng: -44.8846, geoSource: "address_approx" }, gps), true); // ~450 m
  assert.equal(shouldLearnLocation({ lat: -20.2, lng: -44.8846, geoSource: "address_approx" }, gps), false); // ~6 km
});

test("posição exata, manual ou já aprendida nunca é trocada pelo check-in", () => {
  for (const geoSource of ["address", "manual", "checkin", null]) {
    assert.equal(shouldLearnLocation({ lat: -20.1466, lng: -44.8846, geoSource }, gps), false);
  }
});
