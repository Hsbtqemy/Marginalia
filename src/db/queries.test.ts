import test from "node:test";
import assert from "node:assert/strict";
import type Database from "@tauri-apps/plugin-sql";
import { BUILTIN_PRESETS } from "../presets/presetSchema";
import { createDocument, getDocumentStateBundle, migrateLegacyDocumentsToCanonicalModel, seedInitialData } from "./queries";
import { readCanonicalDocumentModel } from "./documentModelRepository";

interface DocumentRow {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

interface StateRow {
  lexical_json: string;
  updated_at: number;
}

interface PresetRow {
  id: string;
  name: string;
  built_in: number;
  preset_json: string;
  updated_at: number;
}

interface ExportSettingRow {
  default_preset_id: string | null;
  updated_at: number;
}

interface CanonicalDocumentModelRow {
  model_json: string;
  model_version: number;
  source_format: string;
  updated_at: number;
}

class FakeDatabase {
  readonly documents = new Map<string, DocumentRow>();
  readonly manuscriptStates = new Map<string, StateRow>();
  readonly leftMarginStates = new Map<string, StateRow>();
  readonly rightMarginStates = new Map<string, StateRow>();
  readonly exportPresets = new Map<string, PresetRow>();
  readonly documentExportSettings = new Map<string, ExportSettingRow>();
  readonly documentUnitModels = new Map<string, CanonicalDocumentModelRow>();

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    const normalized = normalizeSql(sql);

    if (normalized === "BEGIN" || normalized === "COMMIT" || normalized === "ROLLBACK") {
      return;
    }

