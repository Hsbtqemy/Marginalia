import { createRoot } from "react-dom/client";
import "./theme/tokens.css";

function stringifyUnknownError(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return value.stack ?? value.message;
  }

  if (typeof value === "object" && value !== null) {
    const candidate = value as { stack?: unknown; message?: unknown };
    if (typeof candidate.stack === "string" && candidate.stack.length > 0) {
      return candidate.stack;
    }
    if (typeof candidate.message === "string" && candidate.message.length > 0) {
      return candidate.message;
    }
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getRootElement(): HTMLElement | null {
  return document.getElementById("root");
}

function renderBootError(message: string): void {
  const root = getRootElement();
  if (!root) {
    return;
  }

  const shell = document.createElement("div");
  shell.className = "app-shell";

  const fallback = document.createElement("div");
  fallback.className = "boot-fallback";

  const card = document.createElement("section");
  card.className = "boot-fallback-card";
  card.setAttribute("role", "alert");
  card.setAttribute("aria-live", "assertive");

  const title = document.createElement("h1");
  title.className = "boot-fallback-title";
  title.textContent = "Marginalia startup error";

  const copy = document.createElement("p");
  copy.className = "boot-fallback-copy";
  copy.textContent = "Marginalia could not finish opening its local workspace.";

  const details = document.createElement("pre");
  details.className = "boot-fallback-message";
  details.textContent = message;

  card.append(title, copy, details);
  fallback.append(card);
  shell.append(fallback);
  root.replaceChildren(shell);
}

window.addEventListener("error", (event) => {
  renderBootError(stringifyUnknownError(event.error ?? event.message ?? "Unknown startup error."));
});

window.addEventListener("unhandledrejection", (event) => {
  renderBootError(stringifyUnknownError(event.reason));
});

async function startApp(): Promise<void> {
  const root = getRootElement();
  if (!root) {
    throw new Error("Marginalia could not find its root element.");
  }

  const module = await import("./app/App");
  const App = module.default;

  createRoot(root).render(<App />);
}

void startApp().catch((error) => {
  renderBootError(stringifyUnknownError(error));
});
