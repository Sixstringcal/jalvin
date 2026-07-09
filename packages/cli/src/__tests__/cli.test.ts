import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { runBuild } from "../cli.js";
import * as fs from "node:fs";
import * as path from "node:path";

// Mock vite build
const mockViteBuild = vi.fn();
vi.mock("vite", () => ({
  build: (...args: any[]) => mockViteBuild(...args)
}));

// Mock compiler
const mockCompile = vi.fn().mockReturnValue({
  ok: true,
  code: "console.log('compiled');",
  diagnostics: { items: [] }
});
vi.mock("@jalvin/compiler", () => ({
  compile: (...args: any[]) => mockCompile(...args)
}));

describe("jalvin build CLI command", () => {
  let originalCwd: string;
  let tempDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(originalCwd, "temp-test-"));
    process.chdir(tempDir);
    mockViteBuild.mockClear();
    mockCompile.mockClear();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("builds UI project using Vite when entryFile and entryComponent are present", async () => {
    // Write a UI configuration
    fs.writeFileSync("JALVIN", `
entryFile = src/main.jalvin
entryComponent = App
title = Test App
`);

    // Mock local plugin resolution to not throw error by creating a dummy file
    fs.mkdirSync("node_modules/@jalvin/vite-plugin/dist", { recursive: true });
    fs.writeFileSync("node_modules/@jalvin/vite-plugin/dist/index.js", "export const jalvin = () => ({ name: 'mock-plugin' });");

    await runBuild({
      command: "build",
      files: [],
      outDir: null,
      emitTypes: false,
      verbose: false,
      color: false,
      passthrough: []
    });

    // Check that vite.build was called
    expect(mockViteBuild).toHaveBeenCalledTimes(1);
    const call = mockViteBuild.mock.calls[0];
    expect(call).toBeDefined();
    const buildArgs = call![0];
    expect(buildArgs.root).toBe(tempDir);
    expect(buildArgs.build.outDir).toBe("dist"); // default outDir
    
    // Check that standard compilation was NOT called
    expect(mockCompile).not.toHaveBeenCalled();
  });

  it("falls back to standard compilation for library projects", async () => {
    // Write a Library configuration (no entryFile/entryComponent)
    fs.writeFileSync("JALVIN", `
rootDir = src
outDir = dist
`);

    // Create a dummy .jalvin file
    fs.mkdirSync("src", { recursive: true });
    fs.writeFileSync("src/lib.jalvin", "fun hello() {}");

    await runBuild({
      command: "build",
      files: [],
      outDir: null,
      emitTypes: false,
      verbose: false,
      color: false,
      passthrough: []
    });

    // Check that vite.build was NOT called
    expect(mockViteBuild).not.toHaveBeenCalled();

    // Check that standard compilation was called
    expect(mockCompile).toHaveBeenCalledTimes(1);
    expect(fs.existsSync("dist/lib.ts")).toBe(true);
    expect(fs.readFileSync("dist/lib.ts", "utf8")).toBe("console.log('compiled');");
  });
});