    if (normalized.startsWith("INSERT INTO documents(")) {
      const [id, title, createdAt, updatedAt] = params as [string, string, number, number];
      this.documents.set(id, {
        id,
        title,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      return;
    }

    if (normalized.startsWith("INSERT INTO manuscript_states(")) {
      const [documentId, lexicalJson, updatedAt] = params as [string, string, number];
      const existing = this.manuscriptStates.get(documentId);
      if (!existing || normalized.includes("DO UPDATE")) {
        this.manuscriptStates.set(documentId, {
          lexical_json: lexicalJson,
          updated_at: updatedAt,
        });
      }
      return;
    }

    if (normalized.startsWith("INSERT INTO margin_left_states(")) {
      const [documentId, lexicalJson, updatedAt] = params as [string, string, number];
      if (normalized.includes("DO UPDATE") || !this.leftMarginStates.has(documentId)) {
        this.leftMarginStates.set(documentId, {
          lexical_json: lexicalJson,
          updated_at: updatedAt,
        });
      }
      return;
    }

    if (normalized.startsWith("INSERT INTO margin_right_states(")) {
      const [documentId, lexicalJson, updatedAt] = params as [string, string, number];
      if (normalized.includes("DO UPDATE") || !this.rightMarginStates.has(documentId)) {
        this.rightMarginStates.set(documentId, {
          lexical_json: lexicalJson,
          updated_at: updatedAt,
        });
      }
      return;
    }

    if (normalized.startsWith("INSERT INTO export_presets(")) {
      const [id, name, builtIn, presetJson, updatedAt] = params as [string, string, number, string, number];
      if (!this.exportPresets.has(id)) {
        this.exportPresets.set(id, {
          id,
          name,
          built_in: builtIn,
          preset_json: presetJson,
          updated_at: updatedAt,
        });
      }
      return;
    }

    if (normalized.startsWith("INSERT INTO document_export_settings(")) {
      const [documentId, defaultPresetId, updatedAt] = params as [string, string | null, number];
      if (normalized.includes("DO UPDATE") || !this.documentExportSettings.has(documentId)) {
        this.documentExportSettings.set(documentId, {
          default_preset_id: defaultPresetId,
          updated_at: updatedAt,
        });
      }
      return;
    }

    if (normalized.startsWith("INSERT INTO document_unit_models(")) {
      const [documentId, modelVersion, sourceFormat, modelJson, updatedAt] = params as [
        string,
        number,
        string,
        string,
        number,
      ];
      this.documentUnitModels.set(documentId, {
        model_json: modelJson,
        model_version: modelVersion,
        source_format: sourceFormat,
        updated_at: updatedAt,
      });
      return;
    }

    if (normalized.startsWith("UPDATE documents SET updated_at =")) {
      const [updatedAt, documentId] = params as [number, string];
      const existing = this.documents.get(documentId);
      if (existing) {
        existing.updated_at = updatedAt;
      }
      return;
    }

    throw new Error(`Unhandled execute SQL in test double: ${normalized}`);
  }

  async select<T>(sql: string, params: unknown[] = []): Promise<T> {
    const normalized = normalizeSql(sql);

    if (normalized.startsWith("SELECT lexical_json FROM manuscript_states")) {
      const [documentId] = params as [string];
      return (this.manuscriptStates.has(documentId)
        ? [{ lexical_json: this.manuscriptStates.get(documentId)?.lexical_json ?? "" }]
        : []) as T;
    }

    if (normalized.startsWith("SELECT lexical_json FROM margin_left_states")) {
      const [documentId] = params as [string];
      return (this.leftMarginStates.has(documentId)
        ? [{ lexical_json: this.leftMarginStates.get(documentId)?.lexical_json ?? "" }]
        : []) as T;
    }

    if (normalized.startsWith("SELECT lexical_json FROM margin_right_states")) {
      const [documentId] = params as [string];
      return (this.rightMarginStates.has(documentId)
        ? [{ lexical_json: this.rightMarginStates.get(documentId)?.lexical_json ?? "" }]
        : []) as T;
    }

    if (normalized.startsWith("SELECT default_preset_id FROM document_export_settings")) {
      const [documentId] = params as [string];
      return (this.documentExportSettings.has(documentId)
        ? [{ default_preset_id: this.documentExportSettings.get(documentId)?.default_preset_id ?? null }]
        : []) as T;
    }

    if (normalized.startsWith("SELECT id, title, created_at, updated_at FROM documents")) {
      return [...this.documents.values()].sort((a, b) => b.updated_at - a.updated_at) as T;
    }

    if (normalized.startsWith("SELECT id, name, built_in, preset_json, updated_at FROM export_presets")) {
      return [...this.exportPresets.values()]
        .sort((a, b) => {
          if (a.built_in !== b.built_in) {
            return b.built_in - a.built_in;
          }
          return a.name.localeCompare(b.name);
        }) as T;
    }

    if (normalized.startsWith("SELECT model_json, model_version, source_format, updated_at FROM document_unit_models")) {
      const [documentId] = params as [string];
      return (this.documentUnitModels.has(documentId) ? [this.documentUnitModels.get(documentId)] : []) as T;
    }

    throw new Error(`Unhandled select SQL in test double: ${normalized}`);
  }
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function asDatabase(fakeDb: FakeDatabase): Database {
  return fakeDb as unknown as Database;
}

function blockIdOf(node: Record<string, unknown>): string | null {
  const state = node.$;
  if (!state || typeof state !== "object") {
    return null;
  }

  return typeof (state as { blockId?: unknown }).blockId === "string"
    ? ((state as { blockId: string }).blockId ?? null)
    : null;
}

test("createDocument seeds built-in presets, default editor states, and export settings", async () => {
  const fakeDb = new FakeDatabase();

  const created = await createDocument(asDatabase(fakeDb), "Draft Alpha");

  assert.equal(created.title, "Draft Alpha");
  assert.ok(fakeDb.documents.has(created.id));
  assert.ok(fakeDb.manuscriptStates.has(created.id));
  assert.ok(fakeDb.leftMarginStates.has(created.id));
  assert.ok(fakeDb.rightMarginStates.has(created.id));
  assert.deepEqual(
    [...fakeDb.exportPresets.keys()].sort(),
    BUILTIN_PRESETS.map((preset) => preset.id).sort(),
  );
  assert.equal(
    fakeDb.documentExportSettings.get(created.id)?.default_preset_id,
    BUILTIN_PRESETS[0].id,
  );
  assert.ok(fakeDb.documentUnitModels.has(created.id));

  const bundle = await getDocumentStateBundle(asDatabase(fakeDb), created.id);
  const canonical = await readCanonicalDocumentModel(asDatabase(fakeDb), created.id);
  const parsedManuscript = JSON.parse(bundle.manuscriptJson) as {
    root: { children: Array<Record<string, unknown>> };
  };
  assert.equal(bundle.defaultPresetId, BUILTIN_PRESETS[0].id);
  assert.match(bundle.manuscriptJson, /Start writing your manuscript here\./);
  assert.match(blockIdOf(parsedManuscript.root.children[0]) ?? "", /.+/);
  assert.match(blockIdOf(parsedManuscript.root.children[1]) ?? "", /.+/);
  assert.deepEqual(
    (JSON.parse(bundle.leftMarginJson) as { root: { children: unknown[] } }).root.children,
    [],
  );
  assert.match(bundle.rightMarginJson, /Sources, citations, and annexes\./);
  assert.equal(canonical?.units.length, 2);
  assert.equal(canonical?.rightNotes.length, 1);
  assert.equal(canonical?.rightPaneMode, "supplemental-notes");
});

test("getDocumentStateBundle keeps manuscript block ids stable for every passage while preserving linked scholies", async () => {
  const fakeDb = new FakeDatabase();
  const documentId = "doc-1";

  fakeDb.documents.set(documentId, {
    id: documentId,
    title: "Linked Draft",
    created_at: 1,
    updated_at: 1,
  });

  fakeDb.manuscriptStates.set(documentId, {
    lexical_json: JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            $: { blockId: "keep-paragraph" },
            children: [{ type: "text", text: "Keep paragraph" }],
          },
          {
            type: "paragraph",
            $: { blockId: "drop-paragraph" },
            children: [{ type: "text", text: "Drop paragraph" }],
          },
          {
            type: "list",
            children: [
              {
                type: "listitem",
                $: { blockId: "keep-list-item" },
                children: [{ type: "text", text: "Keep list item" }],
              },
              {
                type: "listitem",
                $: { blockId: "drop-list-item" },
                children: [{ type: "text", text: "Drop list item" }],
              },
            ],
          },
        ],
      },
    }),
    updated_at: 1,
  });

  fakeDb.leftMarginStates.set(documentId, {
    lexical_json: JSON.stringify({
      root: {
        children: [
          {
            type: "marginalia-block",
            marginBlockId: "left-1",
            linkedManuscriptBlockId: "keep-paragraph",
            children: [],
          },
          {
            type: "marginalia-block",
            marginBlockId: "left-2",
            linkedManuscriptBlockId: null,
            children: [],
          },
        ],
      },
    }),
    updated_at: 1,
  });

  fakeDb.rightMarginStates.set(documentId, {
    lexical_json: JSON.stringify({
      root: {
        children: [
          {
            type: "marginalia-block",
            marginBlockId: "right-1",
            linkedManuscriptBlockId: "keep-list-item",
            children: [],
          },
        ],
      },
    }),
    updated_at: 1,
  });

  const bundle = await getDocumentStateBundle(asDatabase(fakeDb), documentId);
  const parsed = JSON.parse(bundle.manuscriptJson) as {
    root: { children: Array<Record<string, unknown>> };
  };

  const [firstParagraph, secondParagraph, list] = parsed.root.children;
  const listChildren = Array.isArray(list.children) ? (list.children as Array<Record<string, unknown>>) : [];

  assert.equal(blockIdOf(firstParagraph), "keep-paragraph");
  assert.equal(blockIdOf(secondParagraph), "drop-paragraph");
  assert.equal(blockIdOf(listChildren[0]), "keep-list-item");
  assert.equal(blockIdOf(listChildren[1]), "drop-list-item");
  assert.equal(fakeDb.manuscriptStates.get(documentId)?.lexical_json, bundle.manuscriptJson);
  assert.equal(bundle.defaultPresetId, BUILTIN_PRESETS[0].id);

  const canonical = await readCanonicalDocumentModel(asDatabase(fakeDb), documentId);
  assert.equal(canonical?.units.length, 4);
  assert.equal(canonical?.units[0].manuscript.blockId, "keep-paragraph");
  assert.equal(canonical?.units[0].scholie?.marginBlockId, "left-1");
  assert.equal(canonical?.units[1].manuscript.blockId, "drop-paragraph");
  assert.equal(canonical?.units[2].manuscript.blockId, "keep-list-item");
  assert.equal(canonical?.units[3].manuscript.blockId, "drop-list-item");
  assert.equal(canonical?.rightNotes[0]?.marginBlockId, "right-1");
});

