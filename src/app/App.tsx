import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Menu } from "@tauri-apps/api/menu";
import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import { ThreePaneLayout } from "./layout/ThreePaneLayout";
import { buildMenu } from "./menu/buildMenu";
import {
  createDocument,
  deleteDocument,
  getDocumentStateBundle,
  listDocuments,
  listPresets,
  renameDocument,
  saveLeftMarginState,
  saveManuscriptState,
  saveRightMarginState,
  seedInitialData,
  setDocumentDefaultPreset,
  upsertPreset,
  deletePreset,
} from "../db/queries";
import { openAppDatabase } from "../db/db";
import { useAppStore, type PaneSizes, type ThemeMode } from "../state/useAppStore";
import { applyTheme, subscribeToSystemTheme } from "../theme/theme";
import { LeftMarginEditor, type LeftMarginEditorHandle } from "../editors/margin/LeftMarginEditor";
import { RightMarginEditor, type RightMarginEditorHandle } from "../editors/margin/RightMarginEditor";
import {
  ManuscriptEditor,
  type ManuscriptEditorHandle,
} from "../editors/manuscript/ManuscriptEditor";
import { PresetManager } from "../presets/PresetManager";
import { BUILTIN_PRESETS, type ExportPresetRecord } from "../presets/presetSchema";
import { buildMarginLinkIndexFromLexicalJson } from "../editors/margin/marginaliaBlocks/indexing";
import { buildPrintPreviewHtml } from "../utils/printPreview";

const PREFS_FILE = "ui-preferences.json";

