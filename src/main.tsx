import { createRoot } from "react-dom/client";
import App from "./app/App";
import "./theme/tokens.css";

function renderBootError(message: string): void {
  const root = document.getElementById("root");
  if (!root) {
    return;
  }
  root.innerHTML = `
    <div style="padding:16px;font-family:Segoe UI,Arial,sans-serif;background:#1f1f1f;color:#f3f3f3;min-height:100vh">
      <h2 style="margin:0 0 12px">Marginalia startup error</h2>
      <pre style="white-space:pre-wrap;word-break:break-word;background:#2b2b2b;border:1px solid #444;padding:12px;border-radius:8px">${message}</pre>
    </div>
  `;
}

window.addEventListener("error", (event) => {
  renderBootError(event.error?.stack ?? event.message ?? "Unknown startup error.");
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const message =
    typeof reason === "string"
      ? reason
      : reason?.stack ?? reason?.message ?? JSON.stringify(reason, null, 2);
  renderBootError(message);
});

try {
  createRoot(document.getElementById("root") as HTMLElement).render(
    <App />,
  );
} catch (error) {
  renderBootError(error instanceof Error ? error.stack ?? error.message : String(error));
}
