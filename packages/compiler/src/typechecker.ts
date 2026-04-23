// ─────────────────────────────────────────────────────────────────────────────
// Jalvin Type Checker
//
// Performs:
//   • Symbol resolution (builds a scope tree)
//   • Type inference for expressions and declarations
//   • Null safety enforcement (T vs T?)
//   • Exhaustiveness checking for `when` on sealed classes
//   • suspend / async context validation
//   • Override checking
// ─────────────────────────────────────────────────────────────────────────────

import * as AST from "./ast.js";
import {
  DiagnosticBag,
  E_TYPE_MISMATCH,
  E_UNDEFINED_SYMBOL,
  E_NOT_NULLABLE,
  E_UNSAFE_NULL_DEREFERENCE,
  E_WRONG_ARG_COUNT,
  E_NOT_A_FUNCTION,
  E_WHEN_NOT_EXHAUSTIVE,
  E_SUSPEND_IN_NON_SUSPEND,
  E_DUPLICATE_CLASS_MEMBER,
  E_ABSTRACT_MEMBER_NOT_IMPLEMENTED,
  E_OVERRIDE_NOTHING,
  E_CLASS_EXTENDS_FINAL,
  E_CONST_VAL_REASSIGNMENT,
  E_LATEINIT_INVALID,
  W_DEPRECATED,
  W_UNUSED_VARIABLE,
  W_UNREACHABLE_CODE,
  W_IMPLICIT_ANY,
} from "./diagnostics.js";

// ---------------------------------------------------------------------------
// Type system
// ---------------------------------------------------------------------------

export type JType =
  | { tag: "int" }
  | { tag: "long" }
  | { tag: "float" }
  | { tag: "double" }
  | { tag: "boolean" }
  | { tag: "string" }
  | { tag: "char" }
  | { tag: "byte" }
  | { tag: "short" }
  | { tag: "unit" }
  | { tag: "any" }
  | { tag: "nothing" }
  | { tag: "nullable"; inner: JType }
  | { tag: "class"; name: string; typeArgs: JType[]; decl?: AST.ClassDecl | AST.DataClassDecl | AST.SealedClassDecl | AST.EnumClassDecl | AST.InterfaceDecl }
  | { tag: "func"; params: JType[]; paramNames?: string[]; ret: JType; suspend: boolean }
  | { tag: "typeparam"; name: string; bound: JType | null }
  | { tag: "error" }
  | { tag: "unknown" };

export const T_INT: JType = { tag: "int" };
export const T_LONG: JType = { tag: "long" };
export const T_FLOAT: JType = { tag: "float" };
export const T_DOUBLE: JType = { tag: "double" };
export const T_BOOL: JType = { tag: "boolean" };
export const T_STRING: JType = { tag: "string" };
export const T_CHAR: JType = { tag: "char" };
export const T_UNIT: JType = { tag: "unit" };
export const T_ANY: JType = { tag: "any" };
export const T_NOTHING: JType = { tag: "nothing" };
export const T_ERROR: JType = { tag: "error" };
export const T_UNKNOWN: JType = { tag: "unknown" };

/** JavaScript/TypeScript built-in globals that should pass through the typechecker without error. */
const JS_GLOBALS = new Set([
  "Math", "JSON", "console", "Object", "Array", "Promise", "Date", "Error",
  "Number", "Boolean", "Symbol", "globalThis", "window", "document",
  "parseInt", "parseFloat", "isNaN", "isFinite", "encodeURIComponent",
  "decodeURIComponent", "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "fetch", "URL", "URLSearchParams", "FormData", "Blob", "File",
  "localStorage", "sessionStorage", "performance", "navigator", "location",
  "HTMLElement", "Element", "Event", "CustomEvent",
]);

export function nullable(t: JType): JType {
  if (t.tag === "nullable") return t;
  if (t.tag === "nothing") return T_UNIT; // Nothing? ≈ Unit?
  return { tag: "nullable", inner: t };
}

export function unwrapNullable(t: JType): JType {
  return t.tag === "nullable" ? t.inner : t;
}

export function isNullable(t: JType): boolean {
  return t.tag === "nullable";
}

type ClassDecl = AST.ClassDecl | AST.DataClassDecl | AST.SealedClassDecl | AST.EnumClassDecl | AST.InterfaceDecl;

export function classType(name: string, typeArgs: JType[] = [], decl?: ClassDecl): JType {
  return decl !== undefined
    ? { tag: "class", name, typeArgs, decl }
    : { tag: "class", name, typeArgs };
}

// ---------------------------------------------------------------------------
// Symbol table
// ---------------------------------------------------------------------------

export interface Symbol {
  name: string;
  type: JType;
  mutable: boolean;
  span: AST.Span;
  /** Set if the declaration carries @Nuked; contains the reason message or "" */
  nuked?: string;
}

export class Scope {
  private readonly symbols = new Map<string, Symbol>();
  private readonly usedNames = new Set<string>();

  constructor(readonly parent: Scope | null = null) {}

  define(sym: Symbol): true | Symbol {
    const existing = this.symbols.get(sym.name);
    if (existing) return existing;
    this.symbols.set(sym.name, sym);
    return true;
  }

  lookup(name: string): Symbol | null {
    return this.symbols.get(name) ?? this.parent?.lookup(name) ?? null;
  }

  markUsed(name: string): void {
    if (this.symbols.has(name)) {
      this.usedNames.add(name);
    } else {
      this.parent?.markUsed(name);
    }
  }

  /** Returns symbols defined in this scope that were never referenced. */
  localUnused(): Symbol[] {
    return [...this.symbols.values()].filter((s) => !this.usedNames.has(s.name));
  }
}

// ---------------------------------------------------------------------------
// Type environment — built-in types and stdlib symbols
// ---------------------------------------------------------------------------

class TypeEnv {
  readonly global = new Scope();

  constructor() {
    this.seedBuiltins();
  }

  private sym(name: string, type: JType): void {
    this.global.define({ name, type, mutable: false, span: AST.BUILTIN_SPAN });
  }

  private seedBuiltins(): void {
    // Global functions
    this.sym("println", { tag: "func", params: [T_ANY], paramNames: ["message"], ret: T_UNIT, suspend: false });
    this.sym("print", { tag: "func", params: [T_ANY], paramNames: ["message"], ret: T_UNIT, suspend: false });
    this.sym("readLine", { tag: "func", params: [], ret: nullable(T_STRING), suspend: false });
    this.sym("TODO", { tag: "func", params: [nullable(T_STRING)], paramNames: ["reason"], ret: T_NOTHING, suspend: false });
    this.sym("error", { tag: "func", params: [T_STRING], paramNames: ["message"], ret: T_NOTHING, suspend: false });
    this.sym("require", { tag: "func", params: [T_BOOL, nullable(T_STRING)], paramNames: ["value", "lazyMessage"], ret: T_UNIT, suspend: false });
    this.sym("check", { tag: "func", params: [T_BOOL, nullable(T_STRING)], paramNames: ["value", "lazyMessage"], ret: T_UNIT, suspend: false });
    this.sym("assert", { tag: "func", params: [T_BOOL, nullable(T_STRING)], paramNames: ["value", "lazyMessage"], ret: T_UNIT, suspend: false });

    // Collection builders
    const listType = classType("List", [T_UNKNOWN]);
    const mutableListType = classType("MutableList", [T_UNKNOWN]);
    const setType = classType("Set", [T_UNKNOWN]);
    const mapType = classType("Map", [T_UNKNOWN, T_UNKNOWN]);

    this.sym("listOf", { tag: "func", params: [T_UNKNOWN], ret: listType, suspend: false });
    this.sym("mutableListOf", { tag: "func", params: [T_UNKNOWN], ret: mutableListType, suspend: false });
    this.sym("setOf", { tag: "func", params: [T_UNKNOWN], ret: setType, suspend: false });
    this.sym("mapOf", { tag: "func", params: [T_UNKNOWN], ret: mapType, suspend: false });
    this.sym("emptyList", { tag: "func", params: [], ret: listType, suspend: false });
    this.sym("emptyMap", { tag: "func", params: [], ret: mapType, suspend: false });
    this.sym("emptySet", { tag: "func", params: [], ret: setType, suspend: false });
    this.sym("mutableSetOf", { tag: "func", params: [T_UNKNOWN], ret: classType("MutableSet", [T_UNKNOWN]), suspend: false });
    this.sym("mutableMapOf", { tag: "func", params: [T_UNKNOWN], ret: classType("MutableMap", [T_UNKNOWN, T_UNKNOWN]), suspend: false });

    // Pair / Triple constructors
    const pairType = classType("Pair", [T_UNKNOWN, T_UNKNOWN]);
    const tripleType = classType("Triple", [T_UNKNOWN, T_UNKNOWN, T_UNKNOWN]);
    this.sym("Pair", pairType);
    this.sym("Triple", tripleType);

    // Coroutines
    const deferredType = classType("Deferred", [T_UNKNOWN]);
    this.sym("withContext", { tag: "func", params: [T_ANY, { tag: "func", params: [], ret: T_UNKNOWN, suspend: true }], paramNames: ["context", "block"], ret: T_UNKNOWN, suspend: true });
    this.sym("delay", { tag: "func", params: [T_LONG], paramNames: ["timeMillis"], ret: T_UNIT, suspend: true });

    // Dispatchers — no-ops in JS; exist for source compat
    this.sym("Dispatchers", classType("Dispatchers"));

    // Bibi HTTP client
    this.sym("Bibi", classType("Bibi"));
    this.sym("BibiError", classType("BibiError"));

    // State & MVVM
    this.sym("mutableStateOf", { tag: "func", params: [T_UNKNOWN], paramNames: ["value"], ret: classType("MutableState", [T_UNKNOWN]), suspend: false });
    this.sym("remember", { tag: "func", params: [{ tag: "func", params: [], ret: T_UNKNOWN, suspend: false }], paramNames: ["calculation"], ret: T_UNKNOWN, suspend: false });
    this.sym("useViewModel", { tag: "func", params: [T_STRING, { tag: "func", params: [], ret: T_UNKNOWN, suspend: false }], paramNames: ["key", "factory"], ret: classType("ViewModel"), suspend: false });
    // Keep old `viewModel` alias for source compat
    this.sym("viewModel", { tag: "func", params: [], ret: classType("ViewModel"), suspend: false });
    this.sym("collectAsState", { tag: "func", params: [T_UNKNOWN], paramNames: ["flow"], ret: T_UNKNOWN, suspend: false });

    // React effect hooks
    const effectDepsType = classType("List", [T_UNKNOWN]);
    this.sym("LaunchedEffect", { tag: "func", params: [effectDepsType, { tag: "func", params: [], ret: T_UNIT, suspend: true }], paramNames: ["deps", "block"], ret: T_UNIT, suspend: false });
    this.sym("DisposableEffect", { tag: "func", params: [effectDepsType, { tag: "func", params: [], ret: T_UNIT, suspend: false }], paramNames: ["deps", "block"], ret: T_UNIT, suspend: false });
    this.sym("SideEffect", { tag: "func", params: [{ tag: "func", params: [], ret: T_UNIT, suspend: false }], paramNames: ["block"], ret: T_UNIT, suspend: false });

    // Scope functions (top-level `with` and standalone `run`)
    this.sym("with", { tag: "func", params: [T_UNKNOWN, { tag: "func", params: [], ret: T_UNKNOWN, suspend: false }], paramNames: ["receiver", "block"], ret: T_UNKNOWN, suspend: false });
    this.sym("run", { tag: "func", params: [{ tag: "func", params: [], ret: T_UNKNOWN, suspend: false }], paramNames: ["block"], ret: T_UNKNOWN, suspend: false });

    // Math library
    this.sym("abs", { tag: "func", params: [T_INT], paramNames: ["n"], ret: T_INT, suspend: false });
    this.sym("minOf", { tag: "func", params: [T_INT, T_INT], paramNames: ["a", "b"], ret: T_INT, suspend: false });
    this.sym("maxOf", { tag: "func", params: [T_INT, T_INT], paramNames: ["a", "b"], ret: T_INT, suspend: false });
    this.sym("sqrt", { tag: "func", params: [T_DOUBLE], paramNames: ["x"], ret: T_DOUBLE, suspend: false });

    // IntRange
    const intRangeType = classType("IntRange");
    this.sym("downTo", { tag: "func", params: [T_INT, T_INT], ret: intRangeType, suspend: false });
    this.sym("until", { tag: "func", params: [T_INT, T_INT], ret: intRangeType, suspend: false });
    this.sym("step", { tag: "func", params: [intRangeType, T_INT], ret: intRangeType, suspend: false });

    // Result<T>
    const resultType = classType("Result", [T_UNKNOWN]);
    this.sym("runCatching", { tag: "func", params: [{ tag: "func", params: [], ret: T_UNKNOWN, suspend: false }], paramNames: ["block"], ret: resultType, suspend: false });
    this.sym("runCatchingAsync", { tag: "func", params: [{ tag: "func", params: [], ret: T_UNKNOWN, suspend: true }], paramNames: ["block"], ret: resultType, suspend: true });

    // StringBuilder + builders
    const sbType = classType("StringBuilder");
    this.sym("buildString", { tag: "func", params: [{ tag: "func", params: [sbType], ret: T_UNIT, suspend: false }], paramNames: ["builderAction"], ret: T_STRING, suspend: false });
    this.sym("buildList", { tag: "func", params: [{ tag: "func", params: [T_ANY], ret: T_UNIT, suspend: false }], paramNames: ["builderAction"], ret: listType, suspend: false });
    this.sym("buildSet", { tag: "func", params: [{ tag: "func", params: [T_ANY], ret: T_UNIT, suspend: false }], paramNames: ["builderAction"], ret: setType, suspend: false });
    this.sym("buildMap", { tag: "func", params: [{ tag: "func", params: [T_ANY], ret: T_UNIT, suspend: false }], paramNames: ["builderAction"], ret: mapType, suspend: false });

    // Regex
    const regexType = classType("Regex");
    this.sym("Regex", { tag: "func", params: [T_STRING, T_STRING], paramNames: ["pattern", "options"], ret: regexType, suspend: false });

    // Timing
    this.sym("measureTimeMillis", { tag: "func", params: [{ tag: "func", params: [], ret: T_UNIT, suspend: false }], paramNames: ["block"], ret: T_LONG, suspend: false });
    this.sym("measureTimedValue", { tag: "func", params: [{ tag: "func", params: [], ret: T_UNKNOWN, suspend: false }], paramNames: ["block"], ret: classType("TimedValue", [T_UNKNOWN]), suspend: false });

    // Random
    const randomType = classType("Random");
    this.sym("Random", { tag: "func", params: [], ret: randomType, suspend: false });
    this.sym("randomUUID", { tag: "func", params: [], ret: T_STRING, suspend: false });

    // coroutineScope / supervisorScope
    this.sym("coroutineScope", { tag: "func", params: [{ tag: "func", params: [classType("CoroutineScope")], ret: T_UNKNOWN, suspend: true }], paramNames: ["block"], ret: T_UNKNOWN, suspend: true });
    this.sym("supervisorScope", { tag: "func", params: [{ tag: "func", params: [classType("CoroutineScope")], ret: T_UNKNOWN, suspend: true }], paramNames: ["block"], ret: T_UNKNOWN, suspend: true });
  }
}

