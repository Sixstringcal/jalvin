// ─────────────────────────────────────────────────────────────────────────────
// Jalvin Code Generator — AST → TypeScript/TSX
//
// Design principles:
//   • component declarations  → React functional components (TSX)
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
  /** Emit .tsx (React JSX) output — set for files containing `component` decls */
  readonly jsx: boolean;
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
  jsx: false,
  module: "esm",
  emitTypes: false,
  runtimeImport: "@jalvin/runtime",
};

export interface CodegenResult {
  readonly code: string;
  readonly lineMap: number[];
  /** Whether JSX was emitted (caller should rename output to .tsx) */
  readonly isJsx: boolean;
}

export class CodeGenerator {
  private readonly w = new Writer();
  private readonly opts: CodegenOptions;
  private hasComponents = false;
  private runtimeSymbolsNeeded = new Set<string>();
  /** Names of component functions — used to detect Compose-style calls and emit them as JSX */
  private componentNames = new Set<string>();
  /** True when the program contains `import @jalvin/ui.*` — used to detect UI primitive calls */
  private hasUiStarImport = false;
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
    ) || program.imports.some((imp) => imp.path[0] === "@jalvin" && imp.path[1] === "ui");

    // Collect component names for Compose-style call detection
    this.componentNames = new Set<string>();
    for (const decl of program.declarations) {
      if (decl.kind === "ComponentDecl") this.componentNames.add(decl.name);
      if (decl.kind === "ClassDecl" && decl.body) {
        for (const m of decl.body.members) {
          if (m.kind === "ComponentDecl") this.componentNames.add(m.name);
        }
      }
    }
    this.hasUiStarImport = false;
    for (const imp of program.imports) {
      // Named imports from @jalvin/ui are component functions
      if (imp.path[0] === "@jalvin" && imp.path[1] === "ui" && !imp.star) {
        this.componentNames.add(imp.path[imp.path.length - 1]!);
      }
      // Star import from @jalvin/ui — UI primitives won't be in componentNames
      if (imp.path[0] === "@jalvin" && imp.path[1] === "ui" && imp.star) {
        this.hasUiStarImport = true;
      }
    }

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
      isJsx: false, // DOM-based emit — no JSX
    };
  }

  // ── Preamble & imports ─────────────────────────────────────────────────────

  private buildPreamble(): string {
    const lines: string[] = [];

    // No React import — @jalvin/ui is DOM-based.

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
      // Build module specifier.
      //
      // Scoped packages (@org/pkg.Symbol): symbol is an export from the package,
      // strip the last segment.
      //   import @jalvin/ui.Column       → import { Column } from "@jalvin/ui"
      //   import @jalvin/runtime.*       → import * as runtime from "@jalvin/runtime"
      //
      // Local imports (a.b.C): check whether the preceding segments already
      // resolve to a file on disk.
      //   import src.models.Rotation     → src/models/Rotation.ts does NOT exist
      //                                    → import { Rotation } from "src/models/Rotation"
      //   import src.models.css.Css      → src/models/css.ts DOES exist
      //                                    → import { Css } from "src/models/css"
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
        // Local import: check if the preceding segments resolve to a file.
        const precedingParts = imp.path.slice(0, -1);
        const precedingRelPath = precedingParts.join("/");
        const fileExts = [".ts", ".tsx", ".jalvin"];
        const precedingIsFile = precedingParts.length > 0 && fileExts.some((ext) =>
          fs.existsSync(nodePath.join(sourceRoot, precedingRelPath + ext))
        );
        moduleSpecifier = precedingIsFile
          ? precedingRelPath          // src.models.css.Css → "src/models/css"
          : imp.path.join("/");       // src.models.Rotation → "src/models/Rotation"
      }

      if (imp.star && isScoped && this.externalStarCandidates.size > 0) {
        // Named-import expansion of a scoped star import.
        // Emit explicit named imports for each external symbol used in the file so
        // that symbols like `ViewModel`, `mutableStateOf` are directly in scope.
        const symbols = [...this.externalStarCandidates].sort();
        this.w.writeIndentedLine(`import { ${symbols.join(", ")} } from "${moduleSpecifier}";`);
        this.handledStarImportModules.add(moduleSpecifier);
      } else if (imp.star) {
        // Fallback: namespace import (multiple scoped star imports or no candidates).
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

  // ── Top-level declarations ─────────────────────────────────────────────────

  /** Emit a @deprecated JSDoc block if the declaration has @Nuked. */
  private emitAnnotations(mods: AST.Modifiers): void {
    for (const ann of mods.annotations) {
      if (ann.name === "Nuked") {
        const reason = ann.args ? ` ${ann.args.replace(/^["']|["']$/g, "")}` : "";
        this.w.writeIndentedLine(`/** @deprecated${reason} */`);
      }
      // Other annotations are silently ignored for now (pass-through model)
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
      // Abstract / interface method
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
      // Expression body
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

  // ── component declarations → React function components ────────────────────

  private emitComponentDecl(decl: AST.ComponentDecl): void {
    this.emitAnnotations(decl.modifiers);
    this.hasComponents = true;
    const vis = this.exportPrefix(decl.modifiers);
    const params = this.emitComponentPropsStr(decl.params);

    // Props interface
    if (decl.params.length > 0) {
      this.w.writeIndentedLine(`interface ${decl.name}Props {`);
      this.w.pushIndent();
      for (const p of decl.params) {
        const optional = p.defaultValue ? "?" : "";
        const typeStr = this.opts.emitTypes ? this.emitTypeRef(p.type) : "any";
        this.w.writeIndentedLine(`readonly ${p.name}${optional}: ${typeStr};`);
      }
      this.w.popIndent();
      this.w.writeIndentedLine(`}`);
      this.w.writeLine();
    }

    const propsParam = decl.params.length > 0
      ? `{ ${decl.params.map((p) => p.name + (p.defaultValue ? ` = ${this.emitExpr(p.defaultValue)}` : "")).join(", ")} }: ${decl.name}Props`
      : "";

    this.w.writeIndentedLine(`${vis}function ${decl.name}(${propsParam}) {`);
    this.w.pushIndent();
    this.emitComponentBlock(decl.body);
    this.w.popIndent();
    this.w.writeIndentedLine(`}`);
  }

  /**
   * Emit the body of a `component fun` block.
   * The last statement, if it is a plain expression, is implicitly returned
   * (Kotlin-style implicit return of the last expression).
   */
  private emitComponentBlock(block: AST.Block): void {
    const stmts = block.statements;
    for (let i = 0; i < stmts.length; i++) {
      const stmt = stmts[i]!;
      if (i === stmts.length - 1 && stmt.kind === "ExprStmt") {
        // Implicit return: last expression in a component block
        this.w.writeIndentedLine(`return ${this.emitExpr(stmt.expr)};`);
      } else {
        this.emitStmt(stmt);
      }
    }
  }

  // ── regular class ──────────────────────────────────────────────────────────

  private emitClassDecl(decl: AST.ClassDecl): void {
    this.emitAnnotations(decl.modifiers);
    const vis = this.exportPrefix(decl.modifiers);
    const abstract = decl.modifiers.modifiers.includes("abstract") ? "abstract " : "";
    const typeParams = this.emitTypeParamsStr(decl.typeParams);
    const superTypes = this.emitSuperTypesStr(decl.superTypes);

    this.w.writeIndentedLine(`${vis}${abstract}class ${decl.name}${typeParams}${superTypes} {`);
    this.w.pushIndent();

    // The first supertype's delegateArgs become the `super(args)` call inside the constructor.
    const superDelegateArgs = decl.superTypes[0]?.delegateArgs ?? null;

    if (decl.primaryConstructor) {
      const initBlocks = decl.body?.members.filter((m): m is AST.InitBlock => m.kind === "InitBlock") ?? [];
      this.emitPrimaryConstructorProps(decl.primaryConstructor.params, initBlocks, superDelegateArgs);
    } else if (superDelegateArgs !== null) {
      // No primary constructor but the supertype has explicit delegation args —
      // emit a minimal constructor that forwards them to super().
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

    // Discriminant for sealed class sub-types
    if (kindName) {
      this.w.writeIndentedLine(`readonly __kind = "${kindName}" as const;`);
    }

    // Constructor params → readonly properties
    for (const p of props) {
      const t = this.opts.emitTypes ? `: ${this.emitTypeRef(p.type)}` : "";
      this.w.writeIndentedLine(`readonly ${p.name}${t};`);
    }
    this.w.writeLine();

    // Constructor
    const ctorParams = props.map((p) => {
      const t = this.opts.emitTypes ? `: ${this.emitTypeRef(p.type)}` : "";
      return `${p.name}${t}`;
    }).join(", ");
    this.w.writeIndentedLine(`constructor(${ctorParams}) {`);
    this.w.pushIndent();
    // Emit super() with actual delegation args (or empty call if delegateArgs is []).
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

    // copy()
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

    // equals()
    this.runtimeSymbolsNeeded.add("jalvinEquals");
    const eqChecks = props.map((p) => `jalvinEquals(this.${p.name}, other.${p.name})`).join(" && ") || "true";
    this.w.writeIndentedLine(`equals(other: unknown): boolean {`);
    this.w.pushIndent();
    this.w.writeIndentedLine(`if (!(other instanceof ${decl.name})) return false;`);
    this.w.writeIndentedLine(`return ${eqChecks};`);
    this.w.popIndent();
    this.w.writeIndentedLine(`}`);
    this.w.writeLine();

    // toString()
    const toStringParts = props.map((p) => `${p.name}=\${this.${p.name}}`).join(", ");
    this.w.writeIndentedLine(`toString(): string {`);
    this.w.pushIndent();
    this.w.writeIndentedLine(`return \`${decl.name}(${toStringParts})\`;`);
    this.w.popIndent();
    this.w.writeIndentedLine(`}`);
    this.w.writeLine();

    // hashCode() — djb2
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

    // Separate sub-type declarations from regular members
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

    // Emit the abstract base class (only non-subtype members in the body)
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

    // Emit non-object sub-declarations at module level (before namespace)
    for (const sub of subDecls) {
      if (sub.kind === "DataClassDecl") {
        this.emitDataClassDecl(sub, sub.name);
        this.w.writeLine();
      } else if (sub.kind === "ClassDecl") {
        this.emitClassDecl(sub);
        this.w.writeLine();
      }
    }

    // Emit namespace merging so SealedClass.SubType is accessible
    this.w.writeIndentedLine(`${vis}namespace ${decl.name} {`);
    this.w.pushIndent();
    for (const sub of subDecls) {
      if (sub.kind === "ObjectDecl") {
        // Singleton object — emit inline in namespace with __kind discriminant
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
        // DataClassDecl / ClassDecl — already emitted at module level, re-export
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

    // Emit the enum as a TypeScript class with static singleton instances.
    // This preserves the `EnumClass.ENTRY` access pattern and allows
    // methods/properties to be attached to entries.
    this.w.writeIndentedLine(`${vis}class ${decl.name}${typeParams} {`);
    this.w.pushIndent();

    // Private constructor so entries are the only instances
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

    // Static entry instances
    for (let i = 0; i < decl.entries.length; i++) {
      const entry = decl.entries[i]!;
      const args = entry.args.length > 0
        ? entry.args.map((a) => this.emitExpr(a.value)).join(", ")
        : `"${entry.name}", ${i}`;
      this.w.writeIndentedLine(`static readonly ${entry.name} = new ${decl.name}(${args});`);
    }

    if (decl.entries.length > 0) {
      this.w.writeLine();
      // values() helper
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

  // ── destructuring declaration — val (a, b) = expr ─────────────────────────

  private emitDestructuringDecl(decl: AST.DestructuringDecl, _memberOf: boolean): void {
    const kw = decl.mutable ? "let" : "const";
    const names = decl.names.map((n) => n ?? "_").join(", ");
    const init = this.emitExpr(decl.initializer);
    this.w.writeIndentedLine(`${kw} [${names}] = ${init};`);
  }

  // ── interface ──────────────────────────────────────────────────────────────

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

  // ── object declaration → singleton ────────────────────────────────────────

  private emitObjectDecl(decl: AST.ObjectDecl): void {
    if (!decl.name) {
      // Anonymous object — emitted inline
      return;
    }
    this.emitAnnotations(decl.modifiers);
    const vis = this.exportPrefix(decl.modifiers);
    const superTypes = this.emitSuperTypesStr(decl.superTypes);

    this.w.writeIndentedLine(`${vis}const ${decl.name} = new (class${superTypes} {`);
    this.w.pushIndent();
    this.emitClassBody(decl.body);
    this.w.popIndent();
    this.w.writeIndentedLine(`})();`);
  }

  // ── type alias ─────────────────────────────────────────────────────────────

  private emitTypeAliasDecl(decl: AST.TypeAliasDecl): void {
    const vis = this.exportPrefix(decl.modifiers);
    const typeParams = this.emitTypeParamsStr(decl.typeParams);
    this.w.writeIndentedLine(`${vis}type ${decl.name}${typeParams} = ${this.emitTypeRef(decl.type)};`);
  }

  // ── extension functions ────────────────────────────────────────────────────
  // Emitted as standalone free functions with receiver as explicit first param.
  // For class types, also patched onto the prototype for dot-call syntax.
  // For primitive types, call sites are rewritten via `primitiveExtensions`.

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

    // Emit as a free function: receiver is the first explicit parameter `$receiver`.
    // Inside the function body, `this` is rebound to `$receiver` so Jalvin's
    // `this.prop` references work correctly.
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
        // Register for call-site rewriting — cannot patch primitive prototypes
        if (!this.primitiveExtensions.has(simpleReceiverName)) {
          this.primitiveExtensions.set(simpleReceiverName, new Map());
        }
        this.primitiveExtensions.get(simpleReceiverName)!.set(decl.name, fnName);
      } else {
        // Class types — prototype monkey-patch for dot-call syntax
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

  /**
   * Maps a JType to the primitive receiver type name used as a key
   * in `primitiveExtensions` (e.g. JType `{ tag: "string" }` → `"String"`).
   * Returns null for non-primitive / unknown types.
   */
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

  // ── property declaration ───────────────────────────────────────────────────

  private emitPropertyDecl(decl: AST.PropertyDecl, member: boolean, isLocal = false): void {
    this.emitAnnotations(decl.modifiers);
    const vis = member ? this.visibilityPrefix(decl.modifiers) : isLocal ? "" : this.exportPrefix(decl.modifiers);
    const isConst = decl.modifiers.modifiers.includes("const");
    const isLateinit = decl.modifiers.modifiers.includes("lateinit");
    // `const val` → `const` at module level; inside classes treated as `static readonly`
    const kw = member
      ? (decl.mutable ? "" : "readonly ")
      : (isConst ? "const " : decl.mutable ? "let " : "const ");
    const type = decl.type && this.opts.emitTypes ? `: ${this.emitTypeRef(decl.type)}` : "";

    if (decl.delegate) {
      // Delegated property — wrap in a getter/setter pair using the delegate
      this.runtimeSymbolsNeeded.add("delegate");
      const delegateExpr = this.emitExpr(decl.delegate);
      if (member) {
        this.w.writeIndentedLine(`${vis}get ${decl.name}()${type} { return delegate(${delegateExpr}, "${decl.name}", this).getValue(); }`);
        if (decl.mutable) {
          this.w.writeIndentedLine(`${vis}set ${decl.name}(v: any) { delegate(${delegateExpr}, "${decl.name}", this).setValue(v); }`);
        }
      } else {
        this.w.writeIndentedLine(`${kw}${decl.name}${type} = ${delegateExpr};`);
      }
      return;
    }

    const init = decl.initializer ? ` = ${this.emitExpr(decl.initializer)}` : (isLateinit ? "" : "");

    if (member) {
      const modStr = isConst ? "static readonly " : decl.mutable ? "" : "readonly ";
      this.w.writeIndentedLine(`${vis}${modStr}${decl.name}${type}${init};`);
    } else {
      this.w.writeIndentedLine(`${vis}${kw}${decl.name}${type}${init};`);
    }

    if (decl.getter) {
      this.emitPropertyAccessor("get", decl.name, decl.getter, member, type);
    }
    if (decl.setter) {
      this.emitPropertyAccessor("set", decl.name, decl.setter, member, type);
    }
  }

  private emitPropertyAccessor(
    kind: "get" | "set",
    name: string,
    acc: AST.PropertyAccessor,
    member: boolean,
    type: string
  ): void {
    const retOrParam = kind === "get" ? type : `(value: any)`;
    const vis = this.visibilityPrefix(acc.modifiers);
    this.w.writeIndentedLine(`${vis}${kind} ${name}()${retOrParam} {`);
    this.w.pushIndent();
    if (acc.body) {
      if (acc.body.kind === "Block") this.emitBlock(acc.body);
      else this.w.writeIndentedLine(`return ${this.emitExpr(acc.body)};`);
    }
    this.w.popIndent();
    this.w.writeIndentedLine(`}`);
  }

  // ── class body ─────────────────────────────────────────────────────────────

  private emitClassBody(body: AST.ClassBody): void {
    for (const member of body.members) {
      // InitBlocks are emitted inside the constructor by emitPrimaryConstructorProps
      if (member.kind === "InitBlock") continue;
      this.emitClassMember(member);
      this.w.writeLine();
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
      case "InitBlock":         /* handled in constructor */ break;
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
    // Constructor
    const ctorParams = params.map((p) => {
      const ro = p.propertyKind === "val" ? "readonly " : p.propertyKind === "var" ? "" : "";
      const type = this.opts.emitTypes ? `: ${this.emitTypeRef(p.type)}` : "";
      const def = p.defaultValue ? ` = ${this.emitExpr(p.defaultValue)}` : "";
      return `${p.name}${type}${def}`;
    });
    this.w.writeIndentedLine(`constructor(${ctorParams.join(", ")}) {`);
    this.w.pushIndent();
    // super() call must be the first statement if there is a supertype.
    if (superDelegateArgs !== null && superDelegateArgs !== undefined) {
      const superArgsStr = superDelegateArgs.map((a) => this.emitExpr(a.value)).join(", ");
      this.w.writeIndentedLine(`super(${superArgsStr});`);
    }
    for (const p of params) {
      if (p.propertyKind) {
        this.w.writeIndentedLine(`this.${p.name} = ${p.name};`);
      }
    }
    // Emit init{} blocks inside the constructor, in declaration order
    for (const ib of (initBlocks ?? [])) {
      this.emitBlock(ib.body);
    }
    this.w.popIndent();
    this.w.writeIndentedLine(`}`);
    this.w.writeLine();
  }

  private emitCompanionObject(co: AST.CompanionObject): void {
    // Emit companion object members as `static` members of the outer class so that
    // `MyClass.factoryMethod()` works directly (standard semantics).
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

  // ── Statements ─────────────────────────────────────────────────────────────

  private emitBlock(block: AST.Block): void {
    for (const stmt of block.statements) {
      this.emitStmt(stmt);
    }
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
    // when(subject) { is Foo -> ... else -> ... }
    // Compiles to a series of if/else-if chains
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
        this.emitBlock(branch.body);
      } else {
        this.w.writeIndentedLine(`${this.emitExpr(branch.body)};`);
      }
      this.w.popIndent();
    }
    this.w.writeIndentedLine(`}`);
  }

  private emitWhenCondition(cond: AST.WhenCondition, subject: string): string {
    switch (cond.kind) {
      case "WhenIsCondition": {
        // Qualified name (e.g. UiState.Loading) → use __kind discriminant
        // Single name (e.g. BibiError) → use instanceof
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
        return subject
          ? `${subject} === ${this.emitExpr(cond.expr)}`
          : this.emitExpr(cond.expr);
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
      // Use .entries() for JS Map (Map<K,V>), Object.entries() for plain objects
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
      // Narrow type
      if (this.opts.emitTypes) {
        this.w.writeIndentedLine(`if (!(${c.name} instanceof ${this.emitTypeRef(c.type)})) throw ${c.name};`);
      }
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

  // ── Expressions ────────────────────────────────────────────────────────────

  emitExpr(expr: AST.Expr): string {
    switch (expr.kind) {
      case "IntLiteralExpr":    return String(expr.value);
      case "LongLiteralExpr":   return `BigInt(${expr.value})`;
      case "FloatLiteralExpr":
      case "DoubleLiteralExpr": return String(expr.value);
      case "BooleanLiteralExpr": return String(expr.value);
      case "NullLiteralExpr":   return "null";
      case "StringLiteralExpr":
        return expr.raw
          ? `\`${expr.value}\``
          : JSON.stringify(expr.value);
      case "StringTemplateExpr":
        return this.emitStringTemplate(expr);
      case "NameExpr":
        // Ensure Int/Long companion objects are imported from the runtime
        if (expr.name === "Int" || expr.name === "Long") {
          this.runtimeSymbolsNeeded.add(expr.name);
        }
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
          // `compareTo` overloads: wrap result in a comparison against 0
          if (opMethod === "compareTo") {
            const cmpOp = expr.op as string;
            return `(${l}.compareTo(${r}) ${cmpOp} 0)`;
          }
          // `contains` overloads: `element in collection` → `collection.contains(element)`
          if (opMethod === "contains") {
            return `${r}.contains(${l})`;
          }
          if (opMethod === "!contains") {
            return `!${r}.contains(${l})`;
          }
          // Generic operator overload: emit as method call `left.method(right)`
          return `${l}.${opMethod}(${r})`;
        }
        // `==` → structural equality, `!=` → negation
        if (expr.op === "==" || expr.op === "!=") {
          this.runtimeSymbolsNeeded.add("jalvinEquals");
          const eq = `jalvinEquals(${this.emitExpr(expr.left)}, ${this.emitExpr(expr.right)})`;
          return expr.op === "==" ? eq : `!${eq}`;
        }
        // `in` / `!in` without a user-defined operator: use JS `in` / array includes
        if (expr.op === "in") {
          return `${this.emitExpr(expr.right)}.includes?.(${this.emitExpr(expr.left)}) ?? (${this.emitExpr(expr.left)} in ${this.emitExpr(expr.right)})`;
        }
        if (expr.op === "!in") {
          return `!(${this.emitExpr(expr.right)}.includes?.(${this.emitExpr(expr.left)}) ?? (${this.emitExpr(expr.left)} in ${this.emitExpr(expr.right)}))`;
        }
        return `(${this.emitExpr(expr.left)} ${this.binaryOpStr(expr.op)} ${this.emitExpr(expr.right)})`;
      }      case "AssignExpr":
        return `${this.emitExpr(expr.target as AST.Expr)} = ${this.emitExpr(expr.value)}`;
      case "CompoundAssignExpr":
        return `${this.emitExpr(expr.target as AST.Expr)} ${expr.op} ${this.emitExpr(expr.value)}`;
      case "IncrDecrExpr":
        return expr.prefix
          ? `${expr.op}${this.emitExpr(expr.target as AST.Expr)}`
          : `${this.emitExpr(expr.target as AST.Expr)}${expr.op}`;
      case "MemberExpr":
        return `${this.emitExpr(expr.target)}.${expr.member}`;
      case "SafeMemberExpr":
        return `${this.emitExpr(expr.target)}?.${expr.member}`;
      case "IndexExpr":
        return `${this.emitExpr(expr.target)}[${this.emitExpr(expr.index)}]`;
      case "NotNullExpr":
        // Runtime check
        this.runtimeSymbolsNeeded.add("notNull");
        return `notNull(${this.emitExpr(expr.expr)})`;
      case "ElvisExpr": {
        // left ?? right  (null coalescing)
        return `(${this.emitExpr(expr.left)} ?? ${this.emitExpr(expr.right)})`;
      }
      case "CallExpr":
        return this.emitCallExpr(expr);
      case "LambdaExpr":
        return this.emitLambdaExpr(expr);
      case "IfExpr":
        return this.emitIfExpr(expr);
      case "WhenExpr":
        return this.emitWhenExpr(expr);
      case "TryCatchExpr":
        return this.emitTryCatchExpr(expr);
      case "TypeCheckExpr":
        return `${expr.negated ? "!(" : ""}${this.emitExpr(expr.expr)} instanceof ${this.emitTypeRef(expr.type)}${expr.negated ? ")" : ""}`;
      case "TypeCastExpr":
        // Unsafe cast — emit as `(expr as Type)` which is stripped at runtime
        return `(${this.emitExpr(expr.expr)} as unknown as ${this.emitTypeRef(expr.type)})`;
      case "SafeCastExpr": {
        this.runtimeSymbolsNeeded.add("safeCast");
        return `safeCast(${this.emitExpr(expr.expr)}, ${this.emitTypeRef(expr.type)})`;
      }
      case "RangeExpr": {
        this.runtimeSymbolsNeeded.add("range");
        return `range(${this.emitExpr(expr.from)}, ${this.emitExpr(expr.to)}, ${expr.inclusive})`;
      }
      case "LaunchExpr": {
        // fire-and-forget → void IIFE
        const stmts = this.captureBlock(expr.body);
        return `(async () => { ${stmts} })()`;
      }
      case "AsyncExpr": {
        // returns Promise<T>
        const stmts = this.captureBlock(expr.body);
        return `(async () => { ${stmts} })()`;
      }
      case "CollectionLiteralExpr":
        return this.emitCollectionLiteral(expr);
      case "ObjectExpr":
        return this.emitObjectExpr(expr);
      case "ReturnExpr": {
        const val = expr.value ? ` ${this.emitExpr(expr.value)}` : "";
        return `((() => { return${val}; })())`;
      }
      case "BreakExpr":   return "undefined /* break */";
      case "ContinueExpr": return "undefined /* continue */";
      case "JsxElement":
        return this.emitJsxElement(expr);
      default:
        return "undefined";
    }
  }

  // ── JSX ──────────────────────────────────────────────────────────────────

  private emitJsxElement(expr: AST.JsxElement): string {
    const attrsStr = expr.attrs.length > 0
      ? " " + expr.attrs.map((a) => this.emitJsxAttr(a)).join(" ")
      : "";
    if (expr.children.length === 0) {
      return `<${expr.tag}${attrsStr} />`;
    }
    const children = expr.children.map((c) => this.emitJsxChild(c)).join("");
    return `<${expr.tag}${attrsStr}>${children}</${expr.tag}>`;
  }

  private emitJsxAttr(attr: AST.JsxAttr): string {
    // Map HTML attribute names to React prop names
    const name = attr.name === "class" ? "className"
      : attr.name === "for" ? "htmlFor"
      : attr.name;
    if (attr.value === null) return name;
    if (typeof attr.value === "string") return `${name}="${attr.value}"`;
    return `${name}={${this.emitExpr(attr.value as AST.Expr)}}`;
  }

  private emitJsxChild(child: AST.JsxChild): string {
    switch (child.kind) {
      case "JsxElement":   return this.emitJsxElement(child);
      case "JsxExprChild": return `{${this.emitExpr(child.expr)}}`;
      case "JsxTextChild": return child.text;
    }
  }

  private emitStringTemplate(expr: AST.StringTemplateExpr): string {
    const inner = expr.parts.map((p) => {
      if (p.kind === "LiteralPart") {
        return p.value.replace(/`/g, "\\`").replace(/\\/g, "\\\\");
      }
      return `\${${this.emitExpr(p.expr)}}`;
    }).join("");
    return `\`${inner}\``;
  }

  private emitCallExpr(expr: AST.CallExpr): string {
    // Rewrite infix numeric extension calls that JS numbers don't natively have:
    //   `a.downTo(b)` → `downTo(a, b)`   `a.until(b)` → `range(a, b, false)`
    //   `range.step(n)` → `step(range, n)`
    if (
      expr.callee.kind === "MemberExpr" &&
      (expr.callee.member === "downTo" || expr.callee.member === "until" || expr.callee.member === "step")
    ) {
      const obj = this.emitExpr(expr.callee.target);
      const arg = expr.args.length > 0 ? this.emitExpr(expr.args[0]!.value) : "0";
      if (expr.callee.member === "downTo") {
        this.runtimeSymbolsNeeded.add("downTo");
        return `downTo(${obj}, ${arg})`;
      }
      if (expr.callee.member === "until") {
        this.runtimeSymbolsNeeded.add("range");
        return `range(${obj}, ${arg}, false)`;
      }
      if (expr.callee.member === "step") {
        this.runtimeSymbolsNeeded.add("step");
        return `step(${obj}, ${arg})`;
      }
    }

    // Rewrite calls on primitive-receiver extension functions.
    // `str.truncate(30)` where `String.truncate` is a user extension → `__ext_string_truncate(str, 30)`
    if (expr.callee.kind === "MemberExpr") {
      const scopeMember = expr.callee.member;

      // Scope function call rewriting: `x.let { ... }` → `let_(x, ...)`
      // `x.apply { ... }` → `apply(x, function(this:any) { ... })`
      if (scopeMember === "let" || scopeMember === "also" || scopeMember === "apply" || scopeMember === "run" || scopeMember === "takeIf" || scopeMember === "takeUnless") {
        const receiver = this.emitExpr(expr.callee.target);
        const lambda = expr.trailingLambda ??
          (expr.args.length === 1 && expr.args[0]!.value.kind === "LambdaExpr"
            ? (expr.args[0]!.value as AST.LambdaExpr)
            : null);

        if (lambda) {
          if (scopeMember === "let") {
            this.runtimeSymbolsNeeded.add("let_");
            return `let_(${receiver}, ${this.emitLambdaExpr(lambda)})`;
          }
          if (scopeMember === "also") {
            this.runtimeSymbolsNeeded.add("also");
            return `also(${receiver}, ${this.emitLambdaExpr(lambda)})`;
          }
          if (scopeMember === "apply") {
            this.runtimeSymbolsNeeded.add("apply");
            const body = this.captureBlockStatements(lambda.body);
            return `apply(${receiver}, function(this: any) { ${body} })`;
          }
          if (scopeMember === "run") {
            this.runtimeSymbolsNeeded.add("run_");
            const body = this.captureBlockStatements(lambda.body);
            return `run_(${receiver}, function(this: any) { ${body} })`;
          }
          if (scopeMember === "takeIf") {
            this.runtimeSymbolsNeeded.add("takeIf");
            return `takeIf(${receiver}, ${this.emitLambdaExpr(lambda)})`;
          }
          if (scopeMember === "takeUnless") {
            this.runtimeSymbolsNeeded.add("takeUnless");
            return `takeUnless(${receiver}, ${this.emitLambdaExpr(lambda)})`;
          }
        }
      }

      // `with(x) { ... }` is a free function handled via seedBuiltins; but rewrite if emitted as member
    }

    // Rewrite calls on primitive-receiver extension functions.
    // `str.truncate(30)` where `String.truncate` is a user extension → `__ext_string_truncate(str, 30)`
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
            const restArgs = expr.args.map((a) =>
              a.spread ? `...${this.emitExpr(a.value)}` : this.emitExpr(a.value)
            );
            if (expr.trailingLambda) restArgs.push(this.emitLambdaExpr(expr.trailingLambda));
            return `${fnName}(${[receiver, ...restArgs].join(", ")})`;
          }
        }
      }
    }

    const callee = this.emitExpr(expr.callee);
    const typeArgs = expr.typeArgs.length > 0
      ? `<${expr.typeArgs.map((t) => t.star ? "*" : this.emitTypeRef(t.type!)).join(", ")}>`
      : "";

    // Rewrite top-level `with(obj) { ... }` → `with_(obj, function(this: any) { ... })`
    if (
      expr.callee.kind === "NameExpr" && expr.callee.name === "with" &&
      (expr.trailingLambda || (expr.args.length === 2 && expr.args[1]!.value.kind === "LambdaExpr"))
    ) {
      const obj = expr.args.length > 0 ? this.emitExpr(expr.args[0]!.value) : "undefined";
      const lambda = expr.trailingLambda ??
        (expr.args[1]!.value as AST.LambdaExpr);
      this.runtimeSymbolsNeeded.add("with_");
      const body = this.captureBlockStatements(lambda.body);
      return `with_(${obj}, function(this: any) { ${body} })`;
    }

    // Rewrite top-level `run { ... }` (no receiver) — just call the lambda
    if (
      expr.callee.kind === "NameExpr" && expr.callee.name === "run" &&
      expr.args.length === 0 && expr.trailingLambda
    ) {
      return `(${this.emitLambdaExpr(expr.trailingLambda)})()`;
    }

    // Handle named arguments by reordering them to match positional parameters
    const calleeType = this.typeMap.get(expr.callee);

    // Compose-style component call: Column(modifier = ...) { ... } → Column({ modifier: ... }, [children])
    // Also catches star-imported @jalvin/ui primitives (Row, Button, etc.) whose type is T_UNKNOWN
    if (expr.callee.kind === "NameExpr" && (
      this.componentNames.has(expr.callee.name) ||
      (this.hasUiStarImport && (!calleeType || calleeType.tag === "unknown") && /^[A-Z]/.test(expr.callee.name))
    )) {
      return this.emitComposeCallAsDom(expr);
    }
    let finalArgs: string[] = [];

    if (calleeType && calleeType.tag === "func" && calleeType.paramNames) {
      const paramNames = calleeType.paramNames;
      const argsByName = new Map<string, string>();
      const positionalArgs: string[] = [];

      for (const arg of expr.args) {
        if (arg.name) {
          argsByName.set(arg.name, arg.spread ? `...${this.emitExpr(arg.value)}` : this.emitExpr(arg.value));
        } else {
          positionalArgs.push(arg.spread ? `...${this.emitExpr(arg.value)}` : this.emitExpr(arg.value));
        }
      }

      // Reconstruct args based on paramNames
      for (let i = 0; i < paramNames.length; i++) {
        const name = paramNames[i]!;
        if (argsByName.has(name)) {
          finalArgs.push(argsByName.get(name)!);
        } else if (i < positionalArgs.length) {
          finalArgs.push(positionalArgs[i]!);
        } else {
          // Missing argument - JS default value logic will handle it if we pass undefined
          finalArgs.push("undefined");
        }
      }
      // Handle trailing positional args if any
      if (positionalArgs.length > paramNames.length) {
        finalArgs.push(...positionalArgs.slice(paramNames.length));
      }
    } else {
      // Fallback for types we don't know param names for (like constructors or any)
      finalArgs = expr.args.map((a) => {
        return a.spread ? `...${this.emitExpr(a.value)}` : this.emitExpr(a.value);
      });
    }

    if (expr.trailingLambda) {
      finalArgs.push(this.emitLambdaExpr(expr.trailingLambda));
    }

    // If the callee is a class instance (not a constructor / function), emit `.invoke(args)`
    if (
      calleeType &&
      calleeType.tag === "class" &&
      calleeType.decl &&
      this.classHasInvokeOperator(calleeType.decl)
    ) {
      return `${callee}.invoke(${finalArgs.join(", ")})`;
    }

    // Constructor calls: class names start with uppercase by convention
    if (this.isConstructorCall(expr.callee)) {
      return `new ${callee}${typeArgs}(${finalArgs.join(", ")})`;
    }

    return `${callee}${typeArgs}(${finalArgs.join(", ")})`;
  }

  /** Returns true if a call expression's callee looks like a class constructor.
   *  In Jalvin, class names always start with an uppercase letter. */
  private isConstructorCall(calleeExpr: AST.Expr): boolean {
    if (calleeExpr.kind === "NameExpr") {
      // Names in componentNames are factory functions (UI primitives, components), not constructors
      if (this.componentNames.has(calleeExpr.name)) return false;
      // Class names start with uppercase; function names start with lowercase
      return /^[A-Z]/.test(calleeExpr.name);
    }
    if (calleeExpr.kind === "MemberExpr") {
      // e.g. UiState.Success(data), Discount.Percentage(0.1)
      return /^[A-Z]/.test(calleeExpr.member);
    }
    return false;
  }

  // ── Compose-style component call → DOM ──────────────────────────────────────

  /** Emit `Column(modifier = ...) { ... }` as `Column({ modifier: ... }, [children])` */
  private emitComposeCallAsDom(expr: AST.CallExpr): string {
    const tag = (expr.callee as AST.NameExpr).name;
    const calleeType = this.typeMap.get(expr.callee);
    const paramNames = calleeType?.tag === "func" ? calleeType.paramNames : undefined;

    // Build props object from named/positional args
    const props: string[] = [];
    for (let i = 0; i < expr.args.length; i++) {
      const arg = expr.args[i]!;
      const propName = arg.name ?? paramNames?.[i];
      if (!propName) continue;
      const val = this.emitExpr(arg.value);
      props.push(`${propName}: ${val}`);
    }

    const propsStr = props.length > 0 ? `{ ${props.join(", ")} }` : "{}";

    if (expr.trailingLambda) {
      const children = this.emitLambdaBodyAsDomChildren(expr.trailingLambda);
      return children ? `${tag}(${propsStr}, [${children}])` : `${tag}(${propsStr})`;
    }
    return `${tag}(${propsStr})`;
  }

  /** Collect each expression statement in a trailing-lambda body as DOM children. */
  private emitLambdaBodyAsDomChildren(lambda: AST.LambdaExpr): string {
    return lambda.body
      .filter((stmt) => stmt.kind === "ExprStmt")
      .map((stmt) => this.emitExpr((stmt as AST.ExprStmt).expr))
      .join(", ");
  }

  private emitLambdaExpr(expr: AST.LambdaExpr): string {
    // If no explicit params, emit `it` as the single implicit parameter
    // (Convention for single-argument lambdas)
    const params = expr.params.length === 0
      ? "it"
      : expr.params.map((p) => p.name ?? "_").join(", ");
    const body = expr.body;
    if (body.length === 1 && body[0]!.kind === "ExprStmt") {
      return `(${params}) => ${this.emitExpr((body[0] as AST.ExprStmt).expr)}`;
    }
    return `(${params}) => { ${body.map((s) => this.captureStmt(s)).join(" ")} }`;
  }

  private emitIfExpr(expr: AST.IfExpr): string {
    const cond = this.emitExpr(expr.condition);
    const thenStr = expr.then.kind === "Block"
      ? `(() => { ${this.captureBlockStatements(expr.then.statements)} })()`
      : this.emitExpr(expr.then);
    const elseExpr = expr.else;
    const elseStr = elseExpr.kind === "Block"
      ? `(() => { ${this.captureBlockStatements(elseExpr.statements)} })()`
      : elseExpr.kind === "IfExpr"
        ? this.emitIfExpr(elseExpr)
        : this.emitExpr(elseExpr);
    return `(${cond} ? ${thenStr} : ${elseStr})`;
  }

  private emitWhenExpr(expr: AST.WhenExpr): string {
    // Compile as an IIFE with if/else chain
    const parts: string[] = [];
    const subject = expr.subject ? `const __s = ${this.emitExpr(expr.subject.expr)};` : "";
    const subjectRef = expr.subject ? (expr.subject.binding ?? "__s") : "";

    for (const branch of expr.branches) {
      if (branch.isElse) {
        const body = branch.body.kind === "Block"
          ? this.captureBlock(branch.body)
          : `return ${this.emitExpr(branch.body)};`;
        parts.push(`{ ${body} }`);
      } else {
        const cond = branch.conditions.map((c) => this.emitWhenCondition(c, subjectRef)).join(" || ");
        const body = branch.body.kind === "Block"
          ? this.captureBlock(branch.body)
          : `return ${this.emitExpr(branch.body)};`;
        parts.push(`if (${cond}) { ${body} }`);
      }
    }

    return `(() => { ${subject} ${parts.join(" else ")} })()`;
  }

  private emitTryCatchExpr(expr: AST.TryCatchExpr): string {
    const body = this.captureBlock(expr.body);
    const catches = expr.catches.map((c) => {
      const cb = this.captureBlock(c.body);
      return `catch (${c.name}) { ${cb} }`;
    }).join(" ");
    const fin = expr.finally ? `finally { ${this.captureBlock(expr.finally)} }` : "";
    return `(() => { try { ${body} } ${catches} ${fin} })()`;
  }

  private emitCollectionLiteral(expr: AST.CollectionLiteralExpr): string {
    if (expr.collectionKind === "map") {
      const entries = expr.elements.map((e) => {
        if ("kind" in e && e.kind === "MapEntry") {
          return `[${this.emitExpr(e.key)}, ${this.emitExpr(e.value)}]`;
        }
        return "null";
      });
      return `new Map([${entries.join(", ")}])`;
    }
    if (expr.collectionKind === "set") {
      const items = (expr.elements as AST.Expr[]).map((e) => this.emitExpr(e));
      return `new Set([${items.join(", ")}])`;
    }
    const items = (expr.elements as AST.Expr[]).map((e) => this.emitExpr(e));
    return `[${items.join(", ")}]`;
  }

  private emitObjectExpr(expr: AST.ObjectExpr): string {
    const superType = expr.superTypes[0];
    const ext = superType ? ` extends ${this.emitTypeRef(superType.type)}` : "";
    const members = expr.body.members.map((m) => this.captureClassMember(m)).join(" ");
    return `(new (class${ext} { ${members} })())`;
  }

  // ── capture helpers (emit to temp string) ─────────────────────────────────

  private captureBlock(block: AST.Block): string {
    return block.statements.map((s) => this.captureStmt(s)).join(" ");
  }

  private captureBlockStatements(stmts: readonly AST.Stmt[]): string {
    return stmts.map((s) => this.captureStmt(s)).join(" ");
  }

  private captureStmt(stmt: AST.Stmt): string {
    const saved = this.w;
    const tmp = new Writer();
    (this as unknown as { w: Writer }).w = tmp;
    this.emitStmt(stmt);
    (this as unknown as { w: Writer }).w = saved;
    return tmp.output.trim();
  }

  private captureClassMember(member: AST.ClassMember): string {
    const saved = this.w;
    const tmp = new Writer();
    (this as unknown as { w: Writer }).w = tmp;
    this.emitClassMember(member);
    (this as unknown as { w: Writer }).w = saved;
    return tmp.output.trim();
  }

  // ── Type reference emission ────────────────────────────────────────────────

  private emitTypeRef(ref: AST.TypeRef): string {
    switch (ref.kind) {
      case "SimpleTypeRef": {
        const name = ref.name.join(".");
        return PRIMITIVE_TYPE_MAP[name] ?? name;
      }
      case "NullableTypeRef":
        return `${this.emitTypeRef(ref.base)} | null | undefined`;
      case "GenericTypeRef": {
        const base = ref.base.name.join(".");
        const mapped = GENERIC_TYPE_MAP[base] ?? base;
        const args = ref.args.map((a) => a.star ? "any" : a.type ? this.emitTypeRef(a.type) : "unknown");
        return `${mapped}<${args.join(", ")}>`;
      }
      case "FunctionTypeRef": {
        const params = ref.params.map((p, i) => `p${i}: ${this.emitTypeRef(p)}`).join(", ");
        const ret = this.emitTypeRef(ref.returnType);
        return `(${params}) => ${ret}`;
      }
      case "StarProjection":
        return "any";
    }
  }

  // ── Utility helpers ────────────────────────────────────────────────────────

  private emitTypeParamsStr(params: readonly AST.TypeParam[]): string {
    if (params.length === 0) return "";
    const ps = params.map((p) => {
      const bound = p.upperBound ? ` extends ${this.emitTypeRef(p.upperBound)}` : "";
      return `${p.name}${bound}`;
    });
    return `<${ps.join(", ")}>`;
  }

  private emitParamsStr(params: readonly AST.Param[]): string {
    return params.map((p) => {
      const spread = p.vararg ? "..." : "";
      // vararg params are rest params in TS: `...name: T[]`
      const type = this.opts.emitTypes
        ? `: ${this.emitTypeRef(p.type)}${p.vararg ? "[]" : ""}`
        : "";
      const def = p.defaultValue ? ` = ${this.emitExpr(p.defaultValue)}` : "";
      return `${spread}${p.name}${type}${def}`;
    }).join(", ");
  }

  private emitComponentPropsStr(params: readonly AST.Param[]): string {
    if (params.length === 0) return "";
    return params.map((p) => {
      const type = this.opts.emitTypes ? `: ${this.emitTypeRef(p.type)}` : "";
      return `${p.name}${type}`;
    }).join(", ");
  }

  private emitSuperTypesStr(superTypes: readonly AST.SuperTypeEntry[]): string {
    if (superTypes.length === 0) return "";
    const parts: string[] = [];
    let first = true;
    for (const s of superTypes) {
      // TypeScript does NOT allow constructor arguments in the `extends` clause.
      // Delegation args are passed via `super(args)` inside the constructor.
      if (first) {
        parts.push(` extends ${this.emitTypeRef(s.type)}`);
        first = false;
      } else {
        parts.push(` implements ${this.emitTypeRef(s.type)}`);
      }
    }
    return parts.join("");
  }

  private exportPrefix(mods: AST.Modifiers): string {
    if (mods.visibility === "private" || mods.visibility === "internal") return "";
    return "export ";
  }

  private visibilityPrefix(mods: AST.Modifiers): string {
    switch (mods.visibility) {
      case "private":   return "private ";
      case "protected": return "protected ";
      case "internal":  return "/* internal */ ";
      default:          return "";
    }
  }

  private unaryOpStr(op: AST.UnaryOp): string {
    if (op === "not") return "!";
    return op;
  }

  private binaryOpStr(op: AST.BinaryOp): string {
    switch (op) {
      case "and": return "&&";
      case "or":  return "||";
      case "xor": return "^";
      case "shl": return "<<";
      case "shr": return ">>";
      case "ushr": return ">>>";
      // === / !== are JS reference equality (Jalvin's triple-equals)
      case "===": return "===";
      case "!==": return "!==";
      case "..":  return "/* .. */ +"; // handled by range()
      case "..<": return "/* ..< */ +";
      default:    return op;
    }
  }

  // ── AST name walkers (for wildcard import resolution) ─────────────────────

  /**
   * Walk the entire program AST and collect all identifier names that are
   * REFERENCED (i.e., used) in the code: NameExpr values and the first name
   * component of SimpleTypeRef / GenericTypeRef nodes.
   *
   * Jalvin primitive type names (String, Boolean, …) that map to TS primitives
   * are excluded from TypeRef collection since they never need an import.
   */
  private gatherReferencedNames(program: AST.Program): Set<string> {
    const names = new Set<string>();
    const visited = new WeakSet<object>();

    const walk = (val: unknown): void => {
      if (!val || typeof val !== "object") return;
      if (Array.isArray(val)) {
        for (const item of val) walk(item);
        return;
      }
      const obj = val as Record<string, unknown>;
      if (visited.has(obj)) return;
      visited.add(obj);

      const kind = obj["kind"];

      if (kind === "NameExpr") {
        const name = obj["name"];
        if (typeof name === "string") names.add(name);
        return; // leaf node
      }
      if (kind === "SimpleTypeRef") {
        const nameArr = obj["name"] as string[] | undefined;
        if (Array.isArray(nameArr) && nameArr.length > 0) {
          const first = nameArr[0]!;
          // Skip Jalvin primitive type names — they're erased to TS primitives.
          if (!(first in PRIMITIVE_TYPE_MAP)) names.add(first);
        }
        return;
      }
      if (kind === "GenericTypeRef") {
        const base = obj["base"] as Record<string, unknown> | undefined;
        const nameArr = base?.["name"] as string[] | undefined;
        if (Array.isArray(nameArr) && nameArr.length > 0) {
          const first = nameArr[0]!;
          if (!(first in PRIMITIVE_TYPE_MAP)) names.add(first);
        }
        // Fall through to recurse into type arguments
      }

      for (const propVal of Object.values(obj)) {
        walk(propVal);
      }
    };

    for (const decl of program.declarations) walk(decl);
    return names;
  }

  /**
   * Walk the entire program AST and collect all names that are LOCALLY DEFINED:
   * top-level declaration names, non-star import aliases, function/lambda
   * parameters, local val/var bindings, for-loop variables, catch-clause names,
   * when-subject bindings, and type parameter names.
   */
  private gatherAllLocalBindings(program: AST.Program): Set<string> {
    const names = new Set<string>();
    const visited = new WeakSet<object>();

    // Top-level declaration names
    for (const decl of program.declarations) {
      const d = decl as unknown as { name?: unknown };
      if (typeof d.name === "string" && d.name) names.add(d.name);
    }

    // Non-star import aliases
    for (const imp of program.imports) {
      if (!imp.star) {
        const name = imp.alias ?? imp.path[imp.path.length - 1];
        if (name) names.add(name);
      }
    }

    const walk = (val: unknown): void => {
      if (!val || typeof val !== "object") return;
      if (Array.isArray(val)) {
        for (const item of val) walk(item);
        return;
      }
      const obj = val as Record<string, unknown>;
      if (visited.has(obj)) return;
      visited.add(obj);

      const kind = obj["kind"];

      // Collect bound names at their declaration sites
      if (kind === "PropertyDecl" || kind === "DestructuringDecl") {
        if (typeof obj["name"] === "string") names.add(obj["name"] as string);
        const nms = obj["names"] as unknown[] | undefined;
        if (Array.isArray(nms)) {
          for (const n of nms) { if (typeof n === "string") names.add(n); }
        }
      }
      if (
        kind === "FunDecl" || kind === "ExtensionFunDecl" ||
        kind === "ComponentDecl" || kind === "ClassDecl" ||
        kind === "DataClassDecl" || kind === "SealedClassDecl" ||
        kind === "EnumClassDecl" || kind === "InterfaceDecl" ||
        kind === "ObjectDecl" || kind === "TypeAliasDecl"
      ) {
        if (typeof obj["name"] === "string" && obj["name"]) names.add(obj["name"] as string);
        // Type parameters
        const typeParams = obj["typeParams"] as Array<{ name: string }> | undefined;
        if (Array.isArray(typeParams)) {
          for (const tp of typeParams) { if (tp.name) names.add(tp.name); }
        }
        // Function/method parameters
        const params = obj["params"] as Array<{ name: string }> | undefined;
        if (Array.isArray(params)) {
          for (const p of params) { if (p.name) names.add(p.name); }
        }
      }
      if (kind === "LambdaExpr") {
        const params = obj["params"] as Array<{ name: string }> | undefined;
        if (Array.isArray(params)) {
          for (const p of params) { if (p.name) names.add(p.name); }
        }
      }
      if (kind === "ForStmt") {
        const binding = obj["binding"];
        if (typeof binding === "string") {
          names.add(binding);
        } else if (binding && typeof binding === "object") {
          const b = binding as Record<string, unknown>;
          // TupleDestructure or MapDestructure
          if (Array.isArray(b["names"])) {
            for (const n of b["names"] as unknown[]) { if (typeof n === "string") names.add(n); }
          }
          if (typeof b["key"] === "string") names.add(b["key"] as string);
          if (typeof b["value"] === "string") names.add(b["value"] as string);
        }
      }
      if (kind === "TryCatchStmt") {
        const catches = obj["catches"] as Array<{ name: string }> | undefined;
        if (Array.isArray(catches)) {
          for (const c of catches) { if (c.name) names.add(c.name); }
        }
      }
      if (kind === "WhenStmt" || kind === "WhenExpr") {
        const subject = obj["subject"] as Record<string, unknown> | undefined;
        if (typeof subject?.["binding"] === "string") names.add(subject["binding"] as string);
      }
      if (kind === "SecondaryConstructor") {
        const params = obj["params"] as Array<{ name: string }> | undefined;
        if (Array.isArray(params)) {
          for (const p of params) { if (p.name) names.add(p.name); }
        }
      }

      for (const propVal of Object.values(obj)) {
        walk(propVal);
      }
    };

    for (const decl of program.declarations) walk(decl);
    return names;
  }
}

// ---------------------------------------------------------------------------
// Type name mappings (Jalvin → TypeScript)
// ---------------------------------------------------------------------------

const PRIMITIVE_TYPE_MAP: Record<string, string> = {
  Int:     "number",
  Long:    "bigint",
  Float:   "number",
  Double:  "number",
  Boolean: "boolean",
  String:  "string",
  Char:    "string",
  Byte:    "number",
  Short:   "number",
  Unit:    "void",
  Any:     "unknown",
  Nothing: "never",
};

const GENERIC_TYPE_MAP: Record<string, string> = {
  List:         "ReadonlyArray",
  MutableList:  "Array",
  Set:          "ReadonlySet",
  MutableSet:   "Set",
  Map:          "ReadonlyMap",
  MutableMap:   "Map",
  Array:        "Array",
  Pair:         "[",  // handled specially
  Triple:       "[",
  Deferred:     "Promise",
  StateFlow:    "StateFlow",
  MutableStateFlow: "MutableStateFlow",
  Flow:         "AsyncIterable",
};

const PRIMITIVE_TYPES = new Set(Object.keys(PRIMITIVE_TYPE_MAP));

// ---------------------------------------------------------------------------
// Well-known JavaScript / TypeScript global names that must never be emitted
// as named imports from a wildcard-imported package.
// ---------------------------------------------------------------------------

const JS_GLOBAL_NAMES = new Set([
  // JS built-in constructors and objects
  "Array", "Map", "Set", "Object", "String", "Number", "Boolean",
  "Promise", "Error", "TypeError", "RangeError", "SyntaxError", "URIError",
  "EvalError", "ReferenceError",
  "console", "Math", "Date", "JSON", "RegExp", "Symbol", "BigInt",
  "Proxy", "Reflect", "globalThis", "Atomics", "SharedArrayBuffer",
  "ArrayBuffer", "DataView", "Int8Array", "Uint8Array", "Uint8ClampedArray",
  "Int16Array", "Uint16Array", "Int32Array", "Uint32Array",
  "Float32Array", "Float64Array", "BigInt64Array", "BigUint64Array",
  // Global functions
  "isNaN", "isFinite", "parseInt", "parseFloat", "eval",
  "encodeURI", "decodeURI", "encodeURIComponent", "decodeURIComponent",
  // Browser/Node globals
  "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "queueMicrotask", "requestAnimationFrame", "cancelAnimationFrame",
  "fetch", "URL", "URLSearchParams", "AbortController", "AbortSignal",
  "EventTarget", "Event", "CustomEvent", "FormData", "Headers",
  "Request", "Response", "Blob", "File", "FileReader",
  "Worker", "SharedWorker", "WebSocket",
  "ReadableStream", "WritableStream", "TransformStream",
  "document", "window", "navigator", "location", "history", "screen",
  "performance", "crypto", "indexedDB", "localStorage", "sessionStorage",
  "process", "Buffer", "global", "require", "module", "exports", "__dirname", "__filename",
  // Special identifiers
  "undefined", "null", "NaN", "Infinity",
  "it", "this", "super", "arguments", "new", "class", "function",
  // TypeScript primitive type names
  "any", "unknown", "never", "void", "string", "number", "boolean", "bigint",
  "object", "symbol",
  // Jalvin type names that map to TS primitives (never need import)
  "String", "Boolean", "Any", "Nothing", "Unit", "Char", "Byte", "Short",
  "Float", "Double",
]);

// ---------------------------------------------------------------------------
// Public helper
// ---------------------------------------------------------------------------

export function generate(
  program: AST.Program,
  opts?: Partial<CodegenOptions>,
  operatorOverloads?: Map<AST.BinaryExpr, string>,
  typeMap?: Map<object, JType>
): CodegenResult {
  return new CodeGenerator(opts).generate(program, operatorOverloads, typeMap);
}
