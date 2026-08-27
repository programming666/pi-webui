// Postbuild: copy UI assets into dist/ so the compiled server can find them.
import { mkdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const srcUi = join(root, "src", "ui");
const distUi = join(root, "dist", "ui");
mkdirSync(distUi, { recursive: true });
for (const f of ["app.html", "app.css", "app.js"]) {
    copyFileSync(join(srcUi, f), join(distUi, f));
    console.log(`copied ${f}`);
}