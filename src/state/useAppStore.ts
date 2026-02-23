import type Database from "@tauri-apps/plugin-sql";
import type { Store } from "@tauri-apps/plugin-store";
import { create } from "zustand";
import type { DocumentRecord } from "../db/queries";
import type { ExportPresetRecord } from "../presets/presetSchema";

export type ThemeMode = "system" | "light" | "dark";

export interface PaneSizes {
  left: number;
  right: number;
}

export interface MarginLinkIndex {
  [manuscriptBlockId: string]: string[];
}

interface AppState {
  db: Database | null;
  prefsStore: Store | null;
  initialized: boolean;
  documents: DocumentRecord[];
  currentDocumentId: string | null;
  manuscriptJson: string;
  leftMarginJson: string;
  rightMarginJson: string;
  presets: ExportPresetRecord[];
  defaultPresetId: string | null;
  pagePreview: boolean;
  rightPaneVisible: boolean;
  presetManagerOpen: boolean;
  themeMode: ThemeMode;
  highContrast: boolean;
  paneSizes: PaneSizes;
  currentManuscriptBlockId: string | null;
  leftCurrentBlockId: string | null;
  rightCurrentBlockId: string | null;
  leftLinksByManuscriptBlockId: MarginLinkIndex;
  rightLinksByManuscriptBlockId: MarginLinkIndex;
  setDb: (db: Database) => void;
  setPrefsStore: (store: Store) => void;
  setInitialized: (initialized: boolean) => void;
  setDocuments: (documents: DocumentRecord[]) => void;
  setCurrentDocumentId: (documentId: string | null) => void;
  setEditorStates: (value: { manuscriptJson: string; leftMarginJson: string; rightMarginJson: string }) => void;
  setPresets: (presets: ExportPresetRecord[]) => void;
  setDefaultPresetId: (presetId: string | null) => void;
  setPagePreview: (pagePreview: boolean) => void;
  setRightPaneVisible: (visible: boolean) => void;
  setPresetManagerOpen: (open: boolean) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setHighContrast: (enabled: boolean) => void;
  setPaneSizes: (sizes: PaneSizes) => void;
  setCurrentManuscriptBlockId: (blockId: string | null) => void;
  setLeftCurrentBlockId: (blockId: string | null) => void;
  setRightCurrentBlockId: (blockId: string | null) => void;
  setLeftLinksByManuscriptBlockId: (index: MarginLinkIndex) => void;
  setRightLinksByManuscriptBlockId: (index: MarginLinkIndex) => void;
}

export const useAppStore = create<AppState>((set) => ({
  db: null,
  prefsStore: null,
  initialized: false,
  documents: [],
  currentDocumentId: null,
  manuscriptJson: "",
  leftMarginJson: "",
  rightMarginJson: "",
  presets: [],
  defaultPresetId: null,
  pagePreview: false,
  rightPaneVisible: false,
  presetManagerOpen: false,
  themeMode: "system",
  highContrast: false,
  paneSizes: { left: 0.28, right: 0.24 },
  currentManuscriptBlockId: null,
  leftCurrentBlockId: null,
  rightCurrentBlockId: null,
  leftLinksByManuscriptBlockId: {},
  rightLinksByManuscriptBlockId: {},
  setDb: (db) => set({ db }),
  setPrefsStore: (prefsStore) => set({ prefsStore }),
  setInitialized: (initialized) => set({ initialized }),
  setDocuments: (documents) => set({ documents }),
  setCurrentDocumentId: (currentDocumentId) => set({ currentDocumentId }),
  setEditorStates: ({ manuscriptJson, leftMarginJson, rightMarginJson }) =>
    set({ manuscriptJson, leftMarginJson, rightMarginJson }),
  setPresets: (presets) => set({ presets }),
  setDefaultPresetId: (defaultPresetId) => set({ defaultPresetId }),
  setPagePreview: (pagePreview) => set({ pagePreview }),
  setRightPaneVisible: (rightPaneVisible) => set({ rightPaneVisible }),
  setPresetManagerOpen: (presetManagerOpen) => set({ presetManagerOpen }),
  setThemeMode: (themeMode) => set({ themeMode }),
  setHighContrast: (highContrast) => set({ highContrast }),
  setPaneSizes: (paneSizes) => set({ paneSizes }),
  setCurrentManuscriptBlockId: (currentManuscriptBlockId) => set({ currentManuscriptBlockId }),
  setLeftCurrentBlockId: (leftCurrentBlockId) => set({ leftCurrentBlockId }),
  setRightCurrentBlockId: (rightCurrentBlockId) => set({ rightCurrentBlockId }),
  setLeftLinksByManuscriptBlockId: (leftLinksByManuscriptBlockId) => set({ leftLinksByManuscriptBlockId }),
  setRightLinksByManuscriptBlockId: (rightLinksByManuscriptBlockId) => set({ rightLinksByManuscriptBlockId }),
}));
