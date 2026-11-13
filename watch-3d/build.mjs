// Bundles src/page.html plus its CSS and every <script src> into one
// self-contained index.html: no external requests at all.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const page = join(HERE, "src/page.html");

let html = readFileSync(page, "utf8");

html = html.replace(/<link rel="stylesheet" href="([^"]+)"\s*\/?>/, (match, href) => {
  const css = readFileSync(join(HERE, href), "utf8");
  return `<style>\n${css}\n</style>`;
});

let inlined = 0;
html = html.replace(/<script src="([^"]+)"><\/script>/g, (match, src) => {
  const code = readFileSync(join(HERE, src), "utf8").replace(/<\/script/gi, "<\\/script");
  inlined += 1;
  return `<script>\n${code}\n</script>`;
});

writeFileSync(join(HERE, "index.html"), html);
console.log(`wrote index.html  ${(html.length / 1024).toFixed(0)} KB  (${inlined} scripts inlined)`);
