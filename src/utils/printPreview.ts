import type { ExportPreset } from "../presets/presetSchema";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildFontStack(preset: ExportPreset): string {
  const family = [preset.fontFamily, ...preset.fontFallbacks].map((item) => {
    if (item.includes(" ")) {
      return `"${item}"`;
    }
    return item;
  });
  return family.join(", ");
}

const ALLOWED_TAGS = new Set([
  "a",
  "blockquote",
  "br",
  "em",
  "h1",
  "h2",
  "h3",
  "i",
  "li",
  "ol",
  "p",
  "strong",
  "u",
  "ul",
]);

function isSafeHref(value: string): boolean {
  if (value.startsWith("#") || value.startsWith("/")) {
    return true;
  }

  try {
    const url = new URL(value, "https://marginalia.local");
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

function sanitizeNode(node: Node, document: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(node.textContent ?? "");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const element = node as HTMLElement;
  const tagName = element.tagName.toLowerCase();

  if (!ALLOWED_TAGS.has(tagName)) {
    const fragment = document.createDocumentFragment();
    for (const child of [...element.childNodes]) {
      const sanitizedChild = sanitizeNode(child, document);
      if (sanitizedChild) {
        fragment.appendChild(sanitizedChild);
      }
    }
    return fragment;
  }

  const clean = document.createElement(tagName);

  if (tagName === "a") {
    const href = element.getAttribute("href");
    if (href && isSafeHref(href)) {
      clean.setAttribute("href", href);
      clean.setAttribute("rel", "noreferrer noopener");
      clean.setAttribute("target", "_blank");
    }
  }

  for (const child of [...element.childNodes]) {
    const sanitizedChild = sanitizeNode(child, document);
    if (sanitizedChild) {
      clean.appendChild(sanitizedChild);
    }
  }

  return clean;
}

export function sanitizePrintPreviewHtmlFragment(html: string): string {
  if (typeof DOMParser === "undefined" || typeof document === "undefined") {
    return escapeHtml(html);
  }

  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, "text/html");
  const container = document.createElement("div");

  for (const child of [...parsed.body.childNodes]) {
    const sanitizedChild = sanitizeNode(child, document);
    if (sanitizedChild) {
      container.appendChild(sanitizedChild);
    }
  }

  return container.innerHTML;
}

export function buildPrintPreviewHtml(options: {
  title: string;
  manuscriptHtml: string;
  preset: ExportPreset;
}): string {
  const { title, manuscriptHtml, preset } = options;
  const safeManuscriptHtml = sanitizePrintPreviewHtmlFragment(manuscriptHtml);
  const pageSize = preset.pageSize === "A4" ? "A4" : "Letter";
  const pageWidthMm = pageSize === "A4" ? 210 : 216;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; navigate-to https: http: mailto:;" />
    <style>
      :root {
        --preview-font-family: ${buildFontStack(preset)};
        --preview-font-size-pt: ${preset.fontSizePt};
        --preview-line-height: ${preset.lineHeight};
        --preview-paragraph-before-pt: ${preset.paragraphSpacingBeforePt};
        --preview-paragraph-after-pt: ${preset.paragraphSpacingAfterPt};
        --preview-margin-top-mm: ${preset.marginTopMm};
        --preview-margin-right-mm: ${preset.marginRightMm};
        --preview-margin-bottom-mm: ${preset.marginBottomMm};
        --preview-margin-left-mm: ${preset.marginLeftMm};
        --preview-h1-scale: ${preset.headingScale.h1};
        --preview-h2-scale: ${preset.headingScale.h2};
        --preview-h3-scale: ${preset.headingScale.h3};
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        padding: 0;
        font-family: var(--preview-font-family);
        font-size: calc(var(--preview-font-size-pt) * 1pt);
        line-height: var(--preview-line-height);
      }

      .print-root {
        max-width: calc(${pageWidthMm}mm + 2 * 16mm);
        margin: 0 auto;
        padding: 16mm;
      }

      .print-page {
        width: 100%;
        min-height: 250mm;
        padding-top: calc(var(--preview-margin-top-mm) * 1mm);
        padding-right: calc(var(--preview-margin-right-mm) * 1mm);
        padding-bottom: calc(var(--preview-margin-bottom-mm) * 1mm);
        padding-left: calc(var(--preview-margin-left-mm) * 1mm);
      }

      .print-content p,
      .print-content li,
      .print-content blockquote,
      .print-content h1,
      .print-content h2,
      .print-content h3 {
        margin-top: calc(var(--preview-paragraph-before-pt) * 1pt);
        margin-bottom: calc(var(--preview-paragraph-after-pt) * 1pt);
      }

      .print-content h1 {
        font-size: calc(var(--preview-font-size-pt) * var(--preview-h1-scale) * 1pt);
      }

      .print-content h2 {
        font-size: calc(var(--preview-font-size-pt) * var(--preview-h2-scale) * 1pt);
      }

      .print-content h3 {
        font-size: calc(var(--preview-font-size-pt) * var(--preview-h3-scale) * 1pt);
      }

      @page {
        size: ${pageSize};
        margin-top: calc(var(--preview-margin-top-mm) * 1mm);
        margin-right: calc(var(--preview-margin-right-mm) * 1mm);
        margin-bottom: calc(var(--preview-margin-bottom-mm) * 1mm);
        margin-left: calc(var(--preview-margin-left-mm) * 1mm);
      }

      @media print {
        body {
          margin: 0;
        }

        .print-root {
          max-width: none;
          margin: 0;
          padding: 0;
        }

        .print-page {
          min-height: auto;
          padding: 0;
        }
      }
    </style>
  </head>
  <body>
    <main class="print-root">
      <article class="print-page print-content">${safeManuscriptHtml}</article>
    </main>
  </body>
</html>`;
}
