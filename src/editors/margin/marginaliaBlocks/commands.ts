import {
  $createParagraphNode,
  $parseSerializedNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  type ElementNode,
  type LexicalNode,
  type LexicalCommand,
  type RangeSelection,
} from "lexical";
import type { LexicalEditor } from "lexical";
import { $createMarginaliaBlockNode, $isMarginaliaBlockNode, type MarginKind, type MarginaliaBlockNode } from "./MarginaliaBlockNode";
import { newUuid } from "../../../utils/uuid";
import { $createListNode, $isListItemNode, $isListNode, ListNode } from "@lexical/list";

export interface InsertMarginaliaBlockPayload {
  kind: MarginKind;
  linkedManuscriptBlockId?: string | null;
}

export const INSERT_MARGINALIA_BLOCK_COMMAND: LexicalCommand<InsertMarginaliaBlockPayload> =
  createCommand("INSERT_MARGINALIA_BLOCK_COMMAND");

export const LINK_CURRENT_MARGINALIA_BLOCK_COMMAND: LexicalCommand<{ manuscriptBlockId: string | null }> =
  createCommand("LINK_CURRENT_MARGINALIA_BLOCK_COMMAND");

export const UNLINK_CURRENT_MARGINALIA_BLOCK_COMMAND: LexicalCommand<void> =
  createCommand("UNLINK_CURRENT_MARGINALIA_BLOCK_COMMAND");

export const MOVE_CURRENT_MARGINALIA_BLOCK_UP_COMMAND: LexicalCommand<void> =
  createCommand("MOVE_CURRENT_MARGINALIA_BLOCK_UP_COMMAND");

export const MOVE_CURRENT_MARGINALIA_BLOCK_DOWN_COMMAND: LexicalCommand<void> =
  createCommand("MOVE_CURRENT_MARGINALIA_BLOCK_DOWN_COMMAND");

export const DELETE_CURRENT_MARGINALIA_BLOCK_COMMAND: LexicalCommand<void> =
  createCommand("DELETE_CURRENT_MARGINALIA_BLOCK_COMMAND");

export const DUPLICATE_CURRENT_MARGINALIA_BLOCK_COMMAND: LexicalCommand<void> =
  createCommand("DUPLICATE_CURRENT_MARGINALIA_BLOCK_COMMAND");

export const SPLIT_CURRENT_MARGINALIA_BLOCK_COMMAND: LexicalCommand<void> =
  createCommand("SPLIT_CURRENT_MARGINALIA_BLOCK_COMMAND");

export const MERGE_CURRENT_MARGINALIA_BLOCK_WITH_PREVIOUS_COMMAND: LexicalCommand<void> =
  createCommand("MERGE_CURRENT_MARGINALIA_BLOCK_WITH_PREVIOUS_COMMAND");

export const MERGE_CURRENT_MARGINALIA_BLOCK_WITH_NEXT_COMMAND: LexicalCommand<void> =
  createCommand("MERGE_CURRENT_MARGINALIA_BLOCK_WITH_NEXT_COMMAND");

export function $getCurrentMarginaliaBlockNode(): MarginaliaBlockNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return null;
  }

  let current: LexicalNode | null = selection.anchor.getNode();
  while (current != null) {
    if ($isMarginaliaBlockNode(current)) {
      return current;
    }
    current = current.getParent();
  }

  return null;
}

function createBlock(payload: InsertMarginaliaBlockPayload): MarginaliaBlockNode {
  const block = $createMarginaliaBlockNode({
    kind: payload.kind,
    linkedManuscriptBlockId: payload.linkedManuscriptBlockId ?? null,
  });
  block.append($createParagraphNode());
  return block;
}

function createEmptySiblingBlock(block: MarginaliaBlockNode): MarginaliaBlockNode {
  return $createMarginaliaBlockNode({
    kind: block.getKind(),
    linkedManuscriptBlockId: block.getLinkedManuscriptBlockId(),
  });
}

function findDirectChildInBlock(block: MarginaliaBlockNode, node: LexicalNode | null): ElementNode | null {
  let current = node;
  while (current != null) {
    if (current.getParent() === block && $isElementNode(current)) {
      return current;
    }
    current = current.getParent();
  }
  return null;
}

function findListItemWithinDirectList(list: ListNode, node: LexicalNode | null): ElementNode | null {
  let current = node;
  while (current != null) {
    if (current.getParent() === list && $isListItemNode(current)) {
      return current;
    }
    current = current.getParent();
  }
  return null;
}

function moveSiblingChain(startNode: LexicalNode | null, target: ElementNode): void {
  let current = startNode;
  while (current != null) {
    const next = current.getNextSibling();
    target.append(current);
    current = next;
  }
}

function ensureBlockHasContent(block: MarginaliaBlockNode): void {
  if (block.getChildrenSize() === 0) {
    block.append($createParagraphNode());
  }
}

