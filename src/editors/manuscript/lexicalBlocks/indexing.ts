export interface ManuscriptBlockSummary {
  blockId: string;
  text: string;
}

interface SerializedLexicalRoot {
  root?: {
    children?: Array<Record<string, unknown>>;
  };
}

function collectText(node: Record<string, unknown>): string {
  if (typeof node.text === "string") {
    return node.text;
  }

  if (!Array.isArray(node.children)) {
    return "";
  }

  return node.children
    .map((child) => (child && typeof child === "object" ? collectText(child as Record<string, unknown>) : ""))
    .join("");
}

function readBlockId(node: Record<string, unknown>): string | null {
  const state = node.$;
  if (!state || typeof state !== "object") {
    return null;
  }

  return typeof (state as { blockId?: unknown }).blockId === "string"
    ? ((state as { blockId: string }).blockId ?? null)
    : null;
}

function normalizeExcerpt(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 180);
}

export function collectManuscriptBlockSummariesFromSerializedLexicalState(
  parsed: SerializedLexicalRoot,
): ManuscriptBlockSummary[] {
  const rootChildren = parsed.root?.children;
  if (!Array.isArray(rootChildren)) {
    return [];
  }

  const summaries: ManuscriptBlockSummary[] = [];
  for (const child of rootChildren) {
    if (!child || typeof child !== "object") {
      continue;
    }

    if (child.type === "list" && Array.isArray(child.children)) {
      for (const listItem of child.children) {
        if (!listItem || typeof listItem !== "object") {
          continue;
        }
        const blockId = readBlockId(listItem);
        if (!blockId) {
          continue;
        }
        summaries.push({
          blockId,
          text: normalizeExcerpt(collectText(listItem)),
        });
      }
      continue;
    }

    const blockId = readBlockId(child);
    if (!blockId) {
      continue;
    }

    summaries.push({
      blockId,
      text: normalizeExcerpt(collectText(child)),
    });
  }

  return summaries;
}

export function collectManuscriptBlockSummariesFromLexicalJson(lexicalJson: string): ManuscriptBlockSummary[] {
  if (!lexicalJson) {
    return [];
  }

  try {
    return collectManuscriptBlockSummariesFromSerializedLexicalState(
      JSON.parse(lexicalJson) as SerializedLexicalRoot,
    );
  } catch {
    return [];
  }
}

export function buildManuscriptExcerptIndexFromSerializedLexicalState(
  parsed: SerializedLexicalRoot,
): Record<string, string> {
  const index: Record<string, string> = {};
  for (const summary of collectManuscriptBlockSummariesFromSerializedLexicalState(parsed)) {
    index[summary.blockId] = summary.text;
  }
  return index;
}

export function buildManuscriptExcerptIndexFromLexicalJson(lexicalJson: string): Record<string, string> {
  if (!lexicalJson) {
    return {};
  }

  try {
    return buildManuscriptExcerptIndexFromSerializedLexicalState(
      JSON.parse(lexicalJson) as SerializedLexicalRoot,
    );
  } catch {
    return {};
  }
}
