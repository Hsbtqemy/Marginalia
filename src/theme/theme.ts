import type { ThemeMode } from "../state/useAppStore";

const DARK_QUERY = "(prefers-color-scheme: dark)";
const CONTRAST_QUERY = "(prefers-contrast: more)";

function getDarkQueryList(): MediaQueryList {
  return window.matchMedia(DARK_QUERY);
}

function getContrastQueryList(): MediaQueryList {
  return window.matchMedia(CONTRAST_QUERY);
}

export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "light") {
    return "light";
  }
  if (mode === "dark") {
    return "dark";
  }
  return getDarkQueryList().matches ? "dark" : "light";
}

export function applyTheme(options: { mode: ThemeMode; highContrast: boolean }): void {
  const root = document.documentElement;
  root.dataset.themeMode = options.mode;
  root.dataset.theme = resolveTheme(options.mode);
  const systemContrast = getContrastQueryList().matches;
  root.dataset.contrast = options.highContrast || systemContrast ? "more" : "normal";
}

export function subscribeToSystemTheme(onChange: () => void): () => void {
  const dark = getDarkQueryList();
  const contrast = getContrastQueryList();

  const handler = () => onChange();
  dark.addEventListener("change", handler);
  contrast.addEventListener("change", handler);

  return () => {
    dark.removeEventListener("change", handler);
    contrast.removeEventListener("change", handler);
  };
}
