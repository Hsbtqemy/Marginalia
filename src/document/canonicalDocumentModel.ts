export type CanonicalDocumentModelSourceFormat = "legacy-lexical-triptych";
export type CanonicalRightPaneMode = "supplemental-notes";
export type CanonicalSupplementalLeftNoteReason =
  | "duplicate-left-link"
  | "unlinked-left-note"
  | "stale-left-link";

export interface CanonicalManuscriptRootContainer {
  kind: "root";
}

export interface CanonicalManuscriptListContainer {
  kind: "list";
  listType: string | null;
  start: number | null;
  tag: string | null;
  direction: string | null;
  format: string | null;
  indent: number | null;
}

export type CanonicalManuscriptContainer = CanonicalManuscriptRootContainer | CanonicalManuscriptListContainer;

export interface CanonicalManuscriptBlock {
  blockId: string;
  lexicalNode: Record<string, unknown>;
  excerpt: string;
  container: CanonicalManuscriptContainer;
}

export interface CanonicalLeftScholie {
  marginBlockId: string;
  linkedManuscriptBlockId: string;
  marginOrder: number;
  lexicalNode: Record<string, unknown>;
  excerpt: string;
  hasContent: boolean;
}

export interface CanonicalRightNote {
  marginBlockId: string;
  linkedManuscriptBlockId: string | null;
  marginOrder: number;
  lexicalNode: Record<string, unknown>;
  excerpt: string;
  hasContent: boolean;
}

export interface CanonicalSupplementalLeftNote {
  marginBlockId: string;
  linkedManuscriptBlockId: string | null;
  marginOrder: number;
  lexicalNode: Record<string, unknown>;
  excerpt: string;
  hasContent: boolean;
  reason: CanonicalSupplementalLeftNoteReason;
}

export interface CanonicalEditorialUnit {
  unitId: string;
  order: number;
  manuscript: CanonicalManuscriptBlock;
  scholie: CanonicalLeftScholie | null;
}

export interface CanonicalLegacyDiagnostics {
  duplicateLeftMarginBlockIdsByUnitId: Record<string, string[]>;
  unlinkedLeftMarginBlockIds: string[];
  staleLinkedLeftMarginBlockIds: string[];
}

export interface CanonicalDocumentModel {
  version: 1;
  sourceFormat: CanonicalDocumentModelSourceFormat;
  rightPaneMode: CanonicalRightPaneMode;
  units: CanonicalEditorialUnit[];
  supplementalLeftNotes: CanonicalSupplementalLeftNote[];
  rightNotes: CanonicalRightNote[];
  legacyDiagnostics: CanonicalLegacyDiagnostics;
}

interface ExtractedManuscriptBlock {
  blockId: string;
  lexicalNode: Record<string, unknown>;
  excerpt: string;
  container: CanonicalManuscriptContainer;
}

interface ExtractedMarginBlock {
  marginBlockId: string;
  linkedManuscriptBlockId: string | null;
  marginOrder: number;
  lexicalNode: Record<string, unknown>;
  excerpt: string;
  hasContent: boolean;
}

const CANONICAL_DOCUMENT_MODEL_VERSION = 1 as const;
const CANONICAL_DOCUMENT_MODEL_SOURCE_FORMAT: CanonicalDocumentModelSourceFormat = "legacy-lexical-triptych";
const CANONICAL_RIGHT_PANE_MODE: CanonicalRightPaneMode = "supplemental-notes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cloneNode(node: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(node)) as Record<string, unknown>;
}

function collectText(node: Record<string, unknown>): string {
  const ownText = typeof node.text === "string" ? node.text : "";
  if (!Array.isArray(node.children)) {
    return ownText;
  }

  return [
    ownText,
    ...node.children.map((child) => (isRecord(child) ? collectText(child) : "")),
  ].join("");
}

function normalizeExcerpt(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 180);
}

function parseRootChildren(lexicalJson: string): Record<string, unknown>[] {
  if (!lexicalJson) {
    return [];
  }

  try {
    const parsed = JSON.parse(lexicalJson) as {
      root?: {
        children?: unknown[];
      };
    };
    return Array.isArray(parsed.root?.children) ? parsed.root.children.filter(isRecord) : [];
  } catch {
    return [];
  }
}

