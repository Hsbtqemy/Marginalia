import type Database from "@tauri-apps/plugin-sql";
import {
  deriveCanonicalDocumentModelFromEditorStates,
  parseCanonicalDocumentModelJson,
  serializeCanonicalDocumentModel,
  type CanonicalDocumentModel,
  type CanonicalDocumentModelSourceFormat,
} from "../document/canonicalDocumentModel";

const CANONICAL_MODEL_VERSION = 1;
const CANONICAL_MODEL_SOURCE_FORMAT: CanonicalDocumentModelSourceFormat = "legacy-lexical-triptych";

interface CanonicalDocumentModelRow {
  model_json: string;
  model_version: number;
  source_format: string;
  updated_at: number;
}

export interface CanonicalDocumentModelSyncResult {
  model: CanonicalDocumentModel;
  wrote: boolean;
}

async function selectCanonicalDocumentModelRow(
  db: Database,
  documentId: string,
): Promise<CanonicalDocumentModelRow | null> {
  const rows = await db.select<CanonicalDocumentModelRow[]>(
    "SELECT model_json, model_version, source_format, updated_at FROM document_unit_models WHERE document_id = $1",
    [documentId],
  );
  return rows[0] ?? null;
}

export async function readCanonicalDocumentModel(db: Database, documentId: string): Promise<CanonicalDocumentModel | null> {
  const row = await selectCanonicalDocumentModelRow(db, documentId);
  if (!row) {
    return null;
  }
  return parseCanonicalDocumentModelJson(row.model_json);
}

export async function syncCanonicalDocumentModelFromEditorStates(
  db: Database,
  input: {
    documentId: string;
    manuscriptJson: string;
    leftMarginJson: string;
    rightMarginJson: string;
    updatedAt?: number;
  },
): Promise<CanonicalDocumentModelSyncResult> {
  const model = deriveCanonicalDocumentModelFromEditorStates({
    manuscriptJson: input.manuscriptJson,
    leftMarginJson: input.leftMarginJson,
    rightMarginJson: input.rightMarginJson,
  });
  const modelJson = serializeCanonicalDocumentModel(model);
  const existing = await selectCanonicalDocumentModelRow(db, input.documentId);

  if (
    existing &&
    existing.model_json === modelJson &&
    existing.model_version === CANONICAL_MODEL_VERSION &&
    existing.source_format === CANONICAL_MODEL_SOURCE_FORMAT
  ) {
    return { model, wrote: false };
  }

  await db.execute(
    "INSERT INTO document_unit_models(document_id, model_version, source_format, model_json, updated_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT(document_id) DO UPDATE SET model_version = excluded.model_version, source_format = excluded.source_format, model_json = excluded.model_json, updated_at = excluded.updated_at",
    [input.documentId, CANONICAL_MODEL_VERSION, CANONICAL_MODEL_SOURCE_FORMAT, modelJson, input.updatedAt ?? Date.now()],
  );

  return { model, wrote: true };
}
