import type {
  CanonicalDocumentModel,
  CanonicalManuscriptBlock,
  CanonicalRightNote,
  CanonicalLeftScholie,
  CanonicalSupplementalLeftNote,
  CanonicalSupplementalLeftNoteReason,
} from "../document/canonicalDocumentModel";

export type EditorialExportProfile = "clean" | "working";
export type EditorialScholieRole = "omitted" | "comment";
export type EditorialRightNoteRole = "omitted" | "footnote";
export type EditorialSupplementalLeftRole = "omitted" | "annex";

export interface EditorialExportTextSegment {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

export interface EditorialExportManuscriptBlock {
  blockId: string;
  kind: "paragraph" | "heading" | "quote" | "list-item";
  headingLevel: number | null;
  orderedList: boolean;
  listGroupId: string | null;
  listStart: number | null;
  text: string;
  segments: EditorialExportTextSegment[];
}

export interface EditorialExportNote {
  marginBlockId: string;
  linkedManuscriptBlockId: string | null;
  text: string;
  segments: EditorialExportTextSegment[];
  hasContent: boolean;
}

export interface EditorialExportSupplementalLeftNote extends EditorialExportNote {
  reason: CanonicalSupplementalLeftNoteReason;
}

export interface EditorialExportUnit {
  unitId: string;
  manuscript: EditorialExportManuscriptBlock;
  scholie: EditorialExportNote | null;
  rightNotes: EditorialExportNote[];
}

export interface EditorialExportProfileRules {
  scholieRole: EditorialScholieRole;
  rightNoteRole: EditorialRightNoteRole;
  supplementalLeftRole: EditorialSupplementalLeftRole;
}

export interface EditorialExportDocument {
  profile: EditorialExportProfile;
  rules: EditorialExportProfileRules;
  units: EditorialExportUnit[];
  supplementalLeftNotes: EditorialExportSupplementalLeftNote[];
}

export const EDITORIAL_EXPORT_PROFILE_RULES: Record<EditorialExportProfile, EditorialExportProfileRules> = {
  clean: {
    scholieRole: "omitted",
    rightNoteRole: "omitted",
    supplementalLeftRole: "omitted",
  },
  working: {
    scholieRole: "comment",
    rightNoteRole: "footnote",
    supplementalLeftRole: "annex",
  },
};

const TEXT_FORMAT_BOLD = 1;
const TEXT_FORMAT_ITALIC = 1 << 1;
const TEXT_FORMAT_UNDERLINE = 1 << 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function readTextFormat(node: Record<string, unknown>): number {
  const direct = node.format;
  if (typeof direct === "number" && Number.isFinite(direct)) {
    return direct;
  }
  const textFormat = node.textFormat;
  return typeof textFormat === "number" && Number.isFinite(textFormat) ? textFormat : 0;
}

function extractSegments(node: Record<string, unknown>): EditorialExportTextSegment[] {
  const type = typeof node.type === "string" ? node.type : "";

  if (type === "text") {
    const text = typeof node.text === "string" ? node.text : "";
    if (text.length === 0) {
      return [];
    }
    const format = readTextFormat(node);
    return [
      {
        text,
        bold: (format & TEXT_FORMAT_BOLD) !== 0,
        italic: (format & TEXT_FORMAT_ITALIC) !== 0,
        underline: (format & TEXT_FORMAT_UNDERLINE) !== 0,
      },
    ];
  }

  if (type === "linebreak") {
    return [
      {
        text: "\n",
        bold: false,
        italic: false,
        underline: false,
      },
    ];
  }

  if (!Array.isArray(node.children)) {
    return [];
  }

  return node.children
    .filter(isRecord)
    .flatMap((child) => extractSegments(child));
}

function normalizeSegments(segments: EditorialExportTextSegment[]): EditorialExportTextSegment[] {
  const normalized: EditorialExportTextSegment[] = [];

  for (const segment of segments) {
    if (segment.text.length === 0) {
      continue;
    }

    const previous = normalized[normalized.length - 1];
    if (
      previous &&
      previous.bold === segment.bold &&
      previous.italic === segment.italic &&
      previous.underline === segment.underline
    ) {
      previous.text += segment.text;
      continue;
    }

    normalized.push({ ...segment });
  }

  return normalized;
}

function normalizeTextFromSegments(segments: EditorialExportTextSegment[]): string {
  return segments
    .map((segment) => segment.text)
    .join("")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

function buildNote(note: CanonicalLeftScholie | CanonicalRightNote): EditorialExportNote {
  const segments = normalizeSegments(extractSegments(note.lexicalNode));
  return {
    marginBlockId: note.marginBlockId,
    linkedManuscriptBlockId: note.linkedManuscriptBlockId,
    text: normalizeTextFromSegments(segments),
    segments,
    hasContent: note.hasContent,
  };
}

function buildSupplementalLeftNote(note: CanonicalSupplementalLeftNote): EditorialExportSupplementalLeftNote {
  const segments = normalizeSegments(extractSegments(note.lexicalNode));
  return {
    marginBlockId: note.marginBlockId,
    linkedManuscriptBlockId: note.linkedManuscriptBlockId,
    text: normalizeTextFromSegments(segments),
    segments,
    hasContent: note.hasContent,
    reason: note.reason,
  };
}

function listContainerSignature(block: CanonicalManuscriptBlock): string | null {
  if (block.container.kind !== "list") {
    return null;
  }

  return JSON.stringify({
    listType: block.container.listType,
    start: block.container.start,
    tag: block.container.tag,
    direction: block.container.direction,
    format: block.container.format,
    indent: block.container.indent,
  });
}

function buildManuscriptBlock(
  block: CanonicalManuscriptBlock,
  listGroupId: string | null,
): EditorialExportManuscriptBlock {
  const type = typeof block.lexicalNode.type === "string" ? block.lexicalNode.type : "paragraph";
  const headingTag = typeof block.lexicalNode.tag === "string" ? block.lexicalNode.tag : "h1";
  const headingLevel = headingTag === "h2" ? 2 : headingTag === "h3" ? 3 : 1;
  const segments = normalizeSegments(extractSegments(block.lexicalNode));
  const isListItem = block.container.kind === "list";
  const listContainer = block.container.kind === "list" ? block.container : null;

  return {
    blockId: block.blockId,
    kind:
      isListItem
        ? "list-item"
        : type === "heading"
          ? "heading"
          : type === "quote"
            ? "quote"
            : "paragraph",
    headingLevel: type === "heading" ? headingLevel : null,
    orderedList: listContainer?.listType === "number",
    listGroupId: isListItem ? listGroupId : null,
    listStart: listContainer?.start ?? (isListItem ? 1 : null),
    text: normalizeTextFromSegments(segments),
    segments,
  };
}

export function buildEditorialExportDocument(
  model: CanonicalDocumentModel,
  profile: EditorialExportProfile,
): EditorialExportDocument {
  let previousListSignature: string | null = null;
  let currentListGroupId: string | null = null;

  return {
    profile,
    rules: EDITORIAL_EXPORT_PROFILE_RULES[profile],
    units: model.units.map((unit) => {
      const listSignature = listContainerSignature(unit.manuscript);
      if (listSignature == null) {
        previousListSignature = null;
        currentListGroupId = null;
      } else if (listSignature !== previousListSignature) {
        previousListSignature = listSignature;
        currentListGroupId = unit.manuscript.blockId;
      }

      return {
        unitId: unit.unitId,
        manuscript: buildManuscriptBlock(unit.manuscript, currentListGroupId),
        scholie: unit.scholie ? buildNote(unit.scholie) : null,
        rightNotes: model.rightNotes
          .filter((note) => note.linkedManuscriptBlockId === unit.manuscript.blockId)
          .map((note) => buildNote(note)),
      };
    }),
    supplementalLeftNotes: model.supplementalLeftNotes.map((note) => buildSupplementalLeftNote(note)),
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderSegments(segments: EditorialExportTextSegment[]): string {
  return segments
    .map((segment) => {
      const pieces = escapeHtml(segment.text).split("\n").join("<br />");
      let html = pieces;
      if (segment.underline) {
        html = `<u>${html}</u>`;
      }
      if (segment.italic) {
        html = `<em>${html}</em>`;
      }
      if (segment.bold) {
        html = `<strong>${html}</strong>`;
      }
      return html;
    })
    .join("");
}

function renderNoteBody(note: EditorialExportNote | EditorialExportSupplementalLeftNote): string {
  if (note.segments.length === 0) {
    return "";
  }
  return `<p>${renderSegments(note.segments)}</p>`;
}

function supplementalReasonLabel(reason: CanonicalSupplementalLeftNoteReason): string {
  switch (reason) {
    case "duplicate-left-link":
      return "Legacy duplicate";
    case "stale-left-link":
      return "Stale link";
    case "unlinked-left-note":
    default:
      return "Free scholie";
  }
}

export function renderEditorialExportHtml(document: EditorialExportDocument): string {
  const html: string[] = [];
  let currentListTag: "ol" | "ul" | null = null;
  let currentListGroupId: string | null = null;

  const closeList = () => {
    if (currentListTag) {
      html.push(`</${currentListTag}>`);
      currentListTag = null;
      currentListGroupId = null;
    }
  };

  const renderWorkingAttachments = (unit: EditorialExportUnit): string => {
    if (document.profile !== "working") {
      return "";
    }

    const attachments: string[] = [];
    if (document.rules.scholieRole === "comment" && unit.scholie?.hasContent) {
      attachments.push(
        `<aside class="print-scholie"><div class="print-note-label">Scholie</div>${renderNoteBody(unit.scholie)}</aside>`,
      );
    }

    if (document.rules.rightNoteRole === "footnote") {
      const notes = unit.rightNotes.filter((note) => note.hasContent);
      if (notes.length > 0) {
        attachments.push(
          `<ol class="print-unit-sources">${notes
            .map((note) => `<li>${renderNoteBody(note)}</li>`)
            .join("")}</ol>`,
        );
      }
    }

    return attachments.join("");
  };

  for (const unit of document.units) {
    const block = unit.manuscript;
    const blockHtml = renderSegments(block.segments);

    if (block.kind === "list-item") {
      const nextListTag: "ol" | "ul" = block.orderedList ? "ol" : "ul";
      if (currentListTag !== nextListTag || currentListGroupId !== block.listGroupId) {
        closeList();
        currentListTag = nextListTag;
        currentListGroupId = block.listGroupId;
        html.push(`<${nextListTag}>`);
      }
      html.push(`<li>${blockHtml}${renderWorkingAttachments(unit)}</li>`);
      continue;
    }

    closeList();
    if (block.kind === "heading") {
      const tag = block.headingLevel === 2 ? "h2" : block.headingLevel === 3 ? "h3" : "h1";
      html.push(`<${tag}>${blockHtml}</${tag}>${renderWorkingAttachments(unit)}`);
      continue;
    }

    if (block.kind === "quote") {
      html.push(`<blockquote>${blockHtml}</blockquote>${renderWorkingAttachments(unit)}`);
      continue;
    }

    html.push(`<p>${blockHtml}</p>${renderWorkingAttachments(unit)}`);
  }

  closeList();

  if (document.profile === "working" && document.rules.supplementalLeftRole === "annex") {
    const supplementalNotes = document.supplementalLeftNotes.filter((note) => note.hasContent || note.text.length > 0);
    if (supplementalNotes.length > 0) {
      html.push("<section class=\"print-annex\">");
      html.push("<h1>Supplemental Scholies</h1>");
      html.push("<ul class=\"print-annex-list\">");
      for (const note of supplementalNotes) {
        const label = supplementalReasonLabel(note.reason);
        const text = note.hasContent ? renderNoteBody(note) : `<p>(${escapeHtml(note.marginBlockId)})</p>`;
        html.push(`<li><div class="print-note-label">${escapeHtml(label)}</div>${text}</li>`);
      }
      html.push("</ul>");
      html.push("</section>");
    }
  }

  return html.join("");
}