test("migrateLegacyDocumentsToCanonicalModel backfills unopened legacy documents and flags ambiguous cases", async () => {
  const fakeDb = new FakeDatabase();

  fakeDb.documents.set("doc-clean", {
    id: "doc-clean",
    title: "Clean draft",
    created_at: 1,
    updated_at: 10,
  });
  fakeDb.documents.set("doc-legacy", {
    id: "doc-legacy",
    title: "Legacy draft",
    created_at: 2,
    updated_at: 20,
  });

  fakeDb.manuscriptStates.set("doc-clean", {
    lexical_json: JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "Fresh passage without explicit id yet" }],
          },
        ],
      },
    }),
    updated_at: 1,
  });
  fakeDb.leftMarginStates.set("doc-clean", {
    lexical_json: JSON.stringify({ root: { children: [] } }),
    updated_at: 1,
  });
  fakeDb.rightMarginStates.set("doc-clean", {
    lexical_json: JSON.stringify({ root: { children: [] } }),
    updated_at: 1,
  });

  fakeDb.manuscriptStates.set("doc-legacy", {
    lexical_json: JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            $: { blockId: "m-1" },
            children: [{ type: "text", text: "Legacy linked passage" }],
          },
          {
            type: "paragraph",
            $: { blockId: "m-2" },
            children: [{ type: "text", text: "Legacy passage without scholie" }],
          },
        ],
      },
    }),
    updated_at: 1,
  });
  fakeDb.leftMarginStates.set("doc-legacy", {
    lexical_json: JSON.stringify({
      root: {
        children: [
          {
            type: "marginalia-block",
            kind: "left",
            marginBlockId: "left-1",
            linkedManuscriptBlockId: "m-1",
            children: [{ type: "paragraph", children: [{ type: "text", text: "Primary scholie" }] }],
          },
          {
            type: "marginalia-block",
            kind: "left",
            marginBlockId: "left-1-dup",
            linkedManuscriptBlockId: "m-1",
            children: [{ type: "paragraph", children: [{ type: "text", text: "Duplicate scholie" }] }],
          },
          {
            type: "marginalia-block",
            kind: "left",
            marginBlockId: "left-free",
            linkedManuscriptBlockId: null,
            children: [{ type: "paragraph", children: [{ type: "text", text: "Free scholie" }] }],
          },
          {
            type: "marginalia-block",
            kind: "left",
            marginBlockId: "left-stale",
            linkedManuscriptBlockId: "missing-block",
            children: [{ type: "paragraph", children: [{ type: "text", text: "Stale scholie" }] }],
          },
        ],
      },
    }),
    updated_at: 1,
  });
  fakeDb.rightMarginStates.set("doc-legacy", {
    lexical_json: JSON.stringify({
      root: {
        children: [
          {
            type: "marginalia-block",
            kind: "right",
            marginBlockId: "right-1",
            linkedManuscriptBlockId: "m-2",
            children: [{ type: "paragraph", children: [{ type: "text", text: "Source note" }] }],
          },
        ],
      },
    }),
    updated_at: 1,
  });

  const report = await migrateLegacyDocumentsToCanonicalModel(asDatabase(fakeDb));

  assert.equal(report.migratedDocumentCount, 2);
  assert.deepEqual(report.migratedDocumentIds, ["doc-legacy", "doc-clean"]);
  assert.equal(report.documentsNeedingReviewCount, 1);
  assert.deepEqual(report.documentsNeedingReviewIds, ["doc-legacy"]);

  const cleanCanonical = await readCanonicalDocumentModel(asDatabase(fakeDb), "doc-clean");
  const legacyCanonical = await readCanonicalDocumentModel(asDatabase(fakeDb), "doc-legacy");

  assert.equal(cleanCanonical?.units.length, 1);
  assert.match(cleanCanonical?.units[0].manuscript.blockId ?? "", /.+/);
  assert.equal(legacyCanonical?.units.length, 2);
  assert.equal(legacyCanonical?.units[0].scholie?.marginBlockId, "left-1");
  assert.deepEqual(
    legacyCanonical?.supplementalLeftNotes.map((note) => [note.marginBlockId, note.reason]),
    [
      ["left-1-dup", "duplicate-left-link"],
      ["left-free", "unlinked-left-note"],
      ["left-stale", "stale-left-link"],
    ],
  );
});

