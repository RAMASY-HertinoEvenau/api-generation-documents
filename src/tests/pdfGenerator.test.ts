import assert from "node:assert/strict";
import test from "node:test";
import { getCompiledPdfTemplate } from "../services/pdfGenerator";

test("getCompiledPdfTemplate caches templates by name", () => {
  const first = getCompiledPdfTemplate("test-template");
  const second = getCompiledPdfTemplate("test-template");

  assert.equal(first, second, "Should return the same object reference from cache");
  assert.equal(first.name, "test-template");
});

test("getCompiledPdfTemplate creates separate entries per name", () => {
  const templateA = getCompiledPdfTemplate("template-a");
  const templateB = getCompiledPdfTemplate("template-b");

  assert.notEqual(templateA, templateB);
  assert.equal(templateA.name, "template-a");
  assert.equal(templateB.name, "template-b");
});

test("compiled template has a render function", () => {
  const template = getCompiledPdfTemplate("render-check");

  assert.equal(typeof template.render, "function");
  assert.ok(template.compiledAt);
});
