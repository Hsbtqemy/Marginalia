import test from "node:test";
import assert from "node:assert/strict";
import { $createParagraphNode, $createTextNode, $getRoot, createEditor } from "lexical";
import { $createListItemNode, $createListNode, $isListItemNode, ListItemNode, ListNode } from "@lexical/list";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import {
  deleteCurrentManuscriptBlock,
  duplicateCurrentManuscriptBlock,
  getCurrentSelectionBlockId,
  insertManuscriptBlockAfterCurrent,
  insertManuscriptBlockBeforeCurrent,
  moveCurrentManuscriptBlockDown,
  moveCurrentManuscriptBlockUp,
} from "./manuscriptBlockUtils";
import { getBlockId, setBlockId } from "./blockIdState";

function flushEditor(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createManuscriptEditor() {
  return createEditor({
    namespace: "manuscript-block-utils-test",
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode],
    onError(error) {
      throw error;
    },
  });
}

function createParagraph(blockId: string, text: string) {
  const paragraph = $createParagraphNode();
  setBlockId(paragraph, blockId);
  paragraph.append($createTextNode(text));
  return paragraph;
}

function createListItem(blockId: string, text: string) {
  const listItem = $createListItemNode();
  setBlockId(listItem, blockId);
  listItem.append($createTextNode(text));
  return listItem;
}

test("insertManuscriptBlockBeforeCurrent inserts a sibling list item before the current top-level list item", async () => {
  const editor = createManuscriptEditor();
  let createdBlockId: string | null = null;

  editor.update(() => {
    const list = $createListNode("bullet");
    const first = createListItem("li-1", "First");
    const second = createListItem("li-2", "Second");
    list.append(first, second);
    $getRoot().append(list);
    second.selectStart();

    createdBlockId = insertManuscriptBlockBeforeCurrent();
  });

  await flushEditor();

  editor.getEditorState().read(() => {
    const list = $getRoot().getFirstChild();
    assert.ok(list instanceof ListNode);

    const children = list.getChildren().filter($isListItemNode);
    assert.equal(children.length, 3);
    assert.equal(getBlockId(children[0]), "li-1");
    assert.equal(getBlockId(children[1]), createdBlockId);
    assert.equal(getBlockId(children[2]), "li-2");
    assert.equal(getCurrentSelectionBlockId(), createdBlockId);
  });
});

test("insertManuscriptBlockAfterCurrent inserts a fresh paragraph after the current root block", async () => {
  const editor = createManuscriptEditor();
  let createdBlockId: string | null = null;

  editor.update(() => {
    const paragraph = createParagraph("p-1", "First");
    $getRoot().append(paragraph);
    paragraph.selectStart();

    createdBlockId = insertManuscriptBlockAfterCurrent();
  });

  await flushEditor();

  editor.getEditorState().read(() => {
    const children = $getRoot().getChildren();
    assert.equal(children.length, 2);
    assert.equal(getBlockId(children[0]), "p-1");
    assert.equal(getBlockId(children[1]), createdBlockId);
    assert.notEqual(createdBlockId, "p-1");
    assert.equal(getCurrentSelectionBlockId(), createdBlockId);
  });
});

test("duplicateCurrentManuscriptBlock clones the current paragraph with a fresh block id", async () => {
  const editor = createManuscriptEditor();
  let duplicateBlockId: string | null = null;

  editor.update(() => {
    const paragraph = createParagraph("p-1", "Alpha");
    $getRoot().append(paragraph);
    paragraph.selectStart();

    duplicateBlockId = duplicateCurrentManuscriptBlock();
  });

  await flushEditor();

  editor.getEditorState().read(() => {
    const children = $getRoot().getChildren();
    assert.equal(children.length, 2);
    assert.equal(getBlockId(children[0]), "p-1");
    assert.equal(getBlockId(children[1]), duplicateBlockId);
    assert.notEqual(duplicateBlockId, "p-1");
    assert.equal(children[0].getTextContent(), "Alpha");
    assert.equal(children[1].getTextContent(), "Alpha");
    assert.equal(getCurrentSelectionBlockId(), duplicateBlockId);
  });
});

