import {
  $copyNode,
  $createParagraphNode,
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

function createEmptySiblingBlock(
  block: MarginaliaBlockNode,
  options?: { preserveLinkedManuscriptBlockId?: boolean },
): MarginaliaBlockNode {
  return $createMarginaliaBlockNode({
    kind: block.getKind(),
    linkedManuscriptBlockId:
      options?.preserveLinkedManuscriptBlockId === false ? null : block.getLinkedManuscriptBlockId(),
  });
}

function cloneMarginaliaSubtree<T extends LexicalNode>(node: T): T {
  const clone = $copyNode(node);

  if ($isElementNode(node) && $isElementNode(clone)) {
    for (const child of node.getChildren()) {
      clone.append(cloneMarginaliaSubtree(child));
    }
  }

  return clone;
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

function enforcesSingleLinkedBlock(kind: MarginKind): boolean {
  return kind === "left";
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

export function $normalizeMarginaliaRoot(kind: MarginKind): void {
  const root = $getRoot();
  const rootChildren = [...root.getChildren()];

  if (rootChildren.length === 0) {
    root.append(createBlock({ kind }));
    return;
  }

  const hasNonMarginaliaChildren = rootChildren.some((child) => !$isMarginaliaBlockNode(child));
  if (!hasNonMarginaliaChildren) {
    return;
  }

  let fallbackBlock =
    rootChildren.find((child): child is MarginaliaBlockNode => $isMarginaliaBlockNode(child)) ?? null;

  if (!fallbackBlock) {
    fallbackBlock = createBlock({ kind });
    const firstChild = root.getFirstChild();
    if (firstChild) {
      firstChild.insertBefore(fallbackBlock);
    } else {
      root.append(fallbackBlock);
    }
  }

  for (const child of [...root.getChildren()]) {
    if ($isMarginaliaBlockNode(child)) {
      continue;
    }

    if ($isElementNode(child)) {
      fallbackBlock.append(child);
      continue;
    }

    const paragraph = $createParagraphNode();
    paragraph.append(child);
    fallbackBlock.append(paragraph);
  }

  ensureBlockHasContent(fallbackBlock);
}

export function $insertMarginaliaBlock(payload: InsertMarginaliaBlockPayload): MarginaliaBlockNode {
  if (payload.linkedManuscriptBlockId && enforcesSingleLinkedBlock(payload.kind)) {
    const existing = $findFirstMarginaliaBlockByLinkedManuscriptId(payload.linkedManuscriptBlockId);
    if (existing) {
      existing.selectStart();
      return existing;
    }
  }

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

export function $findFirstMarginaliaBlockByLinkedManuscriptId(
  manuscriptBlockId: string,
  options?: { excludeMarginBlockId?: string | null },
): MarginaliaBlockNode | null {
  const root = $getRoot();
  for (const child of root.getChildren()) {
    if (
      $isMarginaliaBlockNode(child) &&
      child.getLinkedManuscriptBlockId() === manuscriptBlockId &&
      child.getMarginBlockId() !== options?.excludeMarginBlockId
    ) {
      return child;
    }
  }
  return null;
}

export function $findMarginaliaBlocksByLinkedManuscriptId(
  manuscriptBlockId: string,
  options?: { excludeMarginBlockIds?: string[] },
): MarginaliaBlockNode[] {
  const excludedIds = new Set(options?.excludeMarginBlockIds ?? []);
  const matches: MarginaliaBlockNode[] = [];

  for (const child of $getRoot().getChildren()) {
    if (
      $isMarginaliaBlockNode(child) &&
      child.getLinkedManuscriptBlockId() === manuscriptBlockId &&
      !excludedIds.has(child.getMarginBlockId())
    ) {
      matches.push(child);
    }
  }

  return matches;
}

function positionMarginaliaBlock(
  block: MarginaliaBlockNode,
  options?: {
    afterMarginBlockId?: string | null;
    beforeMarginBlockId?: string | null;
    select?: boolean;
  },
): MarginaliaBlockNode {
  const shouldSelect = options?.select ?? true;
  const afterBlock =
    options?.afterMarginBlockId != null ? $findMarginaliaBlockById(options.afterMarginBlockId) : null;
  const beforeBlock =
    options?.beforeMarginBlockId != null ? $findMarginaliaBlockById(options.beforeMarginBlockId) : null;

  if (afterBlock && afterBlock !== block) {
    afterBlock.insertAfter(block, shouldSelect);
  } else if (beforeBlock && beforeBlock !== block) {
    beforeBlock.insertBefore(block, shouldSelect);
  } else if (block.getParent() == null) {
    $getRoot().append(block);
  }

  if (shouldSelect) {
    block.selectStart();
  }

  return block;
}

export function $insertMarginaliaBlockAt(
  payload: InsertMarginaliaBlockPayload,
  options?: {
    afterMarginBlockId?: string | null;
    beforeMarginBlockId?: string | null;
    select?: boolean;
  },
): MarginaliaBlockNode {
  if (payload.linkedManuscriptBlockId && enforcesSingleLinkedBlock(payload.kind)) {
    const existing = $findFirstMarginaliaBlockByLinkedManuscriptId(payload.linkedManuscriptBlockId);
    if (existing) {
      if (options?.select ?? true) {
        existing.selectStart();
      }
      return existing;
    }
  }

  const block = createBlock(payload);
  return positionMarginaliaBlock(block, options);
}

export function $normalizeLegacyLinkedMarginaliaBlocks(kind: MarginKind): number {
  if (!enforcesSingleLinkedBlock(kind)) {
    return 0;
  }

  const seenLinkedManuscriptBlockIds = new Set<string>();
  let normalizedCount = 0;

  for (const child of $getRoot().getChildren()) {
    if (!$isMarginaliaBlockNode(child)) {
      continue;
    }

    const linkedManuscriptBlockId = child.getLinkedManuscriptBlockId();
    if (!linkedManuscriptBlockId) {
      continue;
    }

    if (seenLinkedManuscriptBlockIds.has(linkedManuscriptBlockId)) {
      child.setLinkedManuscriptBlockId(null);
      normalizedCount += 1;
      continue;
    }

    seenLinkedManuscriptBlockIds.add(linkedManuscriptBlockId);
  }

  return normalizedCount;
}

export function $linkCurrentMarginaliaBlock(
  manuscriptBlockId: string | null,
  options?: { reuseExistingLinkedBlock?: boolean },
): boolean {
  const current = $getCurrentMarginaliaBlockNode();
  if (!current) {
    return false;
  }

  if (current.getLinkedManuscriptBlockId() === manuscriptBlockId) {
    return true;
  }

  if (manuscriptBlockId && options?.reuseExistingLinkedBlock) {
    const existing = $findFirstMarginaliaBlockByLinkedManuscriptId(manuscriptBlockId, {
      excludeMarginBlockId: current.getMarginBlockId(),
    });
    if (existing) {
      // Legacy documents may still contain duplicates; keep focus on the first linked scholie
      // instead of creating a second active link from the left margin.
      existing.selectStart();
      return true;
    }
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

  const duplicate = cloneMarginaliaSubtree(current);
  duplicate.setMarginBlockId(newUuid());
  if (enforcesSingleLinkedBlock(current.getKind()) && duplicate.getLinkedManuscriptBlockId()) {
    duplicate.setLinkedManuscriptBlockId(null);
  }
  positionMarginaliaBlock(duplicate, {
    afterMarginBlockId: current.getMarginBlockId(),
    select: true,
  });
  return true;
}

export function $duplicateMarginaliaBlockById(
  marginBlockId: string,
  options?: {
    linkedManuscriptBlockId?: string | null;
    afterMarginBlockId?: string | null;
    beforeMarginBlockId?: string | null;
    select?: boolean;
  },
): MarginaliaBlockNode | null {
  const current = $findMarginaliaBlockById(marginBlockId);
  if (!current) {
    return null;
  }

  const duplicate = cloneMarginaliaSubtree(current);
  duplicate.setMarginBlockId(newUuid());

  if (options?.linkedManuscriptBlockId !== undefined) {
    duplicate.setLinkedManuscriptBlockId(options.linkedManuscriptBlockId);
  } else if (enforcesSingleLinkedBlock(current.getKind()) && duplicate.getLinkedManuscriptBlockId()) {
    duplicate.setLinkedManuscriptBlockId(null);
  }

  if (
    enforcesSingleLinkedBlock(current.getKind()) &&
    duplicate.getLinkedManuscriptBlockId() &&
    $findFirstMarginaliaBlockByLinkedManuscriptId(duplicate.getLinkedManuscriptBlockId() ?? "", {
      excludeMarginBlockId: current.getMarginBlockId(),
    })
  ) {
    return $findFirstMarginaliaBlockByLinkedManuscriptId(duplicate.getLinkedManuscriptBlockId() ?? "");
  }

  return positionMarginaliaBlock(duplicate, {
    afterMarginBlockId: options?.afterMarginBlockId ?? current.getMarginBlockId(),
    beforeMarginBlockId: options?.beforeMarginBlockId,
    select: options?.select,
  });
}

export function $moveMarginaliaBlockBefore(
  marginBlockId: string,
  beforeMarginBlockId: string,
  options?: { select?: boolean },
): boolean {
  const current = $findMarginaliaBlockById(marginBlockId);
  const before = $findMarginaliaBlockById(beforeMarginBlockId);
  if (!current || !before || current === before) {
    return false;
  }

  before.insertBefore(current, options?.select ?? false);
  if (options?.select) {
    current.selectStart();
  }
  return true;
}

export function $moveMarginaliaBlockAfter(
  marginBlockId: string,
  afterMarginBlockId: string,
  options?: { select?: boolean },
): boolean {
  const current = $findMarginaliaBlockById(marginBlockId);
  const after = $findMarginaliaBlockById(afterMarginBlockId);
  if (!current || !after || current === after) {
    return false;
  }

  after.insertAfter(current, options?.select ?? false);
  if (options?.select) {
    current.selectStart();
  }
  return true;
}

export function $deleteMarginaliaBlocksById(marginBlockIds: string[]): number {
  const targetIds = new Set(marginBlockIds);
  let deletedCount = 0;

  for (const child of [...$getRoot().getChildren()]) {
    if (!$isMarginaliaBlockNode(child) || !targetIds.has(child.getMarginBlockId())) {
      continue;
    }

    child.remove();
    deletedCount += 1;
  }

  return deletedCount;
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

  const newBlock = createEmptySiblingBlock(current, {
    preserveLinkedManuscriptBlockId: !enforcesSingleLinkedBlock(current.getKind()),
  });

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
  const runUpdateSafely = (callback: () => void): boolean => {
    try {
      editor.update(callback);
      return true;
    } catch (error) {
      console.error("Marginalia command failed", error);
      return false;
    }
  };

  const unregisterInsert = editor.registerCommand(
    INSERT_MARGINALIA_BLOCK_COMMAND,
    (payload) => {
      return runUpdateSafely(() => {
        $insertMarginaliaBlock({ ...payload, kind });
      });
    },
    COMMAND_PRIORITY_EDITOR,
  );

  const unregisterLink = editor.registerCommand(
    LINK_CURRENT_MARGINALIA_BLOCK_COMMAND,
    ({ manuscriptBlockId }) => {
      let handled = false;
      const updated = runUpdateSafely(() => {
        handled = $linkCurrentMarginaliaBlock(manuscriptBlockId, {
          reuseExistingLinkedBlock: kind === "left",
        });
      });
      return updated && handled;
    },
    COMMAND_PRIORITY_EDITOR,
  );

  const unregisterUnlink = editor.registerCommand(
    UNLINK_CURRENT_MARGINALIA_BLOCK_COMMAND,
    () => {
      let handled = false;
      const updated = runUpdateSafely(() => {
        handled = $linkCurrentMarginaliaBlock(null);
      });
      return updated && handled;
    },
    COMMAND_PRIORITY_EDITOR,
  );

  const unregisterMoveUp = editor.registerCommand(
    MOVE_CURRENT_MARGINALIA_BLOCK_UP_COMMAND,
    () => {
      let handled = false;
      const updated = runUpdateSafely(() => {
        handled = $moveCurrentMarginaliaBlock("up");
      });
      return updated && handled;
    },
    COMMAND_PRIORITY_EDITOR,
  );

  const unregisterMoveDown = editor.registerCommand(
    MOVE_CURRENT_MARGINALIA_BLOCK_DOWN_COMMAND,
    () => {
      let handled = false;
      const updated = runUpdateSafely(() => {
        handled = $moveCurrentMarginaliaBlock("down");
      });
      return updated && handled;
    },
    COMMAND_PRIORITY_EDITOR,
  );

  const unregisterDelete = editor.registerCommand(
    DELETE_CURRENT_MARGINALIA_BLOCK_COMMAND,
    () => {
      let handled = false;
      const updated = runUpdateSafely(() => {
        handled = $deleteCurrentMarginaliaBlock(kind);
      });
      return updated && handled;
    },
    COMMAND_PRIORITY_EDITOR,
  );

  const unregisterDuplicate = editor.registerCommand(
    DUPLICATE_CURRENT_MARGINALIA_BLOCK_COMMAND,
    () => {
      let handled = false;
      const updated = runUpdateSafely(() => {
        handled = $duplicateCurrentMarginaliaBlock();
      });
      return updated && handled;
    },
    COMMAND_PRIORITY_EDITOR,
  );

  const unregisterSplit = editor.registerCommand(
    SPLIT_CURRENT_MARGINALIA_BLOCK_COMMAND,
    () => {
      let handled = false;
      const updated = runUpdateSafely(() => {
        handled = $splitCurrentMarginaliaBlock();
      });
      return updated && handled;
    },
    COMMAND_PRIORITY_EDITOR,
  );

  const unregisterMergePrevious = editor.registerCommand(
    MERGE_CURRENT_MARGINALIA_BLOCK_WITH_PREVIOUS_COMMAND,
    () => {
      let handled = false;
      const updated = runUpdateSafely(() => {
        handled = $mergeCurrentMarginaliaBlock("previous");
      });
      return updated && handled;
    },
    COMMAND_PRIORITY_EDITOR,
  );

  const unregisterMergeNext = editor.registerCommand(
    MERGE_CURRENT_MARGINALIA_BLOCK_WITH_NEXT_COMMAND,
    () => {
      let handled = false;
      const updated = runUpdateSafely(() => {
        handled = $mergeCurrentMarginaliaBlock("next");
      });
      return updated && handled;
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
