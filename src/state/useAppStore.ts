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

function marginLinkIndexEquals(a: MarginLinkIndex, b: MarginLinkIndex): boolean {
  if (a === b) {
    return true;
  }

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }

  for (const key of aKeys) {
    const aLinks = a[key];
    const bLinks = b[key];
    if (!Array.isArray(aLinks) || !Array.isArray(bLinks) || aLinks.length !== bLinks.length) {
      return false;
    }
    for (let index = 0; index < aLinks.length; index += 1) {
      if (aLinks[index] !== bLinks[index]) {
        return false;
      }
    }
  }

  return true;
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
  paneSizes: { left: 0.24, right: 0.2 },
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
  setCurrentManuscriptBlockId: (currentManuscriptBlockId) =>
    set((state) =>
      state.currentManuscriptBlockId === currentManuscriptBlockId ? state : { currentManuscriptBlockId }
    ),
  setLeftCurrentBlockId: (leftCurrentBlockId) =>
    set((state) => (state.leftCurrentBlockId === leftCurrentBlockId ? state : { leftCurrentBlockId })),
  setRightCurrentBlockId: (rightCurrentBlockId) =>
    set((state) => (state.rightCurrentBlockId === rightCurrentBlockId ? state : { rightCurrentBlockId })),
  setLeftLinksByManuscriptBlockId: (leftLinksByManuscriptBlockId) =>
    set((state) =>
      marginLinkIndexEquals(state.leftLinksByManuscriptBlockId, leftLinksByManuscriptBlockId)
        ? state
        : { leftLinksByManuscriptBlockId }
    ),
  setRightLinksByManuscriptBlockId: (rightLinksByManuscriptBlockId) =>
    set((state) =>
      marginLinkIndexEquals(state.rightLinksByManuscriptBlockId, rightLinksByManuscriptBlockId)
        ? state
        : { rightLinksByManuscriptBlockId }
    ),
}));