function readManuscriptBlockId(node: Record<string, unknown>): string | null {
  if (!isRecord(node.$)) {
    return null;
  }
  return readString(node.$.blockId);
}

function extractManuscriptBlocks(manuscriptJson: string): ExtractedManuscriptBlock[] {
  const blocks: ExtractedManuscriptBlock[] = [];

  for (const child of parseRootChildren(manuscriptJson)) {
    if (child.type === "list" && Array.isArray(child.children)) {
      const container: CanonicalManuscriptListContainer = {
        kind: "list",
        listType: readString(child.listType),
        start: readNumber(child.start),
        tag: readString(child.tag),
        direction: readString(child.direction),
        format: readString(child.format),
        indent: readNumber(child.indent),
      };

      for (const listItem of child.children) {
        if (!isRecord(listItem)) {
          continue;
        }
        const blockId = readManuscriptBlockId(listItem);
        if (!blockId) {
          continue;
        }
        blocks.push({
          blockId,
          lexicalNode: cloneNode(listItem),
          excerpt: normalizeExcerpt(collectText(listItem)),
          container,
        });
      }
      continue;
    }

    const blockId = readManuscriptBlockId(child);
    if (!blockId) {
      continue;
    }

    blocks.push({
      blockId,
      lexicalNode: cloneNode(child),
      excerpt: normalizeExcerpt(collectText(child)),
      container: { kind: "root" },
    });
  }

  return blocks;
}

function extractMarginBlocks(lexicalJson: string): ExtractedMarginBlock[] {
  const blocks: ExtractedMarginBlock[] = [];

  for (const [marginOrder, child] of parseRootChildren(lexicalJson).entries()) {
    if (child.type !== "marginalia-block") {
      continue;
    }

    const marginBlockId = readString(child.marginBlockId);
    if (!marginBlockId) {
      continue;
    }

    const excerpt = normalizeExcerpt(collectText(child));
    blocks.push({
      marginBlockId,
      linkedManuscriptBlockId: readString(child.linkedManuscriptBlockId),
      marginOrder,
      lexicalNode: cloneNode(child),
      excerpt,
      hasContent: excerpt.length > 0,
    });
  }

  return blocks;
}