// ---------------------------------------------------------------------------
// TypeChecker
// ---------------------------------------------------------------------------

export class TypeChecker {
  private readonly diag: DiagnosticBag;
  private readonly env = new TypeEnv();
  /** Stack of scopes (innermost last) */
  private scope: Scope;
  /** Whether we're inside a suspend context */
  private inSuspend = false;
  /** Whether we're inside a component */
  private inComponent = false;
  /** Map from node to resolved type (for IDE use) */
  readonly typeMap = new Map<object, JType>();
  /**
   * Binary expressions that resolve to operator overloads.
   * Maps AST.BinaryExpr → the method name to call (e.g. "plus", "compareTo").
   * Consumed by codegen to emit `left.method(right)` instead of `left op right`.
   */
  readonly operatorOverloadMap = new Map<AST.BinaryExpr, string>();
  /**
   * Sealed class name → set of direct subclass names.
   * Populated after hoisting so exhaustiveness checking can use it.
   */
  private readonly sealedSubclasses = new Map<string, Set<string>>();
  /**
   * Enum class name → ordered list of entry names.
   * Populated at the same time as sealedSubclasses.
   */
  private readonly enumEntries = new Map<string, ReadonlyArray<string>>();

  constructor(diag: DiagnosticBag) {
    this.diag = diag;
    this.scope = this.env.global;
  }

  checkProgram(program: AST.Program): void {
    // First pass: hoist all top-level declarations into global scope
    for (const decl of program.declarations) {
      this.hoistDecl(decl);
    }
    // Second pass: build sealed-class subclass map and enum entries for exhaustiveness checking
    this.buildExhaustivenessMap(program.declarations);
    // Third pass: type-check bodies
    for (const decl of program.declarations) {
      this.checkTopLevelDecl(decl);
    }
  }

  /**
   * Walk all class-like declarations and register any that extend a known
   * sealed class into `sealedSubclasses`; also records enum entry names.
   */
  private buildExhaustivenessMap(decls: ReadonlyArray<AST.TopLevelDecl>): void {
    const sealedNames = new Set<string>();

    const collectNames = (ds: ReadonlyArray<AST.TopLevelDecl | AST.ClassMember>, prefix = "") => {
      for (const d of ds) {
        if (d.kind === "SealedClassDecl") {
          const name = prefix ? `${prefix}.${d.name}` : d.name;
          sealedNames.add(name);
          this.sealedSubclasses.set(name, new Set());
          if (d.body) collectNames(d.body.members, name);
        } else if (d.kind === "EnumClassDecl") {
          const name = prefix ? `${prefix}.${d.name}` : d.name;
          this.enumEntries.set(name, d.entries.map((e) => e.name));
          if (d.body) collectNames(d.body.members, name);
        } else if (d.kind === "ClassDecl" || d.kind === "DataClassDecl" || d.kind === "InterfaceDecl") {
          const name = prefix ? `${prefix}.${d.name}` : d.name;
          if (d.body) collectNames(d.body.members, name);
        } else if (d.kind === "ObjectDecl" && d.name) {
          const name = prefix ? `${prefix}.${d.name}` : d.name;
          if (d.body) collectNames(d.body.members, name);
        }
      }
    };

    const registerSubclasses = (ds: ReadonlyArray<AST.TopLevelDecl | AST.ClassMember>, prefix = "") => {
      for (const d of ds) {
        if (
          d.kind === "ClassDecl" ||
          d.kind === "DataClassDecl" ||
          d.kind === "ObjectDecl" ||
          d.kind === "SealedClassDecl"
        ) {
          const declName = prefix ? `${prefix}.${d.name}` : d.name;
          for (const superEntry of d.superTypes) {
            const superName = this.typeRefName(superEntry.type);
            if (superName !== null && sealedNames.has(superName)) {
              if (declName !== null) {
                this.sealedSubclasses.get(superName)!.add(declName);
              }
            }
          }
          if (d.body) registerSubclasses(d.body.members, declName ?? "");
        }
      }
    };

    collectNames(decls);
    registerSubclasses(decls);
  }

  /** Extract the fully qualified name from a TypeRef. */
  private typeRefName(ref: AST.TypeRef): string | null {
    if (ref.kind === "SimpleTypeRef") return ref.name.join(".");
    if (ref.kind === "GenericTypeRef") return ref.base.name.join(".");
    if (ref.kind === "NullableTypeRef") return this.typeRefName(ref.base);
    return null;
  }

  // ── Hoisting ───────────────────────────────────────────────────────────────

