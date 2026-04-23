// ─────────────────────────────────────────────────────────────────────────────
// JALVIN config file parser
//
// Config format (key = value, # comments, blank lines ignored):
//
//   name = my-app
//   version = 1.0.0
//   rootDir = src
//   outDir = dist
//   jsx = true
//   emitTypes = false
// ─────────────────────────────────────────────────────────────────────────────

import * as fs from "node:fs";
import * as path from "node:path";

export interface JalvinConfig {
  name?: string;
  version?: string;
  rootDir: string;
  outDir: string;
  jsx: boolean;
  emitTypes: boolean;
}

const DEFAULTS: JalvinConfig = {
  rootDir: "src",
  outDir: "dist",
  jsx: false,
  emitTypes: false,
};

export async function loadConfig(projectRoot: string): Promise<JalvinConfig> {
  const configPath = path.join(projectRoot, "JALVIN");
  if (!fs.existsSync(configPath)) return { ...DEFAULTS };

  const raw = fs.readFileSync(configPath, "utf8");
  const config: JalvinConfig = { ...DEFAULTS };

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();

    switch (key) {
      case "name":      config.name = value; break;
      case "version":   config.version = value; break;
      case "rootDir":   config.rootDir = value; break;
      case "outDir":    config.outDir = value; break;
      case "jsx":       config.jsx = value === "true"; break;
      case "emitTypes": config.emitTypes = value === "true"; break;
    }
  }

  return config;
}
