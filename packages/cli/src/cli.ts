#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// jalvin CLI — entry point
//
// Commands:
//   jalvin build [files]    — compile .jalvin → .ts/.tsx
//   jalvin check [files]    — type-check without emitting
//   jalvin run <file>       — compile + run as Node.js (via ts-node/tsx)
//   jalvin init [dir]       — scaffold a new Jalvin project
//   jalvin version          — print version
// ─────────────────────────────────────────────────────────────────────────────

import * as fs from "node:fs";
import * as path from "node:path";
import { compile } from "@jalvin/compiler";
import { loadConfig } from "./config.js";

const JALVIN_EXT = ".jalvin";
const VERSION = "1.0.0";

function usage(): void {
  console.log(`
jalvin — the Jalvin language compiler & toolchain
version ${VERSION}

Usage:
  jalvin build [--out <dir>] [<files|dirs>]   Compile .jalvin  → TypeScript
  jalvin check [<files|dirs>]                 Type-check without emitting
  jalvin run   <file> [-- args...]            Compile + execute (requires tsx)
  jalvin init  [<dir>]                        Create new project scaffold
  jalvin version                              Print version

Flags:
  --out, -o <dir>    Output directory (default: as per JALVIN config or ./dist)
  --emit-types       Include TS type annotations in output
  --verbose, -v      Show all diagnostics
  --no-color         Disable ANSI color output

Config:
  Place a 'JALVIN' file (no extension) at your project root to configure the
  compiler. Example:

    outDir = dist
    rootDir = src
    jsx = true
    emitTypes = false
`);
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  command: string;
  files: string[];
  outDir: string | null;
  emitTypes: boolean;
  verbose: boolean;
  color: boolean;
  passthrough: string[];
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    command: "help",
    files: [],
    outDir: null,
    emitTypes: false,
    verbose: false,
    color: true,
    passthrough: [],
  };

  const raw = argv.slice(2); // strip node + script path
  let i = 0;
  let pastDoubleDash = false;

  const commands = new Set(["build", "check", "run", "init", "version", "help"]);

  for (; i < raw.length; i++) {
    const arg = raw[i]!;
    if (arg === "--") { pastDoubleDash = true; i++; break; }
    if (pastDoubleDash) { args.passthrough.push(arg); continue; }

    if (commands.has(arg) && args.command === "help") {
      args.command = arg;
    } else if (arg === "--out" || arg === "-o") {
      args.outDir = raw[++i] ?? null;
    } else if (arg === "--emit-types") {
      args.emitTypes = true;
    } else if (arg === "--verbose" || arg === "-v") {
      args.verbose = true;
    } else if (arg === "--no-color") {
      args.color = false;
    } else if (!arg.startsWith("--")) {
      args.files.push(arg);
    }
  }

  for (; i < raw.length; i++) {
    args.passthrough.push(raw[i]!);
  }

  return args;
}

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------

function collectJalvinFiles(inputs: string[]): string[] {
  const results: string[] = [];
  for (const input of inputs) {
    const stat = fs.statSync(input, { throwIfNoEntry: false });
    if (!stat) {
      console.error(`error: '${input}' not found`);
      process.exit(1);
    }
    if (stat.isDirectory()) {
      const walk = (dir: string): void => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.name.endsWith(JALVIN_EXT)) results.push(full);
        }
      };
      walk(input);
    } else if (input.endsWith(JALVIN_EXT)) {
      results.push(input);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  gray: "\x1b[90m",
};

function colorize(color: boolean, code: string, text: string): string {
  return color ? `${code}${text}${C.reset}` : text;
}

// ---------------------------------------------------------------------------
// Build command
// ---------------------------------------------------------------------------

