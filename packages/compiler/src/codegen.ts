// ─────────────────────────────────────────────────────────────────────────────
// Jalvin Code Generator — AST → TypeScript
//
// Design principles:
//   • component declarations  → Functional components (standard TS)
//   • data class              → class with auto-generated copy(), equals(), toString()
//   • sealed class            → TypeScript discriminated union + base class
//   • extension functions     → module-level functions with receiver as first param,
//                               augmented onto the prototype via declaration merging
//   • launch {}               → void-returning async IIFE  (fire-and-forget)
//   • async {}                → Promise<T>-returning async IIFE
//   • suspend fun             → async function
//   • Bibi(...)               → runtime Bibi() helper (HTTP client)
//   • StateFlow / ViewModel   → @jalvin/runtime types
// ─────────────────────────────────────────────────────────────────────────────

import * as fs from "node:fs";
import * as nodePath from "node:path";
import * as AST from "./ast.js";
import { JType } from "./typechecker.js";
import { DiagnosticBag } from "./diagnostics.js";
import { lex } from "./lexer.js";
import { parse } from "./parser.js";



// ---------------------------------------------------------------------------
// Code writer — thin abstraction over string concatenation that tracks
// indentation and emits source-map line hints.
// ---------------------------------------------------------------------------

class Writer {
  private buf = "";
  private indent = 0;
  private readonly INDENT = "  ";
  /** line mapping: output line → input line (1-based) */
  readonly lineMap: Array<number> = [];
  private currentLine = 1;

  write(text: string): void {
    this.buf += text;
  }

  writeLine(text = ""): void {
    this.buf += text + "\n";
    this.lineMap.push(this.currentLine);
    this.currentLine++;
  }

  writeIndented(text: string): void {
    this.buf += this.INDENT.repeat(this.indent) + text;
  }

  writeIndentedLine(text = ""): void {
    this.buf += this.INDENT.repeat(this.indent) + text + "\n";
    this.lineMap.push(this.currentLine);
    this.currentLine++;
  }

  pushIndent(): void { this.indent++; }
  popIndent(): void { this.indent = Math.max(0, this.indent - 1); }

  get output(): string { return this.buf; }

  setSourceLine(line: number): void { this.currentLine = line + 1; }
}

// ---------------------------------------------------------------------------
// Code generator
// ---------------------------------------------------------------------------

export interface CodegenOptions {
  /** Target module format */
  readonly module: "esm" | "cjs";
  /** Emit type annotations in output (verbose but useful for debugging) */
  readonly emitTypes: boolean;
  /** Path to import from for the Jalvin runtime */
  readonly runtimeImport: string;
  /**
   * Project root directory used to resolve local import paths.
   * When set, the emitter checks whether the preceding path segments of a
   * local import (e.g. `src/models/css`) resolve to an existing file before
   * deciding whether to append the symbol name to the module specifier.
   * Defaults to `process.cwd()` at emit time when not provided.
   */
  readonly sourceRoot?: string;
}

export const DEFAULT_CODEGEN_OPTIONS: CodegenOptions = {
  module: "esm",
  emitTypes: false,
  runtimeImport: "@jalvin/runtime",
};

export interface CodegenResult {
  readonly code: string;
  readonly lineMap: number[];
  /** True if the program contains component declarations or UI imports. */
  readonly hasComponents: boolean;
}

export class CodeGenerator {
  private readonly w = new Writer();
  private readonly opts: CodegenOptions;
  private hasComponents = false;
  private runtimeSymbolsNeeded = new Set<string>();
  /** Names of true Jalvin components — used to detect functional calls */
  private userComponentNames = new Set<string>();
  /** Names of all potential components (including UI primitives) — used to detect props-object calls */
  private allComponentLikeNames = new Set<string>();
  /**
   * Param names for components resolved from imported local .jalvin files.
   * Maps component name → ordered list of param names.
   */
  private componentParamNames = new Map<string, string[]>();
  /** True when the program contains `import @jalvin/ui.*` — used to detect UI primitive calls */
  private hasUiStarImport = false;
  /** Names of symbols explicitly imported from @jalvin/ui */
  private uiNamedImports = new Set<string>();
  /** Operator overload resolutions from the type checker */
  private operatorOverloadMap = new Map<AST.BinaryExpr, string>();
  /** Type map from the type checker */
  private typeMap = new Map<object, JType>();
  /**
   * Registry of extension functions declared on primitive receiver types.
   * Maps receiverTypeName → Map<methodName, generatedFnName>
   * Populated during top-level emit; used at call sites for rewriting.
   */
  private primitiveExtensions = new Map<string, Map<string, string>>();
  /**
   * When a scoped star import exists (e.g. import @jalvin/runtime.*), contains the
   * set of external symbol names to emit as named imports from that package instead
   * of a namespace import. Empty if namespace-import behavior is used.
   */
  private externalStarCandidates = new Set<string>();
  /** Module specifiers whose symbols are already covered by a named star-import expansion. */
  private handledStarImportModules = new Set<string>();
  /**
   * Exported symbol names from local .jalvin files imported via wildcard (import src.module.*).
   * Maps module specifier (e.g. "src/views") → sorted list of exported names.
   */
  private localStarExports = new Map<string, string[]>();
  private isInClass = false;

  constructor(opts: Partial<CodegenOptions> = {}) {
    this.opts = { ...DEFAULT_CODEGEN_OPTIONS, ...opts };
  }

  generate(
    program: AST.Program,
    operatorOverloads?: Map<AST.BinaryExpr, string>,
    typeMap?: Map<object, JType>
  ): CodegenResult {
    if (operatorOverloads) this.operatorOverloadMap = operatorOverloads;
    if (typeMap) this.typeMap = typeMap;

    // Pre-scan for components (local declarations OR @jalvin/ui imports)
    this.hasComponents = program.declarations.some(
      (d) => d.kind === "ComponentDecl" ||
        (d.kind === "ClassDecl" && d.body?.members.some((m) => m.kind === "ComponentDecl"))
    ) || program.imports.some((imp) => imp.path[0] === "@jalvin" && imp.path[1] === "ui")
      || this.containsJsx(program);

    // Collect component names for component call detection
    this.userComponentNames = new Set<string>();
    this.allComponentLikeNames = new Set<string>();
    this.componentParamNames = new Map<string, string[]>();

    for (const decl of program.declarations) {
      if (decl.kind === "ComponentDecl") {
        this.userComponentNames.add(decl.name);
        this.allComponentLikeNames.add(decl.name);
        this.componentParamNames.set(decl.name, decl.params.map((p) => p.name));
      }
      if (decl.kind === "ClassDecl" && decl.body) {
        for (const m of decl.body.members) {
          if (m.kind === "ComponentDecl") {
            this.userComponentNames.add(m.name);
            this.allComponentLikeNames.add(m.name);
            this.componentParamNames.set(m.name, m.params.map((p) => p.name));
          }
        }
      }
    }

    this.hasUiStarImport = false;
    this.uiNamedImports = new Set<string>();
    for (const imp of program.imports) {
      if (imp.path[0] === "@jalvin" && imp.path[1] === "ui") {
        if (imp.star) {
          this.hasUiStarImport = true;
        } else {
          const name = imp.path[imp.path.length - 1]!;
          this.uiNamedImports.add(name);
          this.allComponentLikeNames.add(name);
        }
      }
    }

    // Resolve component fun symbols from locally imported .jalvin files
    const sourceRoot = this.opts.sourceRoot ?? process.cwd();
    this.resolveLocalComponentImports(program, sourceRoot);
    // Detect props-object calling convention from .d.ts for external @jalvin/* packages
    this.resolveExternalPackageImports(program, sourceRoot);

    // Pre-compute external star-import candidates (before emitting anything)
    this.externalStarCandidates = new Set<string>();
    this.handledStarImportModules = new Set<string>();
    const scopedStarImports = program.imports.filter(
      (imp) => imp.star && imp.path[0]!.startsWith("@")
    );
    if (scopedStarImports.length === 1) {
      // Only resolve when there's exactly one scoped star import — with multiple
      // star imports we can't safely split external names across packages.
      const referencedNames = this.gatherReferencedNames(program);
      const localBindings = this.gatherAllLocalBindings(program);
      for (const name of referencedNames) {
        if (!localBindings.has(name) && !JS_GLOBAL_NAMES.has(name)) {
          this.externalStarCandidates.add(name);
        }
      }
    }

    // Emit header
    this.emitHeader(program);

    // Declarations
    for (const decl of program.declarations) {
      this.emitTopLevelDecl(decl);
      this.w.writeLine();
    }

    // Patch in runtime import if needed
    const preamble = this.buildPreamble();
    const code = preamble + this.w.output;

    return {
      code,
      lineMap: this.w.lineMap,
      hasComponents: this.hasComponents,
    };
  }

  /** Walk AST to see if it contains any JsxElement nodes */
  private containsJsx(program: AST.Program): boolean {
    let found = false;
    const walk = (val: unknown): void => {
      if (found || !val || typeof val !== "object") return;
      if (Array.isArray(val)) {
        for (const item of val) walk(item);
        return;
      }
      const obj = val as Record<string, unknown>;
      if (obj["kind"] === "JsxElement") {
        found = true;
        return;
      }
      for (const propVal of Object.values(obj)) {
        walk(propVal);
      }
    };
    for (const decl of program.declarations) walk(decl);
    return found;
  }

  // ── Preamble & imports ─────────────────────────────────────────────────────

  private buildPreamble(): string {
    const lines: string[] = [];
    lines.push("// ─────────────────────────────────────────────────────────────────────────────");
    lines.push("// JALVIN COMPILER V5 - PURE VANILLA - NO REACT ALLOWED");
    lines.push(`// BUILD ID: ${Date.now()}`);
    lines.push("// ─────────────────────────────────────────────────────────────────────────────");

    if (this.hasComponents) {
      this.runtimeSymbolsNeeded.add("jalvinCreateElement");
    }

    // Emit compiler-injected runtime symbols, but only those NOT already covered
    // by a star-import's named-import expansion (to avoid duplicate imports).
    const alreadyCovered = this.handledStarImportModules.has(this.opts.runtimeImport)
      ? this.externalStarCandidates
      : new Set<string>();
    const needed = [...this.runtimeSymbolsNeeded].filter((s) => !alreadyCovered.has(s));
    if (needed.length > 0) {
      lines.push(`import { ${needed.sort().join(", ")} } from "${this.opts.runtimeImport}";`);
    }

    return lines.length > 0 ? lines.join("\n") + "\n\n" : "";
  }

