import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Menu } from "@tauri-apps/api/menu";
import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import { ThreePaneLayout } from "./layout/ThreePaneLayout";
import { buildMenu } from "./menu/buildMenu";
import { CommandPalette, type CommandPaletteItem } from "./CommandPalette";
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
import { buildManuscriptExcerptIndexFromLexicalJson } from "../editors/manuscript/lexicalBlocks/indexing";
import { buildPrintPreviewHtml } from "../utils/printPreview";
import { debounce } from "../utils/debounce";

const PREFS_FILE = "ui-preferences.json";

function sanitizeFilename(text: string): string {
  return text
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
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
    currentManuscriptBlockId,
    leftCurrentBlockId,
    rightCurrentBlockId,
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
  const [bootError, setBootError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");

  const persistPreference = useCallback(
    async (key: string, value: unknown) => {
      if (!prefsStore) {
        return;
      }

      try {
        await prefsStore.set(key, value);
        await prefsStore.save();
      } catch (error) {
        console.error(`Failed to persist preference "${key}"`, error);
        setStatusMessage("A workspace preference could not be saved.");
      }
    },
    [prefsStore],
  );

  const debouncedPanePreferenceSave = useMemo(
    () => debounce((sizes: PaneSizes) => void persistPreference("paneSizes", sizes), 220),
    [persistPreference],
  );

  useEffect(() => {
    return () => {
      debouncedPanePreferenceSave.flush();
    };
  }, [debouncedPanePreferenceSave]);

  const reportError = useCallback((message: string, error: unknown) => {
    console.error(message, error);
    setStatusMessage(message);
  }, []);

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
      try {
        setBootError(null);
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

        const bundle = await getDocumentStateBundle(loadedDb, initialDocumentId);
        setCurrentDocumentId(initialDocumentId);
        setEditorStates({
          manuscriptJson: bundle.manuscriptJson,
          leftMarginJson: bundle.leftMarginJson,
          rightMarginJson: bundle.rightMarginJson,
        });
        setDefaultPresetId(bundle.defaultPresetId);
        setLeftLinksByManuscriptBlockId(buildMarginLinkIndexFromLexicalJson(bundle.leftMarginJson));
        setRightLinksByManuscriptBlockId(buildMarginLinkIndexFromLexicalJson(bundle.rightMarginJson));
        await loadedPrefs.set("lastDocumentId", initialDocumentId);
        await loadedPrefs.save();

        const presetRows = await listPresets(loadedDb);
        setPresets(presetRows);

        if (!active) {
          return;
        }
        setInitialized(true);
      } catch (error) {
        if (!active) {
          return;
        }
        console.error("Failed to initialize Marginalia", error);
        setBootError("Marginalia could not open its local workspace.");
      }
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, [
    setDb,
    setCurrentDocumentId,
    setDocuments,
    setEditorStates,
    setDefaultPresetId,
    setHighContrast,
    setInitialized,
    setLeftLinksByManuscriptBlockId,
    setPagePreview,
    setPaneSizes,
    setPrefsStore,
    setPresets,
    setRightLinksByManuscriptBlockId,
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

  useEffect(() => {
    if (renameDialogOpen) {
      setRenameDraft(currentDocument?.title ?? "");
    }
  }, [currentDocument, renameDialogOpen]);

  const activePreset = useMemo<ExportPresetRecord | null>(() => {
    const fromState = presets.find((preset) => preset.id === defaultPresetId);
    return fromState ?? presets[0] ?? BUILTIN_PRESETS[0] ?? null;
  }, [defaultPresetId, presets]);

  const manuscriptExcerptByBlockId = useMemo(
    () => buildManuscriptExcerptIndexFromLexicalJson(manuscriptJson),
    [manuscriptJson],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isMainModifier = event.metaKey || event.ctrlKey;
      if (!isMainModifier || event.key.toLowerCase() !== "k") {
        return;
      }
      if (isEditableTarget(event.target) && !commandPaletteOpen) {
        return;
      }

      event.preventDefault();
      setCommandPaletteOpen((open) => !open);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commandPaletteOpen]);

  const saveCurrentPresetForDocument = useCallback(
    async (presetId: string) => {
      if (!db || !currentDocumentId) {
        return;
      }
      try {
        await setDocumentDefaultPreset(db, currentDocumentId, presetId);
        setDefaultPresetId(presetId);
      } catch (error) {
        reportError("The default export style could not be saved.", error);
      }
    },
    [currentDocumentId, db, reportError, setDefaultPresetId],
  );

  const handleNewDocument = useCallback(async () => {
    if (!db) {
      return;
    }
    try {
      const created = await createDocument(db, "Untitled Draft");
      await refreshDocuments();
      await loadDocumentIntoEditors(created.id);
    } catch (error) {
      reportError("A new document could not be created.", error);
    }
  }, [db, loadDocumentIntoEditors, refreshDocuments, reportError]);

  const handleRenameDocument = useCallback(async () => {
    if (!db || !currentDocumentId || !currentDocument) {
      return;
    }
    setRenameDraft(currentDocument.title);
    setRenameDialogOpen(true);
  }, [currentDocument, currentDocumentId, db]);

  const confirmRenameDocument = useCallback(async () => {
    if (!db || !currentDocumentId) {
      return;
    }

    const next = renameDraft.trim();
    if (next.length === 0) {
      setStatusMessage("A document title cannot be empty.");
      return;
    }

    try {
      await renameDocument(db, currentDocumentId, next);
      await refreshDocuments();
      setRenameDialogOpen(false);
    } catch (error) {
      reportError("The document title could not be updated.", error);
    }
  }, [currentDocumentId, db, refreshDocuments, renameDraft, reportError]);

  const handleDeleteDocument = useCallback(async () => {
    if (!db || !currentDocumentId) {
      return;
    }
    setDeleteDialogOpen(true);
  }, [currentDocumentId, db]);

  const confirmDeleteDocument = useCallback(async () => {
    if (!db || !currentDocumentId) {
      return;
    }

    try {
      await deleteDocument(db, currentDocumentId);
      const docs = await listDocuments(db);

      if (docs.length === 0) {
        const created = await createDocument(db, "Untitled Draft");
        await refreshDocuments();
        await loadDocumentIntoEditors(created.id);
        setDeleteDialogOpen(false);
        return;
      }

      setDocuments(docs);
      await loadDocumentIntoEditors(docs[0].id);
      setDeleteDialogOpen(false);
    } catch (error) {
      reportError("The document could not be deleted.", error);
    }
  }, [currentDocumentId, db, loadDocumentIntoEditors, refreshDocuments, reportError, setDocuments]);

  const saveManuscript = useCallback(
    async (lexicalJson: string) => {
      if (!db || !currentDocumentId) {
        return;
      }
      try {
        await saveManuscriptState(db, currentDocumentId, lexicalJson);
      } catch (error) {
        reportError("The manuscript could not be saved.", error);
      }
    },
    [currentDocumentId, db, reportError],
  );

  const saveLeftMargin = useCallback(
    async (lexicalJson: string) => {
      if (!db || !currentDocumentId) {
        return;
      }
      try {
        await saveLeftMarginState(db, currentDocumentId, lexicalJson);
      } catch (error) {
        reportError("The left notes could not be saved.", error);
      }
    },
    [currentDocumentId, db, reportError],
  );

  const saveRightMargin = useCallback(
    async (lexicalJson: string) => {
      if (!db || !currentDocumentId) {
        return;
      }
      try {
        await saveRightMarginState(db, currentDocumentId, lexicalJson);
      } catch (error) {
        reportError("The right notes could not be saved.", error);
      }
    },
    [currentDocumentId, db, reportError],
  );

  const handleSetPaneSizes = useCallback(
    (sizes: PaneSizes) => {
      setPaneSizes(sizes);
      debouncedPanePreferenceSave(sizes);
    },
    [debouncedPanePreferenceSave, setPaneSizes],
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
    const title = currentDocument?.title ?? "Untitled Draft";
    setPrintPreviewHtml(buildPrintPreviewHtml({ title, manuscriptHtml, preset: activePreset }));
    setPrintPreviewOpen(true);
  }, [activePreset, currentDocument]);

  const exportDocx = useCallback(
    async (profile: "clean" | "working") => {
      if (!currentDocument || !activePreset) {
        return;
      }

      const suggested = `${sanitizeFilename(currentDocument.title)}-${profile}.docx`;
      let outputPath: string | null = null;
      try {
        outputPath = await invoke<string | null>("pick_save_path", {
          suggestedName: suggested,
          title: "Save DOCX Export",
        });
      } catch (error) {
        reportError("The export save dialog could not be opened.", error);
        return;
      }

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
      try {
        await invoke("export_docx", { payload });
        setStatusMessage(`DOCX export saved to ${outputPath}`);
      } catch (error) {
        reportError("The DOCX export could not be created.", error);
      }
    },
    [activePreset, currentDocument, leftMarginJson, manuscriptJson, reportError, rightMarginJson],
  );

  const handleSavePreset = useCallback(
    async (preset: ExportPresetRecord) => {
      if (!db) {
        return;
      }
      try {
        await upsertPreset(db, preset);
        await refreshPresets();
      } catch (error) {
        reportError("The export style could not be saved.", error);
      }
    },
    [db, refreshPresets, reportError],
  );

  const handleDeletePreset = useCallback(
    async (presetId: string) => {
      if (!db) {
        return;
      }
      try {
        await deletePreset(db, presetId);
        await refreshPresets();

        const updated = await listPresets(db);
        if (!updated.some((preset) => preset.id === useAppStore.getState().defaultPresetId)) {
          const fallback = updated[0];
          if (fallback && currentDocumentId) {
            await saveCurrentPresetForDocument(fallback.id);
          }
        }
      } catch (error) {
        reportError("The export style could not be deleted.", error);
      }
    },
    [currentDocumentId, db, refreshPresets, reportError, saveCurrentPresetForDocument],
  );

  const commandPaletteItems = useMemo<CommandPaletteItem[]>(
    () => [
      {
        id: "document.new",
        title: "Start a new document",
        section: "Document",
        shortcut: "Ctrl/Cmd+N",
        keywords: ["create file draft"],
        onSelect: () => void handleNewDocument(),
      },
      {
        id: "document.rename",
        title: "Rename this document",
        section: "Document",
        keywords: ["title"],
        onSelect: () => void handleRenameDocument(),
      },
      {
        id: "document.delete",
        title: "Delete this document",
        section: "Document",
        keywords: ["remove trash"],
        onSelect: () => void handleDeleteDocument(),
      },
      {
        id: "view.print-preview",
        title: "Open page preview",
        section: "View",
        keywords: ["pdf export print"],
        onSelect: handleOpenPrintPreview,
      },
      {
        id: "view.toggle-preview",
        title: pagePreview ? "Disable page preview" : "Enable page preview",
        section: "View",
        keywords: ["page layout manuscript"],
        onSelect: handleTogglePagePreview,
      },
      {
        id: "view.toggle-right-pane",
        title: rightPaneVisible ? "Hide right notes" : "Show right notes",
        section: "View",
        keywords: ["pane notes citations"],
        onSelect: handleToggleRightPane,
      },
      {
        id: "focus.manuscript",
        title: "Jump to manuscript",
        section: "Focus",
        keywords: ["center editor writing"],
        onSelect: () => manuscriptEditorRef.current?.focusEditor(),
      },
      {
        id: "focus.left",
        title: "Jump to left notes",
        section: "Focus",
        keywords: ["marginalia notes"],
        onSelect: () => leftEditorRef.current?.focusEditor(),
      },
      {
        id: "focus.right",
        title: "Jump to right notes",
        section: "Focus",
        disabled: !rightPaneVisible,
        keywords: ["citations notes"],
        onSelect: () => rightEditorRef.current?.focusEditor(),
      },
      {
        id: "left.new-linked",
        title: "Left notes: create linked note",
        section: "Left Notes",
        disabled: !currentManuscriptBlockId,
        shortcut: "Ctrl/Cmd+Alt+N",
        keywords: ["note anchor manuscript"],
        onSelect: () => {
          leftEditorRef.current?.insertBlock(currentManuscriptBlockId);
          leftEditorRef.current?.focusEditor();
        },
      },
      {
        id: "left.duplicate",
        title: "Left notes: duplicate current note",
        section: "Left Notes",
        disabled: !leftCurrentBlockId,
        shortcut: "Ctrl/Cmd+Alt+D",
        keywords: ["copy clone"],
        onSelect: () => leftEditorRef.current?.duplicateCurrent(),
      },
      {
        id: "left.split",
        title: "Left notes: split current note",
        section: "Left Notes",
        disabled: !leftCurrentBlockId,
        shortcut: "Ctrl/Cmd+Alt+S",
        keywords: ["break divide"],
        onSelect: () => leftEditorRef.current?.splitCurrent(),
      },
      {
        id: "left.merge-up",
        title: "Left notes: merge current note upward",
        section: "Left Notes",
        disabled: !leftCurrentBlockId,
        shortcut: "Ctrl/Cmd+Alt+Shift+Up",
        keywords: ["join combine previous"],
        onSelect: () => leftEditorRef.current?.mergeCurrentUp(),
      },
      {
        id: "left.merge-down",
        title: "Left notes: merge current note downward",
        section: "Left Notes",
        disabled: !leftCurrentBlockId,
        shortcut: "Ctrl/Cmd+Alt+Shift+Down",
        keywords: ["join combine next"],
        onSelect: () => leftEditorRef.current?.mergeCurrentDown(),
      },
      {
        id: "left.delete",
        title: "Left notes: delete current note",
        section: "Left Notes",
        disabled: !leftCurrentBlockId,
        shortcut: "Ctrl/Cmd+Alt+X",
        keywords: ["remove trash"],
        onSelect: () => leftEditorRef.current?.deleteCurrent(),
      },
      {
        id: "right.duplicate",
        title: "Right notes: duplicate current note",
        section: "Right Notes",
        disabled: !rightPaneVisible || !rightCurrentBlockId,
        shortcut: "Ctrl/Cmd+Alt+D",
        keywords: ["copy clone"],
        onSelect: () => rightEditorRef.current?.duplicateCurrent(),
      },
      {
        id: "right.split",
        title: "Right notes: split current note",
        section: "Right Notes",
        disabled: !rightPaneVisible || !rightCurrentBlockId,
        shortcut: "Ctrl/Cmd+Alt+S",
        keywords: ["break divide"],
        onSelect: () => rightEditorRef.current?.splitCurrent(),
      },
      {
        id: "right.merge-up",
        title: "Right notes: merge current note upward",
        section: "Right Notes",
        disabled: !rightPaneVisible || !rightCurrentBlockId,
        shortcut: "Ctrl/Cmd+Alt+Shift+Up",
        keywords: ["join combine previous"],
        onSelect: () => rightEditorRef.current?.mergeCurrentUp(),
      },
      {
        id: "right.merge-down",
        title: "Right notes: merge current note downward",
        section: "Right Notes",
        disabled: !rightPaneVisible || !rightCurrentBlockId,
        shortcut: "Ctrl/Cmd+Alt+Shift+Down",
        keywords: ["join combine next"],
        onSelect: () => rightEditorRef.current?.mergeCurrentDown(),
      },
      {
        id: "right.delete",
        title: "Right notes: delete current note",
        section: "Right Notes",
        disabled: !rightPaneVisible || !rightCurrentBlockId,
        shortcut: "Ctrl/Cmd+Alt+X",
        keywords: ["remove trash"],
        onSelect: () => rightEditorRef.current?.deleteCurrent(),
      },
    ],
    [
      currentManuscriptBlockId,
      handleDeleteDocument,
      handleNewDocument,
      handleOpenPrintPreview,
      handleRenameDocument,
      handleTogglePagePreview,
      handleToggleRightPane,
      leftCurrentBlockId,
      pagePreview,
      rightCurrentBlockId,
      rightPaneVisible,
    ],
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

  if (bootError) {
    return (
      <div className="app-shell">
        <div className="empty-state" role="alert">{bootError}</div>
      </div>
    );
  }

  if (!initialized || !currentDocumentId) {
    return <div className="app-shell"><div className="empty-state">Opening your writing workspace...</div></div>;
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
          Export Styles...
        </button>
        <button className="secondary-button" type="button" onClick={handleOpenPrintPreview}>
          Page Preview
        </button>
        <button className="secondary-button" type="button" onClick={() => setCommandPaletteOpen(true)}>
          Quick Actions
        </button>

        <span className="app-chip">Preset: {activePreset?.name ?? "No preset"}</span>
        <span className="app-chip">Ctrl/Cmd+K</span>
      </header>

      {statusMessage ? (
        <div className="status-banner" role="status">
          <span>{statusMessage}</span>
          <button type="button" className="ghost-button" onClick={() => setStatusMessage(null)}>
            Clear
          </button>
        </div>
      ) : null}

      <ThreePaneLayout
        rightVisible={rightPaneVisible}
        paneSizes={paneSizes}
        onPaneSizesChange={handleSetPaneSizes}
        left={
          <LeftMarginEditor
            key={`left-${currentDocumentId}`}
            ref={leftEditorRef}
            initialStateJson={leftMarginJson}
            manuscriptExcerptByBlockId={manuscriptExcerptByBlockId}
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
            manuscriptExcerptByBlockId={manuscriptExcerptByBlockId}
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

      <CommandPalette
        open={commandPaletteOpen}
        commands={commandPaletteItems}
        onClose={() => setCommandPaletteOpen(false)}
      />

      {renameDialogOpen ? (
        <div
          className="dialog-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-document-title"
        >
          <div className="dialog-card">
            <div className="modal-header">
              <strong id="rename-document-title">Rename This Document</strong>
              <button type="button" className="ghost-button" onClick={() => setRenameDialogOpen(false)}>
                Cancel
              </button>
            </div>
            <div className="modal-body dialog-body">
              <label className="dialog-field" htmlFor="rename-document-input">
                Title
                <input
                  id="rename-document-input"
                  className="app-input"
                  value={renameDraft}
                  autoFocus
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void confirmRenameDocument();
                    }
                  }}
                />
              </label>
            </div>
            <div className="modal-footer">
              <button type="button" className="secondary-button" onClick={() => setRenameDialogOpen(false)}>
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={() => void confirmRenameDocument()}>
                Save Title
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteDialogOpen ? (
        <div
          className="dialog-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-document-title"
        >
          <div className="dialog-card">
            <div className="modal-header">
              <strong id="delete-document-title">Delete This Document</strong>
              <button type="button" className="ghost-button" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </button>
            </div>
            <div className="modal-body dialog-body">
              <p>
                Delete <strong>{currentDocument?.title ?? "this document"}</strong> permanently?
              </p>
              <p className="dialog-copy">
                This removes the manuscript, the left and right notes, and the selected export style for this document.
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="secondary-button" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </button>
              <button type="button" className="primary-button destructive-button" onClick={() => void confirmDeleteDocument()}>
                Delete Document
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {printPreviewOpen ? (
        <div className="print-preview-overlay" role="dialog" aria-modal="true" aria-label="Page preview">
          <div className="print-preview-modal">
            <div className="modal-header">
              <strong>Page Preview</strong>
              <span className="app-chip">{activePreset?.name ?? "Export style"}</span>
              <button type="button" className="ghost-button" onClick={() => setPrintPreviewOpen(false)}>
                Cancel
              </button>
            </div>
            <div className="modal-body">
              <iframe
                ref={printFrameRef}
                className="print-preview-frame"
                title="Page preview"
                sandbox="allow-modals"
                srcDoc={printPreviewHtml}
              />
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
