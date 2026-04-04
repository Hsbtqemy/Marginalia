import { $getRoot } from "lexical";
import { $isMarginaliaBlockNode, type MarginKind } from "./MarginaliaBlockNode";

export type LeftScholiePresentationState = "empty" | "reduced" | "developed" | null;

export interface MarginaliaPresentationSummary {
  marginBlockId: string;
  linkedManuscriptBlockId: string | null;
  hasContent: boolean;
  isCurrent: boolean;
  scholieState: LeftScholiePresentationState;
}

export function deriveLeftScholiePresentationState(options: {
  kind: MarginKind;
  linkedManuscriptBlockId: string | null;
  hasContent: boolean;
  isCurrent: boolean;
}): LeftScholiePresentationState {
  if (options.kind !== "left" || !options.linkedManuscriptBlockId) {
    return null;
  }

  if (!options.hasContent) {
    return "empty";
  }

  return options.isCurrent ? "developed" : "reduced";
}

export function collectMarginaliaPresentationSummaries(
  kind: MarginKind,
  currentMarginBlockId: string | null,
): MarginaliaPresentationSummary[] {
  const summaries: MarginaliaPresentationSummary[] = [];

  for (const child of $getRoot().getChildren()) {
    if (!$isMarginaliaBlockNode(child)) {
      continue;
    }

    const marginBlockId = child.getMarginBlockId();
    const linkedManuscriptBlockId = child.getLinkedManuscriptBlockId();
    const hasContent = child.getTextContent().trim().length > 0;
    const isCurrent = currentMarginBlockId === marginBlockId;

    summaries.push({
      marginBlockId,
      linkedManuscriptBlockId,
      hasContent,
      isCurrent,
      scholieState: deriveLeftScholiePresentationState({
        kind,
        linkedManuscriptBlockId,
        hasContent,
        isCurrent,
      }),
    });
  }

  return summaries;
}