async function runBuild(args: CliArgs): Promise<void> {
  const config = await loadConfig(process.cwd());
  const outDir = args.outDir ?? config.outDir ?? "dist";
  const inputGlobs = args.files.length > 0 ? args.files : [config.rootDir ?? "src"];

  const files = collectJalvinFiles(inputGlobs);
  if (files.length === 0) {
    console.warn("No .jalvin files found.");
    return;
  }

  let errors = 0;
  let warnings = 0;

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const result = compile(source, file, {
      emitTypes: args.emitTypes || config.emitTypes,
    });

    for (const diag of result.diagnostics) {
      const sev = diag.severity;
      if (sev === "error") errors++;
      if (sev === "warning") warnings++;
      if (sev === "error" || args.verbose) {
        const color = sev === "error" ? C.red : C.yellow;
        const loc = diag.span
          ? `${colorize(args.color, C.gray, `${file}:${diag.span.startLine + 1}:${diag.span.startCol + 1}`)}: `
          : `${colorize(args.color, C.gray, file)}: `;
        console.log(`${loc}${colorize(args.color, color, sev)}: ${diag.message} ${colorize(args.color, C.gray, `[${diag.code}]`)}`);
      }
    }

    if (!result.ok) continue;

    const ext = result.isJsx ? ".tsx" : ".ts";
    const relative = path.relative(config.rootDir ?? "src", file).replace(JALVIN_EXT, ext);
    const outFile = path.join(outDir, relative);

    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, result.code, "utf8");

    if (args.verbose) {
      console.log(`${colorize(args.color, C.green, "compiled")} ${file} → ${outFile}`);
    }
  }

  const icon = errors > 0 ? colorize(args.color, C.red, "✗") : colorize(args.color, C.green, "✓");
  const eSummary = errors > 0 ? colorize(args.color, C.red, `${errors} error${errors !== 1 ? "s" : ""}`) : colorize(args.color, C.green, "0 errors");
  const wSummary = warnings > 0 ? colorize(args.color, C.yellow, `${warnings} warning${warnings !== 1 ? "s" : ""}`) : "0 warnings";
  console.log(`\n${icon}  Build complete — ${eSummary}, ${wSummary}  (${files.length} file${files.length !== 1 ? "s" : ""})`);
  if (errors > 0) process.exit(1);
}

// ---------------------------------------------------------------------------
// Check command
// ---------------------------------------------------------------------------

async function runCheck(args: CliArgs): Promise<void> {
  const config = await loadConfig(process.cwd());
  const inputGlobs = args.files.length > 0 ? args.files : [config.rootDir ?? "src"];
  const files = collectJalvinFiles(inputGlobs);

  if (files.length === 0) {
    console.warn("No .jalvin files found.");
    return;
  }

  let errors = 0;
  let warnings = 0;

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const result = compile(source, file);
    for (const diag of result.diagnostics) {
      if (diag.severity === "error") errors++;
      if (diag.severity === "warning") warnings++;
      const color = diag.severity === "error" ? C.red : C.yellow;
      const loc = diag.span
        ? `${file}:${diag.span.startLine + 1}:${diag.span.startCol + 1}: `
        : `${file}: `;
      console.log(`${colorize(args.color, C.gray, loc)}${colorize(args.color, color, diag.severity)}: ${diag.message} [${diag.code}]`);
    }
  }

  const icon = errors > 0 ? "✗" : "✓";
  console.log(`\n${icon}  ${files.length} file${files.length !== 1 ? "s" : ""} checked — ${errors} error${errors !== 1 ? "s" : ""}, ${warnings} warning${warnings !== 1 ? "s" : ""}`);
  if (errors > 0) process.exit(1);
}

// ---------------------------------------------------------------------------
// Run command
// ---------------------------------------------------------------------------

