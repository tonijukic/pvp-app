import { test } from "node:test";
import assert from "node:assert/strict";
import { gatherAndFilter, dedupeAgainst } from "./compute";
import { classifyArea, type RadarSourceItem } from "./sources";

const item = (over: Partial<RadarSourceItem>): RadarSourceItem => ({
  dedupKey: "PISRS:x",
  area: "drugo",
  title: "Naslov",
  source: "PISRS",
  ...over,
});

test("classifyArea maps keywords to practice areas", () => {
  assert.equal(classifyArea("Sprememba ZDR-1 in delovna razmerja"), "delovno_pravo");
  assert.equal(classifyArea("Novela ZJN-3 o javnem naročilu"), "javna_narocila");
  assert.equal(classifyArea("Varstvo osebnih podatkov po GDPR"), "gdpr");
  assert.equal(classifyArea("Dostop do informacij javnega značaja"), "ijz");
  assert.equal(classifyArea("Napredovanje javnih uslužbencev"), "javni_usluzbenci");
  assert.equal(classifyArea("Obligacijski zakonik (OZ) in pogodbe"), "obligacije");
  assert.equal(classifyArea("Nekaj povsem nepovezanega"), "drugo");
});

test("classifyArea does not false-match short tokens inside words", () => {
  // "oz" must not match inside "organizacija"
  assert.equal(classifyArea("Reorganizacija ministrstva"), "drugo");
});

test("gatherAndFilter dedupes within a batch and keeps all classified items", () => {
  const batch = [
    item({ dedupKey: "a", area: "gdpr" }),
    item({ dedupKey: "a", area: "gdpr" }), // dup
    item({ dedupKey: "b", area: "drugo" }), // "drugo" kept
  ];
  const out = gatherAndFilter(batch);
  assert.equal(out.length, 2);
  assert.deepEqual(
    out.map((i) => i.dedupKey),
    ["a", "b"],
  );
});

test("dedupeAgainst drops items already stored", () => {
  const batch = [item({ dedupKey: "a" }), item({ dedupKey: "b" }), item({ dedupKey: "c" })];
  const out = dedupeAgainst(batch, new Set(["b"]));
  assert.deepEqual(
    out.map((i) => i.dedupKey),
    ["a", "c"],
  );
});
