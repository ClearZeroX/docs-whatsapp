// scratch preview builder: same as build.mjs but skips model-movement.js
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = join(dirname(fileURLToPath(import.meta.url)), "..");
const page = join(HERE, "src/page.html");
let html = readFileSync(page, "utf8");
html = html.replace(/<link rel="stylesheet" href="([^"]+)"\s*\/?>/, (m, href) => {
  return `<style>\n${readFileSync(join(HERE, href), "utf8")}\n</style>`;
});
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  if (src.includes("model-movement")) return "<!-- movement skipped for exterior preview -->";
  const code = readFileSync(join(HERE, src), "utf8").replace(/<\/script/gi, "<\\/script");
  return `<script>\n${code}\n</script>`;
});
writeFileSync(join(HERE, ".tmp/preview.html"), html);
console.log("wrote .tmp/preview.html");