function canMergeBlockLinks(destination: MarginaliaBlockNode, source: MarginaliaBlockNode): boolean {
  const destinationLinked = destination.getLinkedManuscriptBlockId();
  const sourceLinked = source.getLinkedManuscriptBlockId();
  return destinationLinked === sourceLinked || destinationLinked == null || sourceLinked == null;
}

function inheritMissingLink(destination: MarginaliaBlockNode, source: MarginaliaBlockNode): void {
  if (!destination.getLinkedManuscriptBlockId() && source.getLinkedManuscriptBlockId()) {
    destination.setLinkedManuscriptBlockId(source.getLinkedManuscriptBlockId());
  }
}

export function $ensureFirstMarginaliaBlock(kind: MarginKind): MarginaliaBlockNode {
  const root = $getRoot();
  const first = root.getFirstChild();
  if ($isMarginaliaBlockNode(first)) {
    return first;
  }

  const block = createBlock({ kind });
  root.append(block);
  return block;
}

export function $insertMarginaliaBlock(payload: InsertMarginaliaBlockPayload): MarginaliaBlockNode {
  const current = $getCurrentMarginaliaBlockNode();
  const root = $getRoot();
  const block = createBlock(payload);

  if (current) {
    current.insertAfter(block, true);
  } else {
    root.append(block);
  }

  block.selectStart();
  return block;
}

export function $findMarginaliaBlockById(marginBlockId: string): MarginaliaBlockNode | null {
  const root = $getRoot();
  for (const child of root.getChildren()) {
    if ($isMarginaliaBlockNode(child) && child.getMarginBlockId() === marginBlockId) {
      return child;
    }
  }
  return null;
}

export function $linkCurrentMarginaliaBlock(manuscriptBlockId: string | null): boolean {
  const current = $getCurrentMarginaliaBlockNode();
  if (!current) {
    return false;
  }

  current.setLinkedManuscriptBlockId(manuscriptBlockId);
  return true;
}

export function $moveCurrentMarginaliaBlock(direction: "up" | "down"): boolean {
  const current = $getCurrentMarginaliaBlockNode();
  if (!current) {
    return false;
  }

  if (direction === "up") {
    const previous = current.getPreviousSibling();
    if (!$isMarginaliaBlockNode(previous)) {
      return false;
    }
    previous.insertBefore(current);
    current.selectStart();
    return true;
  }

  const next = current.getNextSibling();
  if (!$isMarginaliaBlockNode(next)) {
    return false;
  }
  next.insertAfter(current);
  current.selectStart();
  return true;
}

export function $deleteCurrentMarginaliaBlock(kind: MarginKind): boolean {
  const current = $getCurrentMarginaliaBlockNode();
  if (!current) {
    return false;
  }

  const previous = current.getPreviousSibling();
  const next = current.getNextSibling();
  current.remove();

  if ($isMarginaliaBlockNode(next)) {
    next.selectStart();
    return true;
  }
  if ($isMarginaliaBlockNode(previous)) {
    previous.selectStart();
    return true;
  }

  const replacement = createBlock({ kind });
  $getRoot().append(replacement);
  replacement.selectStart();
  return true;
}

export function $duplicateCurrentMarginaliaBlock(): boolean {
  const current = $getCurrentMarginaliaBlockNode();
  if (!current) {
    return false;
  }

  const duplicate = $parseSerializedNode(current.exportJSON()) as MarginaliaBlockNode;
  duplicate.setMarginBlockId(newUuid());
  current.insertAfter(duplicate, true);
  duplicate.selectStart();
  return true;
}

export function $splitCurrentMarginaliaBlock(): boolean {
  const selection = $getSelection();
  const current = $getCurrentMarginaliaBlockNode();
  if (!$isRangeSelection(selection) || !selection.isCollapsed() || !current) {
    return false;
  }

  const anchorNode = selection.anchor.getNode();
  const directChild = findDirectChildInBlock(current, anchorNode);
  if (!directChild) {
    return false;
  }

  const newBlock = createEmptySiblingBlock(current);

  if ($isListNode(directChild)) {
    const listItem = findListItemWithinDirectList(directChild, anchorNode);
    if (!listItem) {
      return false;
    }

    listItem.insertNewAfter(selection, false);
    const splitStart = listItem.getNextSibling();
    if (!splitStart) {
      return false;
    }

    const newList = $createListNode(directChild.getListType(), directChild.getStart());
    newBlock.append(newList);
    moveSiblingChain(splitStart, newList);

    const nextSibling = directChild.getNextSibling();
    moveSiblingChain(nextSibling, newBlock);
  } else {
    directChild.insertNewAfter(selection as RangeSelection, false);
    const splitStart = directChild.getNextSibling();
    if (!splitStart) {
      return false;
    }

    moveSiblingChain(splitStart, newBlock);
  }

  current.insertAfter(newBlock, true);
  ensureBlockHasContent(current);
  ensureBlockHasContent(newBlock);
  newBlock.selectStart();
  return true;
}

