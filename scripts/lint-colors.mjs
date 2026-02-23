import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT_DIR = path.resolve("src");
const TOKENS_FILE = path.resolve("src/theme/tokens.css");

const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".html",
]);

const CSS_EXTENSIONS = new Set([".css", ".scss", ".sass", ".less"]);

const COLOR_PATTERNS = [
  { type: "hex", regex: /#[0-9A-Fa-f]{3,8}\b/g },
  { type: "rgb", regex: /\brgba?\s*\(/gi },
  { type: "hsl", regex: /\bhsla?\s*\(/gi },
  { type: "oklch", regex: /\boklch\s*\(/gi },
];

async function collectFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
      continue;
    }
    files.push(fullPath);
  }

  return files;
}

function shouldScan(filePath) {
  if (path.resolve(filePath) === TOKENS_FILE) {
    return false;
  }
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function findLineMatches(line, filePath) {
  const matches = [];

  for (const { type, regex } of COLOR_PATTERNS) {
    for (const match of line.matchAll(regex)) {
      const start = match.index ?? 0;
      if (type === "hex" && start > 0 && line[start - 1] === "&") {
        continue;
      }
      matches.push(type);
      break;
    }
  }

  if (CSS_EXTENSIONS.has(path.extname(filePath).toLowerCase()) && /\bcolor\s*:/i.test(line)) {
    matches.push("color-property");
  }

  return matches;
}

function formatFinding(filePath, lineNumber, lineText, kinds) {
  const relativePath = path.relative(process.cwd(), filePath);
  return `${relativePath}:${lineNumber}: ${kinds.join(", ")} -> ${lineText.trim()}`;
}

async function main() {
  const findings = [];
  const files = await collectFiles(ROOT_DIR);

  for (const filePath of files) {
    if (!shouldScan(filePath)) {
      continue;
    }

    let content;
    try {
      content = await fs.readFile(filePath, "utf8");
    } catch {
      continue;
    }

    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const matches = findLineMatches(line, filePath);
      if (matches.length > 0) {
        findings.push(formatFinding(filePath, index + 1, line, matches));
      }
    }
  }

  if (findings.length > 0) {
    console.error("Hardcoded color literals found outside src/theme/tokens.css:");
    for (const finding of findings) {
      console.error(finding);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("lint:colors failed:", error);
  process.exit(1);
});