test("moveCurrentManuscriptBlockUp reorders a root block across a top-level list container", async () => {
  const editor = createManuscriptEditor();
  let movedBlockId: string | null = null;

  editor.update(() => {
    const intro = createParagraph("p-1", "Intro");
    const list = $createListNode("bullet");
    list.append(createListItem("li-1", "Bullet"));
    const conclusion = createParagraph("p-2", "Conclusion");
    $getRoot().append(intro, list, conclusion);
    conclusion.selectStart();

    movedBlockId = moveCurrentManuscriptBlockUp();
  });

  await flushEditor();

  editor.getEditorState().read(() => {
    const children = $getRoot().getChildren();
    assert.equal(children.length, 3);
    assert.equal(getBlockId(children[0]), "p-1");
    assert.equal(getBlockId(children[1]), "p-2");
    assert.ok(children[2] instanceof ListNode);
    assert.equal(movedBlockId, "p-2");
    assert.equal(getCurrentSelectionBlockId(), "p-2");
  });
});

test("moveCurrentManuscriptBlockDown reorders list items within their current top-level list", async () => {
  const editor = createManuscriptEditor();
  let movedBlockId: string | null = null;

  editor.update(() => {
    const list = $createListNode("bullet");
    const first = createListItem("li-1", "First");
    const second = createListItem("li-2", "Second");
    list.append(first, second);
    $getRoot().append(list);
    first.selectStart();

    movedBlockId = moveCurrentManuscriptBlockDown();
  });

  await flushEditor();

  editor.getEditorState().read(() => {
    const list = $getRoot().getFirstChild();
    assert.ok(list instanceof ListNode);

    const children = list.getChildren().filter($isListItemNode);
    assert.equal(children.length, 2);
    assert.equal(getBlockId(children[0]), "li-2");
    assert.equal(getBlockId(children[1]), "li-1");
    assert.equal(movedBlockId, "li-1");
    assert.equal(getCurrentSelectionBlockId(), "li-1");
  });
});

test("deleteCurrentManuscriptBlock removes an empty top-level list and focuses the next manuscript block", async () => {
  const editor = createManuscriptEditor();
  let focusedBlockId: string | null = null;

  editor.update(() => {
    const intro = createParagraph("p-1", "Intro");
    const list = $createListNode("bullet");
    const onlyItem = createListItem("li-1", "Only");
    list.append(onlyItem);
    const conclusion = createParagraph("p-2", "Conclusion");
    $getRoot().append(intro, list, conclusion);
    onlyItem.selectStart();

    focusedBlockId = deleteCurrentManuscriptBlock();
  });

  await flushEditor();

  editor.getEditorState().read(() => {
    const children = $getRoot().getChildren();
    assert.equal(children.length, 2);
    assert.equal(getBlockId(children[0]), "p-1");
    assert.equal(getBlockId(children[1]), "p-2");
    assert.equal(focusedBlockId, "p-2");
    assert.equal(getCurrentSelectionBlockId(), "p-2");
  });
});

test("deleteCurrentManuscriptBlock creates a fallback paragraph when the document becomes empty", async () => {
  const editor = createManuscriptEditor();
  let focusedBlockId: string | null = null;

  editor.update(() => {
    const paragraph = createParagraph("p-1", "Solo");
    $getRoot().append(paragraph);
    paragraph.selectStart();

    focusedBlockId = deleteCurrentManuscriptBlock();
  });

  await flushEditor();

  editor.getEditorState().read(() => {
    const children = $getRoot().getChildren();
    assert.equal(children.length, 1);
    assert.notEqual(getBlockId(children[0]), "p-1");
    assert.equal(getBlockId(children[0]), focusedBlockId);
    assert.equal(getCurrentSelectionBlockId(), focusedBlockId);
  });
});
