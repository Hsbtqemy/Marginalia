import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  type ElementNode,
  type LexicalNode,
  type RangeSelection,
} from "lexical";
import { $isHeadingNode, $isQuoteNode } from "@lexical/rich-text";
import { $isListItemNode, $isListNode } from "@lexical/list";
import { $isParagraphNode } from "lexical";
import { getBlockId } from "./blockIdState";

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
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return null;
  }

  const block = getSelectionBlockNode(selection);
  if (!block) {
    return null;
  }

  const id = getBlockId(block);
  return id.length > 0 ? id : null;
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

export function collectBlockDomBindings(): BlockDomBinding[] {
  const bindings: BlockDomBinding[] = [];
  const root = $getRoot();

  for (const child of root.getChildren()) {
    if (isManuscriptBlockNode(child)) {
      bindings.push({ key: child.getKey(), blockId: getBlockId(child) });
      continue;
    }

    if ($isListNode(child) && child.getParent()?.getType() === "root") {
      for (const listItem of child.getChildren()) {
        if (isManuscriptBlockNode(listItem)) {
          bindings.push({ key: listItem.getKey(), blockId: getBlockId(listItem) });
        }
      }
    }
  }

  return bindings;
}
