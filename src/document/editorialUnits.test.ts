import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveEditorialUnitProjection,
  EMPTY_EDITORIAL_UNIT_PROJECTION,
  summarizeLegacyLeftDuplicates,
} from "./editorialUnits";

test("deriveEditorialUnitProjection keeps manuscript order and surfaces primary vs duplicate scholies from margin json", () => {
  const manuscriptJson = JSON.stringify({
    root: {
      children: [
        {
          type: "paragraph",
          $: { blockId: "m-1" },
          children: [{ type: "text", text: "First block" }],
        },
        {
          type: "paragraph",
          $: { blockId: "m-2" },
          children: [{ type: "text", text: "Second block" }],
        },
      ],
    },
  });

  const leftMarginJson = JSON.stringify({
    root: {
      children: [
        { type: "marginalia-block", marginBlockId: "left-1", linkedManuscriptBlockId: "m-1" },
        { type: "marginalia-block", marginBlockId: "left-2", linkedManuscriptBlockId: "m-1" },
        { type: "marginalia-block", marginBlockId: "left-3", linkedManuscriptBlockId: null },
      ],
    },
  });

  const projection = deriveEditorialUnitProjection({
    manuscriptJson,
    leftMarginJson,
    leftLinksByManuscriptBlockId: {
      "m-1": ["left-1"],
      "m-2": [],
    },
  });

  assert.deepEqual(projection.units, [
    {
      unitId: "m-1",
      order: 0,
      manuscriptBlockId: "m-1",
      manuscriptExcerpt: "First block",
      leftMarginBlockId: "left-1",
      duplicateLeftMarginBlockIds: ["left-2"],
    },
    {
      unitId: "m-2",
      order: 1,
      manuscriptBlockId: "m-2",
      manuscriptExcerpt: "Second block",
      leftMarginBlockId: null,
      duplicateLeftMarginBlockIds: [],
    },
  ]);
  assert.deepEqual(projection.unlinkedLeftMarginBlockIds, ["left-3"]);
  assert.deepEqual(projection.staleLinkedLeftMarginBlockIds, []);
  assert.deepEqual(projection.indexMismatchManuscriptBlockIds, ["m-1"]);
});

test("deriveEditorialUnitProjection isolates stale linked scholies and tolerates invalid json", () => {
  const projection = deriveEditorialUnitProjection({
    manuscriptJson: "",
    leftMarginJson: JSON.stringify({
      root: {
        children: [
          { type: "marginalia-block", marginBlockId: "left-stale", linkedManuscriptBlockId: "missing-block" },
          { type: "marginalia-block", marginBlockId: "left-free", linkedManuscriptBlockId: null },
        ],
      },
    }),
    leftLinksByManuscriptBlockId: {
      "missing-block": ["left-stale"],
    },
  });

  assert.deepEqual(projection.units, []);
  assert.deepEqual(projection.unlinkedLeftMarginBlockIds, ["left-free"]);
  assert.deepEqual(projection.staleLinkedLeftMarginBlockIds, ["left-stale"]);
  assert.deepEqual(projection.indexMismatchManuscriptBlockIds, []);

  assert.deepEqual(
    deriveEditorialUnitProjection({
      manuscriptJson: "{",
      leftMarginJson: "{",
      leftLinksByManuscriptBlockId: {},
    }),
    EMPTY_EDITORIAL_UNIT_PROJECTION,
  );
});

test("deriveEditorialUnitProjection reports no mismatch when provided index matches derived links", () => {
  const manuscriptJson = JSON.stringify({
    root: {
      children: [
        {
          type: "paragraph",
          $: { blockId: "m-1" },
          children: [{ type: "text", text: "Only block" }],
        },
      ],
    },
  });

  const leftMarginJson = JSON.stringify({
    root: {
      children: [{ type: "marginalia-block", marginBlockId: "left-1", linkedManuscriptBlockId: "m-1" }],
    },
  });

  const projection = deriveEditorialUnitProjection({
    manuscriptJson,
    leftMarginJson,
    leftLinksByManuscriptBlockId: {
      "m-1": ["left-1"],
    },
  });

  assert.deepEqual(projection.indexMismatchManuscriptBlockIds, []);
});

test("summarizeLegacyLeftDuplicates reports affected passages and keeps the primary scholie target", () => {
  const projection = deriveEditorialUnitProjection({
    manuscriptJson: JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            $: { blockId: "m-1" },
            children: [{ type: "text", text: "First block" }],
          },
          {
            type: "paragraph",
            $: { blockId: "m-2" },
            children: [{ type: "text", text: "Second block" }],
          },
        ],
      },
    }),
    leftMarginJson: JSON.stringify({
      root: {
        children: [
          { type: "marginalia-block", marginBlockId: "left-1", linkedManuscriptBlockId: "m-1" },
          { type: "marginalia-block", marginBlockId: "left-2", linkedManuscriptBlockId: "m-1" },
          { type: "marginalia-block", marginBlockId: "left-3", linkedManuscriptBlockId: "m-2" },
          { type: "marginalia-block", marginBlockId: "left-4", linkedManuscriptBlockId: "m-2" },
          { type: "marginalia-block", marginBlockId: "left-5", linkedManuscriptBlockId: "m-2" },
        ],
      },
    }),
    leftLinksByManuscriptBlockId: {
      "m-1": ["left-1"],
      "m-2": ["left-3"],
    },
  });

  assert.deepEqual(summarizeLegacyLeftDuplicates(projection), {
    affectedUnitCount: 2,
    duplicateScholieCount: 3,
    firstAffectedManuscriptBlockId: "m-1",
    firstPrimaryLeftMarginBlockId: "left-1",
  });
});

test("summarizeLegacyLeftDuplicates returns null when no legacy duplicates remain", () => {
  const projection = deriveEditorialUnitProjection({
    manuscriptJson: JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            $: { blockId: "m-1" },
            children: [{ type: "text", text: "Only block" }],
          },
        ],
      },
    }),
    leftMarginJson: JSON.stringify({
      root: {
        children: [{ type: "marginalia-block", marginBlockId: "left-1", linkedManuscriptBlockId: "m-1" }],
      },
    }),
    leftLinksByManuscriptBlockId: {
      "m-1": ["left-1"],
    },
  });

  assert.equal(summarizeLegacyLeftDuplicates(projection), null);
});
