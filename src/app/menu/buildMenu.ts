import { CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import type { ThemeMode } from "../../state/useAppStore";

export interface MenuHandlers {
  onNewDocument: () => void;
  onRenameDocument: () => void;
  onDeleteDocument: () => void;
  onExportDocxClean: () => void;
  onExportDocxWorking: () => void;
  onExportPdf: () => void;
  onTogglePagePreview: () => void;
  onToggleRightPane: () => void;
  onTogglePointerBlockDrag: () => void;
  onSetTheme: (mode: ThemeMode) => void;
  onToggleHighContrast: () => void;
  onOpenPresetManager: () => void;
}

export interface MenuState {
  pagePreview: boolean;
  rightPaneVisible: boolean;
  pointerBlockDragEnabled: boolean;
  themeMode: ThemeMode;
  highContrast: boolean;
}

export async function buildMenu(state: MenuState, handlers: MenuHandlers): Promise<Menu> {
  const exportMenu = await Submenu.new({
    text: "Export",
    items: [
      await MenuItem.new({
        id: "file.export_docx_clean",
        text: "Export DOCX (Clean Draft)",
        action: () => handlers.onExportDocxClean(),
      }),
      await MenuItem.new({
        id: "file.export_docx_working",
        text: "Export DOCX (Working Draft: comments + footnotes)",
        action: () => handlers.onExportDocxWorking(),
      }),
      await MenuItem.new({
        id: "file.export_pdf",
        text: "Print or Save PDF...",
        action: () => handlers.onExportPdf(),
      }),
    ],
  });

  const fileMenu = await Submenu.new({
    text: "File",
    items: [
      await MenuItem.new({
        id: "file.new_document",
        text: "New Document",
        accelerator: "CmdOrCtrl+N",
        action: () => handlers.onNewDocument(),
      }),
      await MenuItem.new({
        id: "file.rename_document",
        text: "Rename This Document",
        action: () => handlers.onRenameDocument(),
      }),
      await MenuItem.new({
        id: "file.delete_document",
        text: "Delete This Document",
        action: () => handlers.onDeleteDocument(),
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      exportMenu,
    ],
  });

  const editMenu = await Submenu.new({
    text: "Edit",
    items: [
      await PredefinedMenuItem.new({ item: "Undo" }),
      await PredefinedMenuItem.new({ item: "Redo" }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await PredefinedMenuItem.new({ item: "Copy" }),
      await PredefinedMenuItem.new({ item: "Paste" }),
      await PredefinedMenuItem.new({ item: "SelectAll" }),
    ],
  });

  const themeMenu = await Submenu.new({
    text: "Theme",
    items: [
      await CheckMenuItem.new({
        id: "view.theme_system",
        text: "System",
        checked: state.themeMode === "system",
        action: () => handlers.onSetTheme("system"),
      }),
      await CheckMenuItem.new({
        id: "view.theme_light",
        text: "Light",
        checked: state.themeMode === "light",
        action: () => handlers.onSetTheme("light"),
      }),
      await CheckMenuItem.new({
        id: "view.theme_dark",
        text: "Dark",
        checked: state.themeMode === "dark",
        action: () => handlers.onSetTheme("dark"),
      }),
    ],
  });

  const viewMenu = await Submenu.new({
    text: "View",
    items: [
      await CheckMenuItem.new({
        id: "view.toggle_page_preview",
        text: "Show Page Preview",
        checked: state.pagePreview,
        action: () => handlers.onTogglePagePreview(),
      }),
      await CheckMenuItem.new({
        id: "view.toggle_right_pane",
        text: "Show Right Notes",
        checked: state.rightPaneVisible,
        action: () => handlers.onToggleRightPane(),
      }),
      await CheckMenuItem.new({
        id: "view.toggle_pointer_drag",
        text: "Enable Pointer Drag Reorder",
        checked: state.pointerBlockDragEnabled,
        action: () => handlers.onTogglePointerBlockDrag(),
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      themeMenu,
      await CheckMenuItem.new({
        id: "view.toggle_high_contrast",
        text: "High Contrast",
        checked: state.highContrast,
        action: () => handlers.onToggleHighContrast(),
      }),
    ],
  });

  const toolsMenu = await Submenu.new({
    text: "Tools",
    items: [
      await MenuItem.new({
        id: "tools.export_presets",
        text: "Manage Export Styles...",
        action: () => handlers.onOpenPresetManager(),
      }),
    ],
  });

  const menu = await Menu.new({ items: [fileMenu, editMenu, viewMenu, toolsMenu] });
  await menu.setAsAppMenu();
  return menu;
}