test("migrateLegacyDocumentsToCanonicalModel flags documents with invalid legacy JSON for review", async () => {
  const fakeDb = new FakeDatabase();

  fakeDb.documents.set("doc-corrupt", {
    id: "doc-corrupt",
    title: "Corrupt legacy draft",
    created_at: 1,
    updated_at: 10,
  });
  fakeDb.manuscriptStates.set("doc-corrupt", {
    lexical_json: "{",
    updated_at: 1,
  });
  fakeDb.leftMarginStates.set("doc-corrupt", {
    lexical_json: JSON.stringify({ root: { children: [] } }),
    updated_at: 1,
  });
  fakeDb.rightMarginStates.set("doc-corrupt", {
    lexical_json: JSON.stringify({ root: { children: [] } }),
    updated_at: 1,
  });

  const report = await migrateLegacyDocumentsToCanonicalModel(asDatabase(fakeDb));
  const canonical = await readCanonicalDocumentModel(asDatabase(fakeDb), "doc-corrupt");

  assert.equal(report.migratedDocumentCount, 1);
  assert.deepEqual(report.migratedDocumentIds, ["doc-corrupt"]);
  assert.equal(report.documentsNeedingReviewCount, 1);
  assert.deepEqual(report.documentsNeedingReviewIds, ["doc-corrupt"]);
  assert.equal(canonical?.units.length, 0);
});

