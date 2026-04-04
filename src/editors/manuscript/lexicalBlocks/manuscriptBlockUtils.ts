import {
  $copyNode,
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  type ElementNode,
  type LexicalNode,
  type RangeSelection,
} from "lexical";
import { $isHeadingNode, $isQuoteNode } from "@lexical/rich-text";
import { $createListItemNode, $isListItemNode, $isListNode, ListNode } from "@lexical/list";
import { $isParagraphNode } from "lexical";
import { ensureBlockId, getBlockId, replaceBlockId } from "./blockIdState";

function isTopLevelListItem(node: LexicalNode): boolean {
  if (!$isListItemNode(node)) {
    return false;
  }
  const parent = node.getParent();
  const grandParent = parent?.getParent();
  return parent != null && grandParent != null && $isListNode(parent) && grandParent.getType() === "root";
}

export function isManuscriptBlockNode(node: LexicalNode): node is ElementNode {
  if ($isParagraphNode(node) || $isHeadingNode(node) || $isQuoteNode(node)) {
    return node.getParent()?.getType() === "root";
  }

  return isTopLevelListItem(node);
}

function isRootManuscriptBlockNode(node: LexicalNode): node is ElementNode {
  return isManuscriptBlockNode(node) && node.getParent()?.getType() === "root";
}

function getCurrentManuscriptBlockNode(): ElementNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return null;
  }

  return getSelectionBlockNode(selection);
}

function resolveManuscriptBlockNode(blockId?: string | null): ElementNode | null {
  if (blockId) {
    return findManuscriptBlockNodeById(blockId);
  }

  return getCurrentManuscriptBlockNode();
}

function createEmptyParagraphBlock(): ElementNode {
  const paragraph = $createParagraphNode();
  ensureBlockId(paragraph);
  return paragraph;
}

function createEmptyListItemBlock(): ElementNode {
  const listItem = $createListItemNode();
  listItem.append($createParagraphNode());
  ensureBlockId(listItem);
  return listItem;
}

function createEmptySiblingBlock(target: ElementNode | null): ElementNode {
  if (target && isTopLevelListItem(target)) {
    return createEmptyListItemBlock();
  }

  return createEmptyParagraphBlock();
}

function cloneLexicalSubtree<T extends LexicalNode>(node: T): T {
  const clone = $copyNode(node);

  if ($isElementNode(node) && $isElementNode(clone)) {
    for (const child of node.getChildren()) {
      clone.append(cloneLexicalSubtree(child));
    }
  }

  return clone;
}

function cloneManuscriptBlock(block: ElementNode): ElementNode {
  const clone = cloneLexicalSubtree(block);
  replaceBlockId(clone);
  return clone;
}

function collectManuscriptBlocksInOrder(): ElementNode[] {
  const blocks: ElementNode[] = [];

  for (const node of $getRoot().getChildren()) {
    if (isRootManuscriptBlockNode(node)) {
      blocks.push(node);
      continue;
    }

    if ($isListNode(node) && node.getParent()?.getType() === "root") {
      for (const listItem of node.getChildren()) {
        if (isManuscriptBlockNode(listItem)) {
          blocks.push(listItem);
        }
      }
    }
  }

  return blocks;
}

function findAdjacentManuscriptBlock(block: ElementNode, direction: "up" | "down"): ElementNode | null {
  const blocks = collectManuscriptBlocksInOrder();
  const index = blocks.findIndex((candidate) => candidate.getKey() === block.getKey());
  if (index < 0) {
    return null;
  }

  return direction === "up" ? blocks[index - 1] ?? null : blocks[index + 1] ?? null;
}

export function getSelectionBlockNode(selection: RangeSelection): ElementNode | null {
  let current: LexicalNode | null = selection.anchor.getNode();
  while (current != null) {
    if (isManuscriptBlockNode(current)) {
      return current;
    }
    current = current.getParent();
  }
  return null;
}

export function getCurrentSelectionBlockId(): string | null {
  const block = getCurrentManuscriptBlockNode();
  if (!block) {
    return null;
  }

  const id = getBlockId(block);
  return id.length > 0 ? id : null;
}

export function ensureCurrentSelectionBlockId(): string | null {
  const block = getCurrentManuscriptBlockNode();
  if (!block) {
    return null;
  }

  return ensureBlockId(block);
}

export function insertLinkedPassageAfterSelection(): string {
  const currentBlock = getCurrentManuscriptBlockNode();
  const paragraph = createEmptyParagraphBlock();

  if ($isListItemNode(currentBlock)) {
    const parentList = currentBlock.getParent();
    if (parentList instanceof ListNode && parentList.getParent()?.getType() === "root") {
      parentList.insertAfter(paragraph, true);
    } else {
      $getRoot().append(paragraph);
    }
  } else if (currentBlock?.getParent()?.getType() === "root") {
    currentBlock.insertAfter(paragraph, true);
  } else {
    $getRoot().append(paragraph);
  }

  paragraph.selectStart();
  return getBlockId(paragraph);
}

export function insertManuscriptBlockBeforeCurrent(blockId?: string | null): string {
  const currentBlock = resolveManuscriptBlockNode(blockId);
  const createdBlock = createEmptySiblingBlock(currentBlock);

  if (currentBlock) {
    currentBlock.insertBefore(createdBlock, true);
  } else {
    $getRoot().append(createdBlock);
  }

  createdBlock.selectStart();
  return getBlockId(createdBlock);
}

