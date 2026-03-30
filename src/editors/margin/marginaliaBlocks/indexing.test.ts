import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMarginLinkIndexFromLexicalJson,
  collectMarginBlockSummariesFromLexicalJson,
} from "./indexing";

test("collectMarginBlockSummariesFromLexicalJson reads marginalia blocks only", () => {
  const lexicalJson = JSON.stringify({
    root: {
      children: [
        {
          type: "marginalia-block",
          marginBlockId: "left-1",
          linkedManuscriptBlockId: "m-1",
        },
        {
          type: "paragraph",
        },
        {
          type: "marginalia-block",
          marginBlockId: "left-2",
          linkedManuscriptBlockId: null,
        },
      ],
    },
  });

  assert.deepEqual(collectMarginBlockSummariesFromLexicalJson(lexicalJson), [
    { marginBlockId: "left-1", linkedManuscriptBlockId: "m-1" },
    { marginBlockId: "left-2", linkedManuscriptBlockId: null },
  ]);
});

test("buildMarginLinkIndexFromLexicalJson groups multiple notes by manuscript block", () => {
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
          marginBlockId: "left-2",
          linkedManuscriptBlockId: "m-1",
        },
        {
          type: "marginalia-block",
          marginBlockId: "right-1",
          linkedManuscriptBlockId: "m-2",
        },
      ],
    },
  });

  assert.deepEqual(buildMarginLinkIndexFromLexicalJson(lexicalJson), {
    "m-1": ["left-1", "left-2"],
    "m-2": ["right-1"],
  });
});
