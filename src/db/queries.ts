import type Database from "@tauri-apps/plugin-sql";
import {
  BUILTIN_PRESETS,
  DEFAULT_PRESET,
  type ExportPreset,
  type ExportPresetRecord,
  normalizePreset,
} from "../presets/presetSchema";
import { normalizeLinkedManuscriptBlocks } from "../editors/manuscript/lexicalBlocks/linkableBlockNormalization";
import { newUuid } from "../utils/uuid";
import { syncCanonicalDocumentModelFromEditorStates } from "./documentModelRepository";
import { runInTransaction, runSerializedWrite } from "./writeUtils";

export interface DocumentRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface DocumentStateBundle {
  manuscriptJson: string;
  leftMarginJson: string;
  rightMarginJson: string;
  defaultPresetId: string | null;
}

export interface LegacyDocumentMigrationReport {
  migratedDocumentCount: number;
  migratedDocumentIds: string[];
  documentsNeedingReviewCount: number;
  documentsNeedingReviewIds: string[];
}

const DEFAULT_DOCUMENT_TITLE = "Untitled Document";

function createTextNode(text: string): Record<string, unknown> {
  return {
    detail: 0,
    format: 0,
    mode: "normal",
    style: "",
    text,
    type: "text",
    version: 1,
  };
}

function createParagraphNode(text: string, blockId?: string): Record<string, unknown> {
  const node: Record<string, unknown> = {
    children: [createTextNode(text)],
    direction: null,
    format: "",
    indent: 0,
    type: "paragraph",
    version: 1,
    textFormat: 0,
    textStyle: "",
  };

  if (blockId) {
    node.$ = { blockId };
  }

  return node;
}

function createMarginaliaBlockNode(kind: "left" | "right", text: string): Record<string, unknown> {
  return {
    children: [createParagraphNode(text)],
    direction: null,
    format: "",
    indent: 0,
    kind,
    linkedManuscriptBlockId: null,
    marginBlockId: newUuid(),
    type: "marginalia-block",
    version: 1,
    textFormat: 0,
    textStyle: "",
  };
}