export function insertManuscriptBlockAfterCurrent(blockId?: string | null): string {
  const currentBlock = resolveManuscriptBlockNode(blockId);
  const createdBlock = createEmptySiblingBlock(currentBlock);

  if (currentBlock) {
    currentBlock.insertAfter(createdBlock, true);
  } else {
    $getRoot().append(createdBlock);
  }

  createdBlock.selectStart();
  return getBlockId(createdBlock);
}

export function duplicateCurrentManuscriptBlock(blockId?: string | null): string | null {
  const currentBlock = resolveManuscriptBlockNode(blockId);
  if (!currentBlock) {
    return null;
  }

  const duplicate = cloneManuscriptBlock(currentBlock);
  currentBlock.insertAfter(duplicate, true);
  duplicate.selectStart();
  return getBlockId(duplicate);
}

export function deleteCurrentManuscriptBlock(blockId?: string | null): string | null {
  const currentBlock = resolveManuscriptBlockNode(blockId);
  if (!currentBlock) {
    return null;
  }

  const nextBlock = findAdjacentManuscriptBlock(currentBlock, "down");
  const previousBlock = nextBlock ? null : findAdjacentManuscriptBlock(currentBlock, "up");
  const nextBlockId = nextBlock ? getBlockId(nextBlock) || ensureBlockId(nextBlock) : null;
  const previousBlockId = previousBlock ? getBlockId(previousBlock) || ensureBlockId(previousBlock) : null;
  const parentList = $isListItemNode(currentBlock) ? currentBlock.getParent() : null;

  currentBlock.remove();

  if (parentList instanceof ListNode && parentList.getParent()?.getType() === "root" && parentList.getChildrenSize() === 0) {
    parentList.remove();
  }

  const focusTargetId = nextBlockId ?? previousBlockId;
  if (focusTargetId) {
    const focusTarget = findManuscriptBlockNodeById(focusTargetId);
    if (focusTarget) {
      focusTarget.selectStart();
      return focusTargetId;
    }
  }

  const fallbackParagraph = createEmptyParagraphBlock();
  $getRoot().append(fallbackParagraph);
  fallbackParagraph.selectStart();
  return getBlockId(fallbackParagraph);
}

export function moveCurrentManuscriptBlockUp(blockId?: string | null): string | null {
  const currentBlock = resolveManuscriptBlockNode(blockId);
  if (!currentBlock) {
    return null;
  }

  if ($isListItemNode(currentBlock)) {
    const previousSibling = currentBlock.getPreviousSibling();
    if (!$isListItemNode(previousSibling)) {
      return null;
    }
    previousSibling.insertBefore(currentBlock);
    currentBlock.selectStart();
    return getBlockId(currentBlock) || ensureBlockId(currentBlock);
  }

  const previousSibling = currentBlock.getPreviousSibling();
  if (!previousSibling) {
    return null;
  }

  previousSibling.insertBefore(currentBlock, true);
  currentBlock.selectStart();
  return getBlockId(currentBlock) || ensureBlockId(currentBlock);
}

export function moveCurrentManuscriptBlockDown(blockId?: string | null): string | null {
  const currentBlock = resolveManuscriptBlockNode(blockId);
  if (!currentBlock) {
    return null;
  }

  if ($isListItemNode(currentBlock)) {
    const nextSibling = currentBlock.getNextSibling();
    if (!$isListItemNode(nextSibling)) {
      return null;
    }
    nextSibling.insertAfter(currentBlock);
    currentBlock.selectStart();
    return getBlockId(currentBlock) || ensureBlockId(currentBlock);
  }

  const nextSibling = currentBlock.getNextSibling();
  if (!nextSibling) {
    return null;
  }

  nextSibling.insertAfter(currentBlock, true);
  currentBlock.selectStart();
  return getBlockId(currentBlock) || ensureBlockId(currentBlock);
}

export function findManuscriptBlockNodeById(blockId: string): ElementNode | null {
  const root = $getRoot();
  const topLevel = root.getChildren();

  for (const node of topLevel) {
    if (isManuscriptBlockNode(node) && getBlockId(node) === blockId) {
      return node;
    }

    if ($isListNode(node) && node.getParent()?.getType() === "root") {
      for (const child of node.getChildren()) {
        if (isManuscriptBlockNode(child) && getBlockId(child) === blockId) {
          return child;
        }
      }
    }
  }

  return null;
}

export interface BlockDomBinding {
  key: string;
  blockId: string;
}

export function collectManuscriptBlockIds(): string[] {
  return collectManuscriptBlocksInOrder()
    .map((block) => getBlockId(block))
    .filter((blockId) => blockId.length > 0);
}

export function collectBlockDomBindings(): BlockDomBinding[] {
  const bindings: BlockDomBinding[] = [];
  const root = $getRoot();

  for (const child of root.getChildren()) {
    if (isManuscriptBlockNode(child)) {
      const blockId = getBlockId(child);
      if (blockId.length > 0) {
        bindings.push({ key: child.getKey(), blockId });
      }
      continue;
    }

    if ($isListNode(child) && child.getParent()?.getType() === "root") {
      for (const listItem of child.getChildren()) {
        if (isManuscriptBlockNode(listItem)) {
          const blockId = getBlockId(listItem);
          if (blockId.length > 0) {
            bindings.push({ key: listItem.getKey(), blockId });
          }
        }
      }
    }
  }

  return bindings;
}
