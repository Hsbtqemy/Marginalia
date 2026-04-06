import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveCanonicalDocumentModelFromEditorStates,
  parseCanonicalDocumentModelJson,
  serializeCanonicalDocumentModel,
} from "./canonicalDocumentModel";

test("deriveCanonicalDocumentModelFromEditorStates builds units, right notes, and legacy supplemental left notes", () => {
  const model = deriveCanonicalDocumentModelFromEditorStates({
    manuscriptJson: JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            $: { blockId: "m-1" },
            children: [{ type: "text", text: "Opening passage" }],
          },
          {
            type: "list",
            listType: "bullet",
            start: 1,
            children: [
              {
                type: "listitem",
                $: { blockId: "m-2" },
                children: [{ type: "text", text: "List passage alpha" }],
              },
              {
                type: "listitem",
                $: { blockId: "m-3" },
                children: [{ type: "text", text: "List passage beta" }],
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
            linkedManuscriptBlockId: "m-1",
            children: [{ type: "paragraph", children: [{ type: "text", text: "Primary scholie" }] }],
          },
          {
            type: "marginalia-block",
            kind: "left",
            marginBlockId: "left-1-dup",
            linkedManuscriptBlockId: "m-1",
            children: [{ type: "paragraph", children: [{ type: "text", text: "Legacy duplicate" }] }],
          },
          {
            type: "marginalia-block",
            kind: "left",
            marginBlockId: "left-free",
            linkedManuscriptBlockId: null,
            children: [{ type: "paragraph", children: [{ type: "text", text: "Free scholie" }] }],
          },
          {
            type: "marginalia-block",
            kind: "left",
            marginBlockId: "left-stale",
            linkedManuscriptBlockId: "missing-block",
            children: [{ type: "paragraph", children: [{ type: "text", text: "Stale scholie" }] }],
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
          {
            type: "marginalia-block",
            kind: "right",
            marginBlockId: "right-2",
            linkedManuscriptBlockId: null,
            children: [{ type: "paragraph", children: [{ type: "text", text: "Loose source" }] }],
          },
        ],
      },
    }),
  });

  assert.equal(model.version, 1);
  assert.equal(model.sourceFormat, "legacy-lexical-triptych");
  assert.equal(model.rightPaneMode, "supplemental-notes");
  assert.equal(model.units.length, 3);
  assert.equal(model.units[0].manuscript.blockId, "m-1");
  assert.equal(model.units[0].scholie?.marginBlockId, "left-1");
  assert.equal(model.units[0].scholie?.marginOrder, 0);
  assert.equal(model.units[1].manuscript.container.kind, "list");
  assert.equal(model.units[1].manuscript.excerpt, "List passage alpha");
  assert.equal(model.rightNotes[0].marginOrder, 0);
  assert.equal(model.rightNotes.length, 2);
  assert.deepEqual(model.legacyDiagnostics.duplicateLeftMarginBlockIdsByUnitId, { "m-1": ["left-1-dup"] });
  assert.deepEqual(model.legacyDiagnostics.unlinkedLeftMarginBlockIds, ["left-free"]);
  assert.deepEqual(model.legacyDiagnostics.staleLinkedLeftMarginBlockIds, ["left-stale"]);
  assert.deepEqual(
    model.supplementalLeftNotes.map((note) => [note.marginBlockId, note.reason, note.marginOrder]),
    [
      ["left-1-dup", "duplicate-left-link", 1],
      ["left-free", "unlinked-left-note", 2],
      ["left-stale", "stale-left-link", 3],
    ],
  );
});

test("parseCanonicalDocumentModelJson round-trips serialized canonical models", () => {
  const model = deriveCanonicalDocumentModelFromEditorStates({
    manuscriptJson: JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            $: { blockId: "m-1" },
            children: [{ type: "text", text: "Only passage" }],
          },
        ],
      },
    }),
    leftMarginJson: JSON.stringify({ root: { children: [] } }),
    rightMarginJson: JSON.stringify({ root: { children: [] } }),
  });

  const parsed = parseCanonicalDocumentModelJson(serializeCanonicalDocumentModel(model));
  assert.deepEqual(parsed, model);
  assert.equal(parseCanonicalDocumentModelJson("{"), null);
});
