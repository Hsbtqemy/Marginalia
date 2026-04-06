import { newUuid } from "../../../utils/uuid";

type LexicalNodeRecord = Record<string, unknown>;

function readBlockId(node: LexicalNodeRecord): string | null {
  const state = node.$;
  if (!state || typeof state !== "object") {
    return null;
  }

  return typeof (state as { blockId?: unknown }).blockId === "string"
    ? ((state as { blockId: string }).blockId ?? null)
    : null;
}

function setBlockId(node: LexicalNodeRecord): boolean {
  const state = node.$;
  const existing = readBlockId(node);
  if (existing) {
    return false;
  }

  const mutableState = state && typeof state === "object" ? { ...(state as Record<string, unknown>) } : {};
  mutableState.blockId = newUuid();
  node.$ = mutableState;

  return true;
}

function isTopLevelManuscriptBlock(node: LexicalNodeRecord): boolean {
  return node.type === "paragraph" || node.type === "heading" || node.type === "quote";
}

function normalizeTopLevelBlockIds(rootChildren: LexicalNodeRecord[]): boolean {
  let changed = false;

  for (const child of rootChildren) {
    if (!child || typeof child !== "object") {
      continue;
    }

    if (child.type === "list" && Array.isArray(child.children)) {
      for (const listItem of child.children) {
        if (!listItem || typeof listItem !== "object") {
          continue;
        }

        if ((listItem as LexicalNodeRecord).type === "listitem") {
          changed = setBlockId(listItem as LexicalNodeRecord) || changed;
        }
      }
      continue;
    }

    if (isTopLevelManuscriptBlock(child)) {
      changed = setBlockId(child) || changed;
    }
  }

  return changed;
}

export function normalizeLinkedManuscriptBlocks(
  manuscriptJson: string,
  _leftMarginJson: string,
  _rightMarginJson: string,
): { lexicalJson: string; changed: boolean } {
  if (!manuscriptJson) {
    return { lexicalJson: manuscriptJson, changed: false };
  }

  try {
    const parsed = JSON.parse(manuscriptJson) as {
      root?: {
        children?: Array<LexicalNodeRecord>;
      };
    };

    const rootChildren = parsed.root?.children;
    if (!Array.isArray(rootChildren)) {
      return { lexicalJson: manuscriptJson, changed: false };
    }

    const changed = normalizeTopLevelBlockIds(rootChildren);

    if (!changed) {
      return { lexicalJson: manuscriptJson, changed: false };
    }

    return {
      lexicalJson: JSON.stringify(parsed),
      changed: true,
    };
  } catch {
    return { lexicalJson: manuscriptJson, changed: false };
  }
}
