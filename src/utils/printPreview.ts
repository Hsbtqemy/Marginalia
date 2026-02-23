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

export function buildPrintPreviewHtml(options: {
  title: string;
  manuscriptHtml: string;
  preset: ExportPreset;
}): string {
  const { title, manuscriptHtml, preset } = options;
  const pageSize = preset.pageSize === "A4" ? "A4" : "Letter";
  const pageWidthMm = pageSize === "A4" ? 210 : 216;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
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
      <article class="print-page print-content">${manuscriptHtml}</article>
    </main>
  </body>
</html>`;
}
