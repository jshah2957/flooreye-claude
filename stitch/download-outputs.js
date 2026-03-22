/**
 * FloorEye x Google Stitch — Download Helper
 *
 * Reads metadata JSON files from stitch/output/ and downloads/re-downloads
 * the HTML and screenshot assets for each generated screen.
 *
 * Usage:
 *   node download-outputs.js                  # Download all
 *   node download-outputs.js --project web    # Download web only
 *   node download-outputs.js --screen login   # Download specific screen
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import https from "https";
import http from "http";

// ─── Env loading ──────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, ".env");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch {
  console.error("No .env file found. Set STITCH_API_KEY environment variable.");
  process.exit(1);
}

if (!process.env.STITCH_API_KEY) {
  console.error("STITCH_API_KEY is not set.");
  process.exit(1);
}

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}
const filterProject = getArg("project");
const filterScreen = getArg("screen");
const filterScreens = filterScreen ? filterScreen.split(",").map(s => s.trim()) : null;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const OUTPUT_DIR = resolve(__dirname, "output");

function downloadFile(url, dest) {
  return new Promise((ok, fail) => {
    const mod = url.startsWith("https") ? https : http;
    mod.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, dest).then(ok).catch(fail);
      }
      if (res.statusCode !== 200) {
        return fail(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        writeFileSync(dest, Buffer.concat(chunks));
        ok(dest);
      });
      res.on("error", fail);
    }).on("error", fail);
  });
}

function findMetadataFiles(baseDir) {
  const results = [];
  if (!existsSync(baseDir)) return results;

  for (const projectDir of readdirSync(baseDir)) {
    const projPath = join(baseDir, projectDir);
    if (!statSync(projPath).isDirectory()) continue;
    if (filterProject && projectDir !== filterProject) continue;

    for (const screenDir of readdirSync(projPath)) {
      const screenPath = join(projPath, screenDir);
      if (!statSync(screenPath).isDirectory()) continue;
      if (filterScreens && !filterScreens.includes(screenDir)) continue;

      const metaPath = join(screenPath, "metadata.json");
      if (existsSync(metaPath)) {
        results.push({ metaPath, screenPath, projectDir, screenDir });
      }
    }
  }
  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== FloorEye x Google Stitch — Download Helper ===\n");

  const { stitch } = await import("@google/stitch-sdk");

  const metaFiles = findMetadataFiles(OUTPUT_DIR);
  if (metaFiles.length === 0) {
    console.log("No metadata files found in stitch/output/.");
    console.log("Run 'node generate-ui.js' first to generate screens.");
    process.exit(0);
  }

  console.log(`Found ${metaFiles.length} screen(s) to download.\n`);

  // Group by project for efficient API usage
  const byProject = {};
  for (const mf of metaFiles) {
    const meta = JSON.parse(readFileSync(mf.metaPath, "utf-8"));
    if (!meta.projectId || !meta.screenId) {
      console.log(`  [SKIP] ${mf.projectDir}/${mf.screenDir} — missing projectId or screenId`);
      continue;
    }
    if (!byProject[meta.projectId]) byProject[meta.projectId] = [];
    byProject[meta.projectId].push({ ...mf, meta });
  }

  let downloaded = 0;
  let failed = 0;

  for (const [projectId, screens] of Object.entries(byProject)) {
    const project = stitch.project(projectId);

    for (const { meta, screenPath, projectDir, screenDir } of screens) {
      console.log(`[${projectDir}/${screenDir}] screenId=${meta.screenId}`);

      try {
        const screen = await project.getScreen(meta.screenId);

        // Download HTML
        try {
          const htmlUrl = await screen.getHtml();
          if (htmlUrl) {
            const htmlDest = resolve(screenPath, "screen.html");
            await downloadFile(htmlUrl, htmlDest);
            console.log(`  [OK] screen.html`);
          } else {
            console.log(`  [WARN] No HTML URL`);
          }
        } catch (e) {
          console.log(`  [ERR] HTML: ${e.message}`);
          failed++;
        }

        // Download screenshot
        try {
          const imgUrl = await screen.getImage();
          if (imgUrl) {
            const imgDest = resolve(screenPath, "screenshot.png");
            await downloadFile(imgUrl, imgDest);
            console.log(`  [OK] screenshot.png`);
          } else {
            console.log(`  [WARN] No screenshot URL`);
          }
        } catch (e) {
          console.log(`  [ERR] Screenshot: ${e.message}`);
          failed++;
        }

        downloaded++;
      } catch (e) {
        console.log(`  [ERR] Failed to get screen: ${e.message}`);
        failed++;
      }

      console.log();
    }
  }

  console.log(`\n=== Download complete: ${downloaded} succeeded, ${failed} failed ===`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