function createRoot(children: Record<string, unknown>[]): Record<string, unknown> {
  return {
    root: {
      children,
      direction: null,
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  };
}

function defaultManuscriptState(): string {
  return JSON.stringify(
    createRoot([
      createParagraphNode("Start writing your manuscript here."),
      createParagraphNode("Use Cmd/Ctrl+Alt+N to add a scholie to the current unit."),
    ]),
  );
}

function defaultLeftMarginState(): string {
  return emptyEditorState();
}

function defaultRightMarginState(): string {
  return JSON.stringify(createRoot([createMarginaliaBlockNode("right", "Sources, citations, and annexes.")]));
}

function dbRowToDocument(row: {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
}): DocumentRecord {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parsePresetJson(presetJson: string): ExportPreset {
  try {
    const parsed = JSON.parse(presetJson) as Partial<ExportPreset>;
    return normalizePreset(parsed);
  } catch {
    return DEFAULT_PRESET;
  }
}

function dbRowToPreset(row: {
  id: string;
  name: string;
  built_in: number;
  preset_json: string;
  updated_at: number;
}): ExportPresetRecord {
  return {
    id: row.id,
    name: row.name,
    builtIn: row.built_in === 1,
    updatedAt: row.updated_at,
    ...parsePresetJson(row.preset_json),
  };
}

export async function listDocuments(db: Database): Promise<DocumentRecord[]> {
  const rows = await db.select<
    Array<{
      id: string;
      title: string;
      created_at: number;
      updated_at: number;
    }>
  >("SELECT id, title, created_at, updated_at FROM documents ORDER BY updated_at DESC");

  return rows.map(dbRowToDocument);
}

async function ensureDocumentStates(db: Database, documentId: string): Promise<void> {
  const now = Date.now();

  await db.execute(
    "INSERT INTO manuscript_states(document_id, lexical_json, updated_at) VALUES ($1, $2, $3) ON CONFLICT(document_id) DO NOTHING",
    [documentId, defaultManuscriptState(), now],
  );

  await db.execute(
    "INSERT INTO margin_left_states(document_id, lexical_json, updated_at) VALUES ($1, $2, $3) ON CONFLICT(document_id) DO NOTHING",
    [documentId, defaultLeftMarginState(), now],
  );

  await db.execute(
    "INSERT INTO margin_right_states(document_id, lexical_json, updated_at) VALUES ($1, $2, $3) ON CONFLICT(document_id) DO NOTHING",
    [documentId, defaultRightMarginState(), now],
  );
}

async function selectStoredEditorStates(
  db: Database,
  documentId: string,
): Promise<{ manuscriptJson: string; leftMarginJson: string; rightMarginJson: string }> {
  const manuscriptRow = await db.select<Array<{ lexical_json: string }>>(
    "SELECT lexical_json FROM manuscript_states WHERE document_id = $1",
    [documentId],
  );
  const leftRow = await db.select<Array<{ lexical_json: string }>>(
    "SELECT lexical_json FROM margin_left_states WHERE document_id = $1",
    [documentId],
  );
  const rightRow = await db.select<Array<{ lexical_json: string }>>(
    "SELECT lexical_json FROM margin_right_states WHERE document_id = $1",
    [documentId],
  );

  return {
    manuscriptJson: manuscriptRow[0]?.lexical_json ?? defaultManuscriptState(),
    leftMarginJson: leftRow[0]?.lexical_json ?? defaultLeftMarginState(),
    rightMarginJson: rightRow[0]?.lexical_json ?? defaultRightMarginState(),
  };
}

function emptyEditorState(): string {
  return JSON.stringify(createRoot([]));
}

function hasParsableLexicalRootChildren(lexicalJson: string): boolean {
  if (!lexicalJson) {
    return false;
  }

  try {
    const parsed = JSON.parse(lexicalJson) as {
      root?: {
        children?: unknown[];
      };
    };
    return Array.isArray(parsed.root?.children);
  } catch {
    return false;
  }
}

function documentHasInvalidLegacyState(states: {
  manuscriptJson: string;
  leftMarginJson: string;
  rightMarginJson: string;
}): boolean {
  return !(
    hasParsableLexicalRootChildren(states.manuscriptJson) &&
    hasParsableLexicalRootChildren(states.leftMarginJson) &&
    hasParsableLexicalRootChildren(states.rightMarginJson)
  );
}

function sanitizeStoredEditorStatesForOpen(states: {
  manuscriptJson: string;
  leftMarginJson: string;
  rightMarginJson: string;
}): {
  manuscriptJson: string;
  leftMarginJson: string;
  rightMarginJson: string;
  changed: boolean;
} {
  const manuscriptJson = hasParsableLexicalRootChildren(states.manuscriptJson)
    ? states.manuscriptJson
    : emptyEditorState();
  const leftMarginJson = hasParsableLexicalRootChildren(states.leftMarginJson)
    ? states.leftMarginJson
    : emptyEditorState();
  const rightMarginJson = hasParsableLexicalRootChildren(states.rightMarginJson)
    ? states.rightMarginJson
    : emptyEditorState();

  return {
    manuscriptJson,
    leftMarginJson,
    rightMarginJson,
    changed:
      manuscriptJson !== states.manuscriptJson ||
      leftMarginJson !== states.leftMarginJson ||
      rightMarginJson !== states.rightMarginJson,
  };
}

async function syncCanonicalDocumentModelFromStoredStates(db: Database, documentId: string): Promise<void> {
  await ensureDocumentStates(db, documentId);
  const states = await selectStoredEditorStates(db, documentId);
  const normalizedManuscript = normalizeLinkedManuscriptBlocks(
    states.manuscriptJson,
    states.leftMarginJson,
    states.rightMarginJson,
  );

  if (normalizedManuscript.changed) {
    await db.execute(
      "INSERT INTO manuscript_states(document_id, lexical_json, updated_at) VALUES ($1, $2, $3) ON CONFLICT(document_id) DO UPDATE SET lexical_json = excluded.lexical_json, updated_at = excluded.updated_at",
      [documentId, normalizedManuscript.lexicalJson, Date.now()],
    );
  }

  await syncCanonicalDocumentModelFromEditorStates(db, {
    documentId,
    manuscriptJson: normalizedManuscript.lexicalJson,
    leftMarginJson: states.leftMarginJson,
    rightMarginJson: states.rightMarginJson,
  });
}

function documentNeedsLegacyReview(model: Awaited<ReturnType<typeof syncCanonicalDocumentModelFromEditorStates>>["model"]): boolean {
  return (
    Object.keys(model.legacyDiagnostics.duplicateLeftMarginBlockIdsByUnitId).length > 0 ||
    model.legacyDiagnostics.unlinkedLeftMarginBlockIds.length > 0 ||
    model.legacyDiagnostics.staleLinkedLeftMarginBlockIds.length > 0
  );
}

export async function migrateLegacyDocumentsToCanonicalModel(db: Database): Promise<LegacyDocumentMigrationReport> {
  const documents = await listDocuments(db);
  const migratedDocumentIds: string[] = [];
  const documentsNeedingReviewIds: string[] = [];

  await runSerializedWrite(db, async () => {
    for (const document of documents) {
      await ensureDocumentStates(db, document.id);
      const states = await selectStoredEditorStates(db, document.id);
      const normalizedManuscript = normalizeLinkedManuscriptBlocks(
        states.manuscriptJson,
        states.leftMarginJson,
        states.rightMarginJson,
      );

      if (normalizedManuscript.changed) {
        await db.execute(
          "INSERT INTO manuscript_states(document_id, lexical_json, updated_at) VALUES ($1, $2, $3) ON CONFLICT(document_id) DO UPDATE SET lexical_json = excluded.lexical_json, updated_at = excluded.updated_at",
          [document.id, normalizedManuscript.lexicalJson, Date.now()],
        );
      }

      const syncResult = await syncCanonicalDocumentModelFromEditorStates(db, {
        documentId: document.id,
        manuscriptJson: normalizedManuscript.lexicalJson,
        leftMarginJson: states.leftMarginJson,
        rightMarginJson: states.rightMarginJson,
      });

      if (syncResult.wrote) {
        migratedDocumentIds.push(document.id);
      }

      if (documentHasInvalidLegacyState(states) || documentNeedsLegacyReview(syncResult.model)) {
        documentsNeedingReviewIds.push(document.id);
      }
    }
  });

  return {
    migratedDocumentCount: migratedDocumentIds.length,
    migratedDocumentIds,
    documentsNeedingReviewCount: documentsNeedingReviewIds.length,
    documentsNeedingReviewIds,
  };
}

async function ensureBuiltInPresets(db: Database): Promise<void> {
  for (const preset of BUILTIN_PRESETS) {
    await db.execute(
      "INSERT INTO export_presets(id, name, built_in, preset_json, updated_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT(id) DO NOTHING",
      [preset.id, preset.name, 1, JSON.stringify(normalizePreset(preset)), preset.updatedAt],
    );
  }
}

async function ensureDocumentExportSetting(db: Database, documentId: string, defaultPresetId: string): Promise<void> {
  await db.execute(
    "INSERT INTO document_export_settings(document_id, default_preset_id, updated_at) VALUES ($1, $2, $3) ON CONFLICT(document_id) DO NOTHING",
    [documentId, defaultPresetId, Date.now()],
  );
}

export async function createDocument(db: Database, title = DEFAULT_DOCUMENT_TITLE): Promise<DocumentRecord> {
  const now = Date.now();
  const id = newUuid();

  await runSerializedWrite(db, async () => {
    await runInTransaction(db, async () => {
      await ensureBuiltInPresets(db);
      await db.execute("INSERT INTO documents(id, title, created_at, updated_at) VALUES ($1, $2, $3, $4)", [
        id,
        title,
        now,
        now,
      ]);

      await ensureDocumentStates(db, id);
      const initialStates = await selectStoredEditorStates(db, id);
      const normalizedManuscript = normalizeLinkedManuscriptBlocks(
        initialStates.manuscriptJson,
        initialStates.leftMarginJson,
        initialStates.rightMarginJson,
      );
      if (normalizedManuscript.changed) {
        await db.execute(
          "INSERT INTO manuscript_states(document_id, lexical_json, updated_at) VALUES ($1, $2, $3) ON CONFLICT(document_id) DO UPDATE SET lexical_json = excluded.lexical_json, updated_at = excluded.updated_at",
          [id, normalizedManuscript.lexicalJson, now],
        );
      }
      await syncCanonicalDocumentModelFromEditorStates(db, {
        documentId: id,
        manuscriptJson: normalizedManuscript.lexicalJson,
        leftMarginJson: initialStates.leftMarginJson,
        rightMarginJson: initialStates.rightMarginJson,
        updatedAt: now,
      });
      await ensureDocumentExportSetting(db, id, BUILTIN_PRESETS[0].id);
    });
  });

  return {
    id,
    title,
    createdAt: now,
    updatedAt: now,
  };
}

export async function renameDocument(db: Database, documentId: string, title: string): Promise<void> {
  await runSerializedWrite(db, async () => {
    await db.execute("UPDATE documents SET title = $1, updated_at = $2 WHERE id = $3", [title, Date.now(), documentId]);
  });
}

export async function deleteDocument(db: Database, documentId: string): Promise<void> {
  await runSerializedWrite(db, async () => {
    await db.execute("DELETE FROM documents WHERE id = $1", [documentId]);
  });
}

export async function getDocumentStateBundle(db: Database, documentId: string): Promise<DocumentStateBundle> {
  await ensureDocumentStates(db, documentId);

  const storedStates = await selectStoredEditorStates(db, documentId);
  const sanitizedStates = sanitizeStoredEditorStatesForOpen(storedStates);

  const exportRow = await db.select<Array<{ default_preset_id: string | null }>>(
    "SELECT default_preset_id FROM document_export_settings WHERE document_id = $1",
    [documentId],
  );

  const leftMarginJson = sanitizedStates.leftMarginJson;
  const rightMarginJson = sanitizedStates.rightMarginJson;
  const rawManuscriptJson = sanitizedStates.manuscriptJson;

  const normalizedManuscript = normalizeLinkedManuscriptBlocks(rawManuscriptJson, leftMarginJson, rightMarginJson);
  const manuscriptJson = normalizedManuscript.lexicalJson;

  if (sanitizedStates.changed || normalizedManuscript.changed) {
    const now = Date.now();
    await runSerializedWrite(db, async () => {
      if (sanitizedStates.manuscriptJson !== storedStates.manuscriptJson || normalizedManuscript.changed) {
        await db.execute(
          "INSERT INTO manuscript_states(document_id, lexical_json, updated_at) VALUES ($1, $2, $3) ON CONFLICT(document_id) DO UPDATE SET lexical_json = excluded.lexical_json, updated_at = excluded.updated_at",
          [documentId, manuscriptJson, now],
        );
      }
      if (sanitizedStates.leftMarginJson !== storedStates.leftMarginJson) {
        await db.execute(
          "INSERT INTO margin_left_states(document_id, lexical_json, updated_at) VALUES ($1, $2, $3) ON CONFLICT(document_id) DO UPDATE SET lexical_json = excluded.lexical_json, updated_at = excluded.updated_at",
          [documentId, leftMarginJson, now],
        );
      }
      if (sanitizedStates.rightMarginJson !== storedStates.rightMarginJson) {
        await db.execute(
          "INSERT INTO margin_right_states(document_id, lexical_json, updated_at) VALUES ($1, $2, $3) ON CONFLICT(document_id) DO UPDATE SET lexical_json = excluded.lexical_json, updated_at = excluded.updated_at",
          [documentId, rightMarginJson, now],
        );
      }
    });
  }

  await syncCanonicalDocumentModelFromEditorStates(db, {
    documentId,
    manuscriptJson,
    leftMarginJson,
    rightMarginJson,
  });

  return {
    manuscriptJson,
    leftMarginJson,
    rightMarginJson,
    defaultPresetId: exportRow[0]?.default_preset_id ?? BUILTIN_PRESETS[0].id,
  };
}

async function touchDocument(db: Database, documentId: string): Promise<void> {
  await db.execute("UPDATE documents SET updated_at = $1 WHERE id = $2", [Date.now(), documentId]);
}

export async function saveManuscriptState(db: Database, documentId: string, lexicalJson: string): Promise<void> {
  const now = Date.now();
  await runSerializedWrite(db, async () => {
    await db.execute(
      "INSERT INTO manuscript_states(document_id, lexical_json, updated_at) VALUES ($1, $2, $3) ON CONFLICT(document_id) DO UPDATE SET lexical_json = excluded.lexical_json, updated_at = excluded.updated_at",
      [documentId, lexicalJson, now],
    );
    await touchDocument(db, documentId);
    await syncCanonicalDocumentModelFromStoredStates(db, documentId);
  });
}

export async function saveLeftMarginState(db: Database, documentId: string, lexicalJson: string): Promise<void> {
  const now = Date.now();
  await runSerializedWrite(db, async () => {
    await db.execute(
      "INSERT INTO margin_left_states(document_id, lexical_json, updated_at) VALUES ($1, $2, $3) ON CONFLICT(document_id) DO UPDATE SET lexical_json = excluded.lexical_json, updated_at = excluded.updated_at",
      [documentId, lexicalJson, now],
    );
    await touchDocument(db, documentId);
    await syncCanonicalDocumentModelFromStoredStates(db, documentId);
  });
}

export async function saveRightMarginState(db: Database, documentId: string, lexicalJson: string): Promise<void> {
  const now = Date.now();
  await runSerializedWrite(db, async () => {
    await db.execute(
      "INSERT INTO margin_right_states(document_id, lexical_json, updated_at) VALUES ($1, $2, $3) ON CONFLICT(document_id) DO UPDATE SET lexical_json = excluded.lexical_json, updated_at = excluded.updated_at",
      [documentId, lexicalJson, now],
    );
    await touchDocument(db, documentId);
    await syncCanonicalDocumentModelFromStoredStates(db, documentId);
  });
}

export async function listPresets(db: Database): Promise<ExportPresetRecord[]> {
  const rows = await db.select<
    Array<{
      id: string;
      name: string;
      built_in: number;
      preset_json: string;
      updated_at: number;
    }>
  >("SELECT id, name, built_in, preset_json, updated_at FROM export_presets ORDER BY built_in DESC, name ASC");

  return rows.map(dbRowToPreset);
}

export async function upsertPreset(db: Database, preset: ExportPresetRecord): Promise<void> {
  await runSerializedWrite(db, async () => {
    await db.execute(
      "INSERT INTO export_presets(id, name, built_in, preset_json, updated_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT(id) DO UPDATE SET name = excluded.name, preset_json = excluded.preset_json, updated_at = excluded.updated_at",
      [preset.id, preset.name, preset.builtIn ? 1 : 0, JSON.stringify(normalizePreset(preset)), Date.now()],
    );
  });
}

export async function deletePreset(db: Database, presetId: string): Promise<void> {
  await runSerializedWrite(db, async () => {
    await db.execute("DELETE FROM export_presets WHERE id = $1 AND built_in = 0", [presetId]);
  });
}

export async function setDocumentDefaultPreset(db: Database, documentId: string, presetId: string): Promise<void> {
  await runSerializedWrite(db, async () => {
    await db.execute(
      "INSERT INTO document_export_settings(document_id, default_preset_id, updated_at) VALUES ($1, $2, $3) ON CONFLICT(document_id) DO UPDATE SET default_preset_id = excluded.default_preset_id, updated_at = excluded.updated_at",
      [documentId, presetId, Date.now()],
    );
  });
}

export async function seedInitialData(db: Database): Promise<{ defaultDocumentId: string }> {
  await ensureBuiltInPresets(db);

  let documents = await listDocuments(db);
  if (documents.length === 0) {
    const created = await createDocument(db, DEFAULT_DOCUMENT_TITLE);
    documents = [created];
  }

  const defaultDocumentId = documents[0].id;
  await ensureDocumentStates(db, defaultDocumentId);
  await ensureDocumentExportSetting(db, defaultDocumentId, BUILTIN_PRESETS[0].id);
  await migrateLegacyDocumentsToCanonicalModel(db);

  return { defaultDocumentId };
}