test("getDocumentStateBundle replaces invalid legacy JSON with safe empty editor states", async () => {
  const fakeDb = new FakeDatabase();
  const documentId = "doc-broken-open";

  fakeDb.documents.set(documentId, {
    id: documentId,
    title: "Broken draft",
    created_at: 1,
    updated_at: 10,
  });
  fakeDb.manuscriptStates.set(documentId, {
    lexical_json: "{",
    updated_at: 1,
  });
  fakeDb.leftMarginStates.set(documentId, {
    lexical_json: "{",
    updated_at: 1,
  });
  fakeDb.rightMarginStates.set(documentId, {
    lexical_json: "{",
    updated_at: 1,
  });

  const bundle = await getDocumentStateBundle(asDatabase(fakeDb), documentId);

  assert.deepEqual(JSON.parse(bundle.manuscriptJson), { root: { children: [], direction: null, format: "", indent: 0, type: "root", version: 1 } });
  assert.deepEqual(JSON.parse(bundle.leftMarginJson), { root: { children: [], direction: null, format: "", indent: 0, type: "root", version: 1 } });
  assert.deepEqual(JSON.parse(bundle.rightMarginJson), { root: { children: [], direction: null, format: "", indent: 0, type: "root", version: 1 } });
  assert.equal(fakeDb.manuscriptStates.get(documentId)?.lexical_json, bundle.manuscriptJson);
  assert.equal(fakeDb.leftMarginStates.get(documentId)?.lexical_json, bundle.leftMarginJson);
  assert.equal(fakeDb.rightMarginStates.get(documentId)?.lexical_json, bundle.rightMarginJson);
});

test("seedInitialData backfills canonical rows for existing documents before choosing the default draft", async () => {
  const fakeDb = new FakeDatabase();

  fakeDb.documents.set("doc-1", {
    id: "doc-1",
    title: "Existing draft",
    created_at: 1,
    updated_at: 5,
  });
  fakeDb.manuscriptStates.set("doc-1", {
    lexical_json: JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "Existing passage" }],
          },
        ],
      },
    }),
    updated_at: 1,
  });
  fakeDb.leftMarginStates.set("doc-1", {
    lexical_json: JSON.stringify({ root: { children: [] } }),
    updated_at: 1,
  });
  fakeDb.rightMarginStates.set("doc-1", {
    lexical_json: JSON.stringify({ root: { children: [] } }),
    updated_at: 1,
  });

  const seeded = await seedInitialData(asDatabase(fakeDb));
  const canonical = await readCanonicalDocumentModel(asDatabase(fakeDb), "doc-1");

  assert.equal(seeded.defaultDocumentId, "doc-1");
  assert.ok(fakeDb.documentUnitModels.has("doc-1"));
  assert.equal(canonical?.units.length, 1);
});
