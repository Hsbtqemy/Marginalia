import test from "node:test";
import assert from "node:assert/strict";
import { $createParagraphNode, $createTextNode, $getRoot, createEditor } from "lexical";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { $createMarginaliaBlockNode, MarginaliaBlockNode } from "./MarginaliaBlockNode";
import {
  $duplicateMarginaliaBlockById,
  $findMarginaliaBlockById,
  $findMarginaliaBlocksByLinkedManuscriptId,
  $getCurrentMarginaliaBlockNode,
  $moveMarginaliaBlockAfter,
  $moveMarginaliaBlockBefore,
  DUPLICATE_CURRENT_MARGINALIA_BLOCK_COMMAND,
  INSERT_MARGINALIA_BLOCK_COMMAND,
  LINK_CURRENT_MARGINALIA_BLOCK_COMMAND,
  $deleteMarginaliaBlocksById,
  $normalizeLegacyLinkedMarginaliaBlocks,
  registerMarginaliaCommands,
} from "./commands";

function createBlock(options: {
  kind: "left" | "right";
  marginBlockId: string;
  linkedManuscriptBlockId: string | null;
  text: string;
}) {
  const block = $createMarginaliaBlockNode({
    kind: options.kind,
    marginBlockId: options.marginBlockId,
    linkedManuscriptBlockId: options.linkedManuscriptBlockId,
  });
  const paragraph = $createParagraphNode();
  paragraph.append($createTextNode(options.text));
  block.append(paragraph);
  return block;
}

function createMarginEditor(kind: "left" | "right") {
  const editor = createEditor({
    namespace: `margin-commands-${kind}`,
    nodes: [MarginaliaBlockNode, HeadingNode, QuoteNode, ListNode, ListItemNode],
    onError(error) {
      throw error;
    },
  });

  const unregister = registerMarginaliaCommands(editor, kind);
  return { editor, unregister };
}

