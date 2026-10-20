// Copies only the public website files into dist/ for Cloudflare Pages.
// Server code in functions/ is bundled by Wrangler separately; secrets never go in dist/.
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
for (const f of readdirSync(".")) {
  if (f.endsWith(".html")) cpSync(f, "dist/" + f);
}
cpSync("assets", "dist/assets", { recursive: true });
cpSync("assets/img/favicon.svg", "dist/favicon.ico");
console.log("dist/ ready:", readdirSync("dist").join(", "));
