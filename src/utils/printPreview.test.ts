import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { buildPrintPreviewHtml, sanitizePrintPreviewHtmlFragment } from "./printPreview";
import { DEFAULT_PRESET } from "../presets/presetSchema";

function installDomGlobals() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    DOMParser: dom.window.DOMParser,
    Node: dom.window.Node,
  });
}

test("sanitizePrintPreviewHtmlFragment strips scripts and unsafe attributes", () => {
  installDomGlobals();

  const html = '<p>Hello<script>alert(1)</script><a href="javascript:alert(2)" onclick="x()">world</a></p>';
  const sanitized = sanitizePrintPreviewHtmlFragment(html);

  assert.match(sanitized, /<p>/);
  assert.doesNotMatch(sanitized, /script/i);
  assert.doesNotMatch(sanitized, /onclick/i);
  assert.doesNotMatch(sanitized, /javascript:/i);
});

test("buildPrintPreviewHtml injects CSP and preserves safe markup", () => {
  installDomGlobals();

  const html = buildPrintPreviewHtml({
    title: "Demo",
    manuscriptHtml: "<h1>Title</h1><p><strong>Body</strong></p>",
    preset: DEFAULT_PRESET,
  });

  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<strong>Body<\/strong>/);
});
