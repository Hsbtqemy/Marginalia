import test from "node:test";
import assert from "node:assert/strict";
import { $createParagraphNode, $createTextNode, $getRoot, createEditor } from "lexical";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { $createMarginaliaBlockNode, MarginaliaBlockNode, type MarginKind } from "./MarginaliaBlockNode";
import {
  collectMarginaliaPresentationSummaries,
  deriveLeftScholiePresentationState,
} from "./presentationState";

function createBlock(options: {
  kind: MarginKind;
  marginBlockId: string;
  linkedManuscriptBlockId: string | null;
  text?: string;
}) {
  const block = $createMarginaliaBlockNode({
    kind: options.kind,
    marginBlockId: options.marginBlockId,
    linkedManuscriptBlockId: options.linkedManuscriptBlockId,
  });
  const paragraph = $createParagraphNode();
  if (options.text) {
    paragraph.append($createTextNode(options.text));
  }
  block.append(paragraph);
  return block;
}

test("deriveLeftScholiePresentationState distinguishes empty, reduced, and developed scholies", () => {
  assert.equal(
    deriveLeftScholiePresentationState({
      kind: "left",
      linkedManuscriptBlockId: "m-1",
      hasContent: false,
      isCurrent: true,
    }),
    "empty",
  );
  assert.equal(
    deriveLeftScholiePresentationState({
      kind: "left",
      linkedManuscriptBlockId: "m-1",
      hasContent: true,
      isCurrent: false,
    }),
    "reduced",
  );
  assert.equal(
    deriveLeftScholiePresentationState({
      kind: "left",
      linkedManuscriptBlockId: "m-1",
      hasContent: true,
      isCurrent: true,
    }),
    "developed",
  );
  assert.equal(
    deriveLeftScholiePresentationState({
      kind: "left",
      linkedManuscriptBlockId: null,
      hasContent: true,
      isCurrent: true,
    }),
    null,
  );
  assert.equal(
    deriveLeftScholiePresentationState({
      kind: "right",
      linkedManuscriptBlockId: "m-1",
      hasContent: true,
      isCurrent: true,
    }),
    null,
  );
});

test("collectMarginaliaPresentationSummaries classifies linked left scholies without mutating right notes", async () => {
  const editor = createEditor({
    namespace: "margin-presentation-left",
    nodes: [MarginaliaBlockNode, HeadingNode, QuoteNode, ListNode, ListItemNode],
    onError(error) {
      throw error;
    },
  });

  editor.update(() => {
    const root = $getRoot();
    const empty = createBlock({
      kind: "left",
      marginBlockId: "left-empty",
      linkedManuscriptBlockId: "m-1",
    });
    const filled = createBlock({
      kind: "left",
      marginBlockId: "left-filled",
      linkedManuscriptBlockId: "m-2",
      text: "Filled scholie",
    });
    const free = createBlock({
      kind: "left",
      marginBlockId: "left-free",
      linkedManuscriptBlockId: null,
      text: "Detached",
    });
    root.append(empty, filled, free);
    filled.selectStart();
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  editor.getEditorState().read(() => {
    const summaries = collectMarginaliaPresentationSummaries("left", "left-filled");
    assert.deepEqual(
      summaries.map((summary) => [summary.marginBlockId, summary.scholieState, summary.hasContent, summary.isCurrent]),
      [
        ["left-empty", "empty", false, false],
        ["left-filled", "developed", true, true],
        ["left-free", null, true, false],
      ],
    );
  });
});

test("collectMarginaliaPresentationSummaries leaves right notes outside the scholie state model", async () => {
  const editor = createEditor({
    namespace: "margin-presentation-right",
    nodes: [MarginaliaBlockNode, HeadingNode, QuoteNode, ListNode, ListItemNode],
    onError(error) {
      throw error;
    },
  });

  editor.update(() => {
    $getRoot().append(
      createBlock({
        kind: "right",
        marginBlockId: "right-1",
        linkedManuscriptBlockId: "m-1",
        text: "Source note",
      }),
    );
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  editor.getEditorState().read(() => {
    const summaries = collectMarginaliaPresentationSummaries("right", "right-1");
    assert.deepEqual(
      summaries.map((summary) => [summary.marginBlockId, summary.scholieState]),
      [["right-1", null]],
    );
  });
});
