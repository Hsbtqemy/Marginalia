export interface MarginBlockSummary {
  marginBlockId: string;
  linkedManuscriptBlockId: string | null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function collectMarginBlockSummariesFromLexicalJson(lexicalJson: string): MarginBlockSummary[] {
  try {
    const parsed = JSON.parse(lexicalJson) as {
      root?: {
        children?: Array<Record<string, unknown>>;
      };
    };

    const children = parsed.root?.children;
    if (!Array.isArray(children)) {
      return [];
    }

    const summaries: MarginBlockSummary[] = [];
    for (const child of children) {
      if (child.type !== "marginalia-block") {
        continue;
      }

      const marginBlockId = readString(child.marginBlockId);
      if (!marginBlockId) {
        continue;
      }

      summaries.push({
        marginBlockId,
        linkedManuscriptBlockId: readString(child.linkedManuscriptBlockId),
      });
    }

    return summaries;
  } catch {
    return [];
  }
}

export function buildMarginLinkIndexFromLexicalJson(
  lexicalJson: string,
  options?: { uniquePerManuscriptBlock?: boolean },
): Record<string, string[]> {
  const index: Record<string, string[]> = {};
  const summaries = collectMarginBlockSummariesFromLexicalJson(lexicalJson);

  for (const summary of summaries) {
    if (!summary.linkedManuscriptBlockId) {
      continue;
    }

    if (!index[summary.linkedManuscriptBlockId]) {
      index[summary.linkedManuscriptBlockId] = [];
    }

    if (options?.uniquePerManuscriptBlock && index[summary.linkedManuscriptBlockId].length > 0) {
      continue;
    }

    index[summary.linkedManuscriptBlockId].push(summary.marginBlockId);
  }

  return index;
}