  private emitHeader(program: AST.Program): void {
    const sourceRoot = this.opts.sourceRoot ?? process.cwd();
    // Re-emit user imports as ES imports
    for (const imp of program.imports) {
      const isScoped = imp.path[0]!.startsWith("@");

      let moduleSpecifier: string;
      if (imp.star) {
        // Star import — the entire path is the module.
        moduleSpecifier = isScoped
          ? imp.path[0] + "/" + imp.path.slice(1).join("/")
          : imp.path.join("/");
      } else if (isScoped) {
        // @org/pkg.Symbol → strip symbol from path.
        const moduleParts = imp.path.slice(0, -1);
        moduleSpecifier = moduleParts[0] + "/" + moduleParts.slice(1).join("/");
      } else {
        // Non-scoped import: prefer local-file convention
        const precedingParts = imp.path.slice(0, -1);
        const precedingRelPath = precedingParts.join("/");
        const fileExts = [".ts", ".tsx", ".jalvin"];
        const precedingIsFile = precedingParts.length > 0 && fileExts.some((ext) =>
          fs.existsSync(nodePath.join(sourceRoot, precedingRelPath + ext))
        );
        const looksLikeNpmPackage = this.isLikelyNodeModuleImport(imp.path, sourceRoot);
        moduleSpecifier = precedingIsFile
          ? precedingRelPath
          : looksLikeNpmPackage
            ? precedingRelPath
            : imp.path.join("/");
      }

      if (imp.star && isScoped && this.externalStarCandidates.size > 0) {
        const symbols = [...this.externalStarCandidates].sort();
        this.w.writeIndentedLine(`import { ${symbols.join(", ")} } from "${moduleSpecifier}";`);
        this.handledStarImportModules.add(moduleSpecifier);
      } else if (imp.star && !isScoped && this.localStarExports.has(moduleSpecifier)) {
        const symbols = this.localStarExports.get(moduleSpecifier)!.slice().sort();
        this.w.writeIndentedLine(`import { ${symbols.join(", ")} } from "${moduleSpecifier}";`);
      } else if (imp.star) {
        this.w.writeIndentedLine(`import * as ${imp.path[imp.path.length - 1]!} from "${moduleSpecifier}";`);
      } else if (imp.alias) {
        const named = imp.path[imp.path.length - 1]!;
        this.w.writeIndentedLine(`import { ${named} as ${imp.alias} } from "${moduleSpecifier}";`);
      } else {
        this.w.writeIndentedLine(`import { ${imp.path[imp.path.length - 1]!} } from "${moduleSpecifier}";`);
      }
    }
    if (program.imports.length > 0) this.w.writeLine();
  }

