import {
  collectManuscriptBlockSummariesFromLexicalJson,
  type ManuscriptBlockSummary,
} from "../editors/manuscript/lexicalBlocks/indexing";
import {
  buildMarginLinkIndexFromLexicalJson,
  collectMarginBlockSummariesFromLexicalJson,
} from "../editors/margin/marginaliaBlocks/indexing";

export interface EditorialMarginLinkIndex {
  [manuscriptBlockId: string]: string[];
}

export interface EditorialUnit {
  unitId: string;
  order: number;
  manuscriptBlockId: string;
  manuscriptExcerpt: string;
  leftMarginBlockId: string | null;
  duplicateLeftMarginBlockIds: string[];
}

export interface EditorialUnitProjection {
  units: EditorialUnit[];
  unlinkedLeftMarginBlockIds: string[];
  staleLinkedLeftMarginBlockIds: string[];
  indexMismatchManuscriptBlockIds: string[];
}

export interface LegacyLeftDuplicateSummary {
  affectedUnitCount: number;
  duplicateScholieCount: number;
  firstAffectedManuscriptBlockId: string | null;
  firstPrimaryLeftMarginBlockId: string | null;
}

export const EMPTY_EDITORIAL_UNIT_PROJECTION: EditorialUnitProjection = {
  units: [],
  unlinkedLeftMarginBlockIds: [],
  staleLinkedLeftMarginBlockIds: [],
  indexMismatchManuscriptBlockIds: [],
};

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const value of values) {
    if (typeof value !== "string" || value.length === 0 || seen.has(value)) {
      continue;
    }
    seen.add(value);
    next.push(value);
  }

  return next;
}

function buildUnit(
  summary: ManuscriptBlockSummary,
  order: number,
  leftLinksByManuscriptBlockId: EditorialMarginLinkIndex,
): EditorialUnit {
  const linkedLeftMarginBlockIds = uniqueStrings(leftLinksByManuscriptBlockId[summary.blockId] ?? []);

  return {
    unitId: summary.blockId,
    order,
    manuscriptBlockId: summary.blockId,
    manuscriptExcerpt: summary.text,
    leftMarginBlockId: linkedLeftMarginBlockIds[0] ?? null,
    duplicateLeftMarginBlockIds: linkedLeftMarginBlockIds.slice(1),
  };
}

function collectIndexMismatchManuscriptBlockIds(
  derivedLeftLinksByManuscriptBlockId: EditorialMarginLinkIndex,
  providedLeftLinksByManuscriptBlockId: EditorialMarginLinkIndex,
): string[] {
  const manuscriptBlockIds = new Set([
    ...Object.keys(derivedLeftLinksByManuscriptBlockId),
    ...Object.keys(providedLeftLinksByManuscriptBlockId),
  ]);

  const mismatches: string[] = [];
  for (const manuscriptBlockId of manuscriptBlockIds) {
    const derived = uniqueStrings(derivedLeftLinksByManuscriptBlockId[manuscriptBlockId] ?? []);
    const provided = uniqueStrings(providedLeftLinksByManuscriptBlockId[manuscriptBlockId] ?? []);

    if (derived.length !== provided.length) {
      mismatches.push(manuscriptBlockId);
      continue;
    }

    let same = true;
    for (let index = 0; index < derived.length; index += 1) {
      if (derived[index] !== provided[index]) {
        same = false;
        break;
      }
    }

    if (!same) {
      mismatches.push(manuscriptBlockId);
    }
  }

  return mismatches;
}

export function deriveEditorialUnitProjection(input: {
  manuscriptJson: string;
  leftMarginJson: string;
  leftLinksByManuscriptBlockId: EditorialMarginLinkIndex;
}): EditorialUnitProjection {
  const manuscriptSummaries = collectManuscriptBlockSummariesFromLexicalJson(input.manuscriptJson);
  const leftMarginSummaries = collectMarginBlockSummariesFromLexicalJson(input.leftMarginJson);
  const derivedLeftLinksByManuscriptBlockId = buildMarginLinkIndexFromLexicalJson(input.leftMarginJson);

  if (manuscriptSummaries.length === 0 && leftMarginSummaries.length === 0) {
    return EMPTY_EDITORIAL_UNIT_PROJECTION;
  }

  const manuscriptBlockIds = new Set(manuscriptSummaries.map((summary) => summary.blockId));

  return {
    units: manuscriptSummaries.map((summary, order) =>
      buildUnit(summary, order, derivedLeftLinksByManuscriptBlockId),
    ),
    unlinkedLeftMarginBlockIds: leftMarginSummaries
      .filter((summary) => summary.linkedManuscriptBlockId == null)
      .map((summary) => summary.marginBlockId),
    staleLinkedLeftMarginBlockIds: leftMarginSummaries
      .filter(
        (summary) =>
          summary.linkedManuscriptBlockId != null && !manuscriptBlockIds.has(summary.linkedManuscriptBlockId),
      )
      .map((summary) => summary.marginBlockId),
    indexMismatchManuscriptBlockIds: collectIndexMismatchManuscriptBlockIds(
      derivedLeftLinksByManuscriptBlockId,
      input.leftLinksByManuscriptBlockId,
    ),
  };
}

export function summarizeLegacyLeftDuplicates(
  projection: EditorialUnitProjection,
): LegacyLeftDuplicateSummary | null {
  let affectedUnitCount = 0;
  let duplicateScholieCount = 0;
  let firstAffectedManuscriptBlockId: string | null = null;
  let firstPrimaryLeftMarginBlockId: string | null = null;

  for (const unit of projection.units) {
    if (unit.duplicateLeftMarginBlockIds.length === 0) {
      continue;
    }

    affectedUnitCount += 1;
    duplicateScholieCount += unit.duplicateLeftMarginBlockIds.length;

    if (firstAffectedManuscriptBlockId == null) {
      firstAffectedManuscriptBlockId = unit.manuscriptBlockId;
      firstPrimaryLeftMarginBlockId = unit.leftMarginBlockId;
    }
  }

  if (affectedUnitCount === 0) {
    return null;
  }

  return {
    affectedUnitCount,
    duplicateScholieCount,
    firstAffectedManuscriptBlockId,
    firstPrimaryLeftMarginBlockId,
  };
}
