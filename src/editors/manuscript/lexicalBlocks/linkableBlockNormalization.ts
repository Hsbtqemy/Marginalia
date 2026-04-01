import { collectMarginBlockSummariesFromLexicalJson } from "../../margin/marginaliaBlocks/indexing";

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

function clearBlockId(node: LexicalNodeRecord): boolean {
  const state = node.$;
  if (!state || typeof state !== "object") {
    return false;
  }

  const mutableState = { ...(state as Record<string, unknown>) };
  if (typeof mutableState.blockId !== "string") {
    return false;
  }

  delete mutableState.blockId;

  if (Object.keys(mutableState).length === 0) {
    delete node.$;
  } else {
    node.$ = mutableState;
  }

  return true;
}

function linkedBlockIdSet(leftMarginJson: string, rightMarginJson: string): Set<string> {
  const linkedIds = new Set<string>();

  for (const summary of collectMarginBlockSummariesFromLexicalJson(leftMarginJson)) {
    if (summary.linkedManuscriptBlockId) {
      linkedIds.add(summary.linkedManuscriptBlockId);
    }
  }

  for (const summary of collectMarginBlockSummariesFromLexicalJson(rightMarginJson)) {
    if (summary.linkedManuscriptBlockId) {
      linkedIds.add(summary.linkedManuscriptBlockId);
    }
  }

  return linkedIds;
}

function normalizeTopLevelBlockIds(rootChildren: LexicalNodeRecord[], keepIds: Set<string>): boolean {
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

        const blockId = readBlockId(listItem as LexicalNodeRecord);
        if (blockId && !keepIds.has(blockId)) {
          changed = clearBlockId(listItem as LexicalNodeRecord) || changed;
        }
      }
      continue;
    }

    const blockId = readBlockId(child);
    if (blockId && !keepIds.has(blockId)) {
      changed = clearBlockId(child) || changed;
    }
  }

  return changed;
}

export function normalizeLinkedManuscriptBlocks(
  manuscriptJson: string,
  leftMarginJson: string,
  rightMarginJson: string,
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

    const keepIds = linkedBlockIdSet(leftMarginJson, rightMarginJson);
    const changed = normalizeTopLevelBlockIds(rootChildren, keepIds);

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
