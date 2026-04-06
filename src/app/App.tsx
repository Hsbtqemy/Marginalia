import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { Menu } from "@tauri-apps/api/menu";
import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import { ThreePaneLayout } from "./layout/ThreePaneLayout";
import { buildMenu } from "./menu/buildMenu";
import { CommandPalette, type CommandPaletteItem } from "./CommandPalette";
import { deriveEditorialUnitProjection, summarizeLegacyLeftDuplicates } from "../document/editorialUnits";
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
import { deriveCanonicalDocumentModelFromEditorStates } from "../document/canonicalDocumentModel";
import { buildEditorialExportDocument, renderEditorialExportHtml } from "../export/editorialExport";
import { createEditorialUnitCoordinator } from "./editorialUnitActions";
import { createEditorialUnitCoordinatorDependencies } from "./editorialUnitCoordinatorDeps";
import { createLinkedMarginaliaScheduler } from "./linkedMarginalia";
import { releaseStuckPointerState } from "./pointerState";

const PREFS_FILE = "ui-preferences.json";

function excerptIndexEquals(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }

  for (const key of aKeys) {
    if (a[key] !== b[key]) {
      return false;
    }
  }

  return true;
}

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
    pointerBlockDragEnabled,
    presetManagerOpen,
    themeMode,
    highContrast,
    paneSizes,
    currentManuscriptBlockId,
    leftCurrentBlockId,
    rightCurrentBlockId,
    leftLinksByManuscriptBlockId,
    setDb,
    setPrefsStore,
    setInitialized,
    setDocuments,
    setCurrentDocumentId,
    setEditorStates,
    setManuscriptJson,
    setLeftMarginJson,
    setRightMarginJson,
    setPresets,
    setDefaultPresetId,
    setPagePreview,
    setRightPaneVisible,
    setPointerBlockDragEnabled,
    setPresetManagerOpen,
    setThemeMode,
    setHighContrast,
    setPaneSizes,
    setCurrentManuscriptBlockId,
    setLeftCurrentBlockId,
    setRightCurrentBlockId,
    setLeftLinksByManuscriptBlockId,
    setRightLinksByManuscriptBlockId,
    setEditorialUnitProjection,
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
  const [activePane, setActivePane] = useState<"left" | "center" | "right" | null>("center");
  const persistedManuscriptExcerptByBlockId = useMemo(
    () => buildManuscriptExcerptIndexFromLexicalJson(manuscriptJson),
    [manuscriptJson],
  );
  const [liveManuscriptExcerptByBlockId, setLiveManuscriptExcerptByBlockId] = useState<Record<string, string>>(
    persistedManuscriptExcerptByBlockId,
  );

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
      setLeftLinksByManuscriptBlockId(
        buildMarginLinkIndexFromLexicalJson(bundle.leftMarginJson, { uniquePerManuscriptBlock: true }),
      );
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
            pointerBlockDragEnabled: true,
            paneSizes: { left: 0.18, right: 0.16 },
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
        const storedPointerBlockDragEnabled =
          (await loadedPrefs.get<boolean>("pointerBlockDragEnabled")) ?? true;
        const storedPaneSizes = (await loadedPrefs.get<PaneSizes>("paneSizes")) ?? { left: 0.18, right: 0.16 };

        setThemeMode(storedThemeMode);
        setHighContrast(storedHighContrast);
        setPagePreview(storedPagePreview);
        setRightPaneVisible(storedRightPaneVisible);
        setPointerBlockDragEnabled(storedPointerBlockDragEnabled);
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
        setLeftLinksByManuscriptBlockId(
          buildMarginLinkIndexFromLexicalJson(bundle.leftMarginJson, { uniquePerManuscriptBlock: true }),
        );
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

  useEffect(() => {
    const onPointerRelease = () => releaseStuckPointerState();
    const onWindowBlur = () => releaseStuckPointerState();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        releaseStuckPointerState();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        releaseStuckPointerState();
      }
    };

    window.addEventListener("pointerup", onPointerRelease, true);
    window.addEventListener("pointercancel", onPointerRelease, true);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("pointerup", onPointerRelease, true);
      window.removeEventListener("pointercancel", onPointerRelease, true);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

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
  const documentCountLabel = `${documents.length} draft${documents.length === 1 ? "" : "s"}`;

  const closeTopbarMenu = useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const menu = target.closest("details");
    if (menu instanceof HTMLDetailsElement) {
      menu.open = false;
    }
  }, []);

  const runTopbarMenuAction = useCallback(
    (event: MouseEvent<HTMLButtonElement>, action: () => void) => {
      closeTopbarMenu(event.currentTarget);
      action();
    },
    [closeTopbarMenu],
  );

  useEffect(() => {
    setLiveManuscriptExcerptByBlockId((previous) =>
      excerptIndexEquals(previous, persistedManuscriptExcerptByBlockId)
        ? previous
        : persistedManuscriptExcerptByBlockId,
    );
  }, [currentDocumentId, persistedManuscriptExcerptByBlockId]);

  const handleManuscriptExcerptIndexChange = useCallback((nextIndex: Record<string, string>) => {
    setLiveManuscriptExcerptByBlockId((previous) =>
      excerptIndexEquals(previous, nextIndex) ? previous : nextIndex,
    );
  }, []);

  const editorialUnitProjection = useMemo(
    () =>
      deriveEditorialUnitProjection({
        manuscriptJson,
        leftMarginJson,
        leftLinksByManuscriptBlockId,
      }),
    [leftLinksByManuscriptBlockId, leftMarginJson, manuscriptJson],
  );

  useEffect(() => {
    setEditorialUnitProjection(editorialUnitProjection);
  }, [editorialUnitProjection, setEditorialUnitProjection]);

  const legacyLeftDuplicateSummary = useMemo(
    () => summarizeLegacyLeftDuplicates(editorialUnitProjection),
    [editorialUnitProjection],
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
        setManuscriptJson(lexicalJson);
      } catch (error) {
        reportError("The manuscript could not be saved.", error);
      }
    },
    [currentDocumentId, db, reportError, setManuscriptJson],
  );

  const saveLeftMargin = useCallback(
    async (lexicalJson: string) => {
      if (!db || !currentDocumentId) {
        return;
      }
      try {
        await saveLeftMarginState(db, currentDocumentId, lexicalJson);
        setLeftMarginJson(lexicalJson);
      } catch (error) {
        reportError("The left notes could not be saved.", error);
      }
    },
    [currentDocumentId, db, reportError, setLeftMarginJson],
  );

  const saveRightMargin = useCallback(
    async (lexicalJson: string) => {
      if (!db || !currentDocumentId) {
        return;
      }
      try {
        await saveRightMarginState(db, currentDocumentId, lexicalJson);
        setRightMarginJson(lexicalJson);
      } catch (error) {
        reportError("The right notes could not be saved.", error);
      }
    },
    [currentDocumentId, db, reportError, setRightMarginJson],
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

  const handleSetPointerBlockDragEnabled = useCallback(
    (enabled: boolean) => {
      setPointerBlockDragEnabled(enabled);
      void persistPreference("pointerBlockDragEnabled", enabled);
    },
    [persistPreference, setPointerBlockDragEnabled],
  );

  const handleTogglePointerBlockDrag = useCallback(() => {
    handleSetPointerBlockDragEnabled(!useAppStore.getState().pointerBlockDragEnabled);
  }, [handleSetPointerBlockDragEnabled]);

  const handleDisablePointerBlockDrag = useCallback(
    (message: string) => {
      handleSetPointerBlockDragEnabled(false);
      setStatusMessage(message);
    },
    [handleSetPointerBlockDragEnabled],
  );

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

  const resolveManuscriptBlockForLink = useCallback((manuscriptBlockId: string | null): string | null => {
    if (manuscriptBlockId) {
      return manuscriptBlockId;
    }

    const ensuredBlockId = manuscriptEditorRef.current?.ensureCurrentSelectionBlockId() ?? null;
    if (ensuredBlockId) {
      return ensuredBlockId;
    }

    return manuscriptEditorRef.current?.createLinkedPassageBlock() ?? null;
  }, []);

  const linkedCreationScheduler = useMemo(
    () =>
      createLinkedMarginaliaScheduler({
        timers: window,
        getCurrentDocumentId: () => useAppStore.getState().currentDocumentId,
        resolveManuscriptBlockForLink,
        focusManuscriptBlockById: (manuscriptBlockId) => {
          manuscriptEditorRef.current?.focusBlockById(manuscriptBlockId);
        },
        findLinkedMarginBlockIdByManuscriptBlockId: (manuscriptBlockId) => {
          return leftEditorRef.current?.findBlockIdForLinkedManuscript(manuscriptBlockId) ?? null;
        },
        focusMarginBlockById: (marginBlockId) => {
          leftEditorRef.current?.focusBlockById(marginBlockId);
        },
        insertLinkedMarginBlock: (manuscriptBlockId) => {
          leftEditorRef.current?.insertBlock(manuscriptBlockId);
        },
        focusMarginEditor: () => {
          leftEditorRef.current?.focusEditor();
        },
        reportError,
      }),
    [reportError, resolveManuscriptBlockForLink],
  );

  const handleCreateLinkedMarginalia = useCallback(
    (manuscriptBlockId: string | null) => {
      if (!currentDocumentId) {
        return;
      }

      linkedCreationScheduler.schedule(currentDocumentId, manuscriptBlockId);
    },
    [currentDocumentId, linkedCreationScheduler],
  );

  useEffect(() => {
    linkedCreationScheduler.clearPending();
  }, [currentDocumentId, linkedCreationScheduler]);

  useEffect(() => {
    return () => {
      linkedCreationScheduler.clearPending();
    };
  }, [linkedCreationScheduler]);

  const handleRevealMarginalia = useCallback((manuscriptBlockId: string | null) => {
    if (!manuscriptBlockId) {
      return;
    }
    leftEditorRef.current?.revealForManuscriptBlock(manuscriptBlockId);
  }, []);

  const handleNavigateToManuscriptBlock = useCallback((manuscriptBlockId: string) => {
    manuscriptEditorRef.current?.focusBlockById(manuscriptBlockId);
  }, []);

  const editorialUnitCoordinator = useMemo(
    () =>
      createEditorialUnitCoordinator(
        createEditorialUnitCoordinatorDependencies({
          activePane,
          setActivePane,
          getCurrentManuscriptBlockId: () => useAppStore.getState().currentManuscriptBlockId,
          getCurrentLeftMarginBlockId: () => useAppStore.getState().leftCurrentBlockId,
          manuscriptEditorRef,
          leftEditorRef,
          reportError,
        }),
      ),
    [activePane, reportError],
  );

  const currentUnitActionsEnabled = editorialUnitCoordinator.canResolveCurrentUnit();

  const handleCreateUnitBefore = useCallback(() => {
    editorialUnitCoordinator.createUnitBefore();
  }, [editorialUnitCoordinator]);

  const handleCreateUnitAfter = useCallback(() => {
    editorialUnitCoordinator.createUnitAfter();
  }, [editorialUnitCoordinator]);

  const handleCreateUnitBeforeBlock = useCallback(
    (manuscriptBlockId: string) => {
      editorialUnitCoordinator.createUnitBeforeBlock(manuscriptBlockId);
    },
    [editorialUnitCoordinator],
  );

  const handleCreateUnitAfterBlock = useCallback(
    (manuscriptBlockId: string) => {
      editorialUnitCoordinator.createUnitAfterBlock(manuscriptBlockId);
    },
    [editorialUnitCoordinator],
  );

  const handleCreateUnitAtStart = useCallback(() => {
    editorialUnitCoordinator.createUnitAtStart();
  }, [editorialUnitCoordinator]);

  const handleQuickInsertUnit = useCallback(() => {
    if (editorialUnitCoordinator.canResolveCurrentUnit()) {
      editorialUnitCoordinator.createUnitAfter();
      return;
    }

    editorialUnitCoordinator.createUnitAtEnd();
  }, [editorialUnitCoordinator]);

  const handleDuplicateCurrentUnit = useCallback(() => {
    editorialUnitCoordinator.duplicateCurrentUnit();
  }, [editorialUnitCoordinator]);

  const handleMoveCurrentUnitUp = useCallback(() => {
    editorialUnitCoordinator.moveCurrentUnitUp();
  }, [editorialUnitCoordinator]);

  const handleMoveCurrentUnitDown = useCallback(() => {
    editorialUnitCoordinator.moveCurrentUnitDown();
  }, [editorialUnitCoordinator]);

  const handleMoveUnitUpFromLeftMargin = useCallback(
    (marginBlockId: string) => {
      editorialUnitCoordinator.moveUnitUpFromMarginBlock(marginBlockId);
    },
    [editorialUnitCoordinator],
  );

  const handleMoveUnitDownFromLeftMargin = useCallback(
    (marginBlockId: string) => {
      editorialUnitCoordinator.moveUnitDownFromMarginBlock(marginBlockId);
    },
    [editorialUnitCoordinator],
  );

  const handleMoveUnitToMarginTargetFromLeftMargin = useCallback(
    (sourceMarginBlockId: string, targetMarginBlockId: string, position: "before" | "after") =>
      editorialUnitCoordinator.moveUnitToMarginTargetFromMarginBlock(
        sourceMarginBlockId,
        targetMarginBlockId,
        position,
      ),
    [editorialUnitCoordinator],
  );

  const handleDeleteCurrentUnit = useCallback(() => {
    editorialUnitCoordinator.deleteCurrentUnit();
  }, [editorialUnitCoordinator]);

  const quickInsertUnitTitle =
    currentUnitActionsEnabled
      ? "Unit: add next unit"
      : "Unit: add unit";

  const handleReviewLegacyLeftDuplicates = useCallback(() => {
    const primaryMarginBlockId = legacyLeftDuplicateSummary?.firstPrimaryLeftMarginBlockId;
    const manuscriptBlockId = legacyLeftDuplicateSummary?.firstAffectedManuscriptBlockId;
    if (!primaryMarginBlockId || !manuscriptBlockId) {
      return;
    }

    manuscriptEditorRef.current?.focusBlockById(manuscriptBlockId);
    leftEditorRef.current?.focusBlockById(primaryMarginBlockId);
    setActivePane("left");
  }, [legacyLeftDuplicateSummary]);

  const handleNormalizeLegacyLeftDuplicates = useCallback(() => {
    const normalizedCount = leftEditorRef.current?.normalizeLegacyLinkedDuplicates() ?? 0;
    if (normalizedCount === 0) {
      return;
    }

    setStatusMessage(
      `${normalizedCount} duplicate ${normalizedCount > 1 ? "scholies were" : "scholie was"} detached as free scholies. The first linked scholie remains primary for each unit.`,
    );
    setActivePane("left");
  }, []);

  const handleOpenPrintPreview = useCallback(() => {
    if (!activePreset) {
      return;
    }

    const manuscriptStateForExport = manuscriptEditorRef.current?.getLexicalJson() ?? manuscriptJson;
    const leftMarginStateForExport = leftEditorRef.current?.getLexicalJson() ?? leftMarginJson;
    const rightMarginStateForExport = rightEditorRef.current?.getLexicalJson() ?? rightMarginJson;
    const canonicalModel = deriveCanonicalDocumentModelFromEditorStates({
      manuscriptJson: manuscriptStateForExport,
      leftMarginJson: leftMarginStateForExport,
      rightMarginJson: rightMarginStateForExport,
    });
    const manuscriptHtml = renderEditorialExportHtml(buildEditorialExportDocument(canonicalModel, "clean"));
    const title = currentDocument?.title ?? "Untitled Draft";
    setPrintPreviewHtml(buildPrintPreviewHtml({ title, manuscriptHtml, preset: activePreset }));
    setPrintPreviewOpen(true);
  }, [activePreset, currentDocument, leftMarginJson, manuscriptJson, rightMarginJson]);

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

      const manuscriptStateForExport = manuscriptEditorRef.current?.getLexicalJson() ?? manuscriptJson;
      const leftMarginStateForExport = leftEditorRef.current?.getLexicalJson() ?? leftMarginJson;
      const rightMarginStateForExport = rightEditorRef.current?.getLexicalJson() ?? rightMarginJson;
      const canonicalModel = deriveCanonicalDocumentModelFromEditorStates({
        manuscriptJson: manuscriptStateForExport,
        leftMarginJson: leftMarginStateForExport,
        rightMarginJson: rightMarginStateForExport,
      });
      const editorialExport = buildEditorialExportDocument(canonicalModel, profile);
      const payload = {
        outputPath,
        documentTitle: currentDocument.title,
        profile,
        editorialExportJson: JSON.stringify(editorialExport),
        preset: activePreset,
        includeSupplementalLeftAnnex: true,
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
        title: rightPaneVisible ? "Hide sources" : "Show sources",
        section: "View",
        keywords: ["pane sources citations"],
        onSelect: handleToggleRightPane,
      },
      {
        id: "view.toggle-pointer-drag",
        title: pointerBlockDragEnabled ? "Disable pointer drag reorder" : "Enable pointer drag reorder",
        section: "View",
        keywords: ["mouse drag reorder scholie source margin handle"],
        onSelect: handleTogglePointerBlockDrag,
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
        title: "Jump to scholies",
        section: "Focus",
        keywords: ["scholies commentary gloss"],
        onSelect: () => leftEditorRef.current?.focusEditor(),
      },
      {
        id: "focus.right",
        title: "Jump to sources",
        section: "Focus",
        disabled: !rightPaneVisible,
        keywords: ["citations notes"],
        onSelect: () => rightEditorRef.current?.focusEditor(),
      },
      {
        id: "unit.quick-insert",
        title: quickInsertUnitTitle,
        section: "Units",
        shortcut: "Ctrl/Cmd+Alt+Enter",
        keywords: ["add create insert unit passage scholie empty document end next"],
        onSelect: handleQuickInsertUnit,
      },
      {
        id: "unit.insert-before",
        title: "Unit: insert before current unit",
        section: "Units",
        disabled: !currentUnitActionsEnabled,
        keywords: ["passage block insert before unit scholie"],
        onSelect: handleCreateUnitBefore,
      },
      {
        id: "unit.insert-after",
        title: "Unit: insert after current unit",
        section: "Units",
        disabled: !currentUnitActionsEnabled,
        keywords: ["passage block insert after unit scholie"],
        onSelect: handleCreateUnitAfter,
      },
      {
        id: "unit.duplicate",
        title: "Unit: duplicate current unit",
        section: "Units",
        disabled: !currentUnitActionsEnabled,
        keywords: ["copy clone block passage scholie"],
        onSelect: handleDuplicateCurrentUnit,
      },
      {
        id: "unit.move-up",
        title: "Unit: move current unit earlier",
        section: "Units",
        disabled: !currentUnitActionsEnabled,
        shortcut: "Ctrl/Cmd+Alt+ArrowUp",
        keywords: ["reorder block passage previous scholie"],
        onSelect: handleMoveCurrentUnitUp,
      },
      {
        id: "unit.move-down",
        title: "Unit: move current unit later",
        section: "Units",
        disabled: !currentUnitActionsEnabled,
        shortcut: "Ctrl/Cmd+Alt+ArrowDown",
        keywords: ["reorder block passage next scholie"],
        onSelect: handleMoveCurrentUnitDown,
      },
      {
        id: "unit.delete",
        title: "Unit: delete current unit",
        section: "Units",
        disabled: !currentUnitActionsEnabled,
        keywords: ["remove trash block passage scholie"],
        onSelect: handleDeleteCurrentUnit,
      },
      {
        id: "left.new-linked",
        title: "Scholies: add to current unit",
        section: "Scholies",
        disabled: false,
        shortcut: "Ctrl/Cmd+Alt+N",
        keywords: ["scholie passage unit commentary anchor manuscript"],
        onSelect: () => handleCreateLinkedMarginalia(currentManuscriptBlockId),
      },
      {
        id: "left.normalize-legacy-duplicates",
        title: "Scholies: normalize legacy duplicates",
        section: "Scholies",
        disabled: !legacyLeftDuplicateSummary,
        keywords: ["legacy duplicate normalize cleanup detach scholie"],
        onSelect: handleNormalizeLegacyLeftDuplicates,
      },
      {
        id: "left.duplicate",
        title: "Scholies: duplicate current scholie",
        section: "Scholies",
        disabled: !leftCurrentBlockId,
        shortcut: "Ctrl/Cmd+Alt+D",
        keywords: ["copy clone"],
        onSelect: () => leftEditorRef.current?.duplicateCurrent(),
      },
      {
        id: "left.split",
        title: "Scholies: split current scholie",
        section: "Scholies",
        disabled: !leftCurrentBlockId,
        shortcut: "Ctrl/Cmd+Alt+S",
        keywords: ["break divide"],
        onSelect: () => leftEditorRef.current?.splitCurrent(),
      },
      {
        id: "left.merge-up",
        title: "Scholies: merge current scholie upward",
        section: "Scholies",
        disabled: !leftCurrentBlockId,
        shortcut: "Ctrl/Cmd+Alt+Shift+Up",
        keywords: ["join combine previous"],
        onSelect: () => leftEditorRef.current?.mergeCurrentUp(),
      },
      {
        id: "left.merge-down",
        title: "Scholies: merge current scholie downward",
        section: "Scholies",
        disabled: !leftCurrentBlockId,
        shortcut: "Ctrl/Cmd+Alt+Shift+Down",
        keywords: ["join combine next"],
        onSelect: () => leftEditorRef.current?.mergeCurrentDown(),
      },
      {
        id: "left.delete",
        title: "Scholies: delete current scholie",
        section: "Scholies",
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
      currentUnitActionsEnabled,
      editorialUnitProjection.units.length,
      handleCreateUnitAfterBlock,
      handleCreateUnitAfter,
      handleCreateUnitAtStart,
      handleCreateUnitBeforeBlock,
      handleCreateUnitBefore,
      handleDeleteDocument,
      handleDeleteCurrentUnit,
      handleDuplicateCurrentUnit,
      handleMoveCurrentUnitDown,
      handleMoveCurrentUnitUp,
      handleMoveUnitDownFromLeftMargin,
      handleMoveUnitUpFromLeftMargin,
      handleNewDocument,
      handleOpenPrintPreview,
      handleQuickInsertUnit,
      handleRenameDocument,
      handleTogglePointerBlockDrag,
      handleTogglePagePreview,
      handleToggleRightPane,
      quickInsertUnitTitle,
      handleCreateLinkedMarginalia,
      handleNormalizeLegacyLeftDuplicates,
      legacyLeftDuplicateSummary,
      leftCurrentBlockId,
      pagePreview,
      pointerBlockDragEnabled,
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
          pointerBlockDragEnabled,
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
          onTogglePointerBlockDrag: handleTogglePointerBlockDrag,
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
    handleTogglePointerBlockDrag,
    handleTogglePagePreview,
    handleToggleRightPane,
    highContrast,
    initialized,
    pagePreview,
    pointerBlockDragEnabled,
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
        <div className="app-topbar-document">
          <div className="app-topbar-kicker">Marginalia</div>
          <div className="app-topbar-document-copy">
            <div className="app-topbar-document-heading">
              <h1 className="app-topbar-title">{currentDocument?.title ?? "Untitled Draft"}</h1>
              <button type="button" className="app-chip app-chip-button" onClick={() => setPresetManagerOpen(true)}>
                {activePreset?.name ?? "Export style"}
              </button>
            </div>
            <div className="app-topbar-document-meta">
              <label className="app-topbar-document-picker">
                <span>Open draft</span>
                <select
                  className="app-select app-document-select"
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
              </label>
              <span className="app-topbar-document-count">{documentCountLabel}</span>
            </div>
          </div>
        </div>

        <div className="app-topbar-actions">
          <details className="app-topbar-menu">
            <summary>Document</summary>
            <div className="app-topbar-menu-body">
              <button
                className="secondary-button app-topbar-menu-item"
                type="button"
                onClick={(event) => runTopbarMenuAction(event, () => void handleNewDocument())}
              >
                New Draft
              </button>
              <button
                className="secondary-button app-topbar-menu-item"
                type="button"
                onClick={(event) => runTopbarMenuAction(event, () => void handleRenameDocument())}
              >
                Rename This Draft
              </button>
              <button
                className="secondary-button destructive-button app-topbar-menu-item"
                type="button"
                onClick={(event) => runTopbarMenuAction(event, () => void handleDeleteDocument())}
              >
                Delete This Draft
              </button>
            </div>
          </details>
          <details className="app-topbar-menu">
            <summary>Export</summary>
            <div className="app-topbar-menu-body">
              <button
                className="secondary-button app-topbar-menu-item"
                type="button"
                disabled={!activePreset}
                onClick={(event) => runTopbarMenuAction(event, () => void exportDocx("clean"))}
              >
                Export DOCX Clean Draft
              </button>
              <button
                className="secondary-button app-topbar-menu-item"
                type="button"
                disabled={!activePreset}
                onClick={(event) => runTopbarMenuAction(event, () => void exportDocx("working"))}
              >
                Export DOCX Working Draft
              </button>
              <button
                className="secondary-button app-topbar-menu-item"
                type="button"
                disabled={!activePreset}
                onClick={(event) => runTopbarMenuAction(event, handleOpenPrintPreview)}
              >
                Print or Save PDF
              </button>
              <button
                className="secondary-button app-topbar-menu-item"
                type="button"
                onClick={(event) => runTopbarMenuAction(event, () => setPresetManagerOpen(true))}
              >
                Manage Export Styles
              </button>
            </div>
          </details>
          <details className="app-topbar-menu">
            <summary>View</summary>
            <div className="app-topbar-menu-body">
              <button
                className="secondary-button app-topbar-menu-item"
                type="button"
                data-active={pagePreview ? "true" : "false"}
                onClick={(event) => runTopbarMenuAction(event, handleTogglePagePreview)}
              >
                {pagePreview ? "Disable Page Preview" : "Enable Page Preview"}
              </button>
              <button
                className="secondary-button app-topbar-menu-item"
                type="button"
                data-active={rightPaneVisible ? "true" : "false"}
                onClick={(event) => runTopbarMenuAction(event, handleToggleRightPane)}
              >
                {rightPaneVisible ? "Hide Sources Pane" : "Show Sources Pane"}
              </button>
              <button
                className="secondary-button app-topbar-menu-item"
                type="button"
                data-active={pointerBlockDragEnabled ? "true" : "false"}
                onClick={(event) => runTopbarMenuAction(event, handleTogglePointerBlockDrag)}
              >
                {pointerBlockDragEnabled ? "Disable Pointer Drag" : "Enable Pointer Drag"}
              </button>
            </div>
          </details>
          <button className="secondary-button" type="button" onClick={() => setCommandPaletteOpen(true)}>
            Quick Actions
          </button>
        </div>
      </header>

      {statusMessage ? (
        <div className="status-banner" role="status">
          <span>{statusMessage}</span>
          <button type="button" className="ghost-button" onClick={() => setStatusMessage(null)}>
            Clear
          </button>
        </div>
      ) : null}

      {legacyLeftDuplicateSummary ? (
        <div className="status-banner status-banner-warning" role="status">
          <span>
            Legacy scholies detected: {legacyLeftDuplicateSummary.duplicateScholieCount} duplicate
            {legacyLeftDuplicateSummary.duplicateScholieCount > 1 ? " scholies" : " scholie"} across{" "}
            {legacyLeftDuplicateSummary.affectedUnitCount} unit
            {legacyLeftDuplicateSummary.affectedUnitCount > 1 ? "s" : ""}. The first scholie stays
            primary for each unit; you can detach the extras as free scholies now.
          </span>
          <div className="status-banner-actions">
            <button type="button" className="ghost-button" onClick={handleReviewLegacyLeftDuplicates}>
              Review Primary
            </button>
            <button type="button" className="ghost-button" onClick={handleNormalizeLegacyLeftDuplicates}>
              Normalize
            </button>
          </div>
        </div>
      ) : null}

      <ThreePaneLayout
        rightVisible={rightPaneVisible}
        activePane={activePane}
        paneSizes={paneSizes}
        onPaneSizesChange={handleSetPaneSizes}
        left={
          <LeftMarginEditor
            key={`left-${currentDocumentId}`}
            ref={leftEditorRef}
            initialStateJson={leftMarginJson}
            manuscriptExcerptByBlockId={liveManuscriptExcerptByBlockId}
            onAutosave={saveLeftMargin}
            onCurrentBlockIdChange={setLeftCurrentBlockId}
            onLinkIndexChange={setLeftLinksByManuscriptBlockId}
            onNavigateToManuscriptBlock={handleNavigateToManuscriptBlock}
            onRequestCreateLinkedNote={() => handleCreateLinkedMarginalia(currentManuscriptBlockId)}
            legacyDuplicateSummary={legacyLeftDuplicateSummary}
            onMoveLinkedUnitUp={handleMoveUnitUpFromLeftMargin}
            onMoveLinkedUnitDown={handleMoveUnitDownFromLeftMargin}
            onMoveLinkedUnitToMarginTarget={handleMoveUnitToMarginTargetFromLeftMargin}
            pointerBlockDragEnabled={pointerBlockDragEnabled}
            onDisablePointerBlockDrag={handleDisablePointerBlockDrag}
            onFocusChange={(focused) => {
              if (focused) {
                setActivePane("left");
              }
            }}
          />
        }
        center={
          <ManuscriptEditor
            key={`manuscript-${currentDocumentId}`}
            ref={manuscriptEditorRef}
            initialStateJson={manuscriptJson}
            unitCount={editorialUnitProjection.units.length}
            pagePreview={pagePreview}
            onAutosave={saveManuscript}
            onCurrentBlockIdChange={setCurrentManuscriptBlockId}
            onCreateLinkedMarginalia={handleCreateLinkedMarginalia}
            onRevealMarginalia={handleRevealMarginalia}
            onInsertUnitBefore={handleCreateUnitBefore}
            onInsertUnitAfter={handleCreateUnitAfter}
            onInsertUnitBeforeBlock={handleCreateUnitBeforeBlock}
            onInsertUnitAfterBlock={handleCreateUnitAfterBlock}
            onInsertUnitAtStart={handleCreateUnitAtStart}
            onQuickInsertUnit={handleQuickInsertUnit}
            onDuplicateUnit={handleDuplicateCurrentUnit}
            onMoveUnitUp={handleMoveCurrentUnitUp}
            onMoveUnitDown={handleMoveCurrentUnitDown}
            onDeleteUnit={handleDeleteCurrentUnit}
            onExcerptIndexChange={handleManuscriptExcerptIndexChange}
            onFocusChange={(focused) => {
              if (focused) {
                setActivePane("center");
              }
            }}
          />
        }
        right={
          <RightMarginEditor
            key={`right-${currentDocumentId}`}
            ref={rightEditorRef}
            initialStateJson={rightMarginJson}
            manuscriptExcerptByBlockId={liveManuscriptExcerptByBlockId}
            onAutosave={saveRightMargin}
            onCurrentBlockIdChange={setRightCurrentBlockId}
            onLinkIndexChange={setRightLinksByManuscriptBlockId}
            onNavigateToManuscriptBlock={handleNavigateToManuscriptBlock}
            pointerBlockDragEnabled={pointerBlockDragEnabled}
            onDisablePointerBlockDrag={handleDisablePointerBlockDrag}
            onFocusChange={(focused) => {
              if (focused) {
                setActivePane("right");
              }
            }}
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
