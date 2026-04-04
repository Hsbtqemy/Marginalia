import { $getState, $setState, type LexicalNode, createState } from "lexical";
import { newUuid } from "../../../utils/uuid";

export const manuscriptBlockIdState = createState("blockId", {
  parse: (value) => (typeof value === "string" ? value : ""),
});

export function getBlockId(node: LexicalNode): string {
  return $getState(node, manuscriptBlockIdState);
}

export function ensureBlockId(node: LexicalNode): string {
  const existing = getBlockId(node);
  if (existing.length > 0) {
    return existing;
  }

  const created = newUuid();
  $setState(node, manuscriptBlockIdState, created);
  return created;
}

export function setBlockId(node: LexicalNode, blockId: string): void {
  $setState(node, manuscriptBlockIdState, blockId);
}

export function replaceBlockId(node: LexicalNode): string {
  const created = newUuid();
  $setState(node, manuscriptBlockIdState, created);
  return created;
}