test("left margin link command reuses the first scholie already linked to a manuscript block", async () => {
  const { editor, unregister } = createMarginEditor("left");

  editor.update(() => {
    const root = $getRoot();
    const existing = createBlock({
      kind: "left",
      marginBlockId: "left-1",
      linkedManuscriptBlockId: "m-1",
      text: "Existing scholie",
    });
    const current = createBlock({
      kind: "left",
      marginBlockId: "left-2",
      linkedManuscriptBlockId: null,
      text: "Draft scholie",
    });
    root.append(existing, current);
    current.selectStart();
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  editor.dispatchCommand(LINK_CURRENT_MARGINALIA_BLOCK_COMMAND, { manuscriptBlockId: "m-1" });
  await new Promise((resolve) => setTimeout(resolve, 0));

  editor.getEditorState().read(() => {
    assert.equal($findMarginaliaBlockById("left-1")?.getLinkedManuscriptBlockId(), "m-1");
    assert.equal($findMarginaliaBlockById("left-2")?.getLinkedManuscriptBlockId(), null);
    assert.equal($getCurrentMarginaliaBlockNode()?.getMarginBlockId(), "left-1");
  });

  unregister();
});

test("left margin insert command reuses the primary scholie instead of inserting a second linked one", async () => {
  const { editor, unregister } = createMarginEditor("left");

  editor.update(() => {
    $getRoot().append(
      createBlock({
        kind: "left",
        marginBlockId: "left-1",
        linkedManuscriptBlockId: "m-1",
        text: "Existing scholie",
      }),
    );
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  editor.dispatchCommand(INSERT_MARGINALIA_BLOCK_COMMAND, {
    kind: "left",
    linkedManuscriptBlockId: "m-1",
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  editor.getEditorState().read(() => {
    const blocks = $getRoot().getChildren().filter((node): node is MarginaliaBlockNode => node instanceof MarginaliaBlockNode);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].getMarginBlockId(), "left-1");
    assert.equal($getCurrentMarginaliaBlockNode()?.getMarginBlockId(), "left-1");
  });

  unregister();
});

test("duplicating a linked left scholie keeps the copy detached to preserve the unique link invariant", async () => {
  const { editor, unregister } = createMarginEditor("left");

  editor.update(() => {
    const block = createBlock({
      kind: "left",
      marginBlockId: "left-1",
      linkedManuscriptBlockId: "m-1",
      text: "Existing scholie",
    });
    $getRoot().append(block);
    block.selectStart();
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  editor.dispatchCommand(DUPLICATE_CURRENT_MARGINALIA_BLOCK_COMMAND, undefined);
  await new Promise((resolve) => setTimeout(resolve, 0));

  editor.getEditorState().read(() => {
    const blocks = $getRoot().getChildren().filter((node): node is MarginaliaBlockNode => node instanceof MarginaliaBlockNode);
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].getLinkedManuscriptBlockId(), "m-1");
    assert.equal(blocks[1].getLinkedManuscriptBlockId(), null);
    assert.equal(blocks[1].getTextContent(), "Existing scholie");
    assert.equal($getCurrentMarginaliaBlockNode()?.getMarginBlockId(), blocks[1].getMarginBlockId());
  });

  unregister();
});

test("duplicating a scholie by id can retarget the copy to a new manuscript block while preserving content", async () => {
  const { editor, unregister } = createMarginEditor("left");
  let duplicatedBlockId: string | null = null;

  editor.update(() => {
    $getRoot().append(
      createBlock({
        kind: "left",
        marginBlockId: "left-1",
        linkedManuscriptBlockId: "m-1",
        text: "Primary scholie",
      }),
      createBlock({
        kind: "left",
        marginBlockId: "left-2",
        linkedManuscriptBlockId: "m-2",
        text: "Second scholie",
      }),
    );
    duplicatedBlockId = $duplicateMarginaliaBlockById("left-1", {
      linkedManuscriptBlockId: "m-3",
      afterMarginBlockId: "left-1",
      beforeMarginBlockId: "left-2",
      select: false,
    })?.getMarginBlockId() ?? null;
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  editor.getEditorState().read(() => {
    const blocks = $getRoot().getChildren().filter((node): node is MarginaliaBlockNode => node instanceof MarginaliaBlockNode);
    assert.deepEqual(
      blocks.map((block) => [block.getMarginBlockId(), block.getLinkedManuscriptBlockId(), block.getTextContent()]),
      [
        ["left-1", "m-1", "Primary scholie"],
        [duplicatedBlockId, "m-3", "Primary scholie"],
        ["left-2", "m-2", "Second scholie"],
      ],
    );
  });

  unregister();
});

test("moving scholies by id can reorder a linked cluster around another scholie", async () => {
  const { editor, unregister } = createMarginEditor("left");

  editor.update(() => {
    $getRoot().append(
      createBlock({
        kind: "left",
        marginBlockId: "left-1",
        linkedManuscriptBlockId: "m-1",
        text: "Primary scholie",
      }),
      createBlock({
        kind: "left",
        marginBlockId: "left-1-dup",
        linkedManuscriptBlockId: "m-1",
        text: "Legacy duplicate",
      }),
      createBlock({
        kind: "left",
        marginBlockId: "left-2",
        linkedManuscriptBlockId: "m-2",
        text: "Second scholie",
      }),
    );

    assert.equal($moveMarginaliaBlockAfter("left-1", "left-2"), true);
    assert.equal($moveMarginaliaBlockAfter("left-1-dup", "left-1"), true);
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  editor.getEditorState().read(() => {
    const blocks = $getRoot().getChildren().filter((node): node is MarginaliaBlockNode => node instanceof MarginaliaBlockNode);
    assert.deepEqual(
      blocks.map((block) => [block.getMarginBlockId(), block.getLinkedManuscriptBlockId()]),
      [
        ["left-2", "m-2"],
        ["left-1", "m-1"],
        ["left-1-dup", "m-1"],
      ],
    );
    assert.deepEqual(
      $findMarginaliaBlocksByLinkedManuscriptId("m-1").map((block) => block.getMarginBlockId()),
      ["left-1", "left-1-dup"],
    );
  });

  unregister();
});

test("deleting scholies by id removes every linked block in the legacy cluster without creating a placeholder", async () => {
  const { editor, unregister } = createMarginEditor("left");
  let deletedCount = 0;

  editor.update(() => {
    $getRoot().append(
      createBlock({
        kind: "left",
        marginBlockId: "left-1",
        linkedManuscriptBlockId: "m-1",
        text: "Primary scholie",
      }),
      createBlock({
        kind: "left",
        marginBlockId: "left-1-dup",
        linkedManuscriptBlockId: "m-1",
        text: "Legacy duplicate",
      }),
      createBlock({
        kind: "left",
        marginBlockId: "left-2",
        linkedManuscriptBlockId: "m-2",
        text: "Second scholie",
      }),
    );
    deletedCount = $deleteMarginaliaBlocksById(["left-1", "left-1-dup"]);
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(deletedCount, 2);
  editor.getEditorState().read(() => {
    const blocks = $getRoot().getChildren().filter((node): node is MarginaliaBlockNode => node instanceof MarginaliaBlockNode);
    assert.deepEqual(
      blocks.map((block) => [block.getMarginBlockId(), block.getLinkedManuscriptBlockId()]),
      [["left-2", "m-2"]],
    );
  });

  unregister();
});

test("normalizing legacy linked scholies keeps the first linked scholie and detaches the rest", async () => {
  const { editor, unregister } = createMarginEditor("left");
  let normalizedCount = 0;

  editor.update(() => {
    $getRoot().append(
      createBlock({
        kind: "left",
        marginBlockId: "left-1",
        linkedManuscriptBlockId: "m-1",
        text: "Primary scholie",
      }),
      createBlock({
        kind: "left",
        marginBlockId: "left-2",
        linkedManuscriptBlockId: "m-1",
        text: "Legacy duplicate",
      }),
      createBlock({
        kind: "left",
        marginBlockId: "left-3",
        linkedManuscriptBlockId: "m-2",
        text: "Another primary",
      }),
      createBlock({
        kind: "left",
        marginBlockId: "left-4",
        linkedManuscriptBlockId: "m-2",
        text: "Another duplicate",
      }),
    );
    normalizedCount = $normalizeLegacyLinkedMarginaliaBlocks("left");
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(normalizedCount, 2);
  editor.getEditorState().read(() => {
    assert.equal($findMarginaliaBlockById("left-1")?.getLinkedManuscriptBlockId(), "m-1");
    assert.equal($findMarginaliaBlockById("left-2")?.getLinkedManuscriptBlockId(), null);
    assert.equal($findMarginaliaBlockById("left-3")?.getLinkedManuscriptBlockId(), "m-2");
    assert.equal($findMarginaliaBlockById("left-4")?.getLinkedManuscriptBlockId(), null);
  });

  unregister();
});

test("normalizing legacy linked scholies does nothing for the right margin", async () => {
  const { editor, unregister } = createMarginEditor("right");
  let normalizedCount = 0;

  editor.update(() => {
    $getRoot().append(
      createBlock({
        kind: "right",
        marginBlockId: "right-1",
        linkedManuscriptBlockId: "m-1",
        text: "Primary source",
      }),
      createBlock({
        kind: "right",
        marginBlockId: "right-2",
        linkedManuscriptBlockId: "m-1",
        text: "Second source",
      }),
    );
    normalizedCount = $normalizeLegacyLinkedMarginaliaBlocks("right");
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(normalizedCount, 0);
  editor.getEditorState().read(() => {
    assert.equal($findMarginaliaBlockById("right-1")?.getLinkedManuscriptBlockId(), "m-1");
    assert.equal($findMarginaliaBlockById("right-2")?.getLinkedManuscriptBlockId(), "m-1");
  });

  unregister();
});

test("right margin link command still allows multiple source notes for the same manuscript block", async () => {
  const { editor, unregister } = createMarginEditor("right");

  editor.update(() => {
    const root = $getRoot();
    const existing = createBlock({
      kind: "right",
      marginBlockId: "right-1",
      linkedManuscriptBlockId: "m-1",
      text: "Existing source",
    });
    const current = createBlock({
      kind: "right",
      marginBlockId: "right-2",
      linkedManuscriptBlockId: null,
      text: "Second source",
    });
    root.append(existing, current);
    current.selectStart();
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  editor.dispatchCommand(LINK_CURRENT_MARGINALIA_BLOCK_COMMAND, { manuscriptBlockId: "m-1" });
  await new Promise((resolve) => setTimeout(resolve, 0));

  editor.getEditorState().read(() => {
    assert.equal($findMarginaliaBlockById("right-1")?.getLinkedManuscriptBlockId(), "m-1");
    assert.equal($findMarginaliaBlockById("right-2")?.getLinkedManuscriptBlockId(), "m-1");
    assert.equal($getCurrentMarginaliaBlockNode()?.getMarginBlockId(), "right-2");
  });

  unregister();
});