export function $mergeCurrentMarginaliaBlock(direction: "previous" | "next"): boolean {
  const current = $getCurrentMarginaliaBlockNode();
  if (!current) {
    return false;
  }

  const sibling =
    direction === "previous" ? current.getPreviousSibling() : current.getNextSibling();
  if (!$isMarginaliaBlockNode(sibling) || !canMergeBlockLinks(direction === "previous" ? sibling : current, direction === "previous" ? current : sibling)) {
    return false;
  }

  if (direction === "previous") {
    inheritMissingLink(sibling, current);
    moveSiblingChain(current.getFirstChild(), sibling);
    current.remove();
    ensureBlockHasContent(sibling);
    sibling.selectEnd();
    return true;
  }

  inheritMissingLink(current, sibling);
  const siblingChildren = sibling.getChildren();
  current.append(...siblingChildren);
  sibling.remove();
  ensureBlockHasContent(current);
  current.selectEnd();
  return true;
}

export function registerMarginaliaCommands(editor: LexicalEditor, kind: MarginKind): () => void {
  const unregisterInsert = editor.registerCommand(
    INSERT_MARGINALIA_BLOCK_COMMAND,
    (payload) => {
      editor.update(() => {
        $insertMarginaliaBlock({ ...payload, kind });
      });
      return true;
    },
    COMMAND_PRIORITY_EDITOR,
  );

  const unregisterLink = editor.registerCommand(
    LINK_CURRENT_MARGINALIA_BLOCK_COMMAND,
    ({ manuscriptBlockId }) => {
      let handled = false;
      editor.update(() => {
        handled = $linkCurrentMarginaliaBlock(manuscriptBlockId);
      });
      return handled;
    },
    COMMAND_PRIORITY_EDITOR,
  );

  const unregisterUnlink = editor.registerCommand(
    UNLINK_CURRENT_MARGINALIA_BLOCK_COMMAND,
    () => {
      let handled = false;
      editor.update(() => {
        handled = $linkCurrentMarginaliaBlock(null);
      });
      return handled;
    },
    COMMAND_PRIORITY_EDITOR,
  );

  const unregisterMoveUp = editor.registerCommand(
    MOVE_CURRENT_MARGINALIA_BLOCK_UP_COMMAND,
    () => {
      let handled = false;
      editor.update(() => {
        handled = $moveCurrentMarginaliaBlock("up");
      });
      return handled;
    },
    COMMAND_PRIORITY_EDITOR,
  );

  const unregisterMoveDown = editor.registerCommand(
    MOVE_CURRENT_MARGINALIA_BLOCK_DOWN_COMMAND,
    () => {
      let handled = false;
      editor.update(() => {
        handled = $moveCurrentMarginaliaBlock("down");
      });
      return handled;
    },
    COMMAND_PRIORITY_EDITOR,
  );

  const unregisterDelete = editor.registerCommand(
    DELETE_CURRENT_MARGINALIA_BLOCK_COMMAND,
    () => {
      let handled = false;
      editor.update(() => {
        handled = $deleteCurrentMarginaliaBlock(kind);
      });
      return handled;
    },
    COMMAND_PRIORITY_EDITOR,
  );

  const unregisterDuplicate = editor.registerCommand(
    DUPLICATE_CURRENT_MARGINALIA_BLOCK_COMMAND,
    () => {
      let handled = false;
      editor.update(() => {
        handled = $duplicateCurrentMarginaliaBlock();
      });
      return handled;
    },
    COMMAND_PRIORITY_EDITOR,
  );

  const unregisterSplit = editor.registerCommand(
    SPLIT_CURRENT_MARGINALIA_BLOCK_COMMAND,
    () => {
      let handled = false;
      editor.update(() => {
        handled = $splitCurrentMarginaliaBlock();
      });
      return handled;
    },
    COMMAND_PRIORITY_EDITOR,
  );

  const unregisterMergePrevious = editor.registerCommand(
    MERGE_CURRENT_MARGINALIA_BLOCK_WITH_PREVIOUS_COMMAND,
    () => {
      let handled = false;
      editor.update(() => {
        handled = $mergeCurrentMarginaliaBlock("previous");
      });
      return handled;
    },
    COMMAND_PRIORITY_EDITOR,
  );

  const unregisterMergeNext = editor.registerCommand(
    MERGE_CURRENT_MARGINALIA_BLOCK_WITH_NEXT_COMMAND,
    () => {
      let handled = false;
      editor.update(() => {
        handled = $mergeCurrentMarginaliaBlock("next");
      });
      return handled;
    },
    COMMAND_PRIORITY_EDITOR,
  );

  return () => {
    unregisterInsert();
    unregisterLink();
    unregisterUnlink();
    unregisterMoveUp();
    unregisterMoveDown();
    unregisterDelete();
    unregisterDuplicate();
    unregisterSplit();
    unregisterMergePrevious();
    unregisterMergeNext();
  };
}