  /** Returns the @Nuked reason string if the declaration is annotated, else undefined. */
  private nukedReason(mods: AST.Modifiers): string | undefined {
    const ann = mods.annotations.find((a) => a.name === "Nuked");
    if (!ann) return undefined;
    // Strip outer quotes if the arg is a simple string literal
    if (ann.args) return ann.args.replace(/^["']|["']$/g, "");
    return "";
  }

  /** Returns `{ nuked: reason }` only if annotated, to satisfy exactOptionalPropertyTypes. */
  private nukedExtra(mods: AST.Modifiers): { nuked: string } | Record<string, never> {
    const r = this.nukedReason(mods);
    return r !== undefined ? { nuked: r } : {};
  }

  private hoistDecl(decl: AST.TopLevelDecl): void {
    switch (decl.kind) {
      case "FunDecl":
        this.scope.define({
          name: decl.name,
          type: this.funDeclType(decl),
          mutable: false,
          span: decl.span,
          ...this.nukedExtra(decl.modifiers),
        });
        break;
      case "ComponentDecl":
        this.scope.define({
          name: decl.name,
          type: { tag: "func", params: this.componentParamTypes(decl), ret: T_UNIT, suspend: false },
          mutable: false,
          span: decl.span,
          ...this.nukedExtra(decl.modifiers),
        });
        break;
      case "ClassDecl":
      case "DataClassDecl":
      case "SealedClassDecl":
      case "InterfaceDecl":
        this.scope.define({
          name: decl.name,
          type: classType(decl.name, [], decl),
          mutable: false,
          span: decl.span,
          ...this.nukedExtra(decl.modifiers),
        });
        break;
      case "EnumClassDecl":
        this.scope.define({
          name: decl.name,
          type: classType(decl.name, [], decl),
          mutable: false,
          span: decl.span,
          ...this.nukedExtra(decl.modifiers),
        });
        break;
      case "ObjectDecl":
        if (decl.name) {
          this.scope.define({
            name: decl.name,
            type: classType(decl.name),
            mutable: false,
            span: decl.span,
            ...this.nukedExtra(decl.modifiers),
          });
        }
        break;
      case "PropertyDecl":
        this.scope.define({
          name: decl.name,
          type: decl.type ? this.resolveTypeRef(decl.type) : T_UNKNOWN,
          mutable: decl.mutable,
          span: decl.span,
          ...this.nukedExtra(decl.modifiers),
        });
        break;
      case "DestructuringDecl":
        // Hoist each binding name into global scope with unknown type
        for (const name of decl.names) {
          if (name) {
            this.scope.define({ name, type: T_UNKNOWN, mutable: decl.mutable, span: decl.span });
          }
        }
        break;
      case "ExtensionFunDecl":
        // Extension functions are module-level; no special hoisting needed beyond the name
        break;
      case "TypeAliasDecl":
        break;
    }
  }

  private funDeclType(decl: AST.FunDecl): JType {
    const params = decl.params.map((p) => this.resolveTypeRef(p.type));
    const paramNames = decl.params.map((p) => p.name);
    const ret = decl.returnType ? this.resolveTypeRef(decl.returnType) : T_UNIT;
    const suspend = AST.isSuspend(decl.modifiers);
    return { tag: "func", params, paramNames, ret, suspend };
  }

  private componentParamTypes(decl: AST.ComponentDecl): JType[] {
    return decl.params.map((p) => this.resolveTypeRef(p.type));
  }

  // ── Top-level checking ─────────────────────────────────────────────────────

  private checkTopLevelDecl(decl: AST.TopLevelDecl): void {
    switch (decl.kind) {
      case "FunDecl":
        this.checkFunDecl(decl);
        break;
      case "ComponentDecl":
        this.checkComponentDecl(decl);
        break;
      case "ClassDecl":
      case "DataClassDecl":
      case "SealedClassDecl":
        this.checkClassLike(decl);
        break;
      case "EnumClassDecl":
        if (decl.body) this.checkClassLike({ ...decl, kind: "ClassDecl" } as unknown as AST.ClassDecl);
        break;
      case "DestructuringDecl":
        this.checkExpr(decl.initializer);
        break;
      case "PropertyDecl":
        this.checkPropertyDecl(decl);
        break;
      case "ExtensionFunDecl":
        this.checkExtensionFun(decl);
        break;
      default:
        break;
    }
  }

  // ── Function checking ──────────────────────────────────────────────────────

  private checkFunDecl(decl: AST.FunDecl): void {
    const childScope = new Scope(this.scope);
    for (const p of decl.params) {
      childScope.define({ name: p.name, type: this.resolveTypeRef(p.type), mutable: false, span: p.span });
    }

    const prevSuspend = this.inSuspend;
    this.inSuspend = AST.isSuspend(decl.modifiers);
    this.withScope(childScope, () => {
      if (decl.body) {
        if (decl.body.kind === "Block") {
          this.checkBlock(decl.body);
        } else {
          this.checkExpr(decl.body);
        }
      }
    });
    this.inSuspend = prevSuspend;
  }

  private checkComponentDecl(decl: AST.ComponentDecl): void {
    const childScope = new Scope(this.scope);
    for (const p of decl.params) {
      childScope.define({ name: p.name, type: this.resolveTypeRef(p.type), mutable: false, span: p.span });
    }
    const prevComp = this.inComponent;
    this.inComponent = true;
    this.withScope(childScope, () => this.checkBlock(decl.body));
    this.inComponent = prevComp;
  }

  private checkExtensionFun(decl: AST.ExtensionFunDecl): void {
    const childScope = new Scope(this.scope);
    const receiverType = this.resolveTypeRef(decl.receiver);
    childScope.define({ name: "this", type: receiverType, mutable: false, span: decl.span });
    for (const p of decl.params) {
      childScope.define({ name: p.name, type: this.resolveTypeRef(p.type), mutable: false, span: p.span });
    }
    const prevSuspend = this.inSuspend;
    this.inSuspend = AST.isSuspend(decl.modifiers);
    this.withScope(childScope, () => {
      if (decl.body.kind === "Block") this.checkBlock(decl.body);
      else this.checkExpr(decl.body);
    });
    this.inSuspend = prevSuspend;
  }

  private checkClassLike(
    decl: AST.ClassDecl | AST.DataClassDecl | AST.SealedClassDecl
  ): void {
    // Inheritance check: cannot extend a final class
    for (const superEntry of decl.superTypes) {
      const superType = this.resolveTypeRef(superEntry.type);
      if (superType.tag === "class" && superType.decl) {
        const isFinal = superType.decl.modifiers.modifiers.includes("final");
        // In Jalvin, classes are final by default unless 'open', 'abstract', or 'sealed'
        const isOpen = superType.decl.modifiers.modifiers.some(m => m === "open" || m === "abstract");
        const isSealed = superType.decl.kind === "SealedClassDecl";
        if (isFinal || (!isOpen && !isSealed)) {
          this.diag.error(superEntry.span, E_CLASS_EXTENDS_FINAL, `Cannot inherit from final class '${superType.name}'`);
        }
      }
    }

    if (!decl.body) return;
    const seen = new Set<string>();

    // Collect all member names from parent class (for override/abstract checks)
    const parentMemberNames = new Set<string>();
    const abstractMemberNames = new Set<string>();
    for (const superEntry of decl.superTypes) {
      const superType = this.resolveTypeRef(superEntry.type);
      if (superType.tag === "class" && superType.decl?.body) {
        for (const m of superType.decl.body.members) {
          const n = this.memberName(m);
          if (n) {
            parentMemberNames.add(n);
            if ((m.kind === "FunDecl" || m.kind === "PropertyDecl") &&
                m.modifiers.modifiers.includes("abstract")) {
              abstractMemberNames.add(n);
            }
          }
        }
      }
    }

    const concreteMembers = new Set<string>();
    for (const member of decl.body.members) {
      const mName = this.memberName(member);
      if (mName) {
        if (seen.has(mName)) {
          this.diag.error(member.span, E_DUPLICATE_CLASS_MEMBER, `Duplicate member '${mName}'`);
        }
        seen.add(mName);
        // Check `override` is actually overriding something
        if ((member.kind === "FunDecl" || member.kind === "PropertyDecl") &&
            member.modifiers.modifiers.includes("override")) {
          if (!parentMemberNames.has(mName)) {
            this.diag.error(member.span, E_OVERRIDE_NOTHING, `'${mName}' overrides nothing`);
          }
        }
        if (!(member.kind === "FunDecl" && member.modifiers.modifiers.includes("abstract"))) {
          concreteMembers.add(mName);
        }
      }
      this.checkClassMember(member);
    }

    // Check all abstract parent members are implemented (only for non-abstract, non-sealed subclasses)
    const isAbstract = decl.modifiers.modifiers.includes("abstract");
    const isSealed = decl.kind === "SealedClassDecl";
    if (!isAbstract && !isSealed) {
      for (const abs of abstractMemberNames) {
        if (!concreteMembers.has(abs)) {
          this.diag.error(decl.span, E_ABSTRACT_MEMBER_NOT_IMPLEMENTED,
            `Class '${decl.name}' must implement abstract member '${abs}'`);
        }
      }
    }
  }

  private memberName(member: AST.ClassMember): string | null {
    switch (member.kind) {
      case "FunDecl":
      case "ComponentDecl":
      case "PropertyDecl":
        return member.name;
      default:
        return null;
    }
  }

  private checkClassMember(member: AST.ClassMember): void {
    switch (member.kind) {
      case "FunDecl": this.checkFunDecl(member); break;
      case "ComponentDecl": this.checkComponentDecl(member); break;
      case "PropertyDecl": this.checkPropertyDecl(member); break;
      case "ClassDecl":
      case "DataClassDecl":
      case "SealedClassDecl":
        this.checkClassLike(member); break;
      default: break;
    }
  }

  private checkPropertyDecl(decl: AST.PropertyDecl): void {
    // E0321: lateinit cannot be applied to val or primitive types
    if (decl.modifiers.modifiers.includes("lateinit")) {
      if (!decl.mutable) {
        this.diag.error(decl.span, E_LATEINIT_INVALID, `'lateinit' can only be applied to 'var' properties`);
      } else if (decl.type) {
        const t = this.resolveTypeRef(decl.type);
        const isPrimitive = t.tag === "int" || t.tag === "long" || t.tag === "float" ||
                            t.tag === "double" || t.tag === "boolean" || t.tag === "char";
        if (isPrimitive) {
          this.diag.error(decl.span, E_LATEINIT_INVALID, `'lateinit' cannot be applied to primitive type '${this.typeToString(t)}'`);
        }
      }
    }
    if (decl.initializer) {
      const initType = this.checkExpr(decl.initializer);
      if (decl.type) {
        const declaredType = this.resolveTypeRef(decl.type);
        this.assertAssignable(decl.initializer.span, initType, declaredType);
      }
      this.typeMap.set(decl, initType);
    }
    if (decl.delegate) {
      this.checkExpr(decl.delegate);
    }
  }

  // ── Block & statement checking ─────────────────────────────────────────────

  private checkBlock(block: AST.Block): void {
    const blockScope = new Scope(this.scope);
    this.withScope(blockScope, () => {
      let terminated = false;
      for (const stmt of block.statements) {
        if (terminated) {
          this.diag.warning(stmt.span, W_UNREACHABLE_CODE, "Unreachable code");
          break;
        }
        this.checkStmt(stmt);
        if (
          stmt.kind === "ReturnStmt" ||
          stmt.kind === "ThrowStmt" ||
          stmt.kind === "BreakStmt" ||
          stmt.kind === "ContinueStmt"
        ) {
          terminated = true;
        }
      }
      // W0001: warn on unused local variables (skip `_`-prefixed)
      for (const sym of blockScope.localUnused()) {
        if (!sym.name.startsWith("_")) {
          this.diag.warning(sym.span, W_UNUSED_VARIABLE, `Variable '${sym.name}' is never used`);
        }
      }
    });
  }

  private checkStmt(stmt: AST.Stmt): void {
    switch (stmt.kind) {
      case "Block": this.checkBlock(stmt); break;
      case "PropertyDecl": {
        const t = stmt.initializer ? this.checkExpr(stmt.initializer) : T_UNKNOWN;
        const declared = stmt.type ? this.resolveTypeRef(stmt.type) : t;
        // W0003: implicit Any when no type annotation and type cannot be inferred
        if (!stmt.type && (declared.tag === "unknown" || declared.tag === "any")) {
          this.diag.warning(stmt.span, W_IMPLICIT_ANY,
            `Variable '${stmt.name}' has implicit 'Any' type — add a type annotation`);
        }
        const result = this.scope.define({
          name: stmt.name,
          type: declared,
          mutable: stmt.mutable,
          span: stmt.span,
        });
        if (result !== true) {
          // Shadowing is allowed in Jalvin
        }
        break;
      }
      case "DestructuringDecl": {
        this.checkExpr(stmt.initializer);
        for (const name of stmt.names) {
          if (name) {
            this.scope.define({ name, type: T_UNKNOWN, mutable: stmt.mutable, span: stmt.span });
          }
        }
        break;
      }
      case "ExprStmt": this.checkExpr(stmt.expr); break;
      case "ReturnStmt":
        if (stmt.value) this.checkExpr(stmt.value);
        break;
      case "ThrowStmt": this.checkExpr(stmt.value); break;
      case "BreakStmt":
      case "ContinueStmt": break;
      case "IfStmt": this.checkIfStmt(stmt); break;
      case "WhenStmt": this.checkWhenStmt(stmt); break;
      case "ForStmt": this.checkForStmt(stmt); break;
      case "WhileStmt": this.checkWhileStmt(stmt); break;
      case "DoWhileStmt": {
        this.checkBlock(stmt.body);
        this.checkExpr(stmt.condition);
        break;
      }
      case "TryCatchStmt": this.checkTryCatch(stmt); break;
      case "LabeledStmt": this.checkStmt(stmt.body); break;
    }
  }

  private checkIfStmt(stmt: AST.IfStmt): void {
    const condType = this.checkExpr(stmt.condition);
    this.assertAssignable(stmt.condition.span, condType, T_BOOL);

    // Smart cast: if (x is T) { ... } narrows x to T inside the then branch
    const narrowings = this.extractSmartCasts(stmt.condition);
    const thenScope = new Scope(this.scope);
    for (const [name, type] of narrowings) {
      const existing = this.scope.lookup(name);
      if (existing) {
        thenScope.define({ ...existing, type });
      }
    }
    this.withScope(thenScope, () => this.checkBlock(stmt.then));

    if (stmt.else) {
      const elseNarrowings = this.extractElseSmartCasts(stmt.condition);
      if (elseNarrowings.size > 0) {
        const elseScope = new Scope(this.scope);
        for (const [name, type] of elseNarrowings) {
          const existing = this.scope.lookup(name);
          if (existing) elseScope.define({ ...existing, type });
        }
        this.withScope(elseScope, () => {
          if (stmt.else!.kind === "Block") this.checkBlock(stmt.else!);
          else if (stmt.else!.kind === "IfStmt") this.checkIfStmt(stmt.else!);
        });
      } else {
        if (stmt.else.kind === "Block") this.checkBlock(stmt.else);
        else if (stmt.else.kind === "IfStmt") this.checkIfStmt(stmt.else);
      }
    }
  }

  /**
   * Extract smart-cast bindings from an `is`-check condition.
   * `x is T` → { x: T }
   * `x is T && y is U` → { x: T, y: U }
   */
  private extractSmartCasts(condition: AST.Expr): Map<string, JType> {
    const result = new Map<string, JType>();
    if (condition.kind === "TypeCheckExpr" && !condition.negated) {
      if (condition.expr.kind === "NameExpr") {
        result.set(condition.expr.name, this.resolveTypeRef(condition.type));
      }
    } else if (condition.kind === "BinaryExpr" && condition.op === "&&") {
      for (const [k, v] of this.extractSmartCasts(condition.left)) result.set(k, v);
      for (const [k, v] of this.extractSmartCasts(condition.right)) result.set(k, v);
    }
    return result;
  }

  /**
   * Extract smart-cast bindings for the ELSE branch.
   * `x !is T` → in else, `x` IS `T` → { x: T }
   * `x !is T || y !is U` → in else (both negations must fail), { x: T, y: U }
   */
  private extractElseSmartCasts(condition: AST.Expr): Map<string, JType> {
    const result = new Map<string, JType>();
    if (condition.kind === "TypeCheckExpr" && condition.negated) {
      // x !is T → entering else means the !is test failed, so x IS T
      if (condition.expr.kind === "NameExpr") {
        result.set(condition.expr.name, this.resolveTypeRef(condition.type));
      }
    } else if (condition.kind === "BinaryExpr" && condition.op === "||") {
      // x !is T || y !is U → both must be false to reach else, so both narrow
      for (const [k, v] of this.extractElseSmartCasts(condition.left)) result.set(k, v);
      for (const [k, v] of this.extractElseSmartCasts(condition.right)) result.set(k, v);
    }
    return result;
  }

  private checkWhenStmt(stmt: AST.WhenStmt): void {
    const subjectType = stmt.subject ? this.checkExpr(stmt.subject.expr) : null;

    // Bind `when (val x = expr)` into each branch scope
    for (const branch of stmt.branches) {
      const branchScope = stmt.subject?.binding
        ? new Scope(this.scope)
        : this.scope;
      if (stmt.subject?.binding && subjectType) {
        (branchScope as Scope).define({
          name: stmt.subject.binding,
          type: subjectType,
          mutable: false,
          span: stmt.subject.span,
        });
      }

      this.withScope(branchScope, () => {
        // Smart cast narrowing: for single `is Type` condition, narrow subject type
        if (
          stmt.subject?.binding &&
          subjectType &&
          branch.conditions.length === 1 &&
          branch.conditions[0]!.kind === "WhenIsCondition" &&
          !branch.conditions[0]!.negated
        ) {
          const isC = branch.conditions[0]!;
          const narrowedType = this.resolveTypeRef(isC.type);
          const narrowScope = new Scope(branchScope);
          narrowScope.define({
            name: stmt.subject.binding,
            type: narrowedType,
            mutable: false,
            span: isC.span,
          });
          this.withScope(narrowScope, () => {
            if (branch.body.kind === "Block") this.checkBlock(branch.body);
            else this.checkExpr(branch.body);
          });
        } else {
          for (const cond of branch.conditions) {
            if (cond.kind === "WhenExprCondition") this.checkExpr(cond.expr);
            else if (cond.kind === "WhenInCondition") this.checkExpr(cond.expr);
          }
          if (branch.body.kind === "Block") this.checkBlock(branch.body);
          else this.checkExpr(branch.body);
        }
      });
    }

    // Exhaustiveness check for sealed classes
    if (subjectType) {
      this.checkWhenExhaustiveness(stmt.span, stmt.branches, subjectType);
    }
  }

  /**
   * If `subjectType` is a sealed class or enum, verify all variants are
   * covered by type/equality branches, or there is an `else` branch.
   * Emits E_WHEN_NOT_EXHAUSTIVE for any missing variant.
   */
  private checkWhenExhaustiveness(
    span: AST.Span,
    branches: ReadonlyArray<AST.WhenBranch>,
    subjectType: JType
  ): void {
    if (subjectType.tag !== "class") return;
    const typeName = subjectType.name;

    // If there's an else branch, it's always exhaustive
    if (branches.some((b) => b.isElse)) return;

    // ── Sealed class exhaustiveness ────────────────────────────────────────
    const subclasses = this.sealedSubclasses.get(typeName);
    if (subclasses) {
      const covered = new Set<string>();
      for (const branch of branches) {
        for (const cond of branch.conditions) {
          if (cond.kind === "WhenIsCondition" && !cond.negated) {
            const name = this.typeRefName(cond.type);
            // We want to match fully qualified name OR just the base name if it matches
            if (name) {
              covered.add(name);
              // Also add the simple name part to be safe
              const parts = name.split(".");
              covered.add(parts[parts.length - 1]!);
            }
          }
        }
      }
      for (const sub of subclasses) {
        const subParts = sub.split(".");
        const subSimple = subParts[subParts.length - 1]!;
        if (!covered.has(sub) && !covered.has(subSimple)) {
          this.diag.error(
            span,
            E_WHEN_NOT_EXHAUSTIVE,
            `Non-exhaustive 'when' on sealed class '${typeName}': missing branch for '${sub}'`
          );
        }
      }
      return;
    }

    // ── Enum class exhaustiveness ──────────────────────────────────────────
    const entries = this.enumEntries.get(typeName);
    if (entries) {
      const covered = new Set<string>();
      for (const branch of branches) {
        for (const cond of branch.conditions) {
          if (cond.kind === "WhenExprCondition") {
            const expr = cond.expr;
            // Match `EnumName.ENTRY` or bare `ENTRY`
            if (expr.kind === "MemberExpr") {
              covered.add(expr.member);
            } else if (expr.kind === "NameExpr") {
              covered.add(expr.name);
            }
          }
        }
      }
      for (const entry of entries) {
        if (!covered.has(entry)) {
          this.diag.error(
            span,
            E_WHEN_NOT_EXHAUSTIVE,
            `Non-exhaustive 'when' on enum '${typeName}': missing branch for '${entry}'`
          );
        }
      }
    }
  }

  private checkForStmt(stmt: AST.ForStmt): void {    const iterType = this.checkExpr(stmt.iterable);
    const elemType = this.elementTypeOf(iterType);
    const childScope = new Scope(this.scope);

    if (typeof stmt.binding === "string") {
      childScope.define({ name: stmt.binding, type: elemType, mutable: false, span: stmt.span });
    }
    this.withScope(childScope, () => this.checkBlock(stmt.body));
  }

  private checkWhileStmt(stmt: AST.WhileStmt): void {
    this.checkExpr(stmt.condition);
    this.checkBlock(stmt.body);
  }

  private checkTryCatch(stmt: AST.TryCatchStmt): void {
    this.checkBlock(stmt.body);
    for (const c of stmt.catches) {
      const childScope = new Scope(this.scope);
      childScope.define({ name: c.name, type: this.resolveTypeRef(c.type), mutable: false, span: c.span });
      this.withScope(childScope, () => this.checkBlock(c.body));
    }
    if (stmt.finally) this.checkBlock(stmt.finally);
  }

  // ── Expression type inference ──────────────────────────────────────────────

  checkExpr(expr: AST.Expr): JType {
    const type = this.inferExpr(expr);
    this.typeMap.set(expr, type);
    return type;
  }

  private inferExpr(expr: AST.Expr): JType {
    switch (expr.kind) {
      case "IntLiteralExpr": return T_INT;
      case "LongLiteralExpr": return T_LONG;
      case "FloatLiteralExpr": return T_FLOAT;
      case "DoubleLiteralExpr": return T_DOUBLE;
      case "BooleanLiteralExpr": return T_BOOL;
      case "NullLiteralExpr": return nullable(T_NOTHING);
      case "StringLiteralExpr":
      case "StringTemplateExpr": {
        if (expr.kind === "StringTemplateExpr") {
          for (const p of expr.parts) {
            if (p.kind === "ExprPart") this.checkExpr(p.expr);
          }
        }
        return T_STRING;
      }
      case "NameExpr": {
        const sym = this.scope.lookup(expr.name);
        if (!sym) {
          // Don't error on Bibi — it's a special runtime symbol
          if (expr.name === "Bibi") return { tag: "func", params: [T_STRING], ret: classType("BibiClient"), suspend: false };
          // Companion-like type objects (for Int.MAX_VALUE, Long.MIN_VALUE)
          if (expr.name === "Int") return classType("IntCompanion");
          if (expr.name === "Long") return classType("LongCompanion");
          if (expr.name === "Double" || expr.name === "Float") return classType("NumberCompanion");
          // JS builtins — allow through without error (emits as-is to TypeScript)
          if (JS_GLOBALS.has(expr.name)) return T_UNKNOWN;
          this.diag.error(expr.span, E_UNDEFINED_SYMBOL, `Unresolved reference: '${expr.name}'`);
          return T_ERROR;
        }
        this.scope.markUsed(expr.name);
        if (sym.nuked !== undefined) {
          const reason = sym.nuked ? `: ${sym.nuked}` : "";
          this.diag.warning(expr.span, W_DEPRECATED, `'${expr.name}' is @Nuked${reason}`);
        }
        return sym.type;
      }
      case "ThisExpr": {
        const sym = this.scope.lookup("this");
        return sym?.type ?? T_ANY;
      }
      case "SuperExpr": return T_ANY;
      case "ParenExpr": return this.checkExpr(expr.expr);
      case "UnaryExpr": return this.checkUnary(expr);
      case "BinaryExpr": return this.checkBinary(expr);
      case "AssignExpr": {
        // E0320: cannot assign to const val
        if (expr.target.kind === "NameExpr") {
          const sym = this.scope.lookup(expr.target.name);
          if (sym && !sym.mutable) {
            this.diag.error(expr.span, E_CONST_VAL_REASSIGNMENT, `Cannot assign to 'val' '${expr.target.name}'`);
          }
        }
        this.checkExpr(expr.value);
        this.checkExpr(expr.target as AST.Expr);
        return T_UNIT;
      }
      case "CompoundAssignExpr": {
        this.checkExpr(expr.value);
        this.checkExpr(expr.target as AST.Expr);
        return T_UNIT;
      }
      case "IncrDecrExpr": {
        this.checkExpr(expr.target as AST.Expr);
        return T_UNIT;
      }
      case "MemberExpr": {
        const targetType = this.checkExpr(expr.target);
        return this.memberType(expr.span, targetType, expr.member, false);
      }
      case "SafeMemberExpr": {
        const targetType = this.checkExpr(expr.target);
        if (!isNullable(targetType) && targetType.tag !== "any" && targetType.tag !== "unknown") {
          this.diag.warning(
            expr.span,
            E_NOT_NULLABLE,
            `Safe call (?.) on non-nullable type '${this.typeToString(targetType)}'`
          );
        }
        const inner = unwrapNullable(targetType);
        return nullable(this.memberType(expr.span, inner, expr.member, true));
      }
      case "IndexExpr": {
        const targetType = this.checkExpr(expr.target);
        this.checkExpr(expr.index);
        // Resolve `operator fun get(index)` on user class types
        const getRetType = this.resolveGetOperator(targetType);
        if (getRetType !== null) return getRetType;
        return T_UNKNOWN;
      }
      case "CallExpr": return this.checkCallExpr(expr);
      case "LambdaExpr": return this.checkLambda(expr);
      case "IfExpr": return this.checkIfExpr(expr);
      case "WhenExpr": {
        const subjectType = expr.subject ? this.checkExpr(expr.subject.expr) : null;
        const branchTypes: JType[] = [];
        for (const b of expr.branches) {
          for (const c of b.conditions) {
            if (c.kind === "WhenExprCondition") this.checkExpr(c.expr);
            else if (c.kind === "WhenInCondition") this.checkExpr(c.expr);
          }
          branchTypes.push(
            b.body.kind === "Block" ? (this.checkBlock(b.body), T_UNIT) : this.checkExpr(b.body)
          );
        }
        // Exhaustiveness: when-expr on a sealed class MUST be exhaustive
        if (subjectType) {
          this.checkWhenExhaustiveness(expr.span, expr.branches, subjectType);
        }
        return this.unify(branchTypes);
      }
      case "TryCatchExpr": {
        this.checkBlock(expr.body);
        for (const c of expr.catches) this.checkBlock(c.body);
        if (expr.finally) this.checkBlock(expr.finally);
        return T_UNKNOWN;
      }
      case "TypeCheckExpr": {
        this.checkExpr(expr.expr);
        return T_BOOL;
      }
      case "TypeCastExpr": {
        this.checkExpr(expr.expr);
        return this.resolveTypeRef(expr.type);
      }
      case "SafeCastExpr": {
        this.checkExpr(expr.expr);
        return nullable(this.resolveTypeRef(expr.type));
      }
      case "NotNullExpr": {
        const inner = this.checkExpr(expr.expr);
        if (!isNullable(inner) && inner.tag !== "any" && inner.tag !== "unknown") {
          this.diag.warning(
            expr.span,
            E_NOT_NULLABLE,
            `Non-null assertion (!!) on non-nullable type '${this.typeToString(inner)}'`
          );
        }
        return unwrapNullable(inner);
      }
      case "ElvisExpr": {
        const left = this.checkExpr(expr.left);
        const right = this.checkExpr(expr.right);
        // Result type: unwrapped left | right
        return this.unify([unwrapNullable(left), right]);
      }
      case "RangeExpr": {
        this.checkExpr(expr.from);
        this.checkExpr(expr.to);
        return classType("IntRange");
      }
      case "LaunchExpr": {
        if (!this.inSuspend && !this.inComponent) {
          // launch is valid at top-level coroutine scope
        }
        const prevSuspend = this.inSuspend;
        this.inSuspend = true;
        this.checkBlock(expr.body);
        this.inSuspend = prevSuspend;
        return classType("Job");
      }
      case "AsyncExpr": {
        const prevSuspend = this.inSuspend;
        this.inSuspend = true;
        this.checkBlock(expr.body);
        this.inSuspend = prevSuspend;
        return classType("Deferred", [T_UNKNOWN]);
      }
      case "CollectionLiteralExpr": {
        const elemTypes = expr.elements.map((e) => {
          if ("kind" in e && e.kind === "MapEntry") {
            this.checkExpr(e.key);
            this.checkExpr(e.value);
            return T_UNKNOWN;
          }
          return this.checkExpr(e as AST.Expr);
        });
        if (expr.collectionKind === "list") return classType("List", [this.unify(elemTypes)]);
        if (expr.collectionKind === "set") return classType("Set", [this.unify(elemTypes)]);
        return classType("Map", [T_UNKNOWN, T_UNKNOWN]);
      }
      case "ObjectExpr": return classType("<anonymous>");
      case "ReturnExpr": {
        if (expr.value) this.checkExpr(expr.value);
        return T_NOTHING;
      }
      case "BreakExpr":
      case "ContinueExpr":
        return T_NOTHING;
      default:
        return T_UNKNOWN;
    }
  }

  private checkUnary(expr: AST.UnaryExpr): JType {
    const t = this.checkExpr(expr.operand);
    if (expr.op === "!") {
      this.assertAssignable(expr.span, t, T_BOOL);
      return T_BOOL;
    }
    return t;
  }

  private checkBinary(expr: AST.BinaryExpr): JType {
    const l = this.checkExpr(expr.left);
    const r = this.checkExpr(expr.right);

    // `in` / `!in` → resolve `contains` on the **right-hand** type
    if (expr.op === "in" || expr.op === "!in") {
      const containsOverload = this.resolveOperatorOverload(r, expr.op);
      if (containsOverload) {
        // Store with a sentinel so codegen knows this is an `in` overload
        this.operatorOverloadMap.set(expr, expr.op === "in" ? "contains" : "!contains");
      }
      return T_BOOL;
    }

    // Check for operator overload on the left-hand class type
    const overload = this.resolveOperatorOverload(l, expr.op);
    if (overload) {
      this.operatorOverloadMap.set(expr, overload.method);
      return overload.retType;
    }

    switch (expr.op) {
      case "==": case "!=": case "===": case "!==": return T_BOOL;
      case "<": case ">": case "<=": case ">=": return T_BOOL;
      case "&&": case "||": return T_BOOL;
      case "+":
        if (l.tag === "string" || r.tag === "string") return T_STRING;
        return this.numericType(l, r);
      case "-": case "*": case "/": case "%":
        return this.numericType(l, r);
      default:
        return T_UNKNOWN;
    }
  }

  /**
   * If the left operand type is a class that declares an `operator fun` matching
   * the given operator, return the method name and return type.
   *
   * Operator → method name mapping:
   *   +  → plus      -  → minus    *  → times    /  → div     %  → rem
   *   == → equals    <  → compareTo (returns Int, we normalise to Boolean)
   *   .. → rangeTo   [] → get (handled elsewhere)
   *   += → plusAssign, etc.
   */
  private resolveOperatorOverload(
    lType: JType,
    op: string
  ): { method: string; retType: JType } | null {
    if (lType.tag !== "class") return null;
    const decl = lType.decl;
    if (!decl || !decl.body) return null;

    const opToMethod: Record<string, string> = {
      "+": "plus",
      "-": "minus",
      "*": "times",
      "/": "div",
      "%": "rem",
      "..": "rangeTo",
      "..<": "rangeUntil",
      "<": "compareTo",
      ">": "compareTo",
      "<=": "compareTo",
      ">=": "compareTo",
      "in": "contains",
      "!in": "contains",
    };
    const methodName = opToMethod[op];
    if (!methodName) return null;

    for (const member of decl.body.members) {
      if (
        member.kind === "FunDecl" &&
        member.name === methodName &&
        member.modifiers.modifiers.includes("operator")
      ) {
        // compareTo always resolves to Boolean (we wrap the Int result)
        const rawRet = member.returnType
          ? this.resolveTypeRef(member.returnType)
          : T_UNKNOWN;
        const retType = (methodName === "compareTo" || methodName === "contains") ? T_BOOL : rawRet;
        return { method: methodName, retType };
      }
    }
    return null;
  }

  /**
   * Resolve `operator fun get(index)` on a class type (for index expressions).
   */
  private resolveGetOperator(targetType: JType): JType | null {
    if (targetType.tag !== "class") return null;
    const decl = targetType.decl;
    if (!decl || !decl.body) return null;
    for (const member of decl.body.members) {
      if (
        member.kind === "FunDecl" &&
        member.name === "get" &&
        member.modifiers.modifiers.includes("operator")
      ) {
        return member.returnType ? this.resolveTypeRef(member.returnType) : T_UNKNOWN;
      }
    }
    return null;
  }

  private checkCallExpr(expr: AST.CallExpr): JType {
    const calleeType = this.checkExpr(expr.callee);
    for (const arg of expr.args) this.checkExpr(arg.value);

    // If callee is a member expr, check for @Nuked on the resolved method
    if (expr.callee.kind === "MemberExpr" || expr.callee.kind === "SafeMemberExpr") {
      // This is handled inside memberType helper
    }

    // Propagate expected lambda param types for `it` implicit parameter support
    if (expr.trailingLambda) {
      let expectedLambdaParams: JType[] | undefined;
      if (calleeType.tag === "func" && calleeType.params.length > 0) {
        const lastParam = calleeType.params[calleeType.params.length - 1]!;
        if (lastParam.tag === "func") {
          expectedLambdaParams = lastParam.params;
        }
      }
      this.checkLambda(expr.trailingLambda, expectedLambdaParams);
    }

    if (calleeType.tag === "func") {
      if (!this.inSuspend && calleeType.suspend) {
        this.diag.error(
          expr.span,
          E_SUSPEND_IN_NON_SUSPEND,
          "Suspend function called outside of coroutine or suspend context"
        );
      }
      return calleeType.ret;
    }

    if (calleeType.tag === "class") {
      // Check for `operator fun invoke(...)` on a class instance
      if (calleeType.decl && calleeType.decl.body) {
        for (const member of calleeType.decl.body.members) {
          if (
            member.kind === "FunDecl" &&
            member.name === "invoke" &&
            member.modifiers.modifiers.includes("operator")
          ) {
            return member.returnType ? this.resolveTypeRef(member.returnType) : T_UNIT;
          }
        }
      }
      // Regular constructor call
      return calleeType;
    }

    if (calleeType.tag === "error" || calleeType.tag === "unknown" || calleeType.tag === "any") {
      return T_UNKNOWN;
    }

    this.diag.error(expr.span, E_NOT_A_FUNCTION, `Type '${this.typeToString(calleeType)}' is not callable`);
    return T_ERROR;
  }

  private checkLambda(expr: AST.LambdaExpr, expectedParamTypes?: JType[]): JType {
    const childScope = new Scope(this.scope);

    // If the lambda has no explicit params, synthesise an `it` binding using
    // the first expected parameter type.
    if (expr.params.length === 0 && expectedParamTypes && expectedParamTypes.length === 1) {
      childScope.define({
        name: "it",
        type: expectedParamTypes[0]!,
        mutable: false,
        span: expr.span,
      });
    }

    for (const p of expr.params) {
      if (p.name) {
        childScope.define({
          name: p.name,
          type: p.type ? this.resolveTypeRef(p.type) : T_UNKNOWN,
          mutable: false,
          span: p.span,
        });
      }
    }
    let retType: JType = T_UNIT;
    this.withScope(childScope, () => {
      for (const stmt of expr.body) {
        if (stmt.kind === "ExprStmt") retType = this.checkExpr(stmt.expr);
        else this.checkStmt(stmt);
      }
    });
    const paramTypes = expr.params.length > 0
      ? expr.params.map((p) => (p.type ? this.resolveTypeRef(p.type) : T_UNKNOWN))
      : (expectedParamTypes ?? [T_UNKNOWN]);
    return { tag: "func", params: paramTypes, ret: retType, suspend: false };
  }

  private checkIfExpr(expr: AST.IfExpr): JType {
    this.checkExpr(expr.condition);

    // Apply smart casts in the `then` branch
    const narrowings = this.extractSmartCasts(expr.condition);
    const thenScope = new Scope(this.scope);
    for (const [name, type] of narrowings) {
      const existing = this.scope.lookup(name);
      if (existing) thenScope.define({ ...existing, type });
    }

    const thenType = this.withScope(thenScope, () =>
      expr.then.kind === "Block"
        ? (this.checkBlock(expr.then), T_UNIT)
        : this.checkExpr(expr.then)
    );

    // Apply narrowings for the else branch (e.g. `x !is T` → else: x IS T)
    const elseNarrowings = this.extractElseSmartCasts(expr.condition);
    let elseType: JType;
    if (elseNarrowings.size > 0) {
      const elseScope = new Scope(this.scope);
      for (const [name, type] of elseNarrowings) {
        const existing = this.scope.lookup(name);
        if (existing) elseScope.define({ ...existing, type });
      }
      elseType = this.withScope(elseScope, () =>
        expr.else.kind === "Block"
          ? (this.checkBlock(expr.else), T_UNIT)
          : expr.else.kind === "IfExpr"
            ? this.checkIfExpr(expr.else)
            : this.checkExpr(expr.else)
      );
    } else {
      elseType = expr.else.kind === "Block"
        ? (this.checkBlock(expr.else), T_UNIT)
        : expr.else.kind === "IfExpr"
          ? this.checkIfExpr(expr.else)
          : this.checkExpr(expr.else);
    }
    return this.unify([thenType, elseType]);
  }

  // ── Type resolution ────────────────────────────────────────────────────────

  private lookupType(nameParts: string[]): JType | null {
    if (nameParts.length === 0) return null;
    const first = nameParts[0]!;
    const builtin = this.builtinType(first);
    if (builtin && nameParts.length === 1) return builtin;

    let sym = this.scope.lookup(first);
    if (!sym) return null;

    let currentType = sym.type;
    for (let i = 1; i < nameParts.length; i++) {
      const part = nameParts[i]!;
      if (currentType.tag === "class" && currentType.decl?.body) {
        // Look for nested class in body
        const nested = currentType.decl.body.members.find(
          (m) => {
            const k = m.kind as string;
            return (
              (k === "ClassDecl" ||
                k === "DataClassDecl" ||
                k === "SealedClassDecl" ||
                k === "EnumClassDecl" ||
                k === "InterfaceDecl" ||
                k === "ObjectDecl") &&
              (m as any).name === part
            );
          }
        );
        if (nested) {
          currentType = classType(currentType.name + "." + part, [], nested as ClassDecl);
        } else {
          return null;
        }
      } else {
        return null;
      }
    }
    return currentType;
  }

  private resolveTypeRef(ref: AST.TypeRef): JType {
    switch (ref.kind) {
      case "NullableTypeRef":
        return nullable(this.resolveTypeRef(ref.base));
      case "SimpleTypeRef": {
        return this.lookupType([...ref.name]) ?? classType(ref.name.join("."));
      }
      case "GenericTypeRef": {
        const base = this.lookupType([...ref.base.name]) ?? classType(ref.base.name.join("."));
        const args = ref.args.map((a) => a.star ? T_ANY : a.type ? this.resolveTypeRef(a.type) : T_UNKNOWN);
        if (base.tag === "class") return { ...base, typeArgs: args };
        return base;
      }
      case "FunctionTypeRef": {
        const params = ref.params.map((p) => this.resolveTypeRef(p));
        const ret = this.resolveTypeRef(ref.returnType);
        return { tag: "func", params, ret, suspend: false };
      }
      case "StarProjection":
        return T_ANY;
    }
  }

  private builtinType(name: string): JType | null {
    switch (name) {
      case "Int": return T_INT;
      case "Long": return T_LONG;
      case "Float": return T_FLOAT;
      case "Double": return T_DOUBLE;
      case "Boolean": return T_BOOL;
      case "String": return T_STRING;
      case "Char": return T_CHAR;
      case "Unit": return T_UNIT;
      case "Any": return T_ANY;
      case "Nothing": return T_NOTHING;
      default: return null;
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private memberType(span: AST.Span, targetType: JType, member: string, safe: boolean): JType {
    if (targetType.tag === "error" || targetType.tag === "unknown" || targetType.tag === "any") {
      return T_UNKNOWN;
    }
    if (targetType.tag === "nullable" && !safe) {
      this.diag.error(span, E_UNSAFE_NULL_DEREFERENCE,
        `Unsafe member access on nullable type '${this.typeToString(targetType)}'. Use ?. instead.`);
      return T_UNKNOWN;
    }
    // Known stdlib members
    if (targetType.tag === "string") {
      const str = T_STRING;
      const bool = T_BOOL;
      const int = T_INT;
      const strList = classType("List", [str]);
      const f = (params: JType[], ret: JType): JType => ({ tag: "func", params, ret, suspend: false });
      switch (member) {
        // properties
        case "length": return int;
        case "indices": return classType("IntRange");
        case "lastIndex": return int;
        // no-arg → String
        case "uppercase": case "lowercase": case "trim": case "trimStart": case "trimEnd":
        case "reversed": case "trimIndent":
        case "toUpperCase": case "toLowerCase": // Java aliases
          return f([], str);
        // no-arg → Boolean
        case "isEmpty": case "isNotEmpty": case "isBlank": case "isNotBlank":
          return f([], bool);
        // String → Boolean
        case "startsWith": case "endsWith": case "contains":
          return f([str], bool);
        // (String) → String
        case "removePrefix": case "removeSuffix":
          return f([str], str);
        // (String) → String
        case "substringBefore": case "substringAfter":
        case "substringBeforeLast": case "substringAfterLast":
          return f([str], str);
        // (Int, Int) → String
        case "substring": return f([int, int], str);
        // (String, String) → String
        case "replace": return f([str, str], str);
        // (String) → List<String>
        case "split": return f([str], strList);
        // → List<String>
        case "lines": return f([], strList);
        // (Int) → String
        case "repeat": return f([int], str);
        case "padStart": case "padEnd": return f([int, str], str);
        // conversions
        case "toInt": return f([], int);
        case "toIntOrNull": return f([], nullable(int));
        case "toDouble": return f([], T_DOUBLE);
        case "toDoubleOrNull": return f([], nullable(T_DOUBLE));
        case "toLong": return f([], T_LONG);
        case "toFloat": return f([], T_FLOAT);
        case "toBoolean": return f([], bool);
        case "toBooleanOrNull": return f([], nullable(bool));
        case "toCharArray": return f([], classType("CharArray"));
        // (Int) → Char
        case "get": return f([int], T_CHAR);
        // (String) → Boolean
        case "matches": return f([classType("Regex")], bool);
        // () → String
        case "capitalize": case "decapitalize": return f([], str);
        // (Int) → String
        case "first": case "last": return f([], T_CHAR);
        case "firstOrNull": case "lastOrNull": return f([], nullable(T_CHAR));
        case "take": case "drop": return f([int], str);
        case "takeLast": case "dropLast": return f([int], str);
        // compareTo, ifEmpty, ifBlank
        case "compareTo": return f([str], int);
        case "ifEmpty": case "ifBlank": return f([{ tag: "func", params: [], ret: str, suspend: false }], str);
        default: return T_UNKNOWN;
      }
    }

    // Numeric member types (Int, Long, Float, Double, Char)
    const isNumeric = targetType.tag === "int" || targetType.tag === "long" ||
                      targetType.tag === "float" || targetType.tag === "double";
    if (isNumeric) {
      const f = (params: JType[], ret: JType): JType => ({ tag: "func", params, ret, suspend: false });
      switch (member) {
        case "coerceAtLeast": case "coerceAtMost": return f([targetType], targetType);
        case "coerceIn": return f([targetType, targetType], targetType);
        case "toInt": return f([], T_INT);
        case "toLong": return f([], T_LONG);
        case "toFloat": return f([], T_FLOAT);
        case "toDouble": return f([], T_DOUBLE);
        case "toString": return f([], T_STRING);
        case "compareTo": return f([targetType], T_INT);
        case "plus": case "minus": case "times": case "div": case "rem":
          return f([targetType], targetType);
        case "unaryMinus": case "unaryPlus": return f([], targetType);
        case "inc": case "dec": return f([], targetType);
        case "downTo": return f([targetType], classType("IntRange"));
        case "until": return f([targetType], classType("IntRange"));
        case "step": return f([T_INT], classType("IntRange"));
        default: return T_UNKNOWN;
      }
    }

    // Collection/List member types
    if (targetType.tag === "class" &&
        (targetType.name === "List" || targetType.name === "MutableList" ||
         targetType.name === "Set" || targetType.name === "MutableSet")) {
      const elemType = targetType.typeArgs[0] ?? T_UNKNOWN;
      const f = (params: JType[], ret: JType): JType => ({ tag: "func", params, ret, suspend: false });
      const predFn: JType = { tag: "func", params: [elemType], ret: T_BOOL, suspend: false };
      switch (member) {
        case "size": return T_INT;
        case "isEmpty": case "isNotEmpty": return f([], T_BOOL);
        case "contains": return f([elemType], T_BOOL);
        case "containsAll": return f([classType("List", [elemType])], T_BOOL);
        case "get": return f([T_INT], elemType);
        case "first": return f([predFn], elemType);
        case "last": return f([predFn], elemType);
        case "firstOrNull": return f([predFn], nullable(elemType));
        case "lastOrNull": return f([predFn], nullable(elemType));
        case "find": case "findLast": return f([predFn], nullable(elemType));
        case "indexOf": case "lastIndexOf": return f([elemType], T_INT);
        case "indexOfFirst": case "indexOfLast": return f([predFn], T_INT);
        case "filter": case "filterNot": return f([predFn], classType("List", [elemType]));
        case "filterNotNull": return f([], classType("List", [T_UNKNOWN]));
        case "filterIsInstance": return f([], classType("List", [T_UNKNOWN]));
        case "map": return { tag: "func", params: [{ tag: "func", params: [elemType], ret: T_UNKNOWN, suspend: false }], ret: classType("List", [T_UNKNOWN]), suspend: false };
        case "mapNotNull": return { tag: "func", params: [{ tag: "func", params: [elemType], ret: nullable(T_UNKNOWN), suspend: false }], ret: classType("List", [T_UNKNOWN]), suspend: false };
        case "mapIndexed": return { tag: "func", params: [{ tag: "func", params: [T_INT, elemType], ret: T_UNKNOWN, suspend: false }], ret: classType("List", [T_UNKNOWN]), suspend: false };
        case "forEach": return f([{ tag: "func", params: [elemType], ret: T_UNIT, suspend: false }], T_UNIT);
        case "forEachIndexed": return f([{ tag: "func", params: [T_INT, elemType], ret: T_UNIT, suspend: false }], T_UNIT);
        case "any": case "all": case "none": return f([predFn], T_BOOL);
        case "count": return f([predFn], T_INT);
        case "sumOf": return { tag: "func", params: [{ tag: "func", params: [elemType], ret: T_DOUBLE, suspend: false }], ret: T_DOUBLE, suspend: false };
        case "minOf": return { tag: "func", params: [{ tag: "func", params: [elemType], ret: T_DOUBLE, suspend: false }], ret: T_DOUBLE, suspend: false };
        case "maxOf": return { tag: "func", params: [{ tag: "func", params: [elemType], ret: T_DOUBLE, suspend: false }], ret: T_DOUBLE, suspend: false };
        case "minOrNull": return f([], nullable(elemType));
        case "maxOrNull": return f([], nullable(elemType));
        case "minByOrNull": case "maxByOrNull": return { tag: "func", params: [{ tag: "func", params: [elemType], ret: T_UNKNOWN, suspend: false }], ret: nullable(elemType), suspend: false };
        case "joinToString": return f([T_STRING, T_STRING, T_STRING], T_STRING);
        case "sortedBy": case "sortedByDescending": return { tag: "func", params: [{ tag: "func", params: [elemType], ret: T_UNKNOWN, suspend: false }], ret: classType("List", [elemType]), suspend: false };
        case "sortedWith": return f([T_UNKNOWN], classType("List", [elemType]));
        case "reversed": return f([], classType("List", [elemType]));
        case "distinct": return f([], classType("List", [elemType]));
        case "distinctBy": return { tag: "func", params: [{ tag: "func", params: [elemType], ret: T_UNKNOWN, suspend: false }], ret: classType("List", [elemType]), suspend: false };
        case "flatten": return f([], classType("List", [T_UNKNOWN]));
        case "flatMap": return { tag: "func", params: [{ tag: "func", params: [elemType], ret: classType("List", [T_UNKNOWN]), suspend: false }], ret: classType("List", [T_UNKNOWN]), suspend: false };
        case "fold": return { tag: "func", params: [T_UNKNOWN, { tag: "func", params: [T_UNKNOWN, elemType], ret: T_UNKNOWN, suspend: false }], ret: T_UNKNOWN, suspend: false };
        case "reduce": return { tag: "func", params: [{ tag: "func", params: [elemType, elemType], ret: elemType, suspend: false }], ret: elemType, suspend: false };
        case "groupBy": return { tag: "func", params: [{ tag: "func", params: [elemType], ret: T_UNKNOWN, suspend: false }], ret: classType("Map", [T_UNKNOWN, classType("List", [elemType])]), suspend: false };
        case "associate": return { tag: "func", params: [{ tag: "func", params: [elemType], ret: classType("Pair", [T_UNKNOWN, T_UNKNOWN]), suspend: false }], ret: classType("Map", [T_UNKNOWN, T_UNKNOWN]), suspend: false };
        case "associateBy": return { tag: "func", params: [{ tag: "func", params: [elemType], ret: T_UNKNOWN, suspend: false }], ret: classType("Map", [T_UNKNOWN, elemType]), suspend: false };
        case "associateWith": return { tag: "func", params: [{ tag: "func", params: [elemType], ret: T_UNKNOWN, suspend: false }], ret: classType("Map", [elemType, T_UNKNOWN]), suspend: false };
        case "partition": return f([predFn], classType("Pair", [classType("List", [elemType]), classType("List", [elemType])]));
        case "zip": return { tag: "func", params: [classType("List", [T_UNKNOWN])], ret: classType("List", [classType("Pair", [elemType, T_UNKNOWN])]), suspend: false };
        case "zipWithNext": return f([], classType("List", [classType("Pair", [elemType, elemType])]));
        case "take": return f([T_INT], classType("List", [elemType]));
        case "takeLast": return f([T_INT], classType("List", [elemType]));
        case "takeWhile": return f([predFn], classType("List", [elemType]));
        case "drop": return f([T_INT], classType("List", [elemType]));
        case "dropLast": return f([T_INT], classType("List", [elemType]));
        case "dropWhile": return f([predFn], classType("List", [elemType]));
        case "chunked": return f([T_INT], classType("List", [classType("List", [elemType])]));
        case "windowed": return f([T_INT], classType("List", [classType("List", [elemType])]));
        case "toList": return f([], classType("List", [elemType]));
        case "toSet": return f([], classType("Set", [elemType]));
        case "toMutableList": return f([], classType("MutableList", [elemType]));
        case "toMutableSet": return f([], classType("MutableSet", [elemType]));
        case "withIndex": return f([], classType("List", [classType("IndexedValue", [elemType])]));
        case "onEach": return f([{ tag: "func", params: [elemType], ret: T_UNIT, suspend: false }], classType("List", [elemType]));
        case "plus": return f([classType("List", [elemType])], classType("List", [elemType]));
        case "minus": return f([elemType], classType("List", [elemType]));
        case "intersect": return f([classType("Set", [elemType])], classType("Set", [elemType]));
        case "union": return f([classType("Set", [elemType])], classType("Set", [elemType]));
        case "subtract": return f([classType("Set", [elemType])], classType("Set", [elemType]));
        // MutableList/MutableSet only
        case "add": return f([elemType], T_BOOL);
        case "remove": return f([elemType], T_BOOL);
        case "removeIf": return f([predFn], T_BOOL);
        case "addAll": return f([classType("List", [elemType])], T_BOOL);
        case "removeAll": return f([classType("List", [elemType])], T_BOOL);
        case "set": return f([T_INT, elemType], elemType);
        case "clear": case "shuffle": case "sort": return f([], T_UNIT);
        case "sortBy": return f([{ tag: "func", params: [elemType], ret: T_UNKNOWN, suspend: false }], T_UNIT);
        default: return T_UNKNOWN;
      }
    }

    // Map member types
    if (targetType.tag === "class" &&
        (targetType.name === "Map" || targetType.name === "MutableMap")) {
      const keyType = targetType.typeArgs[0] ?? T_UNKNOWN;
      const valueType = targetType.typeArgs[1] ?? T_UNKNOWN;
      const f = (params: JType[], ret: JType): JType => ({ tag: "func", params, ret, suspend: false });
      switch (member) {
        case "size": return T_INT;
        case "isEmpty": case "isNotEmpty": return f([], T_BOOL);
        case "keys": return classType("Set", [keyType]);
        case "values": return classType("Collection", [valueType]);
        case "entries": return classType("Set", [classType("MapEntry", [keyType, valueType])]);
        case "get": return f([keyType], nullable(valueType));
        case "containsKey": return f([keyType], T_BOOL);
        case "containsValue": return f([valueType], T_BOOL);
        case "getOrDefault": return f([keyType, valueType], valueType);
        // MutableMap only
        case "put": return f([keyType, valueType], nullable(valueType));
        case "remove": return f([keyType], nullable(valueType));
        case "putAll": return f([classType("Map", [keyType, valueType])], T_UNIT);
        case "clear": return f([], T_UNIT);
        default: return T_UNKNOWN;
      }
    }

    // IntRange members
    if (targetType.tag === "class" && targetType.name === "IntRange") {
      const f = (params: JType[], ret: JType): JType => ({ tag: "func", params, ret, suspend: false });
      switch (member) {
        case "start": case "endInclusive": case "stepSize": return T_INT;
        case "first": case "last": case "count": return f([], T_INT);
        case "isEmpty": return f([], T_BOOL);
        case "contains": return f([T_INT], T_BOOL);
        case "step": return f([T_INT], classType("IntRange"));
        case "toList": return f([], classType("List", [T_INT]));
        case "toString": return f([], T_STRING);
        default: return T_UNKNOWN;
      }
    }

    // Result<T> members
    if (targetType.tag === "class" && targetType.name === "Result") {
      const inner = targetType.typeArgs[0] ?? T_UNKNOWN;
      const f = (params: JType[], ret: JType): JType => ({ tag: "func", params, ret, suspend: false });
      switch (member) {
        case "isSuccess": case "isFailure": return T_BOOL;
        case "getOrNull": return f([], nullable(inner));
        case "getOrUndefined": return f([], nullable(inner));
        case "getOrThrow": return f([], inner);
        case "getOrDefault": return f([inner], inner);
        case "getOrElse": return f([{ tag: "func", params: [T_ANY], ret: inner, suspend: false }], inner);
        case "exceptionOrNull": return f([], nullable(T_ANY));
        case "map": return { tag: "func", params: [{ tag: "func", params: [inner], ret: T_UNKNOWN, suspend: false }], ret: classType("Result", [T_UNKNOWN]), suspend: false };
        case "mapCatching": return { tag: "func", params: [{ tag: "func", params: [inner], ret: T_UNKNOWN, suspend: false }], ret: classType("Result", [T_UNKNOWN]), suspend: false };
        case "recover": return f([{ tag: "func", params: [T_ANY], ret: inner, suspend: false }], classType("Result", [inner]));
        case "onSuccess": case "onFailure": return f([{ tag: "func", params: [T_ANY], ret: T_UNIT, suspend: false }], classType("Result", [inner]));
        case "fold": return { tag: "func", params: [{ tag: "func", params: [inner], ret: T_UNKNOWN, suspend: false }, { tag: "func", params: [T_ANY], ret: T_UNKNOWN, suspend: false }], ret: T_UNKNOWN, suspend: false };
        default: return T_UNKNOWN;
      }
    }

    // Regex members
    if (targetType.tag === "class" && targetType.name === "Regex") {
      const f = (params: JType[], ret: JType): JType => ({ tag: "func", params, ret, suspend: false });
      const regexResult = classType("RegexResult");
      switch (member) {
        case "matches": case "containsMatchIn": return f([T_STRING], T_BOOL);
        case "find": return f([T_STRING], nullable(regexResult));
        case "findAll": return f([T_STRING], classType("List", [regexResult]));
        case "replace": return f([T_STRING, T_STRING], T_STRING);
        case "replaceFirst": return f([T_STRING, T_STRING], T_STRING);
        case "split": return f([T_STRING], classType("List", [T_STRING]));
        case "toPattern": return f([], T_STRING);
        default: return T_UNKNOWN;
      }
    }

    // StringBuilder members
    if (targetType.tag === "class" && targetType.name === "StringBuilder") {
      const f = (params: JType[], ret: JType): JType => ({ tag: "func", params, ret, suspend: false });
      const self = targetType;
      switch (member) {
        case "length": return T_INT;
        case "append": case "appendLine": case "prepend": return f([T_ANY], self);
        case "clear": return f([], self);
        case "isEmpty": case "isNotEmpty": return f([], T_BOOL);
        case "toString": return f([], T_STRING);
        default: return T_UNKNOWN;
      }
    }

    // Int companion — Int.MAX_VALUE, Int.MIN_VALUE
    if (targetType.tag === "class" && targetType.name === "IntCompanion") {
      switch (member) {
        case "MAX_VALUE": return T_INT;
        case "MIN_VALUE": return T_INT;
        case "SIZE_BITS": case "SIZE_BYTES": return T_INT;
        default: return T_UNKNOWN;
      }
    }

    // Long companion — Long.MAX_VALUE, Long.MIN_VALUE
    if (targetType.tag === "class" && targetType.name === "LongCompanion") {
      switch (member) {
        case "MAX_VALUE": return T_LONG;
        case "MIN_VALUE": return T_LONG;
        case "SIZE_BITS": case "SIZE_BYTES": return T_INT;
        default: return T_UNKNOWN;
      }
    }

    // Double / Float companion
    if (targetType.tag === "class" && targetType.name === "NumberCompanion") {
      switch (member) {
        case "MAX_VALUE": case "MIN_VALUE": case "POSITIVE_INFINITY": case "NEGATIVE_INFINITY": case "NaN": return T_DOUBLE;
        default: return T_UNKNOWN;
      }
    }

    // MutableStateFlow<T> / StateFlow<T> members
    if (targetType.tag === "class" &&
        (targetType.name === "MutableStateFlow" || targetType.name === "StateFlow")) {
      const inner = targetType.typeArgs[0] ?? T_UNKNOWN;
      const f = (params: JType[], ret: JType): JType => ({ tag: "func", params, ret, suspend: false });
      switch (member) {
        case "value": return inner;
        case "update": return f([{ tag: "func", params: [inner], ret: inner, suspend: false }], T_UNIT);
        case "collect": return f([{ tag: "func", params: [inner], ret: T_UNIT, suspend: false }], T_UNIT);
        case "emit": return f([inner], T_UNIT);
        case "tryEmit": return f([inner], T_BOOL);
        case "asStateFlow": return f([], classType("StateFlow", [inner]));
        case "compareAndSet": return f([inner, inner], T_BOOL);
        case "map": return { tag: "func", params: [{ tag: "func", params: [inner], ret: T_UNKNOWN, suspend: false }], ret: classType("Flow", [T_UNKNOWN]), suspend: false };
        case "filter": return f([{ tag: "func", params: [inner], ret: T_BOOL, suspend: false }], classType("Flow", [inner]));
        default: return T_UNKNOWN;
      }
    }

    // Flow<T> members
    if (targetType.tag === "class" && targetType.name === "Flow") {
      const inner = targetType.typeArgs[0] ?? T_UNKNOWN;
      const f = (params: JType[], ret: JType): JType => ({ tag: "func", params, ret, suspend: false });
      switch (member) {
        case "collect": return f([{ tag: "func", params: [inner], ret: T_UNIT, suspend: false }], T_UNIT);
        case "map": return { tag: "func", params: [{ tag: "func", params: [inner], ret: T_UNKNOWN, suspend: false }], ret: classType("Flow", [T_UNKNOWN]), suspend: false };
        case "filter": return f([{ tag: "func", params: [inner], ret: T_BOOL, suspend: false }], classType("Flow", [inner]));
        case "onEach": return f([{ tag: "func", params: [inner], ret: T_UNIT, suspend: false }], classType("Flow", [inner]));
        case "take": return f([T_INT], classType("Flow", [inner]));
        case "drop": return f([T_INT], classType("Flow", [inner]));
        case "debounce": return f([T_LONG], classType("Flow", [inner]));
        default: return T_UNKNOWN;
      }
    }

    // Deferred<T> members (async {})
    if (targetType.tag === "class" && targetType.name === "Deferred") {
      const inner = targetType.typeArgs[0] ?? T_UNKNOWN;
      const f = (params: JType[], ret: JType): JType => ({ tag: "func", params, ret, suspend: false });
      switch (member) {
        case "await": return { tag: "func", params: [], ret: inner, suspend: true };
        case "isCompleted": case "isCancelled": case "isActive": return T_BOOL;
        case "cancel": return f([], T_UNIT);
        case "getCompleted": return f([], inner);
        default: return T_UNKNOWN;
      }
    }

    // Job members (launch {})
    if (targetType.tag === "class" && targetType.name === "Job") {
      const f = (params: JType[], ret: JType): JType => ({ tag: "func", params, ret, suspend: false });
      switch (member) {
        case "isCompleted": case "isCancelled": case "isActive": return T_BOOL;
        case "cancel": return f([], T_UNIT);
        case "join": return { tag: "func", params: [], ret: T_UNIT, suspend: true };
        default: return T_UNKNOWN;
      }
    }

    // ViewModel members
    if (targetType.tag === "class" && targetType.name === "ViewModel") {
      const f = (params: JType[], ret: JType): JType => ({ tag: "func", params, ret, suspend: false });
      switch (member) {
        case "onCleared": return f([], T_UNIT);
        case "viewModelScope": return classType("CoroutineScope");
        default: return T_UNKNOWN;
      }
    }

    // CoroutineScope members
    if (targetType.tag === "class" && targetType.name === "CoroutineScope") {
      const f = (params: JType[], ret: JType): JType => ({ tag: "func", params, ret, suspend: false });
      switch (member) {
        case "launch": return f([{ tag: "func", params: [], ret: T_UNIT, suspend: true }], classType("Job"));
        case "cancel": return f([], T_UNIT);
        case "isActive": return T_BOOL;
        default: return T_UNKNOWN;
      }
    }

    // User class member lookup
    if (targetType.tag === "class" && targetType.decl && targetType.decl.body) {
      // Data class copy()
      if (member === "copy" && targetType.decl.kind === "DataClassDecl") {
        const params = targetType.decl.primaryConstructor.params.map(p => this.resolveTypeRef(p.type));
        const paramNames = targetType.decl.primaryConstructor.params.map(p => p.name);
        return { tag: "func", params, paramNames, ret: targetType, suspend: false };
      }

      for (const m of targetType.decl.body.members) {
        if (m.kind === "FunDecl" && m.name === member) {
          return this.funDeclType(m);
        }
        if (m.kind === "PropertyDecl" && m.name === member) {
          if (m.type) return this.resolveTypeRef(m.type);
          // Infer type from delegate (e.g. `val x by lazy { expr }`)
          if (m.delegate) return this.inferDelegateType(m.delegate);
          // Infer type from initializer
          if (m.initializer) return this.checkExpr(m.initializer);
          return T_UNKNOWN;
        }
        // Nested ObjectDecl (singleton) — return the singleton type
        if ((m.kind === "ObjectDecl") && m.name === member) {
          return classType(m.name);
        }
        // Nested DataClassDecl or ClassDecl — return as a callable constructor type
        if ((m.kind === "DataClassDecl" || m.kind === "ClassDecl") && m.name === member) {
          return classType(m.name, [], m);
        }
        // Nested EnumClassDecl — return as class type
        if (m.kind === "EnumClassDecl" && m.name === member) {
          return classType(m.name, [], m);
        }
        // CompanionObject — return its type (for class.companion syntax)
        if (m.kind === "CompanionObject" && (member === "companion" || member === "Companion")) {
          return classType(`${targetType.name}.Companion`);
        }
      }
    }

    // Bibi HTTP client member types
    if (targetType.tag === "class" && targetType.name === "Bibi") {
      const f = (params: JType[], ret: JType): JType => ({ tag: "func", params, ret, suspend: true });
      const responseType = classType("BibiResponse", [T_UNKNOWN]);
      switch (member) {
        case "get": case "delete": case "head":
          return f([T_STRING], responseType);
        case "post": case "put": case "patch":
          return f([T_STRING, T_ANY], responseType);
        case "timeout": case "headers": case "bearer": case "baseUrl":
          return f([T_ANY], classType("Bibi"));
        default: return T_UNKNOWN;
      }
    }

    // BibiResponse members
    if (targetType.tag === "class" && targetType.name === "BibiResponse") {
      const f = (params: JType[], ret: JType): JType => ({ tag: "func", params, ret, suspend: false });
      switch (member) {
        case "body": return f([], T_UNKNOWN);
        case "status": return T_INT;
        case "headers": return classType("Map", [T_STRING, T_STRING]);
        case "ok": return T_BOOL;
        default: return T_UNKNOWN;
      }
    }

    // Dispatchers — static-like singleton with fields
    if (targetType.tag === "class" && targetType.name === "Dispatchers") {
      switch (member) {
        case "IO": case "Main": case "Default": case "Unconfined":
          return classType("CoroutineDispatcher");
        default: return T_UNKNOWN;
      }
    }

    // Pair<A, B> members
    if (targetType.tag === "class" && targetType.name === "Pair") {
      const a = targetType.typeArgs[0] ?? T_UNKNOWN;
      const b = targetType.typeArgs[1] ?? T_UNKNOWN;
      const f = (params: JType[], ret: JType): JType => ({ tag: "func", params, ret, suspend: false });
      switch (member) {
        case "first": return a;
        case "second": return b;
        case "component1": return f([], a);
        case "component2": return f([], b);
        case "toList": return f([], classType("List", [T_UNKNOWN]));
        case "toString": return f([], T_STRING);
        default: return T_UNKNOWN;
      }
    }

    // Triple<A, B, C> members
    if (targetType.tag === "class" && targetType.name === "Triple") {
      const a = targetType.typeArgs[0] ?? T_UNKNOWN;
      const b = targetType.typeArgs[1] ?? T_UNKNOWN;
      const c = targetType.typeArgs[2] ?? T_UNKNOWN;
      const f = (params: JType[], ret: JType): JType => ({ tag: "func", params, ret, suspend: false });
      switch (member) {
        case "first": return a;
        case "second": return b;
        case "third": return c;
        case "component1": return f([], a);
        case "component2": return f([], b);
        case "component3": return f([], c);
        case "toList": return f([], classType("List", [T_UNKNOWN]));
        case "toString": return f([], T_STRING);
        default: return T_UNKNOWN;
      }
    }

    // Random<T> members
    if (targetType.tag === "class" && targetType.name === "Random") {
      const f = (params: JType[], ret: JType): JType => ({ tag: "func", params, ret, suspend: false });
      switch (member) {
        case "nextInt": return f([T_INT, T_INT], T_INT);
        case "nextLong": return f([], T_LONG);
        case "nextFloat": return f([], T_FLOAT);
        case "nextDouble": return f([], T_DOUBLE);
        case "nextBoolean": return f([], T_BOOL);
        case "nextBytes": return f([T_INT], classType("ByteArray"));
        default: return T_UNKNOWN;
      }
    }

    // Scope functions available on any type
    {
      const f = (params: JType[], ret: JType): JType => ({ tag: "func", params, ret, suspend: false });
      const predFn: JType = { tag: "func", params: [targetType], ret: T_BOOL, suspend: false };
      switch (member) {
        case "let":
          return f([{ tag: "func", params: [targetType], ret: T_UNKNOWN, suspend: false }], T_UNKNOWN);
        case "also":
          return f([{ tag: "func", params: [targetType], ret: T_UNIT, suspend: false }], targetType);
        case "apply":
          return f([{ tag: "func", params: [], ret: T_UNIT, suspend: false }], targetType);
        case "run":
          return f([{ tag: "func", params: [], ret: T_UNKNOWN, suspend: false }], T_UNKNOWN);
        case "takeIf":
          return f([predFn], nullable(targetType));
        case "takeUnless":
          return f([predFn], nullable(targetType));
        case "to":
          return f([T_UNKNOWN], classType("Pair", [targetType, T_UNKNOWN]));
      }
    }

    return T_UNKNOWN;
  }

  /**
   * Infer the value type of a delegated property expression.
   * For `by lazy { expr }` the delegate is a lambda; the property type is the
   * return type of that lambda.
   * For other delegates we return T_UNKNOWN.
   */
  private inferDelegateType(delegate: AST.Expr): JType {
    // `lazy { expr }` — delegate is a CallExpr whose callee is "lazy" and whose
    // trailing lambda (or first arg) is a LambdaExpr.
    if (delegate.kind === "CallExpr") {
      // `Delegates.observable(initial, callback)` — type is the type of `initial`
      if (
        delegate.callee.kind === "MemberExpr" &&
        delegate.callee.member === "observable" &&
        delegate.callee.target.kind === "NameExpr" &&
        delegate.callee.target.name === "Delegates" &&
        delegate.args.length > 0
      ) {
        return this.checkExpr(delegate.args[0]!.value);
      }
      // `Delegates.vetoable(initial, callback)` — same pattern
      if (
        delegate.callee.kind === "MemberExpr" &&
        delegate.callee.member === "vetoable" &&
        delegate.callee.target.kind === "NameExpr" &&
        delegate.callee.target.name === "Delegates" &&
        delegate.args.length > 0
      ) {
        return this.checkExpr(delegate.args[0]!.value);
      }
      const lambda = delegate.trailingLambda ??
        (delegate.args.length === 1 && delegate.args[0]!.value.kind === "LambdaExpr"
          ? (delegate.args[0]!.value as AST.LambdaExpr)
          : null);
      if (lambda) {
        // LambdaExpr.body is ReadonlyArray<Stmt> — infer from last statement
        const stmts = lambda.body;
        if (stmts.length > 0) {
          const last = stmts[stmts.length - 1]!;
          if (last.kind === "ExprStmt") return this.checkExpr(last.expr);
          if (last.kind === "ReturnStmt" && last.value) return this.checkExpr(last.value);
        }
      }
    }
    // For `by someDelegate`, check the expression and hope for the best
    return this.checkExpr(delegate);
  }

  private elementTypeOf(iterType: JType): JType {
    if (iterType.tag === "class") {
      const firstArg = iterType.typeArgs[0];
      if (firstArg) return firstArg;
    }
    return T_UNKNOWN;
  }

  private numericType(a: JType, b: JType): JType {
    if (a.tag === "double" || b.tag === "double") return T_DOUBLE;
    if (a.tag === "float" || b.tag === "float") return T_FLOAT;
    if (a.tag === "long" || b.tag === "long") return T_LONG;
    return T_INT;
  }

  private unify(types: JType[]): JType {
    if (types.length === 0) return T_UNIT;
    const filtered = types.filter((t) => t.tag !== "nothing");
    if (filtered.length === 0) return T_NOTHING;
    if (filtered.length === 1) return filtered[0]!;
    // All same?
    const first = filtered[0]!;
    if (filtered.every((t) => t.tag === first.tag)) return first;
    return T_ANY;
  }

  private assertAssignable(span: AST.Span, from: JType, to: JType): void {
    if (this.isAssignable(from, to)) return;
    this.diag.error(
      span,
      E_TYPE_MISMATCH,
      `Type mismatch: expected '${this.typeToString(to)}', got '${this.typeToString(from)}'`
    );
  }

  private isAssignable(from: JType, to: JType): boolean {
    if (from.tag === "error" || to.tag === "error") return true;
    if (from.tag === "nothing" || to.tag === "any") return true;
    if (from.tag === "unknown" || to.tag === "unknown") return true;
    if (to.tag === "nullable") return this.isAssignable(from, to.inner) || from.tag === "nullable";
    if (from.tag === "nullable") return false;
    return from.tag === to.tag;
  }

  private withScope<T>(scope: Scope, fn: () => T): T {
    const prev = this.scope;
    this.scope = scope;
    const result = fn();
    this.scope = prev;
    return result;
  }

  typeToString(t: JType): string {
    switch (t.tag) {
      case "int": return "Int";
      case "long": return "Long";
      case "float": return "Float";
      case "double": return "Double";
      case "boolean": return "Boolean";
      case "string": return "String";
      case "char": return "Char";
      case "byte": return "Byte";
      case "short": return "Short";
      case "unit": return "Unit";
      case "any": return "Any";
      case "nothing": return "Nothing";
      case "nullable": return `${this.typeToString(t.inner)}?`;
      case "class": return t.typeArgs.length > 0
        ? `${t.name}<${t.typeArgs.map((a) => this.typeToString(a)).join(", ")}>`
        : t.name;
      case "func": {
        const p = t.params.map((p) => this.typeToString(p)).join(", ");
        const ret = this.typeToString(t.ret);
        return `${t.suspend ? "suspend " : ""}(${p}) -> ${ret}`;
      }
      case "typeparam": return t.name;
      case "error": return "<error>";
      case "unknown": return "<unknown>";
    }
  }
}

// ---------------------------------------------------------------------------
// Public helper
// ---------------------------------------------------------------------------

export function typeCheck(program: AST.Program, diag: DiagnosticBag): TypeChecker {
  const checker = new TypeChecker(diag);
  checker.checkProgram(program);
  return checker;
}
