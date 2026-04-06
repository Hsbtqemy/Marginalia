import test from "node:test";
import assert from "node:assert/strict";
import { buildMarginLinkIndexFromLexicalJson, collectMarginBlockSummariesFromLexicalJson } from "./indexing";
import { buildManuscriptExcerptIndexFromLexicalJson } from "../../manuscript/lexicalBlocks/indexing";
import { normalizeLinkedManuscriptBlocks } from "../../manuscript/lexicalBlocks/linkableBlockNormalization";

test("margin summaries ignore malformed blocks and keep document order for linked notes", () => {
  const lexicalJson = JSON.stringify({
    root: {
      children: [
        {
          type: "marginalia-block",
          marginBlockId: "left-1",
          linkedManuscriptBlockId: "m-1",
        },
        {
          type: "marginalia-block",
          marginBlockId: "",
          linkedManuscriptBlockId: "m-1",
        },
        {
          type: "marginalia-block",
          marginBlockId: "left-2",
          linkedManuscriptBlockId: "m-1",
        },
        {
          type: "marginalia-block",
          marginBlockId: "left-3",
          linkedManuscriptBlockId: null,
        },
      ],
    },
  });

  assert.deepEqual(collectMarginBlockSummariesFromLexicalJson(lexicalJson), [
    { marginBlockId: "left-1", linkedManuscriptBlockId: "m-1" },
    { marginBlockId: "left-2", linkedManuscriptBlockId: "m-1" },
    { marginBlockId: "left-3", linkedManuscriptBlockId: null },
  ]);

  assert.deepEqual(buildMarginLinkIndexFromLexicalJson(lexicalJson), {
    "m-1": ["left-1", "left-2"],
  });
});

test("manuscript excerpt index and linked-id normalization keep every passage addressable for unit-based tooling", () => {
  const manuscriptJson = JSON.stringify({
    root: {
      children: [
        {
          type: "paragraph",
          $: { blockId: "keep-1" },
          children: [{ type: "text", text: "Keep this linked paragraph" }],
        },
        {
          type: "paragraph",
          $: { blockId: "drop-1" },
          children: [{ type: "text", text: "Drop this stale paragraph" }],
        },
        {
          type: "list",
          children: [
            {
              type: "listitem",
              $: { blockId: "keep-2" },
              children: [{ type: "text", text: "Keep linked list item" }],
            },
            {
              type: "listitem",
              $: { blockId: "drop-2" },
              children: [{ type: "text", text: "Drop stale list item" }],
            },
          ],
        },
      ],
    },
  });

  const leftMarginJson = JSON.stringify({
    root: {
      children: [
        { type: "marginalia-block", marginBlockId: "left-1", linkedManuscriptBlockId: "keep-1" },
      ],
    },
  });
  const rightMarginJson = JSON.stringify({
    root: {
      children: [
        { type: "marginalia-block", marginBlockId: "right-1", linkedManuscriptBlockId: "keep-2" },
      ],
    },
  });

  const normalized = normalizeLinkedManuscriptBlocks(manuscriptJson, leftMarginJson, rightMarginJson);
  const excerptIndex = buildManuscriptExcerptIndexFromLexicalJson(normalized.lexicalJson);
  const leftLinkIndex = buildMarginLinkIndexFromLexicalJson(leftMarginJson);
  const rightLinkIndex = buildMarginLinkIndexFromLexicalJson(rightMarginJson);

  assert.deepEqual(Object.keys(excerptIndex).sort(), ["drop-1", "drop-2", "keep-1", "keep-2"]);
  assert.deepEqual(leftLinkIndex, { "keep-1": ["left-1"] });
  assert.deepEqual(rightLinkIndex, { "keep-2": ["right-1"] });
  assert.equal(excerptIndex["keep-1"], "Keep this linked paragraph");
  assert.equal(excerptIndex["keep-2"], "Keep linked list item");
  assert.equal(excerptIndex["drop-1"], "Drop this stale paragraph");
  assert.equal(excerptIndex["drop-2"], "Drop stale list item");
});