export function deriveCanonicalDocumentModelFromEditorStates(input: {
  manuscriptJson: string;
  leftMarginJson: string;
  rightMarginJson: string;
}): CanonicalDocumentModel {
  const manuscriptBlocks = extractManuscriptBlocks(input.manuscriptJson);
  const leftBlocks = extractMarginBlocks(input.leftMarginJson);
  const rightBlocks = extractMarginBlocks(input.rightMarginJson);

  const manuscriptBlockIds = new Set(manuscriptBlocks.map((block) => block.blockId));
  const leftBlocksByManuscriptBlockId = new Map<string, ExtractedMarginBlock[]>();
  const duplicateLeftMarginBlockIdsByUnitId: Record<string, string[]> = {};
  const unlinkedLeftMarginBlockIds: string[] = [];
  const staleLinkedLeftMarginBlockIds: string[] = [];

  for (const block of leftBlocks) {
    if (!block.linkedManuscriptBlockId || !manuscriptBlockIds.has(block.linkedManuscriptBlockId)) {
      continue;
    }

    const existing = leftBlocksByManuscriptBlockId.get(block.linkedManuscriptBlockId) ?? [];
    existing.push(block);
    leftBlocksByManuscriptBlockId.set(block.linkedManuscriptBlockId, existing);
  }

  const primaryLeftMarginBlockIds = new Set<string>();
  const units: CanonicalEditorialUnit[] = manuscriptBlocks.map((block, order) => {
    const linkedLeftBlocks = leftBlocksByManuscriptBlockId.get(block.blockId) ?? [];
    const primaryScholie = linkedLeftBlocks[0] ?? null;
    const duplicateLeftBlocks = linkedLeftBlocks.slice(1);

    if (primaryScholie) {
      primaryLeftMarginBlockIds.add(primaryScholie.marginBlockId);
    }

    if (duplicateLeftBlocks.length > 0) {
      duplicateLeftMarginBlockIdsByUnitId[block.blockId] = duplicateLeftBlocks.map(
        (duplicateBlock) => duplicateBlock.marginBlockId,
      );
    }

    return {
      unitId: block.blockId,
      order,
      manuscript: {
        blockId: block.blockId,
        lexicalNode: block.lexicalNode,
        excerpt: block.excerpt,
        container: block.container,
      },
      scholie:
        primaryScholie == null
          ? null
          : {
              marginBlockId: primaryScholie.marginBlockId,
              linkedManuscriptBlockId: block.blockId,
              marginOrder: primaryScholie.marginOrder,
              lexicalNode: primaryScholie.lexicalNode,
              excerpt: primaryScholie.excerpt,
              hasContent: primaryScholie.hasContent,
            },
    };
  });

  const supplementalLeftNotes: CanonicalSupplementalLeftNote[] = [];

  for (const block of leftBlocks) {
    if (!block.linkedManuscriptBlockId) {
      unlinkedLeftMarginBlockIds.push(block.marginBlockId);
      supplementalLeftNotes.push({
        marginBlockId: block.marginBlockId,
        linkedManuscriptBlockId: null,
        marginOrder: block.marginOrder,
        lexicalNode: block.lexicalNode,
        excerpt: block.excerpt,
        hasContent: block.hasContent,
        reason: "unlinked-left-note",
      });
      continue;
    }

    if (!manuscriptBlockIds.has(block.linkedManuscriptBlockId)) {
      staleLinkedLeftMarginBlockIds.push(block.marginBlockId);
      supplementalLeftNotes.push({
        marginBlockId: block.marginBlockId,
        linkedManuscriptBlockId: block.linkedManuscriptBlockId,
        marginOrder: block.marginOrder,
        lexicalNode: block.lexicalNode,
        excerpt: block.excerpt,
        hasContent: block.hasContent,
        reason: "stale-left-link",
      });
      continue;
    }

    if (!primaryLeftMarginBlockIds.has(block.marginBlockId)) {
      supplementalLeftNotes.push({
        marginBlockId: block.marginBlockId,
        linkedManuscriptBlockId: block.linkedManuscriptBlockId,
        marginOrder: block.marginOrder,
        lexicalNode: block.lexicalNode,
        excerpt: block.excerpt,
        hasContent: block.hasContent,
        reason: "duplicate-left-link",
      });
    }
  }

  const rightNotes: CanonicalRightNote[] = rightBlocks.map((block) => ({
    marginBlockId: block.marginBlockId,
    linkedManuscriptBlockId: block.linkedManuscriptBlockId,
    marginOrder: block.marginOrder,
    lexicalNode: block.lexicalNode,
    excerpt: block.excerpt,
    hasContent: block.hasContent,
  }));

  return {
    version: CANONICAL_DOCUMENT_MODEL_VERSION,
    sourceFormat: CANONICAL_DOCUMENT_MODEL_SOURCE_FORMAT,
    rightPaneMode: CANONICAL_RIGHT_PANE_MODE,
    units,
    supplementalLeftNotes,
    rightNotes,
    legacyDiagnostics: {
      duplicateLeftMarginBlockIdsByUnitId,
      unlinkedLeftMarginBlockIds,
      staleLinkedLeftMarginBlockIds,
    },
  };
}

export function serializeCanonicalDocumentModel(model: CanonicalDocumentModel): string {
  return JSON.stringify(model);
}

export function parseCanonicalDocumentModelJson(modelJson: string): CanonicalDocumentModel | null {
  try {
    const parsed = JSON.parse(modelJson) as Partial<CanonicalDocumentModel>;
    if (
      parsed.version !== CANONICAL_DOCUMENT_MODEL_VERSION ||
      parsed.sourceFormat !== CANONICAL_DOCUMENT_MODEL_SOURCE_FORMAT ||
      parsed.rightPaneMode !== CANONICAL_RIGHT_PANE_MODE ||
      !Array.isArray(parsed.units) ||
      !Array.isArray(parsed.supplementalLeftNotes) ||
      !Array.isArray(parsed.rightNotes)
    ) {
      return null;
    }
    return parsed as CanonicalDocumentModel;
  } catch {
    return null;
  }
}
