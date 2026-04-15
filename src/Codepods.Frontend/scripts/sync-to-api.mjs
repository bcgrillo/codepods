import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, "..");
const distPath = path.join(frontendRoot, "dist");
const apiWwwroot = path.resolve(frontendRoot, "..", "Codepods.Api", "wwwroot");

if (!existsSync(distPath)) {
  console.error(`Frontend dist folder not found: ${distPath}. Run build first.`);
  process.exit(1);
}

mkdirSync(apiWwwroot, { recursive: true });
rmSync(apiWwwroot, { recursive: true, force: true });
mkdirSync(apiWwwroot, { recursive: true });
for (const entry of readdirSync(distPath, { withFileTypes: true })) {
  const source = path.join(distPath, entry.name);
  const target = path.join(apiWwwroot, entry.name);
  cpSync(source, target, { recursive: true });
}

console.log(`Frontend synced into ${apiWwwroot}`);
