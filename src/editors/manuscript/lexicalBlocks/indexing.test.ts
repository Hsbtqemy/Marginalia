import test from "node:test";
import assert from "node:assert/strict";
import {
  buildManuscriptExcerptIndexFromLexicalJson,
  buildManuscriptExcerptIndexFromSerializedLexicalState,
  collectManuscriptBlockSummariesFromLexicalJson,
} from "./indexing";

test("collectManuscriptBlockSummariesFromLexicalJson reads top-level blocks and list items", () => {
  const lexicalJson = JSON.stringify({
    root: {
      children: [
        {
          type: "paragraph",
          $: { blockId: "p-1" },
          children: [{ type: "text", text: "First paragraph" }],
        },
        {
          type: "list",
          children: [
            {
              type: "listitem",
              $: { blockId: "li-1" },
              children: [{ type: "text", text: "One" }],
            },
          ],
        },
      ],
    },
  });

  assert.deepEqual(collectManuscriptBlockSummariesFromLexicalJson(lexicalJson), [
    { blockId: "p-1", text: "First paragraph" },
    { blockId: "li-1", text: "One" },
  ]);
});

test("buildManuscriptExcerptIndexFromLexicalJson normalizes whitespace and truncates safely", () => {
  const lexicalJson = JSON.stringify({
    root: {
      children: [
        {
          type: "paragraph",
          $: { blockId: "p-2" },
          children: [{ type: "text", text: "  Many   spaces \n and lines  " }],
        },
      ],
    },
  });

  assert.deepEqual(buildManuscriptExcerptIndexFromLexicalJson(lexicalJson), {
    "p-2": "Many spaces and lines",
  });
});

test("buildManuscriptExcerptIndexFromSerializedLexicalState mirrors the JSON helper for live editor state", () => {
  const serializedState = {
    root: {
      children: [
        {
          type: "paragraph",
          $: { blockId: "p-3" },
          children: [{ type: "text", text: "Live excerpt" }],
        },
        {
          type: "list",
          children: [
            {
              type: "listitem",
              $: { blockId: "li-3" },
              children: [{ type: "text", text: "Live list item" }],
            },
          ],
        },
      ],
    },
  };

  assert.deepEqual(
    buildManuscriptExcerptIndexFromSerializedLexicalState(serializedState),
    buildManuscriptExcerptIndexFromLexicalJson(JSON.stringify(serializedState)),
  );
});
