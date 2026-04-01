import test from "node:test";
import assert from "node:assert/strict";
import type Database from "@tauri-apps/plugin-sql";
import { BUILTIN_PRESETS } from "../presets/presetSchema";
import { createDocument, getDocumentStateBundle } from "./queries";

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

class FakeDatabase {
  readonly documents = new Map<string, DocumentRow>();
  readonly manuscriptStates = new Map<string, StateRow>();
  readonly leftMarginStates = new Map<string, StateRow>();
  readonly rightMarginStates = new Map<string, StateRow>();
  readonly exportPresets = new Map<string, PresetRow>();
  readonly documentExportSettings = new Map<string, ExportSettingRow>();

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
      if (!this.leftMarginStates.has(documentId)) {
        this.leftMarginStates.set(documentId, {
          lexical_json: lexicalJson,
          updated_at: updatedAt,
        });
      }
      return;
    }

    if (normalized.startsWith("INSERT INTO margin_right_states(")) {
      const [documentId, lexicalJson, updatedAt] = params as [string, string, number];
      if (!this.rightMarginStates.has(documentId)) {
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

  const bundle = await getDocumentStateBundle(asDatabase(fakeDb), created.id);
  assert.equal(bundle.defaultPresetId, BUILTIN_PRESETS[0].id);
  assert.match(bundle.manuscriptJson, /Start writing your manuscript here\./);
  assert.match(bundle.leftMarginJson, /Working notes and ideas\./);
  assert.match(bundle.rightMarginJson, /Sources and citations\./);
});

test("getDocumentStateBundle keeps only manuscript block ids still referenced by linked margin notes", async () => {
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
  assert.equal(blockIdOf(secondParagraph), null);
  assert.equal(blockIdOf(listChildren[0]), "keep-list-item");
  assert.equal(blockIdOf(listChildren[1]), null);
  assert.equal(fakeDb.manuscriptStates.get(documentId)?.lexical_json, bundle.manuscriptJson);
  assert.equal(bundle.defaultPresetId, BUILTIN_PRESETS[0].id);
});
