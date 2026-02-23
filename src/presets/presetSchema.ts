import { newUuid } from "../utils/uuid";

export type PageSize = "A4" | "Letter";

export interface HeadingScale {
  h1: number;
  h2: number;
  h3: number;
}

export interface ExportPreset {
  fontFamily: string;
  fontFallbacks: string[];
  fontSizePt: number;
  lineHeight: number;
  paragraphSpacingBeforePt: number;
  paragraphSpacingAfterPt: number;
  pageSize: PageSize;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  headingScale: HeadingScale;
}

export interface ExportPresetRecord extends ExportPreset {
  id: string;
  name: string;
  builtIn: boolean;
  updatedAt: number;
}

export const DEFAULT_PRESET: ExportPreset = {
  fontFamily: "Times New Roman",
  fontFallbacks: ["Times", "serif"],
  fontSizePt: 12,
  lineHeight: 1.5,
  paragraphSpacingBeforePt: 0,
  paragraphSpacingAfterPt: 12,
  pageSize: "A4",
  marginTopMm: 25,
  marginRightMm: 25,
  marginBottomMm: 25,
  marginLeftMm: 25,
  headingScale: {
    h1: 1.6,
    h2: 1.35,
    h3: 1.15,
  },
};

export const BUILTIN_PRESETS: ExportPresetRecord[] = [
  {
    id: "preset-academic-times",
    name: "Academic — Times New Roman",
    builtIn: true,
    updatedAt: Date.now(),
    fontFamily: "Times New Roman",
    fontFallbacks: ["Times", "serif"],
    fontSizePt: 12,
    lineHeight: 1.5,
    paragraphSpacingBeforePt: 0,
    paragraphSpacingAfterPt: 12,
    pageSize: "A4",
    marginTopMm: 25,
    marginRightMm: 25,
    marginBottomMm: 25,
    marginLeftMm: 25,
    headingScale: {
      h1: 1.6,
      h2: 1.35,
      h3: 1.15,
    },
  },
  {
    id: "preset-academic-garamond",
    name: "Academic — Garamond",
    builtIn: true,
    updatedAt: Date.now(),
    fontFamily: "Garamond",
    fontFallbacks: ["EB Garamond", "serif"],
    fontSizePt: 12,
    lineHeight: 1.5,
    paragraphSpacingBeforePt: 0,
    paragraphSpacingAfterPt: 12,
    pageSize: "A4",
    marginTopMm: 25,
    marginRightMm: 25,
    marginBottomMm: 25,
    marginLeftMm: 25,
    headingScale: {
      h1: 1.6,
      h2: 1.35,
      h3: 1.15,
    },
  },
];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeHeadingScale(input: unknown): HeadingScale {
  const value = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  return {
    h1: clamp(isFiniteNumber(value.h1) ? value.h1 : DEFAULT_PRESET.headingScale.h1, 1, 3),
    h2: clamp(isFiniteNumber(value.h2) ? value.h2 : DEFAULT_PRESET.headingScale.h2, 1, 3),
    h3: clamp(isFiniteNumber(value.h3) ? value.h3 : DEFAULT_PRESET.headingScale.h3, 1, 3),
  };
}

export function normalizePreset(input: Partial<ExportPreset>): ExportPreset {
  return {
    fontFamily: typeof input.fontFamily === "string" && input.fontFamily.trim().length > 0 ? input.fontFamily.trim() : DEFAULT_PRESET.fontFamily,
    fontFallbacks:
      Array.isArray(input.fontFallbacks) && input.fontFallbacks.length > 0
        ? input.fontFallbacks.filter((font): font is string => typeof font === "string" && font.trim().length > 0)
        : DEFAULT_PRESET.fontFallbacks,
    fontSizePt: clamp(isFiniteNumber(input.fontSizePt) ? input.fontSizePt : DEFAULT_PRESET.fontSizePt, 8, 24),
    lineHeight: clamp(isFiniteNumber(input.lineHeight) ? input.lineHeight : DEFAULT_PRESET.lineHeight, 1, 3),
    paragraphSpacingBeforePt: clamp(
      isFiniteNumber(input.paragraphSpacingBeforePt) ? input.paragraphSpacingBeforePt : DEFAULT_PRESET.paragraphSpacingBeforePt,
      0,
      40,
    ),
    paragraphSpacingAfterPt: clamp(
      isFiniteNumber(input.paragraphSpacingAfterPt) ? input.paragraphSpacingAfterPt : DEFAULT_PRESET.paragraphSpacingAfterPt,
      0,
      40,
    ),
    pageSize: input.pageSize === "Letter" ? "Letter" : "A4",
    marginTopMm: clamp(isFiniteNumber(input.marginTopMm) ? input.marginTopMm : DEFAULT_PRESET.marginTopMm, 10, 50),
    marginRightMm: clamp(isFiniteNumber(input.marginRightMm) ? input.marginRightMm : DEFAULT_PRESET.marginRightMm, 10, 50),
    marginBottomMm: clamp(isFiniteNumber(input.marginBottomMm) ? input.marginBottomMm : DEFAULT_PRESET.marginBottomMm, 10, 50),
    marginLeftMm: clamp(isFiniteNumber(input.marginLeftMm) ? input.marginLeftMm : DEFAULT_PRESET.marginLeftMm, 10, 50),
    headingScale: normalizeHeadingScale(input.headingScale),
  };
}

export function isValidPreset(value: unknown): value is ExportPreset {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const normalized = normalizePreset(value as Partial<ExportPreset>);
  const asJson = JSON.stringify(normalized);
  const inputJson = JSON.stringify(value);
  return asJson === inputJson;
}

export function duplicatePreset(record: ExportPresetRecord): ExportPresetRecord {
  return {
    ...record,
    id: newUuid(),
    name: `${record.name} (Copy)`,
    builtIn: false,
    updatedAt: Date.now(),
  };
}