function sanitizeFilename(text: string): string {
  return text
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

export default function App() {
  const {
    db,
    prefsStore,
    initialized,
    documents,
    currentDocumentId,
    manuscriptJson,
    leftMarginJson,
    rightMarginJson,
    presets,
    defaultPresetId,
    pagePreview,
    rightPaneVisible,
    presetManagerOpen,
    themeMode,
    highContrast,
    paneSizes,
    setDb,
    setPrefsStore,
    setInitialized,
    setDocuments,
    setCurrentDocumentId,
    setEditorStates,
    setPresets,
    setDefaultPresetId,
    setPagePreview,
    setRightPaneVisible,
    setPresetManagerOpen,
    setThemeMode,
    setHighContrast,
    setPaneSizes,
    setCurrentManuscriptBlockId,
    setLeftCurrentBlockId,
    setRightCurrentBlockId,
    setLeftLinksByManuscriptBlockId,
    setRightLinksByManuscriptBlockId,
  } = useAppStore();

  const menuRef = useRef<Menu | null>(null);
  const manuscriptEditorRef = useRef<ManuscriptEditorHandle | null>(null);
  const leftEditorRef = useRef<LeftMarginEditorHandle | null>(null);
  const rightEditorRef = useRef<RightMarginEditorHandle | null>(null);
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);

  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [printPreviewHtml, setPrintPreviewHtml] = useState("");

  const persistPreference = useCallback(
    async (key: string, value: unknown) => {
      if (!prefsStore) {
        return;
      }
      await prefsStore.set(key, value);
      await prefsStore.save();
    },
    [prefsStore],
  );

  const loadDocumentIntoEditors = useCallback(
    async (documentId: string, dbOverride?: typeof db) => {
      const activeDb = dbOverride ?? db;
      if (!activeDb) {
        return;
      }

      const bundle = await getDocumentStateBundle(activeDb, documentId);
      setCurrentDocumentId(documentId);
      setEditorStates({
        manuscriptJson: bundle.manuscriptJson,
        leftMarginJson: bundle.leftMarginJson,
        rightMarginJson: bundle.rightMarginJson,
      });
      setDefaultPresetId(bundle.defaultPresetId);
      setLeftLinksByManuscriptBlockId(buildMarginLinkIndexFromLexicalJson(bundle.leftMarginJson));
      setRightLinksByManuscriptBlockId(buildMarginLinkIndexFromLexicalJson(bundle.rightMarginJson));
      await persistPreference("lastDocumentId", documentId);
    },
    [
      db,
      persistPreference,
      setCurrentDocumentId,
      setDefaultPresetId,
      setEditorStates,
      setLeftLinksByManuscriptBlockId,
      setRightLinksByManuscriptBlockId,
    ],
  );

  const refreshDocuments = useCallback(async () => {
    if (!db) {
      return;
    }
    const rows = await listDocuments(db);
    setDocuments(rows);
  }, [db, setDocuments]);

  const refreshPresets = useCallback(async () => {
    if (!db) {
      return;
    }
    const rows = await listPresets(db);
    setPresets(rows);
  }, [db, setPresets]);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const loadedDb = await openAppDatabase();
      if (!active) {
        return;
      }
      setDb(loadedDb);

      const loadedPrefs = await Store.load(PREFS_FILE, {
        defaults: {
          themeMode: "system",
          highContrast: false,
          pagePreview: false,
          rightPaneVisible: false,
          paneSizes: { left: 0.3, right: 0.24 },
        },
      });
      if (!active) {
        return;
      }
      setPrefsStore(loadedPrefs);

      const storedThemeMode = (await loadedPrefs.get<ThemeMode>("themeMode")) ?? "system";
      const storedHighContrast = (await loadedPrefs.get<boolean>("highContrast")) ?? false;
      const storedPagePreview = (await loadedPrefs.get<boolean>("pagePreview")) ?? false;
      const storedRightPaneVisible = (await loadedPrefs.get<boolean>("rightPaneVisible")) ?? false;
      const storedPaneSizes = (await loadedPrefs.get<PaneSizes>("paneSizes")) ?? { left: 0.3, right: 0.24 };

      setThemeMode(storedThemeMode);
      setHighContrast(storedHighContrast);
      setPagePreview(storedPagePreview);
      setRightPaneVisible(storedRightPaneVisible);
      setPaneSizes(storedPaneSizes);

      const seeded = await seedInitialData(loadedDb);
      const documentRows = await listDocuments(loadedDb);
      setDocuments(documentRows);

      const storedLastDocumentId = await loadedPrefs.get<string>("lastDocumentId");
      const initialDocumentId =
        documentRows.find((document) => document.id === storedLastDocumentId)?.id ??
        documentRows[0]?.id ??
        seeded.defaultDocumentId;

      await loadDocumentIntoEditors(initialDocumentId, loadedDb);
      const presetRows = await listPresets(loadedDb);
      setPresets(presetRows);

      if (!active) {
        return;
      }
      setInitialized(true);
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, [
    loadDocumentIntoEditors,
    setDb,
    setDocuments,
    setHighContrast,
    setInitialized,
    setPagePreview,
    setPaneSizes,
    setPrefsStore,
    setPresets,
    setRightPaneVisible,
    setThemeMode,
  ]);

  useEffect(() => {
    applyTheme({ mode: themeMode, highContrast });
    return subscribeToSystemTheme(() => applyTheme({ mode: themeMode, highContrast }));
  }, [themeMode, highContrast]);

  const currentDocument = useMemo(
    () => documents.find((document) => document.id === currentDocumentId) ?? null,
    [currentDocumentId, documents],
  );

  const activePreset = useMemo<ExportPresetRecord | null>(() => {
    const fromState = presets.find((preset) => preset.id === defaultPresetId);
    return fromState ?? presets[0] ?? BUILTIN_PRESETS[0] ?? null;
  }, [defaultPresetId, presets]);

  const saveCurrentPresetForDocument = useCallback(
    async (presetId: string) => {
      if (!db || !currentDocumentId) {
        return;
      }
      await setDocumentDefaultPreset(db, currentDocumentId, presetId);
      setDefaultPresetId(presetId);
    },
    [currentDocumentId, db, setDefaultPresetId],
  );

  const handleNewDocument = useCallback(async () => {
    if (!db) {
      return;
    }
    const created = await createDocument(db, "Untitled Document");
    await refreshDocuments();
    await loadDocumentIntoEditors(created.id);
  }, [db, loadDocumentIntoEditors, refreshDocuments]);

  const handleRenameDocument = useCallback(async () => {
    if (!db || !currentDocumentId || !currentDocument) {
      return;
    }

    const value = window.prompt("Rename document", currentDocument.title);
    if (!value) {
      return;
    }

    const next = value.trim();
    if (next.length === 0) {
      return;
    }

    await renameDocument(db, currentDocumentId, next);
    await refreshDocuments();
  }, [currentDocument, currentDocumentId, db, refreshDocuments]);

  const handleDeleteDocument = useCallback(async () => {
    if (!db || !currentDocumentId) {
      return;
    }

    const approved = window.confirm("Delete this document permanently?");
    if (!approved) {
      return;
    }

    await deleteDocument(db, currentDocumentId);
    const docs = await listDocuments(db);

    if (docs.length === 0) {
      const created = await createDocument(db, "Untitled Document");
      await refreshDocuments();
      await loadDocumentIntoEditors(created.id);
      return;
    }

    setDocuments(docs);
    await loadDocumentIntoEditors(docs[0].id);
  }, [currentDocumentId, db, loadDocumentIntoEditors, refreshDocuments, setDocuments]);

  const saveManuscript = useCallback(
    async (lexicalJson: string) => {
      if (!db || !currentDocumentId) {
        return;
      }
      await saveManuscriptState(db, currentDocumentId, lexicalJson);
    },
    [currentDocumentId, db],
  );

  const saveLeftMargin = useCallback(
    async (lexicalJson: string) => {
      if (!db || !currentDocumentId) {
        return;
      }
      await saveLeftMarginState(db, currentDocumentId, lexicalJson);
    },
    [currentDocumentId, db],
  );

  const saveRightMargin = useCallback(
    async (lexicalJson: string) => {
      if (!db || !currentDocumentId) {
        return;
      }
      await saveRightMarginState(db, currentDocumentId, lexicalJson);
    },
    [currentDocumentId, db],
  );

  const handleSetPaneSizes = useCallback(
    (sizes: PaneSizes) => {
      setPaneSizes(sizes);
      void persistPreference("paneSizes", sizes);
    },
    [persistPreference, setPaneSizes],
  );

  const handleTogglePagePreview = useCallback(() => {
    const next = !useAppStore.getState().pagePreview;
    setPagePreview(next);
    void persistPreference("pagePreview", next);
  }, [persistPreference, setPagePreview]);

  const handleToggleRightPane = useCallback(() => {
    const next = !useAppStore.getState().rightPaneVisible;
    setRightPaneVisible(next);
    void persistPreference("rightPaneVisible", next);
  }, [persistPreference, setRightPaneVisible]);

  const handleSetThemeMode = useCallback(
    (mode: ThemeMode) => {
      setThemeMode(mode);
      void persistPreference("themeMode", mode);
    },
    [persistPreference, setThemeMode],
  );

  const handleToggleHighContrast = useCallback(() => {
    const next = !useAppStore.getState().highContrast;
    setHighContrast(next);
    void persistPreference("highContrast", next);
  }, [persistPreference, setHighContrast]);

  const handleCreateLinkedMarginalia = useCallback((manuscriptBlockId: string | null) => {
    leftEditorRef.current?.insertBlock(manuscriptBlockId);
    leftEditorRef.current?.focusEditor();
  }, []);

  const handleRevealMarginalia = useCallback((manuscriptBlockId: string | null) => {
    if (!manuscriptBlockId) {
      return;
    }
    leftEditorRef.current?.revealForManuscriptBlock(manuscriptBlockId);
  }, []);

  const handleNavigateToManuscriptBlock = useCallback((manuscriptBlockId: string) => {
    manuscriptEditorRef.current?.focusBlockById(manuscriptBlockId);
  }, []);

  const handleOpenPrintPreview = useCallback(() => {
    if (!activePreset) {
      return;
    }

    const manuscriptHtml = manuscriptEditorRef.current?.getHtml() ?? "";
    const title = currentDocument?.title ?? "Untitled Document";
    setPrintPreviewHtml(buildPrintPreviewHtml({ title, manuscriptHtml, preset: activePreset }));
    setPrintPreviewOpen(true);
  }, [activePreset, currentDocument]);

  const exportDocx = useCallback(
    async (profile: "clean" | "working") => {
      if (!currentDocument || !activePreset) {
        return;
      }

      const suggested = `${sanitizeFilename(currentDocument.title)}-${profile}.docx`;
      const outputPath = await invoke<string | null>("pick_save_path", {
        suggestedName: suggested,
        title: "Export DOCX",
      });

      if (!outputPath) {
        return;
      }

      const payload = {
        outputPath,
        documentTitle: currentDocument.title,
        profile,
        manuscriptJson: manuscriptEditorRef.current?.getLexicalJson() ?? manuscriptJson,
        marginLeftJson: leftEditorRef.current?.getLexicalJson() ?? leftMarginJson,
        marginRightJson: rightEditorRef.current?.getLexicalJson() ?? rightMarginJson,
        preset: activePreset,
        includeUnlinkedLeftAnnex: true,
      };

      await invoke("export_docx", { payload });
    },
    [activePreset, currentDocument, leftMarginJson, manuscriptJson, rightMarginJson],
  );

  const handleSavePreset = useCallback(
    async (preset: ExportPresetRecord) => {
      if (!db) {
        return;
      }
      await upsertPreset(db, preset);
      await refreshPresets();
    },
    [db, refreshPresets],
  );

  const handleDeletePreset = useCallback(
    async (presetId: string) => {
      if (!db) {
        return;
      }
      await deletePreset(db, presetId);
      await refreshPresets();

      const updated = await listPresets(db);
      if (!updated.some((preset) => preset.id === useAppStore.getState().defaultPresetId)) {
        const fallback = updated[0];
        if (fallback && currentDocumentId) {
          await saveCurrentPresetForDocument(fallback.id);
        }
      }
    },
    [currentDocumentId, db, refreshPresets, saveCurrentPresetForDocument],
  );

  useEffect(() => {
    if (!initialized) {
      return;
    }

    let active = true;

    const installMenu = async () => {
      if (menuRef.current) {
        await menuRef.current.close();
        menuRef.current = null;
      }

      const menu = await buildMenu(
        {
          pagePreview,
          rightPaneVisible,
          themeMode,
          highContrast,
        },
        {
          onNewDocument: () => void handleNewDocument(),
          onRenameDocument: () => void handleRenameDocument(),
          onDeleteDocument: () => void handleDeleteDocument(),
          onExportDocxClean: () => void exportDocx("clean"),
          onExportDocxWorking: () => void exportDocx("working"),
          onExportPdf: handleOpenPrintPreview,
          onTogglePagePreview: handleTogglePagePreview,
          onToggleRightPane: handleToggleRightPane,
          onSetTheme: handleSetThemeMode,
          onToggleHighContrast: handleToggleHighContrast,
          onOpenPresetManager: () => setPresetManagerOpen(true),
        },
      );

      if (!active) {
        await menu.close();
        return;
      }

      menuRef.current = menu;
    };

    void installMenu();

    return () => {
      active = false;
    };
  }, [
    exportDocx,
    handleDeleteDocument,
    handleNewDocument,
    handleOpenPrintPreview,
    handleRenameDocument,
    handleSetThemeMode,
    handleToggleHighContrast,
    handleTogglePagePreview,
    handleToggleRightPane,
    highContrast,
    initialized,
    pagePreview,
    rightPaneVisible,
    setPresetManagerOpen,
    themeMode,
  ]);

  if (!initialized || !currentDocumentId) {
    return <div className="app-shell"><div className="empty-state">Loading Marginalia…</div></div>;
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="app-topbar-title">Marginalia</div>

        <select
          className="app-select"
          value={currentDocumentId}
          onChange={(event) => {
            void loadDocumentIntoEditors(event.target.value);
          }}
        >
          {documents.map((document) => (
            <option key={document.id} value={document.id}>
              {document.title}
            </option>
          ))}
        </select>

        <button className="secondary-button" type="button" onClick={() => void handleNewDocument()}>
          New
        </button>
        <button className="secondary-button" type="button" onClick={() => setPresetManagerOpen(true)}>
          Presets…
        </button>
        <button className="secondary-button" type="button" onClick={handleOpenPrintPreview}>
          Print Preview
        </button>

        <span className="app-chip">Preset: {activePreset?.name ?? "None"}</span>
      </header>

      <ThreePaneLayout
        rightVisible={rightPaneVisible}
        paneSizes={paneSizes}
        onPaneSizesChange={handleSetPaneSizes}
        left={
          <LeftMarginEditor
            key={`left-${currentDocumentId}`}
            ref={leftEditorRef}
            initialStateJson={leftMarginJson}
            onAutosave={(json) => void saveLeftMargin(json)}
            onCurrentBlockIdChange={setLeftCurrentBlockId}
            onLinkIndexChange={setLeftLinksByManuscriptBlockId}
            onNavigateToManuscriptBlock={handleNavigateToManuscriptBlock}
          />
        }
        center={
          <ManuscriptEditor
            key={`manuscript-${currentDocumentId}`}
            ref={manuscriptEditorRef}
            initialStateJson={manuscriptJson}
            pagePreview={pagePreview}
            onAutosave={(json) => void saveManuscript(json)}
            onCurrentBlockIdChange={setCurrentManuscriptBlockId}
            onCreateLinkedMarginalia={handleCreateLinkedMarginalia}
            onRevealMarginalia={handleRevealMarginalia}
          />
        }
        right={
          <RightMarginEditor
            key={`right-${currentDocumentId}`}
            ref={rightEditorRef}
            initialStateJson={rightMarginJson}
            onAutosave={(json) => void saveRightMargin(json)}
            onCurrentBlockIdChange={setRightCurrentBlockId}
            onLinkIndexChange={setRightLinksByManuscriptBlockId}
            onNavigateToManuscriptBlock={handleNavigateToManuscriptBlock}
          />
        }
      />

      <PresetManager
        open={presetManagerOpen}
        presets={presets}
        defaultPresetId={defaultPresetId}
        onClose={() => setPresetManagerOpen(false)}
        onSavePreset={(preset) => void handleSavePreset(preset)}
        onDeletePreset={(presetId) => void handleDeletePreset(presetId)}
        onSetDefaultPreset={(presetId) => void saveCurrentPresetForDocument(presetId)}
      />

      {printPreviewOpen ? (
        <div className="print-preview-overlay" role="dialog" aria-modal="true" aria-label="Print preview">
          <div className="print-preview-modal">
            <div className="modal-header">
              <strong>Print Preview</strong>
              <span className="app-chip">{activePreset?.name ?? "Preset"}</span>
              <button type="button" className="ghost-button" onClick={() => setPrintPreviewOpen(false)}>
                Close
              </button>
            </div>
            <div className="modal-body">
              <iframe ref={printFrameRef} className="print-preview-frame" title="Print preview" srcDoc={printPreviewHtml} />
            </div>
            <div className="modal-footer">
              <button type="button" className="secondary-button" onClick={() => setPrintPreviewOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  printFrameRef.current?.contentWindow?.focus();
                  printFrameRef.current?.contentWindow?.print();
                }}
              >
                Print…
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
