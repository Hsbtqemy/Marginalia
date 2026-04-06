import test from "node:test";
import assert from "node:assert/strict";
import { buildEditorialExportDocument, renderEditorialExportHtml } from "./editorialExport";
import { deriveCanonicalDocumentModelFromEditorStates } from "../document/canonicalDocumentModel";

function createModel() {
  return deriveCanonicalDocumentModelFromEditorStates({
    manuscriptJson: JSON.stringify({
      root: {
        children: [
          {
            type: "heading",
            tag: "h1",
            $: { blockId: "m-1" },
            children: [{ type: "text", text: "Opening" }],
          },
          {
            type: "paragraph",
            $: { blockId: "m-2" },
            children: [{ type: "text", text: "Body passage" }],
          },
          {
            type: "list",
            listType: "number",
            children: [
              {
                type: "listitem",
                $: { blockId: "m-3" },
                children: [{ type: "text", text: "Ordered item" }],
              },
            ],
          },
        ],
      },
    }),
    leftMarginJson: JSON.stringify({
      root: {
        children: [
          {
            type: "marginalia-block",
            kind: "left",
            marginBlockId: "left-1",
            linkedManuscriptBlockId: "m-2",
            children: [{ type: "paragraph", children: [{ type: "text", text: "Working scholie" }] }],
          },
          {
            type: "marginalia-block",
            kind: "left",
            marginBlockId: "left-free",
            linkedManuscriptBlockId: null,
            children: [{ type: "paragraph", children: [{ type: "text", text: "Free scholie" }] }],
          },
        ],
      },
    }),
    rightMarginJson: JSON.stringify({
      root: {
        children: [
          {
            type: "marginalia-block",
            kind: "right",
            marginBlockId: "right-1",
            linkedManuscriptBlockId: "m-2",
            children: [{ type: "paragraph", children: [{ type: "text", text: "Source note" }] }],
          },
        ],
      },
    }),
  });
}

function createSeparatedListsModel() {
  return deriveCanonicalDocumentModelFromEditorStates({
    manuscriptJson: JSON.stringify({
      root: {
        children: [
          {
            type: "list",
            listType: "number",
            start: 3,
            children: [
              {
                type: "listitem",
                $: { blockId: "list-a-1" },
                children: [{ type: "text", text: "Third item" }],
              },
              {
                type: "listitem",
                $: { blockId: "list-a-2" },
                children: [{ type: "text", text: "Fourth item" }],
              },
            ],
          },
          {
            type: "paragraph",
            $: { blockId: "bridge" },
            children: [{ type: "text", text: "Bridge paragraph" }],
          },
          {
            type: "list",
            listType: "number",
            start: 1,
            children: [
              {
                type: "listitem",
                $: { blockId: "list-b-1" },
                children: [{ type: "text", text: "Fresh first item" }],
              },
            ],
          },
        ],
      },
    }),
    leftMarginJson: JSON.stringify({ root: { children: [] } }),
    rightMarginJson: JSON.stringify({ root: { children: [] } }),
  });
}

test("buildEditorialExportDocument maps canonical units to explicit clean and working export roles", () => {
  const model = createModel();
  const cleanDocument = buildEditorialExportDocument(model, "clean");
  const workingDocument = buildEditorialExportDocument(model, "working");

  assert.equal(cleanDocument.rules.scholieRole, "omitted");
  assert.equal(cleanDocument.rules.rightNoteRole, "omitted");
  assert.equal(workingDocument.rules.scholieRole, "comment");
  assert.equal(workingDocument.rules.rightNoteRole, "footnote");
  assert.equal(workingDocument.rules.supplementalLeftRole, "annex");
  assert.equal(workingDocument.units[1]?.scholie?.marginBlockId, "left-1");
  assert.equal(workingDocument.units[1]?.rightNotes[0]?.marginBlockId, "right-1");
  assert.equal(workingDocument.supplementalLeftNotes[0]?.marginBlockId, "left-free");
});

test("buildEditorialExportDocument keeps separated ordered lists in distinct export groups", () => {
  const document = buildEditorialExportDocument(createSeparatedListsModel(), "clean");

  assert.equal(document.units[0]?.manuscript.kind, "list-item");
  assert.equal(document.units[0]?.manuscript.listGroupId, "list-a-1");
  assert.equal(document.units[0]?.manuscript.listStart, 3);
  assert.equal(document.units[1]?.manuscript.listGroupId, "list-a-1");
  assert.equal(document.units[3]?.manuscript.listGroupId, "list-b-1");
  assert.equal(document.units[3]?.manuscript.listStart, 1);
  assert.notEqual(document.units[1]?.manuscript.listGroupId, document.units[3]?.manuscript.listGroupId);
});

test("renderEditorialExportHtml keeps manuscript order for clean exports and omits notes", () => {
  const html = renderEditorialExportHtml(buildEditorialExportDocument(createModel(), "clean"));

  assert.match(html, /<h1>Opening<\/h1>/);
  assert.match(html, /<p>Body passage<\/p>/);
  assert.match(html, /<ol><li>Ordered item<\/li><\/ol>/);
  assert.doesNotMatch(html, /Working scholie/);
  assert.doesNotMatch(html, /Source note/);
  assert.ok(html.indexOf("Opening") < html.indexOf("Body passage"));
  assert.ok(html.indexOf("Body passage") < html.indexOf("Ordered item"));
});

test("renderEditorialExportHtml keeps separated ordered lists as distinct list containers", () => {
  const html = renderEditorialExportHtml(buildEditorialExportDocument(createSeparatedListsModel(), "clean"));

  assert.match(html, /<ol><li>Third item<\/li><li>Fourth item<\/li><\/ol><p>Bridge paragraph<\/p><ol><li>Fresh first item<\/li><\/ol>/);
});

test("renderEditorialExportHtml includes scholies, source notes, and annexes for working exports", () => {
  const html = renderEditorialExportHtml(buildEditorialExportDocument(createModel(), "working"));

  assert.match(html, /Working scholie/);
  assert.match(html, /Source note/);
  assert.match(html, /Supplemental Scholies/);
  assert.match(html, /Free scholie/);
});