async function runFile(args: CliArgs): Promise<void> {
  const file = args.files[0];
  if (!file) {
    console.error("error: specify a .jalvin file to run\n  jalvin run <file>");
    process.exit(1);
  }

  const source = fs.readFileSync(file, "utf8");
  const result = compile(source, file);

  if (!result.ok) {
    for (const diag of result.diagnostics) {
      if (diag.severity === "error") {
        console.error(`error: ${diag.message} [${diag.code}] at ${file}:${diag.span ? diag.span.startLine + 1 : "?"}`);
      }
    }
    process.exit(1);
  }

  const tmpDir = fs.mkdtempSync(path.join(process.env["TMPDIR"] ?? "/tmp", "jalvin-"));
  const tmpFile = path.join(tmpDir, path.basename(file).replace(JALVIN_EXT, result.isJsx ? ".tsx" : ".ts"));
  fs.writeFileSync(tmpFile, result.code, "utf8");

  // Use tsx (fast TS runner) if available, fall back to ts-node
  const runner = await findRunner();
  if (!runner) {
    console.error("error: Cannot run Jalvin files — install 'tsx' or 'ts-node':\n  npm install -g tsx");
    process.exit(1);
  }

  const { spawnSync } = await import("node:child_process");
  const res = spawnSync(runner, [tmpFile, ...args.passthrough], { stdio: "inherit" });
  fs.rmSync(tmpDir, { recursive: true, force: true });
  process.exit(res.status ?? 0);
}

async function findRunner(): Promise<string | null> {
  const { execFileSync } = await import("node:child_process");
  for (const bin of ["tsx", "ts-node"]) {
    try {
      execFileSync("which", [bin], { stdio: "ignore" });
      return bin;
    } catch { /* not found */ }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Init command
// ---------------------------------------------------------------------------

async function runInit(args: CliArgs): Promise<void> {
  const dir = args.files[0] ?? ".";
  const projectName = path.basename(path.resolve(dir));

  fs.mkdirSync(path.join(dir, "src"), { recursive: true });

  // JALVIN config
  const jalvinConfig = `# Jalvin project configuration
name = ${projectName}
version = 1.0.0

rootDir = src
outDir = dist

# Uncomment to enable JSX / React
# jsx = true

# Enable TypeScript type annotations in emitted code
emitTypes = false
`;
  writeUnlessExists(path.join(dir, "JALVIN"), jalvinConfig);

  // package.json
  const pkgJson = `{
  "name": "${projectName}",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "jalvin build",
    "check": "jalvin check",
    "dev":   "jalvin build --watch"
  },
  "dependencies": {
    "@jalvin/runtime": "^1.0.0"
  },
  "devDependencies": {
    "@jalvin/cli": "^1.0.0"
  }
}
`;
  writeUnlessExists(path.join(dir, "package.json"), pkgJson);

  // Entry file
  const mainJalvin = `// ${projectName} — main entry point
import @jalvin/runtime.*

fun main() {
    println("Hello from ${projectName}!")

    val greeting = buildGreeting("World")
    println(greeting)
}

fun buildGreeting(name: String): String {
    return "Hello, $name! Welcome to Jalvin."
}
`;
  writeUnlessExists(path.join(dir, "src", "main.jalvin"), mainJalvin);

  // .gitignore
  const gitignore = `node_modules/
dist/
.jalvin-cache/
*.js.map
`;
  writeUnlessExists(path.join(dir, ".gitignore"), gitignore);

  console.log(`
✓ Created new Jalvin project: ${projectName}/
  src/main.jalvin   — your first Jalvin source file
  JALVIN            — project configuration
  package.json      — npm manifest

Next steps:
  cd ${dir}
  npm install
  jalvin build
  jalvin run src/main.jalvin
`);
}

function writeUnlessExists(filePath: string, content: string): void {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf8");
  }
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  switch (args.command) {
    case "build":   await runBuild(args); break;
    case "check":   await runCheck(args); break;
    case "run":     await runFile(args); break;
    case "init":    await runInit(args); break;
    case "version": console.log(`jalvin ${VERSION}`); break;
    default:        usage(); break;
  }
}

main().catch((e: unknown) => {
  console.error("fatal:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
