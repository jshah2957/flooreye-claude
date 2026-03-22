/**
 * FloorEye × Google Stitch — Connection Test
 * Tests API key authentication and lists available projects/tools.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Load .env manually (no dotenv dependency)
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

// Verify key is set
if (!process.env.STITCH_API_KEY) {
  console.error("STITCH_API_KEY is not set in .env or environment.");
  process.exit(1);
}

console.log("=== FloorEye × Google Stitch Connection Test ===\n");
console.log(`API Key: ${process.env.STITCH_API_KEY.slice(0, 8)}...${process.env.STITCH_API_KEY.slice(-4)}`);

// Import and test Stitch SDK
const { stitch } = await import("@google/stitch-sdk");

console.log("\n[1] Testing connection — listing projects...");
try {
  const projects = await stitch.projects();
  console.log(`  ✓ Connected! Found ${projects.length} existing project(s).`);
  for (const p of projects) {
    console.log(`    - Project: ${p.projectId}`);
    const screens = await p.screens();
    console.log(`      Screens: ${screens.length}`);
  }
} catch (err) {
  console.error(`  ✗ Failed to list projects: ${err.message}`);
}

console.log("\n[2] Testing tools — listing available MCP tools...");
try {
  const { tools } = await stitch.listTools();
  console.log(`  ✓ Found ${tools.length} available tool(s):`);
  for (const tool of tools) {
    console.log(`    - ${tool.name}: ${tool.description?.slice(0, 80) || "(no description)"}`);
  }
} catch (err) {
  console.error(`  ✗ Failed to list tools: ${err.message}`);
}

console.log("\n[3] Testing generation — creating a test project...");
try {
  const result = await stitch.callTool("create_project", { title: "FloorEye UI Designs" });
  console.log(`  ✓ Project created!`);
  console.log(`    Project ID: ${JSON.stringify(result)}`);
} catch (err) {
  console.error(`  ✗ Failed to create project: ${err.message}`);
}

console.log("\n=== Connection test complete ===");
process.exit(0);
