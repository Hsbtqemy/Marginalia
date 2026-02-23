import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  type LexicalNode,
  type LexicalCommand,
} from "lexical";
import type { LexicalEditor } from "lexical";
import { $createMarginaliaBlockNode, $isMarginaliaBlockNode, type MarginKind, type MarginaliaBlockNode } from "./MarginaliaBlockNode";

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

  return () => {
    unregisterInsert();
    unregisterLink();
    unregisterUnlink();
    unregisterMoveUp();
    unregisterMoveDown();
  };
}
