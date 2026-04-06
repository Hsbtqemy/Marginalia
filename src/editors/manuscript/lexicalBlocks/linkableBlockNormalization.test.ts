import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLinkedManuscriptBlocks } from "./linkableBlockNormalization";

function blockIdOf(node: Record<string, unknown>): string | null {
  const state = node.$;
  if (!state || typeof state !== "object") {
    return null;
  }
  return typeof (state as { blockId?: unknown }).blockId === "string"
    ? ((state as { blockId: string }).blockId ?? null)
    : null;
}

test("normalizeLinkedManuscriptBlocks preserves existing ids across all manuscript blocks", () => {
  const manuscriptJson = JSON.stringify({
    root: {
      children: [
        {
          type: "paragraph",
          $: { blockId: "keep-p" },
          children: [{ type: "text", text: "Keep me" }],
        },
        {
          type: "paragraph",
          $: { blockId: "drop-p" },
          children: [{ type: "text", text: "Drop me" }],
        },
        {
          type: "list",
          children: [
            {
              type: "listitem",
              $: { blockId: "drop-li" },
              children: [{ type: "text", text: "drop item" }],
            },
            {
              type: "listitem",
              $: { blockId: "keep-li" },
              children: [{ type: "text", text: "keep item" }],
            },
          ],
        },
      ],
    },
  });

  const leftMarginJson = JSON.stringify({
    root: {
      children: [
        { type: "marginalia-block", marginBlockId: "l1", linkedManuscriptBlockId: "keep-p", children: [] },
      ],
    },
  });
  const rightMarginJson = JSON.stringify({
    root: {
      children: [
        { type: "marginalia-block", marginBlockId: "r1", linkedManuscriptBlockId: "keep-li", children: [] },
      ],
    },
  });

  const normalized = normalizeLinkedManuscriptBlocks(manuscriptJson, leftMarginJson, rightMarginJson);
  assert.equal(normalized.changed, false);

  const parsed = JSON.parse(normalized.lexicalJson) as {
    root: { children: Array<Record<string, unknown>> };
  };
  const [p1, p2, list] = parsed.root.children;
  const listChildren = Array.isArray(list.children) ? (list.children as Array<Record<string, unknown>>) : [];

  assert.equal(blockIdOf(p1), "keep-p");
  assert.equal(blockIdOf(p2), "drop-p");
  assert.equal(blockIdOf(listChildren[0]), "drop-li");
  assert.equal(blockIdOf(listChildren[1]), "keep-li");
});

test("normalizeLinkedManuscriptBlocks assigns missing ids to manuscript blocks", () => {
  const manuscriptJson = JSON.stringify({
    root: {
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", text: "No id here" }],
        },
        {
          type: "list",
          children: [
            {
              type: "listitem",
              children: [{ type: "text", text: "List item without id" }],
            },
          ],
        },
      ],
    },
  });

  const normalized = normalizeLinkedManuscriptBlocks(
    manuscriptJson,
    JSON.stringify({ root: { children: [] } }),
    JSON.stringify({ root: { children: [] } }),
  );

  assert.equal(normalized.changed, true);
  const parsed = JSON.parse(normalized.lexicalJson) as {
    root: { children: Array<Record<string, unknown>> };
  };
  const [paragraph, list] = parsed.root.children;
  const listChildren = Array.isArray(list.children) ? (list.children as Array<Record<string, unknown>>) : [];

  assert.match(blockIdOf(paragraph) ?? "", /.+/);
  assert.match(blockIdOf(listChildren[0]) ?? "", /.+/);
});

test("normalizeLinkedManuscriptBlocks tolerates invalid JSON", () => {
  const invalid = "{ not-json";
  const normalized = normalizeLinkedManuscriptBlocks(
    invalid,
    JSON.stringify({ root: { children: [] } }),
    JSON.stringify({ root: { children: [] } }),
  );
  assert.equal(normalized.changed, false);
  assert.equal(normalized.lexicalJson, invalid);
});
