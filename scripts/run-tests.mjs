import { readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

async function collectTests(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTests(fullPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

const root = path.resolve("src");
const testFiles = await collectTests(root);

if (testFiles.length === 0) {
  console.error("No test files were found under src/.");
  process.exit(1);
}

const tsxBin = path.resolve("node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");

const child = spawn(tsxBin, ["--test", ...testFiles], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