  private isLikelyNodeModuleImport(pathParts: ReadonlyArray<string>, sourceRoot: string): boolean {
    if (pathParts.length < 2) return false;
    const packageName = pathParts[0]!;

    let dir = sourceRoot;
    while (true) {
      const packageJson = nodePath.join(dir, "node_modules", packageName, "package.json");
      if (fs.existsSync(packageJson)) return true;

      const parent = nodePath.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return false;
  }

  // ── Top-level declarations ─────────────────────────────────────────────────

  private emitAnnotations(mods: AST.Modifiers): void {
    for (const ann of mods.annotations) {
      if (ann.name === "Nuked") {
        const reason = ann.args ? ` ${ann.args.replace(/^["']|["']$/g, "")}` : "";
        this.w.writeIndentedLine(`/** @deprecated${reason} */`);
      }
    }
  }

  private emitTopLevelDecl(decl: AST.TopLevelDecl): void {
    switch (decl.kind) {
      case "FunDecl":           this.emitFunDecl(decl, false); break;
      case "ComponentDecl":     this.emitComponentDecl(decl); break;
      case "ClassDecl":         this.emitClassDecl(decl); break;
      case "DataClassDecl":     this.emitDataClassDecl(decl); break;
      case "SealedClassDecl":   this.emitSealedClassDecl(decl); break;
      case "EnumClassDecl":     this.emitEnumClassDecl(decl); break;
      case "InterfaceDecl":     this.emitInterfaceDecl(decl); break;
      case "ObjectDecl":        this.emitObjectDecl(decl); break;
      case "TypeAliasDecl":     this.emitTypeAliasDecl(decl); break;
      case "PropertyDecl":      this.emitPropertyDecl(decl, false); break;
      case "ExtensionFunDecl":  this.emitExtensionFunDecl(decl); break;
      case "DestructuringDecl": this.emitDestructuringDecl(decl, false); break;
    }
  }

  // ── function declarations ──────────────────────────────────────────────────

  private emitFunDecl(decl: AST.FunDecl, memberOf: boolean): void {
    this.emitAnnotations(decl.modifiers);
    const isSuspend = AST.isSuspend(decl.modifiers);
    const vis = memberOf ? this.visibilityPrefix(decl.modifiers) : this.exportPrefix(decl.modifiers);
    const asyncKw = isSuspend ? "async " : "";
    const typeParams = this.emitTypeParamsStr(decl.typeParams);
    const params = this.emitParamsStr(decl.params);
    const retType = decl.returnType && this.opts.emitTypes
      ? `: ${this.emitTypeRef(decl.returnType)}`
      : "";

    if (!decl.body) {
      this.w.writeIndentedLine(`${vis}${asyncKw}${decl.name}${typeParams}(${params})${retType};`);
      return;
    }

    if (decl.body.kind === "Block") {
      if (memberOf) {
        this.w.writeIndentedLine(`${vis}${asyncKw}${decl.name}${typeParams}(${params})${retType} {`);
      } else {
        this.w.writeIndentedLine(`${vis}${asyncKw}function ${decl.name}${typeParams}(${params})${retType} {`);
      }
      this.w.pushIndent();
      this.emitBlock(decl.body);
      this.w.popIndent();
      this.w.writeIndentedLine(`}`);
    } else {
      if (memberOf) {
        this.w.writeIndentedLine(`${vis}${asyncKw}${decl.name}${typeParams}(${params})${retType} {`);
      } else {
        this.w.writeIndentedLine(`${vis}${asyncKw}function ${decl.name}${typeParams}(${params})${retType} {`);
      }
      this.w.pushIndent();
      this.w.writeIndentedLine(`return ${this.emitExpr(decl.body)};`);
      this.w.popIndent();
      this.w.writeIndentedLine(`}`);
    }
  }

  private emitMemberFunDecl(decl: AST.FunDecl): void {
    const isSuspend = AST.isSuspend(decl.modifiers);
    const vis = this.visibilityPrefix(decl.modifiers);
    const asyncKw = isSuspend ? "async " : "";
    const typeParams = this.emitTypeParamsStr(decl.typeParams);
    const params = this.emitParamsStr(decl.params);
    const retType = decl.returnType && this.opts.emitTypes
      ? `: ${this.emitTypeRef(decl.returnType)}`
      : "";

    if (!decl.body) {
      this.w.writeIndentedLine(`${vis}${asyncKw}${decl.name}${typeParams}(${params})${retType};`);
      return;
    }

    if (decl.body.kind === "Block") {
      this.w.writeIndentedLine(`${vis}${asyncKw}${decl.name}${typeParams}(${params})${retType} {`);
      this.w.pushIndent();
      this.emitBlock(decl.body);
      this.w.popIndent();
      this.w.writeIndentedLine(`}`);
    } else {
      this.w.writeIndentedLine(`${vis}${asyncKw}${decl.name}${typeParams}(${params})${retType} {`);
      this.w.pushIndent();
      this.w.writeIndentedLine(`return ${this.emitExpr(decl.body)};`);
      this.w.popIndent();
      this.w.writeIndentedLine(`}`);
    }
  }

  // ── component declarations → Functional components ────────────────────

  private emitComponentDecl(decl: AST.ComponentDecl): void {
    this.emitAnnotations(decl.modifiers);
    this.hasComponents = true;
    const vis = this.isInClass ? this.visibilityPrefix(decl.modifiers) : this.exportPrefix(decl.modifiers);

    const hasChildren = decl.params.some((p) => p.name === "children");
    const propsParams = decl.params.filter((p) => p.name !== "children");

    // Props interface
    if (!this.isInClass && propsParams.length > 0) {
      this.w.writeIndentedLine(`interface ${decl.name}Props {`);
      this.w.pushIndent();
      for (const p of propsParams) {
        const optional = p.defaultValue ? "?" : "";
        const typeStr = this.opts.emitTypes ? this.emitTypeRef(p.type) : "any";
        this.w.writeIndentedLine(`readonly ${p.name}${optional}: ${typeStr};`);
      }
      this.w.popIndent();
      this.w.writeIndentedLine(`}`);
      this.w.writeLine();
    }

    const propsType = this.isInClass 
      ? `{ ${propsParams.map(p => {
          const optional = p.defaultValue ? "?" : "";
          const typeStr = this.opts.emitTypes ? this.emitTypeRef(p.type) : "any";
          return `readonly ${p.name}${optional}: ${typeStr}`;
        }).join("; ")} }`
      : `${decl.name}Props`;

    let signature = "";
    if (propsParams.length > 0) {
      signature = `{ ${propsParams.map((p) => p.name + (p.defaultValue ? ` = ${this.emitExpr(p.defaultValue)}` : "")).join(", ")} }: ${propsType}`;
    } else if (hasChildren) {
      signature = "{}";
    }
    
    if (hasChildren) {
      signature += signature ? ", children?: any" : "children?: any";
    }
    
    const sig = this.isInClass 
      ? `${decl.name}(${signature})`
      : `function ${decl.name}(${signature})`;

    this.w.writeIndentedLine(`${vis}${sig} {`);
    this.w.pushIndent();
    this.emitComponentBlock(decl.body);
    this.w.popIndent();
    this.w.writeIndentedLine(`}`);
  }

  private emitComponentBlock(block: AST.Block): void {
    const stmts = block.statements;
    for (let i = 0; i < stmts.length; i++) {
      const stmt = stmts[i]!;
      if (i === stmts.length - 1) {
        this.emitTailStmt(stmt);
      } else {
        this.emitStmt(stmt);
      }
    }
  }

  private emitTailStmt(stmt: AST.Stmt): void {
    if (stmt.kind === "ExprStmt") {
      this.w.writeIndentedLine(`return ${this.emitExpr(stmt.expr)};`);
    } else if (stmt.kind === "IfStmt") {
      this.emitIfStmtWithTailReturn(stmt);
    } else if (stmt.kind === "WhenStmt") {
      this.emitWhenStmtWithTailReturn(stmt);
    } else {
      this.emitStmt(stmt);
    }
  }

  private emitTailBlock(block: AST.Block): void {
    const stmts = block.statements;
    for (let i = 0; i < stmts.length; i++) {
      const stmt = stmts[i]!;
      if (i === stmts.length - 1) {
        this.emitTailStmt(stmt);
      } else {
        this.emitStmt(stmt);
      }
    }
  }

  private emitIfStmtWithTailReturn(stmt: AST.IfStmt): void {
    this.w.writeIndentedLine(`if (${this.emitExpr(stmt.condition)}) {`);
    this.w.pushIndent();
    this.emitTailBlock(stmt.then);
    this.w.popIndent();
    if (stmt.else) {
      if (stmt.else.kind === "IfStmt") {
        this.w.writeIndented(`} else `);
        this.emitIfStmtWithTailReturn(stmt.else);
      } else {
        this.w.writeIndentedLine(`} else {`);
        this.w.pushIndent();
        this.emitTailBlock(stmt.else);
        this.w.popIndent();
        this.w.writeIndentedLine(`}`);
      }
    } else {
      this.w.writeIndentedLine(`}`);
    }
  }

  private emitWhenStmtWithTailReturn(stmt: AST.WhenStmt): void {
    const subjectVar = stmt.subject ? "__when_subject__" : null;
    if (stmt.subject) {
      const binding = stmt.subject.binding ?? subjectVar!;
      this.w.writeIndentedLine(`const ${binding} = ${this.emitExpr(stmt.subject.expr)};`);
    }
    let first = true;
    for (const branch of stmt.branches) {
      if (branch.isElse) {
        this.w.writeIndentedLine(first ? `{` : `} else {`);
      } else {
        const cond = branch.conditions.map((c) => this.emitWhenCondition(c, subjectVar ?? "")).join(" || ");
        this.w.writeIndentedLine(first ? `if (${cond}) {` : `} else if (${cond}) {`);
      }
      first = false;
      this.w.pushIndent();
      if (branch.body.kind === "Block") {
        this.emitTailBlock(branch.body);
      } else {
        this.w.writeIndentedLine(`return ${this.emitExpr(branch.body)};`);
      }
      this.w.popIndent();
    }
    this.w.writeIndentedLine(`}`);
  }

  // ── regular class ──────────────────────────────────────────────────────────

  private emitClassDecl(decl: AST.ClassDecl): void {
    if (decl.modifiers.modifiers.includes("external")) return;
    this.emitAnnotations(decl.modifiers);
    const vis = this.exportPrefix(decl.modifiers);
    const abstract = decl.modifiers.modifiers.includes("abstract") ? "abstract " : "";
    const typeParams = this.emitTypeParamsStr(decl.typeParams);
    const superTypes = this.emitSuperTypesStr(decl.superTypes);

    this.w.writeIndentedLine(`${vis}${abstract}class ${decl.name}${typeParams}${superTypes} {`);
    this.w.pushIndent();

    const superDelegateArgs = decl.superTypes[0]?.delegateArgs ?? null;

    if (decl.primaryConstructor) {
      const initBlocks = decl.body?.members.filter((m): m is AST.InitBlock => m.kind === "InitBlock") ?? [];
      this.emitPrimaryConstructorProps(decl.primaryConstructor.params, initBlocks, superDelegateArgs);
    } else if (superDelegateArgs !== null) {
      const superArgsStr = superDelegateArgs.map((a) => this.emitExpr(a.value)).join(", ");
      this.w.writeIndentedLine(`constructor() {`);
      this.w.pushIndent();
      this.w.writeIndentedLine(`super(${superArgsStr});`);
      this.w.popIndent();
      this.w.writeIndentedLine(`}`);
    }

    if (decl.body) {
      this.emitClassBody(decl.body);
    }

    this.w.popIndent();
    this.w.writeIndentedLine(`}`);
  }

  // ── data class → class with copy/equals/toString ──────────────────────────

  private emitDataClassDecl(decl: AST.DataClassDecl, kindName?: string): void {
    this.emitAnnotations(decl.modifiers);
    const vis = this.exportPrefix(decl.modifiers);
    const typeParams = this.emitTypeParamsStr(decl.typeParams);
    const superTypes = this.emitSuperTypesStr(decl.superTypes);
    const props = decl.primaryConstructor.params;

    this.w.writeIndentedLine(`${vis}class ${decl.name}${typeParams}${superTypes} {`);
    this.w.pushIndent();

    if (kindName) {
      this.w.writeIndentedLine(`readonly __kind = "${kindName}" as const;`);
    }

    for (const p of props) {
      const t = this.opts.emitTypes ? `: ${this.emitTypeRef(p.type)}` : "";
      this.w.writeIndentedLine(`readonly ${p.name}${t};`);
    }
    this.w.writeLine();

    const ctorParams = props.map((p) => {
      const t = this.opts.emitTypes ? `: ${this.emitTypeRef(p.type)}` : "";
      return `${p.name}${t}`;
    }).join(", ");
    this.w.writeIndentedLine(`constructor(${ctorParams}) {`);
    this.w.pushIndent();
    const dataSuperDelegateArgs = decl.superTypes[0]?.delegateArgs ?? null;
    if (dataSuperDelegateArgs !== null) {
      const superArgsStr = dataSuperDelegateArgs.map((a) => this.emitExpr(a.value)).join(", ");
      this.w.writeIndentedLine(`super(${superArgsStr});`);
    }
    for (const p of props) {
      this.w.writeIndentedLine(`this.${p.name} = ${p.name};`);
    }
    this.w.popIndent();
    this.w.writeIndentedLine(`}`);
    this.w.writeLine();

    const copyParams = props.map((p) => {
      const t = this.opts.emitTypes ? `: ${this.emitTypeRef(p.type)}` : "";
      return `${p.name}${t} = this.${p.name}`;
    }).join(", ");
    const copyArgs = props.map((p) => p.name).join(", ");
    this.w.writeIndentedLine(`copy(${copyParams}): ${decl.name} {`);
    this.w.pushIndent();
    this.w.writeIndentedLine(`return new ${decl.name}(${copyArgs});`);
    this.w.popIndent();
    this.w.writeIndentedLine(`}`);
    this.w.writeLine();

    this.runtimeSymbolsNeeded.add("jalvinEquals");
    const eqChecks = props.map((p) => `jalvinEquals(this.${p.name}, other.${p.name})`).join(" && ") || "true";
    this.w.writeIndentedLine(`equals(other: unknown): boolean {`);
    this.w.pushIndent();
    this.w.writeIndentedLine(`if (!(other instanceof ${decl.name})) return false;`);
    this.w.writeIndentedLine(`return ${eqChecks};`);
    this.w.popIndent();
    this.w.writeIndentedLine(`}`);
    this.w.writeLine();

    const toStringParts = props.map((p) => `${p.name}=\${this.${p.name}}`).join(", ");
    this.w.writeIndentedLine(`toString(): string {`);
    this.w.pushIndent();
    this.w.writeIndentedLine(`return \`${decl.name}(${toStringParts})\`;`);
    this.w.popIndent();
    this.w.writeIndentedLine(`}`);
    this.w.writeLine();

    this.w.writeIndentedLine(`hashCode(): number {`);
    this.w.pushIndent();
    this.w.writeIndentedLine(`let h = 17;`);
    for (const p of props) {
      this.w.writeIndentedLine(`h = h * 31 + String(this.${p.name}).split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 0);`);
    }
    this.w.writeIndentedLine(`return h >>> 0;`);
    this.w.popIndent();
    this.w.writeIndentedLine(`}`);

    if (decl.body) {
      this.w.writeLine();
      this.emitClassBody(decl.body);
    }

    this.w.popIndent();
    this.w.writeIndentedLine(`}`);
  }

  // ── sealed class → TS abstract class + namespace merging ──────────────────

  private emitSealedClassDecl(decl: AST.SealedClassDecl): void {
    this.emitAnnotations(decl.modifiers);
    const vis = this.exportPrefix(decl.modifiers);
    const typeParams = this.emitTypeParamsStr(decl.typeParams);

    type SubDecl = AST.ClassDecl | AST.DataClassDecl | AST.ObjectDecl;
    const subDecls: SubDecl[] = [];
    const otherMembers: AST.ClassMember[] = [];
    if (decl.body) {
      for (const member of decl.body.members) {
        if (
          member.kind === "ClassDecl" ||
          member.kind === "DataClassDecl" ||
          member.kind === "ObjectDecl"
        ) {
          subDecls.push(member as SubDecl);
        } else if (member.kind !== "InitBlock") {
          otherMembers.push(member);
        }
      }
    }

    this.w.writeIndentedLine(`${vis}abstract class ${decl.name}${typeParams} {`);
    this.w.pushIndent();
    this.w.writeIndentedLine(`abstract readonly __kind: string;`);
    for (const member of otherMembers) {
      this.emitClassMember(member);
      this.w.writeLine();
    }
    this.w.popIndent();
    this.w.writeIndentedLine(`}`);
    this.w.writeLine();

    if (subDecls.length === 0) return;

    for (const sub of subDecls) {
      if (sub.kind === "DataClassDecl") {
        this.emitDataClassDecl(sub, sub.name);
        this.w.writeLine();
      } else if (sub.kind === "ClassDecl") {
        this.emitClassDecl(sub);
        this.w.writeLine();
      }
    }

    this.w.writeIndentedLine(`${vis}namespace ${decl.name} {`);
    this.w.pushIndent();
    for (const sub of subDecls) {
      if (sub.kind === "ObjectDecl") {
        const superStr = sub.superTypes.length > 0
          ? this.emitSuperTypesStr(sub.superTypes)
          : ` extends ${decl.name}`;
        const membersArr: string[] = [];
        membersArr.push(`readonly __kind = "${sub.name!}" as const;`);
        if (sub.body) {
          for (const m of sub.body.members) {
            if (m.kind !== "InitBlock") membersArr.push(this.captureClassMember(m));
          }
        }
        const membersStr = membersArr.join(" ");
        this.w.writeIndentedLine(`export const ${sub.name} = new (class${superStr} { ${membersStr} })();`);
      } else {
        this.w.writeIndentedLine(`export { ${sub.name} };`);
      }
    }
    this.w.popIndent();
    this.w.writeIndentedLine(`}`);
  }

  // ── enum class → TypeScript const enum + class ────────────────────────────

  private emitEnumClassDecl(decl: AST.EnumClassDecl): void {
    const vis = this.exportPrefix(decl.modifiers);
    const typeParams = this.emitTypeParamsStr(decl.typeParams);

    this.w.writeIndentedLine(`${vis}class ${decl.name}${typeParams} {`);
    this.w.pushIndent();

    if (decl.primaryConstructor && decl.primaryConstructor.params.length > 0) {
      const ctorParams = decl.primaryConstructor.params
        .map((p) => {
          const ro = p.propertyKind === "val" ? "readonly " : "";
          const type = this.opts.emitTypes ? `: ${this.emitTypeRef(p.type)}` : "";
          return `${ro}${p.name}${type}`;
        })
        .join(", ");
      this.w.writeIndentedLine(`private constructor(${ctorParams}) {}`);
    } else {
      this.w.writeIndentedLine(`private constructor(readonly name: string, readonly ordinal: number) {}`);
    }
    this.w.writeLine();

    for (let i = 0; i < decl.entries.length; i++) {
      const entry = decl.entries[i]!;
      const args = entry.args.length > 0
        ? entry.args.map((a) => this.emitExpr(a.value)).join(", ")
        : `"${entry.name}", ${i}`;
      this.w.writeIndentedLine(`static readonly ${entry.name} = new ${decl.name}(${args});`);
    }

    if (decl.entries.length > 0) {
      this.w.writeLine();
      const entryList = decl.entries.map((e) => `${decl.name}.${e.name}`).join(", ");
      this.w.writeIndentedLine(`static values(): ${decl.name}[] { return [${entryList}]; }`);
      this.w.writeIndentedLine(`static valueOf(name: string): ${decl.name} {`);
      this.w.pushIndent();
      this.w.writeIndentedLine(`const v = ${decl.name}.values().find(e => e.name === name);`);
      this.w.writeIndentedLine(`if (!v) throw new Error(\`No enum constant ${decl.name}.\${name}\`);`);
      this.w.writeIndentedLine(`return v;`);
      this.w.popIndent();
      this.w.writeIndentedLine(`}`);
    }

    if (decl.body) {
      this.w.writeLine();
      this.emitClassBody(decl.body);
    }

    this.w.popIndent();
    this.w.writeIndentedLine(`}`);
  }

  private emitDestructuringDecl(decl: AST.DestructuringDecl, _memberOf: boolean): void {
    const kw = decl.mutable ? "let" : "const";
    const names = decl.names.map((n) => n ?? "_").join(", ");
    const init = this.emitExpr(decl.initializer);
    this.w.writeIndentedLine(`${kw} [${names}] = ${init};`);
  }

  private emitInterfaceDecl(decl: AST.InterfaceDecl): void {
    this.emitAnnotations(decl.modifiers);
    const vis = this.exportPrefix(decl.modifiers);
    const typeParams = this.emitTypeParamsStr(decl.typeParams);
    const superTypes = decl.superTypes.length > 0
      ? ` extends ${decl.superTypes.map((s) => this.emitTypeRef(s.type)).join(", ")}`
      : "";

    this.w.writeIndentedLine(`${vis}interface ${decl.name}${typeParams}${superTypes} {`);
    this.w.pushIndent();
    if (decl.body) {
      for (const member of decl.body.members) {
        this.emitClassMember(member);
      }
    }
    this.w.popIndent();
    this.w.writeIndentedLine(`}`);
  }

  private emitObjectDecl(decl: AST.ObjectDecl): void {
    if (!decl.name) return;
    this.emitAnnotations(decl.modifiers);
    const vis = this.exportPrefix(decl.modifiers);
    const superTypes = this.emitSuperTypesStr(decl.superTypes);

    this.w.writeIndentedLine(`${vis}const ${decl.name} = new (class${superTypes} {`);
    this.w.pushIndent();
    this.emitClassBody(decl.body);
    this.w.popIndent();
    this.w.writeIndentedLine(`})();`);
  }

  private emitTypeAliasDecl(decl: AST.TypeAliasDecl): void {
    const vis = this.exportPrefix(decl.modifiers);
    const typeParams = this.emitTypeParamsStr(decl.typeParams);
    this.w.writeIndentedLine(`${vis}type ${decl.name}${typeParams} = ${this.emitTypeRef(decl.type)};`);
  }

  private emitExtensionFunDecl(decl: AST.ExtensionFunDecl): void {
    const isSuspend = AST.isSuspend(decl.modifiers);
    const asyncKw = isSuspend ? "async " : "";
    const receiverType = this.emitTypeRef(decl.receiver);
    const typeParams = this.emitTypeParamsStr(decl.typeParams);
    const params = this.emitParamsStr(decl.params);
    const retType = decl.returnType && this.opts.emitTypes
      ? `: ${this.emitTypeRef(decl.returnType)}`
      : "";
    const fnName = `__ext_${receiverType.replace(/[^a-zA-Z0-9_]/g, "_")}_${decl.name}`;

    this.w.writeIndentedLine(`${asyncKw}function ${fnName}${typeParams}($receiver: ${receiverType}${params ? ", " + params : ""})${retType} {`);
    this.w.pushIndent();
    if (decl.body.kind === "Block") {
      this.w.writeIndentedLine(`return (function(this: ${receiverType})${retType} {`);
      this.w.pushIndent();
      this.emitBlock(decl.body);
      this.w.popIndent();
      this.w.writeIndentedLine(`}).call($receiver);`);
    } else {
      this.w.writeIndentedLine(`return (function(this: ${receiverType})${retType} { return ${this.emitExpr(decl.body)}; }).call($receiver);`);
    }
    this.w.popIndent();
    this.w.writeIndentedLine(`}`);
    this.w.writeLine();

    const simpleReceiverName = this.receiverClassName(decl.receiver);
    if (simpleReceiverName) {
      if (PRIMITIVE_TYPES.has(simpleReceiverName)) {
        if (!this.primitiveExtensions.has(simpleReceiverName)) {
          this.primitiveExtensions.set(simpleReceiverName, new Map());
        }
        this.primitiveExtensions.get(simpleReceiverName)!.set(decl.name, fnName);
      } else {
        this.w.writeIndentedLine(`// Extension: ${receiverType}.${decl.name}`);
        this.w.writeIndentedLine(`(${simpleReceiverName}.prototype as any).${decl.name} = function(this: ${receiverType}, ...args: unknown[]) { return (${fnName} as Function)(this, ...args); };`);
      }
    }
  }

  private receiverClassName(ref: AST.TypeRef): string | null {
    if (ref.kind === "SimpleTypeRef") return ref.name[ref.name.length - 1] ?? null;
    if (ref.kind === "GenericTypeRef") return ref.base.name[ref.base.name.length - 1] ?? null;
    return null;
  }

  private jTypeToReceiverName(type: JType): string | null {
    const tagToReceiverName: Partial<Record<JType["tag"], string>> = {
      string:   "String",
      int:      "Int",
      long:     "Long",
      float:    "Float",
      double:   "Double",
      boolean:  "Boolean",
      char:     "Char",
    };
    return tagToReceiverName[type.tag] ?? null;
  }

  private classHasInvokeOperator(decl: { body?: AST.ClassBody | null }): boolean {
    if (!decl.body) return false;
    return decl.body.members.some(
      (m) =>
        m.kind === "FunDecl" &&
        m.name === "invoke" &&
        m.modifiers.modifiers.includes("operator")
    );
  }

  private emitPropertyDecl(decl: AST.PropertyDecl, member: boolean, isLocal = false): void {
    this.emitAnnotations(decl.modifiers);
    const vis = member ? this.visibilityPrefix(decl.modifiers) : isLocal ? "" : this.exportPrefix(decl.modifiers);
    const isConst = decl.modifiers.modifiers.includes("const");
    const isLateinit = decl.modifiers.modifiers.includes("lateinit");
    const kw = member
      ? (decl.mutable ? "" : "readonly ")
      : (isConst ? "const " : decl.mutable ? "let " : "const ");
    const type = decl.type && this.opts.emitTypes ? `: ${this.emitTypeRef(decl.type)}` : "";

    if (decl.delegate) {
      this.runtimeSymbolsNeeded.add("delegate");
      const delegateExpr = this.emitExpr(decl.delegate);
      if (member) {
        this.w.writeIndentedLine(`${vis}get ${decl.name}()${type} { return delegate(${delegateExpr}, "${decl.name}", this).getValue(); }`);
        if (decl.mutable) {
          this.w.writeIndentedLine(`${vis}set ${decl.name}(v: any) { delegate(${delegateExpr}, "${decl.name}", this).setValue(v); }`);
        }
      } else {
        this.w.writeIndentedLine(`${kw}${decl.name}${type} = delegate(${delegateExpr}, "${decl.name}", null).getValue();`);
      }
      return;
    }

    const init = decl.initializer ? ` = ${this.emitExpr(decl.initializer)}` : "";

    if (member && !decl.getter) {
      const modStr = isConst ? "static readonly " : decl.mutable ? "" : "readonly ";
      this.w.writeIndentedLine(`${vis}${modStr}${decl.name}${type}${init};`);
    } else if (!member) {
      this.w.writeIndentedLine(`${vis}${kw}${decl.name}${type}${init};`);
    }

    if (decl.getter) this.emitPropertyAccessor("get", decl.name, decl.getter, member, type);
    if (decl.setter) this.emitPropertyAccessor("set", decl.name, decl.setter, member, type);
  }

  private emitPropertyAccessor(
    kind: "get" | "set",
    name: string,
    acc: AST.PropertyAccessor,
    member: boolean,
    type: string
  ): void {
    const vis = this.visibilityPrefix(acc.modifiers);
    if (kind === "set") {
      this.w.writeIndentedLine(`${vis}set ${name}(value: any) {`);
    } else {
      this.w.writeIndentedLine(`${vis}get ${name}()${type} {`);
    }
    this.w.pushIndent();
    if (acc.body) {
      if (acc.body.kind === "Block") this.emitBlock(acc.body);
      else this.w.writeIndentedLine(`return ${this.emitExpr(acc.body)};`);
    }
    this.w.popIndent();
    this.w.writeIndentedLine(`}`);
  }

  private emitClassBody(body: AST.ClassBody): void {
    const old = this.isInClass;
    this.isInClass = true;
    try {
      for (const member of body.members) {
        if (member.kind === "InitBlock") continue;
        this.emitClassMember(member);
        this.w.writeLine();
      }
    } finally {
      this.isInClass = old;
    }
  }

  private emitClassMember(member: AST.ClassMember): void {
    switch (member.kind) {
      case "FunDecl":           this.emitMemberFunDecl(member); break;
      case "ComponentDecl":     this.emitComponentDecl(member); break;
      case "PropertyDecl":      this.emitPropertyDecl(member, true); break;
      case "ClassDecl":         this.emitClassDecl(member); break;
      case "DataClassDecl":     this.emitDataClassDecl(member); break;
      case "SealedClassDecl":   this.emitSealedClassDecl(member); break;
      case "EnumClassDecl":     this.emitEnumClassDecl(member); break;
      case "ObjectDecl":        this.emitObjectDecl(member); break;
      case "CompanionObject":   this.emitCompanionObject(member); break;
      case "SecondaryConstructor": this.emitSecondaryConstructor(member); break;
      case "ExtensionFunDecl":  this.emitExtensionFunDecl(member); break;
    }
  }

  private emitPrimaryConstructorProps(
    params: readonly AST.Param[],
    initBlocks?: ReadonlyArray<AST.InitBlock>,
    superDelegateArgs?: ReadonlyArray<AST.CallArg> | null
  ): void {
    for (const p of params) {
      if (p.propertyKind) {
        const ro = p.propertyKind === "val" ? "readonly " : "";
        const type = this.opts.emitTypes ? `: ${this.emitTypeRef(p.type)}` : "";
        this.w.writeIndentedLine(`${ro}${p.name}${type};`);
      }
    }
    const ctorParams = params.map((p) => {
      const type = this.opts.emitTypes ? `: ${this.emitTypeRef(p.type)}` : "";
      const def = p.defaultValue ? ` = ${this.emitExpr(p.defaultValue)}` : "";
      return `${p.name}${type}${def}`;
    });
    this.w.writeIndentedLine(`constructor(${ctorParams.join(", ")}) {`);
    this.w.pushIndent();
    if (superDelegateArgs !== null && superDelegateArgs !== undefined) {
      const superArgsStr = superDelegateArgs.map((a) => this.emitExpr(a.value)).join(", ");
      this.w.writeIndentedLine(`super(${superArgsStr});`);
    }
    for (const p of params) {
      if (p.propertyKind) {
        this.w.writeIndentedLine(`this.${p.name} = ${p.name};`);
      }
    }
    for (const ib of (initBlocks ?? [])) this.emitBlock(ib.body);
    this.w.popIndent();
    this.w.writeIndentedLine(`}`);
    this.w.writeLine();
  }

  private emitCompanionObject(co: AST.CompanionObject): void {
    for (const member of co.body.members) {
      if (member.kind === "FunDecl") {
        const vis = this.visibilityPrefix(member.modifiers);
        const params = this.emitParamsStr(member.params);
        const retType = member.returnType && this.opts.emitTypes
          ? `: ${this.emitTypeRef(member.returnType)}` : "";
        const asyncKw = AST.isSuspend(member.modifiers) ? "async " : "";
        if (member.body) {
          if (member.body.kind === "Block") {
            this.w.writeIndentedLine(`${vis}static ${asyncKw}${member.name}(${params})${retType} {`);
            this.w.pushIndent();
            this.emitBlock(member.body);
            this.w.popIndent();
            this.w.writeIndentedLine(`}`);
          } else {
            this.w.writeIndentedLine(`${vis}static ${asyncKw}${member.name}(${params})${retType} { return ${this.emitExpr(member.body)}; }`);
          }
        } else {
          this.w.writeIndentedLine(`${vis}static abstract ${member.name}(${params})${retType};`);
        }
      } else if (member.kind === "PropertyDecl") {
        const vis = this.visibilityPrefix(member.modifiers);
        const kw = member.mutable ? "" : "readonly ";
        const typeAnn = member.type && this.opts.emitTypes ? `: ${this.emitTypeRef(member.type)}` : "";
        const init = member.initializer ? ` = ${this.emitExpr(member.initializer)}` : "";
        this.w.writeIndentedLine(`${vis}static ${kw}${member.name}${typeAnn}${init};`);
      }
    }
  }

  private emitSecondaryConstructor(ctor: AST.SecondaryConstructor): void {
    const params = this.emitParamsStr(ctor.params);
    this.w.writeIndentedLine(`constructor(${params}) {`);
    this.w.pushIndent();
    if (ctor.delegation) {
      const args = ctor.delegateArgs.map((a) => this.emitExpr(a.value)).join(", ");
      this.w.writeIndentedLine(`${ctor.delegation}(${args});`);
    }
    this.emitBlock(ctor.body);
    this.w.popIndent();
    this.w.writeIndentedLine(`}`);
  }

  private emitBlock(block: AST.Block): void {
    for (const stmt of block.statements) this.emitStmt(stmt);
  }

  private emitStmt(stmt: AST.Stmt): void {
    switch (stmt.kind) {
      case "Block":
        this.w.writeIndentedLine(`{`);
        this.w.pushIndent();
        this.emitBlock(stmt);
        this.w.popIndent();
        this.w.writeIndentedLine(`}`);
        break;
      case "PropertyDecl":
        this.emitPropertyDecl(stmt, false, true);
        break;
      case "DestructuringDecl":
        this.emitDestructuringDecl(stmt, false);
        break;
      case "ExprStmt":
        this.w.writeIndentedLine(`${this.emitExpr(stmt.expr)};`);
        break;
      case "ReturnStmt": {
        const val = stmt.value ? ` ${this.emitExpr(stmt.value)}` : "";
        this.w.writeIndentedLine(`return${val};`);
        break;
      }
      case "ThrowStmt":
        this.w.writeIndentedLine(`throw ${this.emitExpr(stmt.value)};`);
        break;
      case "BreakStmt":
        this.w.writeIndentedLine(stmt.label ? `break ${stmt.label};` : `break;`);
        break;
      case "ContinueStmt":
        this.w.writeIndentedLine(stmt.label ? `continue ${stmt.label};` : `continue;`);
        break;
      case "IfStmt":
        this.emitIfStmt(stmt);
        break;
      case "WhenStmt":
        this.emitWhenStmt(stmt);
        break;
      case "ForStmt":
        this.emitForStmt(stmt);
        break;
      case "WhileStmt":
        this.w.writeIndentedLine(`while (${this.emitExpr(stmt.condition)}) {`);
        this.w.pushIndent();
        this.emitBlock(stmt.body);
        this.w.popIndent();
        this.w.writeIndentedLine(`}`);
        break;
      case "DoWhileStmt":
        this.w.writeIndentedLine(`do {`);
        this.w.pushIndent();
        this.emitBlock(stmt.body);
        this.w.popIndent();
        this.w.writeIndentedLine(`} while (${this.emitExpr(stmt.condition)});`);
        break;
      case "TryCatchStmt":
        this.emitTryCatch(stmt);
        break;
      case "LabeledStmt":
        this.w.writeIndentedLine(`${stmt.label}:`);
        this.emitStmt(stmt.body);
        break;
    }
  }

  private emitIfStmt(stmt: AST.IfStmt): void {
    this.w.writeIndentedLine(`if (${this.emitExpr(stmt.condition)}) {`);
    this.w.pushIndent();
    this.emitBlock(stmt.then);
    this.w.popIndent();
    if (stmt.else) {
      if (stmt.else.kind === "IfStmt") {
        this.w.writeIndented(`} else `);
        this.emitIfStmt(stmt.else);
      } else {
        this.w.writeIndentedLine(`} else {`);
        this.w.pushIndent();
        this.emitBlock(stmt.else);
        this.w.popIndent();
        this.w.writeIndentedLine(`}`);
      }
    } else {
      this.w.writeIndentedLine(`}`);
    }
  }

  private emitWhenStmt(stmt: AST.WhenStmt): void {
    const subjectVar = stmt.subject ? "__when_subject__" : null;
    if (stmt.subject) {
      const binding = stmt.subject.binding ?? subjectVar!;
      this.w.writeIndentedLine(`const ${binding} = ${this.emitExpr(stmt.subject.expr)};`);
    }
    let first = true;
    for (const branch of stmt.branches) {
      if (branch.isElse) {
        this.w.writeIndentedLine(first ? `{` : `} else {`);
      } else {
        const cond = branch.conditions.map((c) => this.emitWhenCondition(c, subjectVar ?? "")).join(" || ");
        this.w.writeIndentedLine(first ? `if (${cond}) {` : `} else if (${cond}) {`);
      }
      first = false;
      this.w.pushIndent();
      if (branch.body.kind === "Block") this.emitBlock(branch.body);
      else this.w.writeIndentedLine(`${this.emitExpr(branch.body)};`);
      this.w.popIndent();
    }
    this.w.writeIndentedLine(`}`);
  }

  private emitWhenCondition(cond: AST.WhenCondition, subject: string): string {
    switch (cond.kind) {
      case "WhenIsCondition": {
        const isQualified = cond.type.kind === "SimpleTypeRef" && cond.type.name.length > 1;
        const check = isQualified
          ? `(${subject} as any).__kind === "${cond.type.kind === "SimpleTypeRef" ? cond.type.name[cond.type.name.length - 1] : ""}"`
          : `${subject} instanceof ${this.emitTypeRef(cond.type)}`;
        return cond.negated ? `!(${check})` : check;
      }
      case "WhenInCondition": {
        const check = `(${this.emitExpr(cond.expr)}).includes(${subject})`;
        return cond.negated ? `!(${check})` : check;
      }
      case "WhenExprCondition":
        if (subject) {
          this.runtimeSymbolsNeeded.add("jalvinEquals");
          return `jalvinEquals(${subject}, ${this.emitExpr(cond.expr)})`;
        }
        return this.emitExpr(cond.expr);
    }
  }

  private emitForStmt(stmt: AST.ForStmt): void {
    const iter = this.emitExpr(stmt.iterable);
    if (typeof stmt.binding === "string") {
      this.w.writeIndentedLine(`for (const ${stmt.binding} of ${iter}) {`);
    } else if (stmt.binding.kind === "TupleDestructure") {
      const names = stmt.binding.names.map((n) => n ?? "_").join(", ");
      this.w.writeIndentedLine(`for (const [${names}] of ${iter}) {`);
    } else {
      const { key, value } = stmt.binding;
      const iterableType = this.typeMap.get(stmt.iterable);
      const isMap = iterableType?.tag === "class" && iterableType.name === "Map";
      const entries = isMap ? `${iter}.entries()` : `Object.entries(${iter})`;
      this.w.writeIndentedLine(`for (const [${key}, ${value}] of ${entries}) {`);
    }
    this.w.pushIndent();
    this.emitBlock(stmt.body);
    this.w.popIndent();
    this.w.writeIndentedLine(`}`);
  }

  private emitTryCatch(stmt: AST.TryCatchStmt): void {
    this.w.writeIndentedLine(`try {`);
    this.w.pushIndent();
    this.emitBlock(stmt.body);
    this.w.popIndent();
    for (const c of stmt.catches) {
      this.w.writeIndentedLine(`} catch (${c.name}: unknown) {`);
      this.w.pushIndent();
      this.w.writeIndentedLine(`if (!(${c.name} instanceof ${this.emitTypeRef(c.type)})) throw ${c.name};`);
      this.emitBlock(c.body);
      this.w.popIndent();
    }
    if (stmt.finally) {
      this.w.writeIndentedLine(`} finally {`);
      this.w.pushIndent();
      this.emitBlock(stmt.finally);
      this.w.popIndent();
    }
    this.w.writeIndentedLine(`}`);
  }

  emitExpr(expr: AST.Expr): string {
    switch (expr.kind) {
      case "IntLiteralExpr":    return String(expr.value);
      case "LongLiteralExpr":   return `${expr.value}n`;
      case "FloatLiteralExpr":
      case "DoubleLiteralExpr": return String(expr.value);
      case "BooleanLiteralExpr": return String(expr.value);
      case "NullLiteralExpr":   return "null";
      case "StringLiteralExpr":
        return expr.raw ? `\`${expr.value}\`` : JSON.stringify(expr.value);
      case "StringTemplateExpr":
        return this.emitStringTemplate(expr);
      case "NameExpr":
        if (expr.name === "Int" || expr.name === "Long") this.runtimeSymbolsNeeded.add(expr.name);
        if (expr.name === "Unit") return "undefined";
        return expr.name;
      case "ThisExpr":          return "this";
      case "SuperExpr":         return "super";
      case "ParenExpr":         return `(${this.emitExpr(expr.expr)})`;
      case "UnaryExpr":
        return expr.prefix
          ? `${this.unaryOpStr(expr.op)}${this.emitExpr(expr.operand)}`
          : `${this.emitExpr(expr.operand)}${this.unaryOpStr(expr.op)}`;
      case "BinaryExpr": {
        const opMethod = this.operatorOverloadMap.get(expr);
        if (opMethod) {
          const l = this.emitExpr(expr.left);
          const r = this.emitExpr(expr.right);
          if (opMethod === "compareTo") return `(${l}.compareTo(${r}) ${expr.op} 0)`;
          if (opMethod === "contains") return `${r}.contains(${l})`;
          if (opMethod === "!contains") return `!${r}.contains(${l})`;
          return `${l}.${opMethod}(${r})`;
        }
        if (expr.op === "==" || expr.op === "!=") {
          this.runtimeSymbolsNeeded.add("jalvinEquals");
          const eq = `jalvinEquals(${this.emitExpr(expr.left)}, ${this.emitExpr(expr.right)})`;
          return expr.op === "==" ? eq : `!${eq}`;
        }
        if (expr.op === "in" || expr.op === "!in") {
          // Evaluate each operand exactly once via an IIFE to avoid double side-effects.
          // Try .has() first (Map/Set), then .includes() (Array), fall back to JS `in` (plain objects).
          const l = this.emitExpr(expr.left);
          const r = this.emitExpr(expr.right);
          const check = `((__l, __r) => __r.has?.(__l) ?? __r.includes?.(__l) ?? (__l in __r))(${l}, ${r})`;
          return expr.op === "in" ? check : `!(${check})`;
        }
        return `(${this.emitExpr(expr.left)} ${this.binaryOpStr(expr.op)} ${this.emitExpr(expr.right)})`;
      }
      case "AssignExpr":
        return `${this.emitExpr(expr.target as AST.Expr)} = ${this.emitExpr(expr.value)}`;
      case "CompoundAssignExpr":
        return `${this.emitExpr(expr.target as AST.Expr)} ${expr.op} ${this.emitExpr(expr.value)}`;
      case "IncrDecrExpr":
        return expr.prefix
          ? `${expr.op}${this.emitExpr(expr.target as AST.Expr)}`
          : `${this.emitExpr(expr.target as AST.Expr)}${expr.op}`;
      case "MemberExpr":        return `${this.emitExpr(expr.target)}.${expr.member}`;
      case "SafeMemberExpr":    return `${this.emitExpr(expr.target)}?.${expr.member}`;
      case "IndexExpr":         return `${this.emitExpr(expr.target)}[${this.emitExpr(expr.index)}]`;
      case "NotNullExpr":
        this.runtimeSymbolsNeeded.add("notNull");
        return `notNull(${this.emitExpr(expr.expr)})`;
      case "SafeCallExpr": {
        const callee = this.emitExpr(expr.callee);
        const restArgs = expr.args.map((a) => a.spread ? `...${this.emitExpr(a.value)}` : this.emitExpr(a.value));
        if (expr.trailingLambda) restArgs.push(this.emitLambdaExpr(expr.trailingLambda));
        return `${callee}?.(${restArgs.join(", ")})`;
      }
      case "ElvisExpr":         return `(${this.emitExpr(expr.left)} ?? ${this.emitExpr(expr.right)})`;
      case "CallExpr":          return this.emitCallExpr(expr);
      case "LambdaExpr":        return this.emitLambdaExpr(expr);
      case "IfExpr":            return this.emitIfExpr(expr);
      case "WhenExpr":          return this.emitWhenExpr(expr);
      case "TryCatchExpr":      return this.emitTryCatchExpr(expr);
      case "TypeCheckExpr":     return `${expr.negated ? "!(" : ""}${this.emitExpr(expr.expr)} instanceof ${this.emitTypeRef(expr.type)}${expr.negated ? ")" : ""}`;
      case "TypeCastExpr":      return `(${this.emitExpr(expr.expr)} as unknown as ${this.emitTypeRef(expr.type)})`;
      case "SafeCastExpr":
        this.runtimeSymbolsNeeded.add("safeCast");
        return `safeCast(${this.emitExpr(expr.expr)}, ${this.emitTypeRef(expr.type)})`;
      case "RangeExpr":
        this.runtimeSymbolsNeeded.add("range");
        return `range(${this.emitExpr(expr.from)}, ${this.emitExpr(expr.to)}, ${expr.inclusive})`;
      case "LaunchExpr": {
        const stmts = this.captureBlock(expr.body);
        return `(async () => { ${stmts} })()`;
      }
      case "AsyncExpr": {
        const stmts = this.captureBlock(expr.body);
        return `(async () => { ${stmts} })()`;
      }
      case "CollectionLiteralExpr": return this.emitCollectionLiteral(expr);
      case "ObjectExpr":            return this.emitObjectExpr(expr);
      case "ReturnExpr": {
        const val = expr.value ? ` ${this.emitExpr(expr.value)}` : "";
        return `((() => { return${val}; })())`;
      }
      case "BreakExpr":             return `((() => { throw new Error("break used as expression is not supported"); })())`;
      case "ContinueExpr":          return `((() => { throw new Error("continue used as expression is not supported"); })())`;
      case "JsxElement":            return this.emitJsxElement(expr);
      default:                      return "undefined";
    }
  }

  private emitJsxElement(expr: AST.JsxElement): string {
    this.runtimeSymbolsNeeded.add("jalvinCreateElement");
    const attrsStr = expr.attrs.length > 0
      ? "{ " + expr.attrs.map((a) => this.emitJsxAttr(a)).join(", ") + " }"
      : "{}";
    const childrenArr = expr.children.length > 0
      ? "[" + expr.children.map((c) => this.emitJsxChild(c)).join(", ") + "]"
      : "[]";
    return `jalvinCreateElement(${JSON.stringify(expr.tag)}, ${attrsStr}, ${childrenArr})`;
  }

  private emitJsxAttr(attr: AST.JsxAttr): string {
    const name = attr.name === "class" ? "className" : attr.name === "for" ? "htmlFor" : attr.name;
    const val = attr.value === null ? "true" : typeof attr.value === "string" ? JSON.stringify(attr.value) : this.emitExpr(attr.value as AST.Expr);
    return `${name}: ${val}`;
  }

  private emitJsxChild(child: AST.JsxChild): string {
    switch (child.kind) {
      case "JsxElement":   return this.emitJsxElement(child);
      case "JsxExprChild": return this.emitExpr(child.expr);
      // Emit as a plain string so it flows through the VNode children array correctly.
      // createDOMNode() already handles string children via document.createTextNode().
      case "JsxTextChild": return JSON.stringify(child.text);
    }
  }

  private emitStringTemplate(expr: AST.StringTemplateExpr): string {
    const inner = expr.parts.map((p) => p.kind === "LiteralPart" ? p.value.replace(/`/g, "\\`").replace(/\\/g, "\\\\") : `\${${this.emitExpr(p.expr)}}`).join("");
    return `\`${inner}\``;
  }

  private emitCallExpr(expr: AST.CallExpr): string {
    if (expr.callee.kind === "MemberExpr" && (expr.callee.member === "downTo" || expr.callee.member === "until" || expr.callee.member === "step")) {
      const obj = this.emitExpr(expr.callee.target);
      const arg = expr.args.length > 0 ? this.emitExpr(expr.args[0]!.value) : "0";
      if (expr.callee.member === "downTo") { this.runtimeSymbolsNeeded.add("downTo"); return `downTo(${obj}, ${arg})`; }
      if (expr.callee.member === "until") { this.runtimeSymbolsNeeded.add("range"); return `range(${obj}, ${arg}, false)`; }
      if (expr.callee.member === "step") { this.runtimeSymbolsNeeded.add("step"); return `step(${obj}, ${arg})`; }
    }

    if (expr.callee.kind === "MemberExpr") {
      const scopeMember = expr.callee.member;
      const receiver = this.emitExpr(expr.callee.target);
      const lambda = expr.trailingLambda ?? (expr.args.length === 1 && expr.args[0]!.value.kind === "LambdaExpr" ? (expr.args[0]!.value as AST.LambdaExpr) : null);
      if (lambda) {
        if (scopeMember === "let") { this.runtimeSymbolsNeeded.add("let_"); return `let_(${receiver}, ${this.emitLambdaExpr(lambda)})`; }
        if (scopeMember === "also") { this.runtimeSymbolsNeeded.add("also"); return `also(${receiver}, ${this.emitLambdaExpr(lambda)})`; }
        if (scopeMember === "apply") { this.runtimeSymbolsNeeded.add("apply"); const body = this.captureBlockStatements(lambda.body); return `apply(${receiver}, function(this: any) { ${body} })`; }
        if (scopeMember === "run") { this.runtimeSymbolsNeeded.add("run_"); const body = this.captureBlockStatements(lambda.body); return `run_(${receiver}, function(this: any) { ${body} })`; }
        if (scopeMember === "takeIf") { this.runtimeSymbolsNeeded.add("takeIf"); return `takeIf(${receiver}, ${this.emitLambdaExpr(lambda)})`; }
        if (scopeMember === "takeUnless") { this.runtimeSymbolsNeeded.add("takeUnless"); return `takeUnless(${receiver}, ${this.emitLambdaExpr(lambda)})`; }
      }
    }

    if (expr.callee.kind === "MemberExpr") {
      const receiverType = this.typeMap.get(expr.callee.target);
      const memberName = expr.callee.member;
      if (receiverType) {
        const tsTypeName = this.jTypeToReceiverName(receiverType);
        if (tsTypeName) {
          const extMap = this.primitiveExtensions.get(tsTypeName);
          if (extMap?.has(memberName)) {
            const fnName = extMap.get(memberName)!;
            const receiver = this.emitExpr(expr.callee.target);
            const restArgs = expr.args.map((a) => a.spread ? `...${this.emitExpr(a.value)}` : this.emitExpr(a.value));
            if (expr.trailingLambda) restArgs.push(this.emitLambdaExpr(expr.trailingLambda));
            return `${fnName}(${[receiver, ...restArgs].join(", ")})`;
          }
        }
      }
    }

    const callee = this.emitExpr(expr.callee);
    const typeArgs = expr.typeArgs.length > 0 ? `<${expr.typeArgs.map((t) => t.star ? "*" : this.emitTypeRef(t.type!)).join(", ")}>` : "";

    if (expr.callee.kind === "NameExpr" && expr.callee.name === "with" && (expr.trailingLambda || (expr.args.length === 2 && expr.args[1]!.value.kind === "LambdaExpr"))) {
      const obj = expr.args.length > 0 ? this.emitExpr(expr.args[0]!.value) : "undefined";
      const lambda = expr.trailingLambda ?? (expr.args[1]!.value as AST.LambdaExpr);
      this.runtimeSymbolsNeeded.add("with_");
      const body = this.captureBlockStatements(lambda.body);
      return `with_(${obj}, function(this: any) { ${body} })`;
    }

    if (expr.callee.kind === "NameExpr" && expr.callee.name === "run" && expr.args.length === 0 && expr.trailingLambda) {
      return `(${this.emitLambdaExpr(expr.trailingLambda)})()`;
    }

    const calleeType = this.typeMap.get(expr.callee);
    const isKnownPositionalFunc = calleeType?.tag === "func" && calleeType.paramNames !== undefined;
    let isComponentLike = false;
    if (expr.callee.kind === "NameExpr") {
      isComponentLike = this.allComponentLikeNames.has(expr.callee.name) || (this.hasUiStarImport && (!calleeType || calleeType.tag === "unknown") && /^[A-Z]/.test(expr.callee.name));
    } else if (expr.callee.kind === "MemberExpr" || expr.callee.kind === "SafeMemberExpr") {
      isComponentLike = this.allComponentLikeNames.has((expr.callee as any).member);
    }

    if (!isKnownPositionalFunc && isComponentLike) return this.emitComponentCall(expr);

    let finalArgs: string[] = [];
    if (calleeType && calleeType.tag === "func" && calleeType.paramNames) {
      const paramNames = calleeType.paramNames;
      const argsByName = new Map<string, string>();
      const positionalArgs: string[] = [];
      for (const arg of expr.args) {
        if (arg.name) argsByName.set(arg.name, arg.spread ? `...${this.emitExpr(arg.value)}` : this.emitExpr(arg.value));
        else positionalArgs.push(arg.spread ? `...${this.emitExpr(arg.value)}` : this.emitExpr(arg.value));
      }
      for (let i = 0; i < paramNames.length; i++) {
        const name = paramNames[i]!;
        if (argsByName.has(name)) finalArgs.push(argsByName.get(name)!);
        else if (i < positionalArgs.length) finalArgs.push(positionalArgs[i]!);
        else finalArgs.push("undefined");
      }
      if (positionalArgs.length > paramNames.length) finalArgs.push(...positionalArgs.slice(paramNames.length));
    } else {
      finalArgs = expr.args.map((a) => a.spread ? `...${this.emitExpr(a.value)}` : this.emitExpr(a.value));
    }
    if (expr.trailingLambda) finalArgs.push(this.emitLambdaExpr(expr.trailingLambda));

    if (calleeType && calleeType.tag === "class" && calleeType.decl && this.classHasInvokeOperator(calleeType.decl)) {
      return `${callee}.invoke(${finalArgs.join(", ")})`;
    }

    if (this.isConstructorCall(expr.callee)) return `new ${callee}${typeArgs}(${finalArgs.join(", ")})`;
    return `${callee}${typeArgs}(${finalArgs.join(", ")})`;
  }

  private resolveExternalPackageImports(program: AST.Program, sourceRoot: string): void {
    for (const imp of program.imports) {
      if (imp.star) continue;
      if (imp.path[0] !== "@jalvin") continue;
      if (imp.path[1] === "ui") continue; // already handled
      if (imp.path.length < 2) continue;

      const rawSymbolName = imp.path[imp.path.length - 1]!;
      const symbolName = imp.alias ?? rawSymbolName;
      const moduleParts = imp.path.slice(0, -1);
      const moduleSpecifier = moduleParts[0] + "/" + moduleParts.slice(1).join("/");

      const propNames = this.readPropsObjectFromDts(rawSymbolName, moduleSpecifier, sourceRoot);
      if (propNames) {
        this.allComponentLikeNames.add(symbolName);
        this.componentParamNames.set(symbolName, propNames);
      }
    }
  }

  private readPropsObjectFromDts(symbolName: string, moduleSpecifier: string, sourceRoot: string): string[] | null {
    // Walk up to find node_modules/<moduleSpecifier>
    let pkgRoot: string | null = null;
    let dir = sourceRoot;
    while (true) {
      const candidate = nodePath.join(dir, "node_modules", moduleSpecifier);
      if (fs.existsSync(nodePath.join(candidate, "package.json"))) {
        pkgRoot = candidate;
        break;
      }
      const parent = nodePath.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    if (!pkgRoot) return null;

    let pkgJson: { types?: string; typings?: string };
    try {
      pkgJson = JSON.parse(fs.readFileSync(nodePath.join(pkgRoot, "package.json"), "utf8")) as { types?: string; typings?: string };
    } catch { return null; }

    const typesEntry = pkgJson.types ?? pkgJson.typings;
    if (!typesEntry) return null;

    const indexDtsPath = nodePath.join(pkgRoot, typesEntry);
    let indexContent: string;
    try {
      indexContent = fs.readFileSync(indexDtsPath, "utf8");
    } catch { return null; }

    // Follow re-export: `export { NavHost, ... } from "./nav.js"` → nav.d.ts
    const reExportRegex = new RegExp(
      `export\\s+\\{[^}]*\\b${symbolName}\\b[^}]*\\}\\s+from\\s+"([^"]+)"`,
      "s"
    );
    const reExportMatch = reExportRegex.exec(indexContent);

    let dtsContent: string;
    if (reExportMatch) {
      const subPath = reExportMatch[1]!.replace(/\.js$/, ".d.ts");
      try {
        dtsContent = fs.readFileSync(nodePath.join(nodePath.dirname(indexDtsPath), subPath), "utf8");
      } catch { return null; }
    } else {
      dtsContent = indexContent;
    }

    // Match: `declare function NavHost(props: { propA: ...; propB: ...; }, ...`
    const fnRegex = new RegExp(
      `declare\\s+function\\s+${symbolName}\\s*\\(\\s*props\\s*:\\s*\\{([^}]*)\\}`,
      "s"
    );
    const fnMatch = fnRegex.exec(dtsContent);
    if (!fnMatch) return null;

    const propNames: string[] = [];
    const propRegex = /(\w+)\s*:/g;
    let m: RegExpExecArray | null;
    while ((m = propRegex.exec(fnMatch[1]!)) !== null) {
      propNames.push(m[1]!);
    }
    return propNames.length > 0 ? propNames : null;
  }

  private resolveLocalComponentImports(program: AST.Program, sourceRoot: string): void {
    this.localStarExports.clear();
    for (const imp of program.imports) {
      if (imp.path[0]?.startsWith("@")) continue;
      if (imp.star) {
        if (imp.path.length < 1) continue;
        const candidatePath = nodePath.join(sourceRoot, imp.path.join("/") + ".jalvin");
        if (!fs.existsSync(candidatePath)) continue;
        try {
          const source = fs.readFileSync(candidatePath, "utf8");
          const diag = new DiagnosticBag();
          const tokens = lex(source, candidatePath, diag);
          if (diag.hasErrors) continue;
          const ast = parse(tokens, candidatePath, diag, source);
          if (diag.hasErrors) continue;
          const moduleSpecifier = imp.path.join("/");
          const exportedNames: string[] = [];
          for (const d of ast.declarations) {
            const name = (d as { name?: string }).name;
            if (!name) continue;
            exportedNames.push(name);
            if (d.kind === "ComponentDecl") {
              this.userComponentNames.add(name);
              this.allComponentLikeNames.add(name);
              this.componentParamNames.set(name, d.params.map((p) => p.name));
              this.hasComponents = true;
            }
            if (d.kind === "ClassDecl" && d.body) {
              for (const m of d.body.members) {
                if (m.kind === "ComponentDecl") {
                  this.allComponentLikeNames.add(m.name);
                  this.componentParamNames.set(m.name, m.params.map((p) => p.name));
                  this.hasComponents = true;
                }
              }
            }
          }
          if (exportedNames.length > 0) this.localStarExports.set(moduleSpecifier, exportedNames);
        } catch { }
        continue;
      }
      if (imp.path.length < 2) continue;
      const rawSymbolName = imp.path[imp.path.length - 1]!;
      const symbolName = imp.alias ?? rawSymbolName;
      const precedingParts = imp.path.slice(0, -1);
      const candidatePath = nodePath.join(sourceRoot, precedingParts.join("/") + ".jalvin");
      if (!fs.existsSync(candidatePath)) continue;
      try {
        const source = fs.readFileSync(candidatePath, "utf8");
        const diag = new DiagnosticBag();
        const tokens = lex(source, candidatePath, diag);
        if (diag.hasErrors) continue;
        const ast = parse(tokens, candidatePath, diag, source);
        if (diag.hasErrors) continue;
        const decl = ast.declarations.find((d): d is AST.ComponentDecl | AST.ClassDecl => ((d.kind === "ComponentDecl" || d.kind === "ClassDecl") && (d as any).name === rawSymbolName));
        if (decl?.kind === "ComponentDecl") {
          this.userComponentNames.add(symbolName);
          this.allComponentLikeNames.add(symbolName);
          this.componentParamNames.set(symbolName, decl.params.map((p) => p.name));
          this.hasComponents = true;
        } else if (decl?.kind === "ClassDecl" && decl.body) {
          for (const m of decl.body.members) {
            if (m.kind === "ComponentDecl") {
              this.userComponentNames.add(m.name);
              this.allComponentLikeNames.add(m.name);
              this.componentParamNames.set(m.name, m.params.map((p) => p.name));
              this.hasComponents = true;
            }
          }
        }
      } catch { }
    }
  }

  private isConstructorCall(calleeExpr: AST.Expr): boolean {
    const name =
      calleeExpr.kind === "NameExpr" ? calleeExpr.name :
      calleeExpr.kind === "MemberExpr" ? calleeExpr.member :
      null;
    if (name !== null && this.allComponentLikeNames.has(name)) return false;

    const tag = this.typeMap.get(calleeExpr)?.tag;
    if (tag === "class") return true;

    // Fallback for imported/unresolved symbols whose types are unknown
    if (tag === "unknown" || !tag) {
      return name !== null && /^[A-Z]/.test(name);
    }

    return false;
  }

  private emitComponentCall(expr: AST.CallExpr): string {
    const callee = this.emitExpr(expr.callee);
    const tagName = expr.callee.kind === "NameExpr" ? expr.callee.name : (expr.callee as any).member;
    const calleeType = this.typeMap.get(expr.callee);
    const paramNames = (calleeType?.tag === "func" ? calleeType.paramNames : undefined) ?? (tagName ? this.componentParamNames.get(tagName) : undefined);
    const props: string[] = [];
    for (let i = 0; i < expr.args.length; i++) {
      const arg = expr.args[i]!;
      const propName = arg.name ?? paramNames?.[i] ?? (arg.value.kind === "NameExpr" ? arg.value.name : undefined);
      const val = this.emitExpr(arg.value);
      if (!propName) {
        // Positional prop with no resolvable name — emit as a numbered key so the value
        // is not silently dropped.  e.g. __arg0: <expr>
        props.push(`__arg${i}: ${val}`);
        continue;
      }
      props.push(propName === val ? propName : `${propName}: ${val}`);
    }
    const propsStr = props.length > 0 ? `{ ${props.join(", ")} }` : "{}";
    if (expr.trailingLambda) {
      if (expr.trailingLambda.params.length > 0) {
        // Lambda with explicit params (e.g. builder-style): emit as a function, not DOM children
        return `${callee}(${propsStr}, [${this.emitLambdaExpr(expr.trailingLambda)}])`;
      }
      const children = this.emitLambdaBodyAsDomChildren(expr.trailingLambda);
      return `${callee}(${propsStr}, [${children}])`;
    }
    return `${callee}(${propsStr})`;
  }

  private emitLambdaBodyAsDomChildren(lambda: AST.LambdaExpr): string {
    const parts: string[] = [];
    for (const stmt of lambda.body) {
      if (stmt.kind === "ExprStmt") {
        parts.push(this.emitExpr((stmt as AST.ExprStmt).expr));
      } else if (stmt.kind === "IfStmt") {
        const s = stmt as AST.IfStmt;
        const cond = this.emitExpr(s.condition);
        const thenExprs = s.then.statements.filter((st) => st.kind === "ExprStmt").map((st) => this.emitExpr((st as AST.ExprStmt).expr));
        const elseExprs = s.else && s.else.kind === "Block" ? s.else.statements.filter((st) => st.kind === "ExprStmt").map((st) => this.emitExpr((st as AST.ExprStmt).expr)) : [];
        
        const thenStr = thenExprs.length > 0 ? `...(${cond} ? [${thenExprs.join(", ")}] : [])` : "";
        const elseStr = elseExprs.length > 0 ? `...(!(${cond}) ? [${elseExprs.join(", ")}] : [])` : "";
        if (thenStr) parts.push(thenStr);
        if (elseStr) parts.push(elseStr);
      } else if (stmt.kind === "ForStmt") {
        const s = stmt as AST.ForStmt;
        const iter = this.emitExpr(s.iterable);
        let bindingStr = typeof s.binding === "string" ? `const ${s.binding}` : s.binding.kind === "TupleDestructure" ? `const [${s.binding.names.map((n) => n ?? "_").join(", ")}]` : `const [${s.binding.key}, ${s.binding.value}]`;
        const innerExprs = s.body.statements.filter((inner) => inner.kind === "ExprStmt").map((inner) => this.emitExpr((inner as AST.ExprStmt).expr));
        if (innerExprs.length > 0) {
          const pushes = innerExprs.map((e) => `__c.push(${e});`).join(" ");
          parts.push(`...(() => { const __c: any[] = []; for (${bindingStr} of ${iter}) { ${pushes} } return __c; })()`);
        }
      }
    }
    return parts.join(", ");
  }

  private emitLambdaExpr(expr: AST.LambdaExpr): string {
    const params = expr.params.length === 0 ? "it" : expr.params.map((p) => p.name ?? "_").join(", ");
    if (expr.body.length === 1 && expr.body[0]!.kind === "ExprStmt") return `(${params}) => ${this.emitExpr((expr.body[0] as AST.ExprStmt).expr)}`;
    return `(${params}) => { ${expr.body.map((s) => this.captureStmt(s)).join(" ")} }`;
  }

  private emitIfExpr(expr: AST.IfExpr): string {
    const cond = this.emitExpr(expr.condition);
    const thenStr = expr.then.kind === "Block" ? `(() => { ${this.captureBlockStatements(expr.then.statements)} })()` : this.emitExpr(expr.then);
    const elseStr = expr.else.kind === "Block" ? `(() => { ${this.captureBlockStatements(expr.else.statements)} })()` : expr.else.kind === "IfExpr" ? this.emitIfExpr(expr.else) : this.emitExpr(expr.else);
    return `(${cond} ? ${thenStr} : ${elseStr})`;
  }

  private emitWhenExpr(expr: AST.WhenExpr): string {
    const parts: string[] = [];
    const subject = expr.subject ? `const __s = ${this.emitExpr(expr.subject.expr)};` : "";
    const subjectRef = expr.subject ? (expr.subject.binding ?? "__s") : "";
    for (const branch of expr.branches) {
      const body = branch.body.kind === "Block" ? this.captureBlock(branch.body) : `return ${this.emitExpr(branch.body)};`;
      if (branch.isElse) parts.push(`{ ${body} }`);
      else parts.push(`if (${branch.conditions.map((c) => this.emitWhenCondition(c, subjectRef)).join(" || ")}) { ${body} }`);
    }
    return `(() => { ${subject} ${parts.join(" else ")} })()`;
  }

  private emitTryCatchExpr(expr: AST.TryCatchExpr): string {
    const body = this.captureBlock(expr.body);
    const catches = expr.catches.map((c) => `catch (${c.name}) { ${this.captureBlock(c.body)} }`).join(" ");
    const fin = expr.finally ? `finally { ${this.captureBlock(expr.finally)} }` : "";
    return `(() => { try { ${body} } ${catches} ${fin} })()`;
  }

  private emitCollectionLiteral(expr: AST.CollectionLiteralExpr): string {
    if (expr.collectionKind === "map") return `new Map([${expr.elements.map((e) => ("kind" in e && e.kind === "MapEntry") ? `[${this.emitExpr(e.key)}, ${this.emitExpr(e.value)}]` : "null").join(", ")}])`;
    if (expr.collectionKind === "set") return `new Set([${(expr.elements as AST.Expr[]).map((e) => this.emitExpr(e)).join(", ")}])`;
    return `[${(expr.elements as AST.Expr[]).map((e) => this.emitExpr(e)).join(", ")}]`;
  }

  private emitObjectExpr(expr: AST.ObjectExpr): string {
    const superType = expr.superTypes[0];
    const ext = superType ? ` extends ${this.emitTypeRef(superType.type)}` : "";
    return `(new (class${ext} { ${expr.body.members.map((m) => this.captureClassMember(m)).join(" ")} })())`;
  }

  private captureBlock(block: AST.Block): string { return block.statements.map((s) => this.captureStmt(s)).join(" "); }
  private captureBlockStatements(stmts: readonly AST.Stmt[]): string { return stmts.map((s) => this.captureStmt(s)).join(" "); }
  private captureStmt(stmt: AST.Stmt): string {
    const saved = this.w;
    const tmp = new Writer();
    (this as any).w = tmp;
    try { this.emitStmt(stmt); } finally { (this as any).w = saved; }
    return tmp.output.trim();
  }
  private captureClassMember(member: AST.ClassMember): string {
    const saved = this.w;
    const tmp = new Writer();
    (this as any).w = tmp;
    try { this.emitClassMember(member); } finally { (this as any).w = saved; }
    return tmp.output.trim();
  }

  private emitTypeRef(ref: AST.TypeRef): string {
    switch (ref.kind) {
      case "SimpleTypeRef": return PRIMITIVE_TYPE_MAP[ref.name.join(".")] ?? ref.name.join(".");
      case "NullableTypeRef": return `${this.emitTypeRef(ref.base)} | null | undefined`;
      case "GenericTypeRef": return `${GENERIC_TYPE_MAP[ref.base.name.join(".")] ?? ref.base.name.join(".")}<${ref.args.map((a) => a.star ? "any" : a.type ? this.emitTypeRef(a.type) : "unknown").join(", ")}>`;
      case "FunctionTypeRef": return `(${ref.params.map((p, i) => `p${i}: ${this.emitTypeRef(p)}`).join(", ")}) => ${this.emitTypeRef(ref.returnType)}`;
      case "StarProjection": return "any";
    }
  }

  private emitTypeParamsStr(params: readonly AST.TypeParam[]): string { return params.length === 0 ? "" : `<${params.map((p) => `${p.name}${p.upperBound ? ` extends ${this.emitTypeRef(p.upperBound)}` : ""}`).join(", ")}>`; }
  private emitParamsStr(params: readonly AST.Param[]): string { return params.map((p) => `${p.vararg ? "..." : ""}${p.name}${this.opts.emitTypes ? `: ${this.emitTypeRef(p.type)}${p.vararg ? "[]" : ""}` : ""}${p.defaultValue ? ` = ${this.emitExpr(p.defaultValue)}` : ""}`).join(", "); }
  private emitSuperTypesStr(superTypes: readonly AST.SuperTypeEntry[]): string { return superTypes.length === 0 ? "" : superTypes.map((s, i) => i === 0 ? ` extends ${this.emitTypeRef(s.type)}` : ` implements ${this.emitTypeRef(s.type)}`).join(""); }
  private exportPrefix(mods: AST.Modifiers): string { return (mods.visibility === "private" || mods.visibility === "internal") ? "" : "export "; }
  private visibilityPrefix(mods: AST.Modifiers): string { switch (mods.visibility) { case "private": return "private "; case "protected": return "protected "; case "internal": return "/* internal */ "; default: return ""; } }
  private unaryOpStr(op: AST.UnaryOp): string { return op === "not" ? "!" : op; }
  private binaryOpStr(op: AST.BinaryOp): string { switch (op) { case "and": return "&&"; case "or": return "||"; case "xor": return "^"; case "shl": return "<<"; case "shr": return ">>"; case "ushr": return ">>>"; case "===": return "==="; case "!==": return "!=="; default: return op; } }
  private gatherReferencedNames(program: AST.Program): Set<string> {
    const names = new Set<string>(); const visited = new WeakSet<object>();
    const walk = (val: unknown): void => {
      if (!val || typeof val !== "object" || visited.has(val)) return; visited.add(val);
      if (Array.isArray(val)) { val.forEach(walk); return; }
      const obj = val as any;
      if (obj.kind === "NameExpr") { if (typeof obj.name === "string") names.add(obj.name); return; }
      if (obj.kind === "SimpleTypeRef") { if (obj.name?.[0] && !(obj.name[0] in PRIMITIVE_TYPE_MAP)) names.add(obj.name[0]); return; }
      if (obj.kind === "GenericTypeRef") { if (obj.base?.name?.[0] && !(obj.base.name[0] in PRIMITIVE_TYPE_MAP)) names.add(obj.base.name[0]); }
      Object.values(obj).forEach(walk);
    };
    program.declarations.forEach(walk); return names;
  }
  private gatherAllLocalBindings(program: AST.Program): Set<string> {
    const names = new Set<string>(); const visited = new WeakSet<object>();
    program.declarations.forEach((d: any) => { if (d.name) names.add(d.name); });
    program.imports.forEach((i) => { if (!i.star) names.add(i.alias ?? i.path[i.path.length - 1]!); });
    const walk = (val: unknown): void => {
      if (!val || typeof val !== "object" || visited.has(val)) return; visited.add(val);
      if (Array.isArray(val)) { val.forEach(walk); return; }
      const obj = val as any;
      if (["PropertyDecl", "DestructuringDecl", "FunDecl", "ExtensionFunDecl", "ComponentDecl", "ClassDecl", "DataClassDecl", "SealedClassDecl", "EnumClassDecl", "InterfaceDecl", "ObjectDecl", "TypeAliasDecl", "LambdaExpr"].includes(obj.kind) && obj.name) names.add(obj.name);
      if (obj.typeParams) obj.typeParams.forEach((tp: any) => names.add(tp.name));
      if (obj.params) obj.params.forEach((p: any) => names.add(p.name));
      if (obj.kind === "ForStmt" && typeof obj.binding === "string") names.add(obj.binding);
      if (obj.kind === "TryCatchStmt" && obj.catches) obj.catches.forEach((c: any) => names.add(c.name));
      Object.values(obj).forEach(walk);
    };
    program.declarations.forEach(walk); return names;
  }
}

const PRIMITIVE_TYPE_MAP: Record<string, string> = { Int: "number", Long: "bigint", Float: "number", Double: "number", Boolean: "boolean", String: "string", Char: "string", Byte: "number", Short: "number", Unit: "void", Any: "unknown", Nothing: "never" };
const GENERIC_TYPE_MAP: Record<string, string> = { List: "ReadonlyArray", MutableList: "Array", Set: "ReadonlySet", MutableSet: "Set", Map: "ReadonlyMap", MutableMap: "Map", Array: "Array", Deferred: "Promise", StateFlow: "StateFlow", MutableStateFlow: "MutableStateFlow", Flow: "AsyncIterable" };
const PRIMITIVE_TYPES = new Set(Object.keys(PRIMITIVE_TYPE_MAP));
const JS_GLOBAL_NAMES = new Set(["Array", "Map", "Set", "Object", "String", "Number", "Boolean", "Promise", "Error", "console", "Math", "Date", "JSON", "setTimeout", "setInterval", "fetch", "document", "window", "undefined", "null", "NaN", "Infinity", "it", "this", "super", "any", "unknown", "never", "void"]);

export function generate(program: AST.Program, opts?: Partial<CodegenOptions>, operatorOverloads?: Map<AST.BinaryExpr, string>, typeMap?: Map<object, JType>): CodegenResult { return new CodeGenerator(opts).generate(program, operatorOverloads, typeMap); }
