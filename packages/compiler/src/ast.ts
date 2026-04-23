// ─────────────────────────────────────────────────────────────────────────────
// Jalvin Abstract Syntax Tree
// Every node carries a Span for error reporting and source maps.
// ─────────────────────────────────────────────────────────────────────────────

// ---------------------------------------------------------------------------
// Source location
// ---------------------------------------------------------------------------

export interface Span {
  readonly file: string;
  readonly startLine: number;
  readonly startCol: number;
  readonly endLine: number;
  readonly endCol: number;
  readonly startOffset: number;
  readonly endOffset: number;
}

export const BUILTIN_SPAN: Span = {
  file: "<builtin>",
  startLine: 0,
  startCol: 0,
  endLine: 0,
  endCol: 0,
  startOffset: 0,
  endOffset: 0,
};

// ---------------------------------------------------------------------------
// Access modifiers and other keyword modifiers
// ---------------------------------------------------------------------------

export type Visibility = "public" | "private" | "protected" | "internal";

export type Modifier =
  | "open"
  | "abstract"
  | "override"
  | "inline"
  | "operator"
  | "infix"
  | "external"
  | "tailrec"
  | "suspend"
  | "reified"
  | "const"
  | "lateinit"
  | "final";

// ---------------------------------------------------------------------------
// Annotations — @Name or @Name("reason") or @Name(key = value, ...)
// ---------------------------------------------------------------------------

export interface Annotation {
  readonly span: Span;
  /** e.g. "Nuked", "JvmStatic", "Suppress" */
  readonly name: string;
  /** Raw argument string (everything between the parens), or null if no parens */
  readonly args: string | null;
}

export interface Modifiers {
  readonly visibility: Visibility;
  readonly modifiers: ReadonlyArray<Modifier>;
  readonly annotations: ReadonlyArray<Annotation>;
}

export const DEFAULT_MODIFIERS: Modifiers = {
  visibility: "public",
  modifiers: [],
  annotations: [],
};

function hasModifier(m: Modifiers, mod: Modifier): boolean {
  return m.modifiers.includes(mod);
}

export function isSuspend(m: Modifiers): boolean {
  return hasModifier(m, "suspend");
}

// ---------------------------------------------------------------------------
// Top-level program
// ---------------------------------------------------------------------------

export interface Program {
  readonly kind: "Program";
  readonly span: Span;
  readonly packageDecl: PackageDecl | null;
  readonly imports: ReadonlyArray<ImportDecl>;
  readonly declarations: ReadonlyArray<TopLevelDecl>;
}

// ---------------------------------------------------------------------------
// Package & imports
// ---------------------------------------------------------------------------

export interface PackageDecl {
  readonly kind: "PackageDecl";
  readonly span: Span;
  readonly path: ReadonlyArray<string>;
}

export interface ImportDecl {
  readonly kind: "ImportDecl";
  readonly span: Span;
  readonly path: ReadonlyArray<string>;
  /** `import foo.bar.*` */
  readonly star: boolean;
  /** `import foo.bar as Baz` */
  readonly alias: string | null;
}

// ---------------------------------------------------------------------------
// Type references
// ---------------------------------------------------------------------------

export type TypeRef =
  | SimpleTypeRef
  | NullableTypeRef
  | FunctionTypeRef
  | GenericTypeRef
  | StarProjection;

export interface SimpleTypeRef {
  readonly kind: "SimpleTypeRef";
  readonly span: Span;
  /** Dotted name: `foo.bar.Baz` */
  readonly name: ReadonlyArray<string>;
}

export interface NullableTypeRef {
  readonly kind: "NullableTypeRef";
  readonly span: Span;
  readonly base: TypeRef;
}

export interface FunctionTypeRef {
  readonly kind: "FunctionTypeRef";
  readonly span: Span;
  readonly receiver: TypeRef | null;
  readonly params: ReadonlyArray<TypeRef>;
  readonly returnType: TypeRef;
}

export interface GenericTypeRef {
  readonly kind: "GenericTypeRef";
  readonly span: Span;
  readonly base: SimpleTypeRef;
  readonly args: ReadonlyArray<TypeArg>;
}

export interface TypeArg {
  readonly span: Span;
  readonly variance: "in" | "out" | null;
  /** `*` projection */
  readonly star: boolean;
  readonly type: TypeRef | null;
}

export interface StarProjection {
  readonly kind: "StarProjection";
  readonly span: Span;
}

export interface TypeParam {
  readonly span: Span;
  readonly name: string;
  readonly variance: "in" | "out" | null;
  readonly reified: boolean;
  readonly upperBound: TypeRef | null;
}

// ---------------------------------------------------------------------------
// Top-level declarations
// ---------------------------------------------------------------------------

export type TopLevelDecl =
  | FunDecl
  | ComponentDecl
  | ClassDecl
  | DataClassDecl
  | SealedClassDecl
  | EnumClassDecl
  | InterfaceDecl
  | ObjectDecl
  | TypeAliasDecl
  | PropertyDecl
  | ExtensionFunDecl
  | DestructuringDecl;

// ---------------------------------------------------------------------------
// Function declaration
// ---------------------------------------------------------------------------

export interface FunDecl {
  readonly kind: "FunDecl";
  readonly span: Span;
  readonly modifiers: Modifiers;
  readonly name: string;
  readonly typeParams: ReadonlyArray<TypeParam>;
  readonly receiver: TypeRef | null;
  readonly params: ReadonlyArray<Param>;
  readonly returnType: TypeRef | null;
  /** Expression body (`fun x() = expr`) or block body */
  readonly body: Block | Expr | null;
}

/** Extension function — sugar that compiles to a TypeParam-scoped function */
export interface ExtensionFunDecl {
  readonly kind: "ExtensionFunDecl";
  readonly span: Span;
  readonly modifiers: Modifiers;
  readonly name: string;
  readonly typeParams: ReadonlyArray<TypeParam>;
  readonly receiver: TypeRef;
  readonly params: ReadonlyArray<Param>;
  readonly returnType: TypeRef | null;
  readonly body: Block | Expr;
}

export interface ComponentDecl {
  readonly kind: "ComponentDecl";
  readonly span: Span;
  readonly modifiers: Modifiers;
  readonly name: string;
  readonly params: ReadonlyArray<Param>;
  readonly body: Block;
}

export interface Param {
  readonly span: Span;
  /** `val` / `var` for primary constructor params that become properties */
  readonly propertyKind: "val" | "var" | null;
  readonly name: string;
  readonly type: TypeRef;
  readonly defaultValue: Expr | null;
  readonly vararg: boolean;
}

// ---------------------------------------------------------------------------
// Class declarations
// ---------------------------------------------------------------------------

export interface ClassDecl {
  readonly kind: "ClassDecl";
  readonly span: Span;
  readonly modifiers: Modifiers;
  readonly name: string;
  readonly typeParams: ReadonlyArray<TypeParam>;
  readonly primaryConstructor: PrimaryConstructor | null;
  readonly superTypes: ReadonlyArray<SuperTypeEntry>;
  readonly body: ClassBody | null;
}

export interface DataClassDecl {
  readonly kind: "DataClassDecl";
  readonly span: Span;
  readonly modifiers: Modifiers;
  readonly name: string;
  readonly typeParams: ReadonlyArray<TypeParam>;
  readonly primaryConstructor: PrimaryConstructor;
  readonly superTypes: ReadonlyArray<SuperTypeEntry>;
  readonly body: ClassBody | null;
}

export interface SealedClassDecl {
  readonly kind: "SealedClassDecl";
  readonly span: Span;
  readonly modifiers: Modifiers;
  readonly name: string;
  readonly typeParams: ReadonlyArray<TypeParam>;
  readonly primaryConstructor: PrimaryConstructor | null;
  readonly superTypes: ReadonlyArray<SuperTypeEntry>;
  readonly body: ClassBody | null;
}

export interface InterfaceDecl {
  readonly kind: "InterfaceDecl";
  readonly span: Span;
  readonly modifiers: Modifiers;
  readonly name: string;
  readonly typeParams: ReadonlyArray<TypeParam>;
  readonly superTypes: ReadonlyArray<SuperTypeEntry>;
  readonly body: ClassBody | null;
}

export interface ObjectDecl {
  readonly kind: "ObjectDecl";
  readonly span: Span;
  readonly modifiers: Modifiers;
  /** null for anonymous `object : SomeSuperType { ... }` */
  readonly name: string | null;
  readonly superTypes: ReadonlyArray<SuperTypeEntry>;
  readonly body: ClassBody;
}

export interface TypeAliasDecl {
  readonly kind: "TypeAliasDecl";
  readonly span: Span;
  readonly modifiers: Modifiers;
  readonly name: string;
  readonly typeParams: ReadonlyArray<TypeParam>;
  readonly type: TypeRef;
}

// ---------------------------------------------------------------------------
// Enum class
// ---------------------------------------------------------------------------

export interface EnumClassDecl {
  readonly kind: "EnumClassDecl";
  readonly span: Span;
  readonly modifiers: Modifiers;
  readonly name: string;
  readonly typeParams: ReadonlyArray<TypeParam>;
  /** Optional constructor params shared by all entries */
  readonly primaryConstructor: PrimaryConstructor | null;
  readonly superTypes: ReadonlyArray<SuperTypeEntry>;
  readonly entries: ReadonlyArray<EnumEntry>;
  /** Additional non-entry members (methods, properties) */
  readonly body: ClassBody | null;
}

export interface EnumEntry {
  readonly span: Span;
  readonly name: string;
  /** Arguments to the enum constructor */
  readonly args: ReadonlyArray<CallArg>;
  /** Optional entry-specific body (overriding methods) */
  readonly body: ClassBody | null;
}

// ---------------------------------------------------------------------------
// Destructuring declaration  — val (a, b) = expr
// ---------------------------------------------------------------------------

export interface DestructuringDecl {
  readonly kind: "DestructuringDecl";
  readonly span: Span;
  readonly modifiers: Modifiers;
  readonly mutable: boolean;
  /** Names of the binding slots; null slots are placeholders (`_`) */
  readonly names: ReadonlyArray<string | null>;
  readonly types: ReadonlyArray<TypeRef | null>;
  readonly initializer: Expr;
}

export interface PrimaryConstructor {
  readonly span: Span;
  readonly modifiers: Modifiers;
  readonly params: ReadonlyArray<Param>;
}

export interface SuperTypeEntry {
  readonly span: Span;
  readonly type: TypeRef;
  /** Arguments to `super()` call */
  readonly delegateArgs: ReadonlyArray<CallArg> | null;
}

export interface ClassBody {
  readonly span: Span;
  readonly members: ReadonlyArray<ClassMember>;
}

export type ClassMember =
  | FunDecl
  | ExtensionFunDecl
  | ComponentDecl
  | PropertyDecl
  | ClassDecl
  | DataClassDecl
  | SealedClassDecl
  | EnumClassDecl
  | ObjectDecl
  | CompanionObject
  | InitBlock
  | SecondaryConstructor;

export interface PropertyDecl {
  readonly kind: "PropertyDecl";
  readonly span: Span;
  readonly modifiers: Modifiers;
  readonly mutable: boolean;
  readonly name: string;
  readonly typeParams: ReadonlyArray<TypeParam>;
  readonly type: TypeRef | null;
  readonly initializer: Expr | null;
  readonly delegate: Expr | null;
  readonly getter: PropertyAccessor | null;
  readonly setter: PropertyAccessor | null;
}

export interface PropertyAccessor {
  readonly span: Span;
  readonly modifiers: Modifiers;
  readonly params: ReadonlyArray<Param>;
  readonly body: Block | Expr | null;
}

export interface CompanionObject {
  readonly kind: "CompanionObject";
  readonly span: Span;
  readonly name: string | null;
  readonly superTypes: ReadonlyArray<SuperTypeEntry>;
  readonly body: ClassBody;
}

export interface InitBlock {
  readonly kind: "InitBlock";
  readonly span: Span;
  readonly body: Block;
}

export interface SecondaryConstructor {
  readonly kind: "SecondaryConstructor";
  readonly span: Span;
  readonly modifiers: Modifiers;
  readonly params: ReadonlyArray<Param>;
  /** `this(...)` or `super(...)` delegation */
  readonly delegation: "this" | "super" | null;
  readonly delegateArgs: ReadonlyArray<CallArg>;
  readonly body: Block;
}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

export type Stmt =
  | Block
  | PropertyDecl
  | DestructuringDecl
  | ExprStmt
  | ReturnStmt
  | ThrowStmt
  | BreakStmt
  | ContinueStmt
  | IfStmt
  | WhenStmt
  | ForStmt
  | WhileStmt
  | DoWhileStmt
  | TryCatchStmt
  | LabeledStmt;

export interface Block {
  readonly kind: "Block";
  readonly span: Span;
  readonly statements: ReadonlyArray<Stmt>;
}

export interface ExprStmt {
  readonly kind: "ExprStmt";
  readonly span: Span;
  readonly expr: Expr;
}

export interface ReturnStmt {
  readonly kind: "ReturnStmt";
  readonly span: Span;
  readonly label: string | null;
  readonly value: Expr | null;
}

export interface ThrowStmt {
  readonly kind: "ThrowStmt";
  readonly span: Span;
  readonly value: Expr;
}

export interface BreakStmt {
  readonly kind: "BreakStmt";
  readonly span: Span;
  readonly label: string | null;
}

export interface ContinueStmt {
  readonly kind: "ContinueStmt";
  readonly span: Span;
  readonly label: string | null;
}

export interface IfStmt {
  readonly kind: "IfStmt";
  readonly span: Span;
  readonly condition: Expr;
  readonly then: Block;
  readonly else: Block | IfStmt | null;
}

export interface WhenStmt {
  readonly kind: "WhenStmt";
  readonly span: Span;
  /** `when (subject)` — null means `when { }` (no subject) */
  readonly subject: WhenSubject | null;
  readonly branches: ReadonlyArray<WhenBranch>;
}

export interface WhenSubject {
  readonly span: Span;
  /** `when (val x = expr)` */
  readonly binding: string | null;
  readonly expr: Expr;
}

export interface WhenBranch {
  readonly span: Span;
  readonly conditions: ReadonlyArray<WhenCondition>;
  readonly isElse: boolean;
  /** Block or single-expression body */
  readonly body: Block | Expr;
}

export type WhenCondition =
  | WhenIsCondition
  | WhenInCondition
  | WhenExprCondition;

export interface WhenIsCondition {
  readonly kind: "WhenIsCondition";
  readonly span: Span;
  readonly negated: boolean;
  readonly type: TypeRef;
}

export interface WhenInCondition {
  readonly kind: "WhenInCondition";
  readonly span: Span;
  readonly negated: boolean;
  readonly expr: Expr;
}

export interface WhenExprCondition {
  readonly kind: "WhenExprCondition";
  readonly span: Span;
  readonly expr: Expr;
}

export interface ForStmt {
  readonly kind: "ForStmt";
  readonly span: Span;
  readonly binding: DestructureBinding | string;
  readonly iterable: Expr;
  readonly body: Block;
}

export type DestructureBinding =
  | { readonly kind: "TupleDestructure"; readonly names: ReadonlyArray<string | null> }
  | { readonly kind: "MapDestructure"; readonly key: string; readonly value: string };

export interface WhileStmt {
  readonly kind: "WhileStmt";
  readonly span: Span;
  readonly condition: Expr;
  readonly body: Block;
}

export interface DoWhileStmt {
  readonly kind: "DoWhileStmt";
  readonly span: Span;
  readonly body: Block;
  readonly condition: Expr;
}

export interface TryCatchStmt {
  readonly kind: "TryCatchStmt";
  readonly span: Span;
  readonly body: Block;
  readonly catches: ReadonlyArray<CatchClause>;
  readonly finally: Block | null;
}

export interface CatchClause {
  readonly span: Span;
  readonly name: string;
  readonly type: TypeRef;
  readonly body: Block;
}

export interface LabeledStmt {
  readonly kind: "LabeledStmt";
  readonly span: Span;
  readonly label: string;
  readonly body: Stmt;
}

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

export type Expr =
  | IntLiteralExpr
  | LongLiteralExpr
  | FloatLiteralExpr
  | DoubleLiteralExpr
  | BooleanLiteralExpr
  | NullLiteralExpr
  | StringLiteralExpr
  | StringTemplateExpr
  | NameExpr
  | ThisExpr
  | SuperExpr
  | CallExpr
  | IndexExpr
  | MemberExpr
  | SafeMemberExpr
  | UnaryExpr
  | BinaryExpr
  | AssignExpr
  | CompoundAssignExpr
  | IncrDecrExpr
  | LambdaExpr
  | IfExpr
  | WhenExpr
  | TryCatchExpr
  | TypeCheckExpr
  | TypeCastExpr
  | SafeCastExpr
  | NotNullExpr
  | ElvisExpr
  | RangeExpr
  | LaunchExpr
  | AsyncExpr
  | CollectionLiteralExpr
  | ObjectExpr
  | ParenExpr
  | BreakExpr
  | ContinueExpr
  | ReturnExpr
  | JsxElement;

// ── JSX types ──────────────────────────────────────────────────────────────

export interface JsxAttr {
  readonly span: Span;
  readonly name: string;
  /** null = boolean attr (e.g. disabled); string = literal value; Expr = {expr} */
  readonly value: Expr | string | null;
}

export interface JsxExprChild {
  readonly kind: "JsxExprChild";
  readonly span: Span;
  readonly expr: Expr;
}

export interface JsxTextChild {
  readonly kind: "JsxTextChild";
  readonly span: Span;
  readonly text: string;
}

export type JsxChild = JsxElement | JsxExprChild | JsxTextChild;

export interface JsxElement {
  readonly kind: "JsxElement";
  readonly span: Span;
  readonly tag: string;
  readonly attrs: ReadonlyArray<JsxAttr>;
  readonly children: ReadonlyArray<JsxChild>;
}

export interface IntLiteralExpr {
  readonly kind: "IntLiteralExpr";
  readonly span: Span;
  readonly value: number;
}

export interface LongLiteralExpr {
  readonly kind: "LongLiteralExpr";
  readonly span: Span;
  readonly value: bigint;
}

export interface FloatLiteralExpr {
  readonly kind: "FloatLiteralExpr";
  readonly span: Span;
  readonly value: number;
}

export interface DoubleLiteralExpr {
  readonly kind: "DoubleLiteralExpr";
  readonly span: Span;
  readonly value: number;
}

export interface BooleanLiteralExpr {
  readonly kind: "BooleanLiteralExpr";
  readonly span: Span;
  readonly value: boolean;
}

export interface NullLiteralExpr {
  readonly kind: "NullLiteralExpr";
  readonly span: Span;
}

export interface StringLiteralExpr {
  readonly kind: "StringLiteralExpr";
  readonly span: Span;
  readonly value: string;
  readonly raw: boolean; // triple-quoted
}

export interface StringTemplateExpr {
  readonly kind: "StringTemplateExpr";
  readonly span: Span;
  readonly parts: ReadonlyArray<StringTemplatePart>;
}

export type StringTemplatePart =
  | { readonly kind: "LiteralPart"; readonly value: string }
  | { readonly kind: "ExprPart"; readonly expr: Expr };

export interface NameExpr {
  readonly kind: "NameExpr";
  readonly span: Span;
  readonly name: string;
}

export interface ThisExpr {
  readonly kind: "ThisExpr";
  readonly span: Span;
  readonly label: string | null;
}

export interface SuperExpr {
  readonly kind: "SuperExpr";
  readonly span: Span;
  readonly label: string | null;
}

export interface CallExpr {
  readonly kind: "CallExpr";
  readonly span: Span;
  readonly callee: Expr;
  readonly typeArgs: ReadonlyArray<TypeArg>;
  readonly args: ReadonlyArray<CallArg>;
  /** Trailing lambda `foo { ... }` */
  readonly trailingLambda: LambdaExpr | null;
}

export interface CallArg {
  readonly span: Span;
  readonly name: string | null;
  readonly spread: boolean;
  readonly value: Expr;
}

export interface IndexExpr {
  readonly kind: "IndexExpr";
  readonly span: Span;
  readonly target: Expr;
  readonly index: Expr;
}

export interface MemberExpr {
  readonly kind: "MemberExpr";
  readonly span: Span;
  readonly target: Expr;
  readonly member: string;
}

export interface SafeMemberExpr {
  readonly kind: "SafeMemberExpr";
  readonly span: Span;
  readonly target: Expr;
  readonly member: string;
}

export type UnaryOp = "+" | "-" | "!" | "not";

export interface UnaryExpr {
  readonly kind: "UnaryExpr";
  readonly span: Span;
  readonly op: UnaryOp;
  readonly operand: Expr;
  readonly prefix: boolean;
}

export type BinaryOp =
  | "+"  | "-"  | "*"  | "/"  | "%"
  | "==" | "!=" | "===" | "!=="
  | "<"  | ">"  | "<=" | ">="
  | "&&" | "||"
  | "and" | "or" | "xor"
  | "shl" | "shr" | "ushr"
  | ".."  | "..<"
  | "in" | "!in";

export interface BinaryExpr {
  readonly kind: "BinaryExpr";
  readonly span: Span;
  readonly op: BinaryOp;
  readonly left: Expr;
  readonly right: Expr;
}

export type AssignTarget = NameExpr | IndexExpr | MemberExpr | SafeMemberExpr;

export interface AssignExpr {
  readonly kind: "AssignExpr";
  readonly span: Span;
  readonly target: AssignTarget;
  readonly value: Expr;
}

export type CompoundOp = "+=" | "-=" | "*=" | "/=" | "%=";

export interface CompoundAssignExpr {
  readonly kind: "CompoundAssignExpr";
  readonly span: Span;
  readonly op: CompoundOp;
  readonly target: AssignTarget;
  readonly value: Expr;
}

export interface IncrDecrExpr {
  readonly kind: "IncrDecrExpr";
  readonly span: Span;
  readonly op: "++" | "--";
  readonly target: AssignTarget;
  readonly prefix: boolean;
}

export interface LambdaExpr {
  readonly kind: "LambdaExpr";
  readonly span: Span;
  readonly params: ReadonlyArray<LambdaParam>;
  readonly returnType: TypeRef | null;
  readonly body: ReadonlyArray<Stmt>;
}

export interface LambdaParam {
  readonly span: Span;
  readonly name: string | null; // null = `_`
  readonly type: TypeRef | null;
}

export interface IfExpr {
  readonly kind: "IfExpr";
  readonly span: Span;
  readonly condition: Expr;
  readonly then: Block | Expr;
  readonly else: Block | IfExpr | Expr;
}

export interface WhenExpr {
  readonly kind: "WhenExpr";
  readonly span: Span;
  readonly subject: WhenSubject | null;
  readonly branches: ReadonlyArray<WhenBranch>;
}

export interface TryCatchExpr {
  readonly kind: "TryCatchExpr";
  readonly span: Span;
  readonly body: Block;
  readonly catches: ReadonlyArray<CatchClause>;
  readonly finally: Block | null;
}

export interface TypeCheckExpr {
  readonly kind: "TypeCheckExpr";
  readonly span: Span;
  readonly negated: boolean;
  readonly expr: Expr;
  readonly type: TypeRef;
}

export interface TypeCastExpr {
  readonly kind: "TypeCastExpr";
  readonly span: Span;
  readonly expr: Expr;
  readonly type: TypeRef;
}

export interface SafeCastExpr {
  readonly kind: "SafeCastExpr";
  readonly span: Span;
  readonly expr: Expr;
  readonly type: TypeRef;
}

export interface NotNullExpr {
  readonly kind: "NotNullExpr";
  readonly span: Span;
  readonly expr: Expr;
}

export interface ElvisExpr {
  readonly kind: "ElvisExpr";
  readonly span: Span;
  readonly left: Expr;
  readonly right: Expr;
}

export interface RangeExpr {
  readonly kind: "RangeExpr";
  readonly span: Span;
  readonly from: Expr;
  readonly to: Expr;
  readonly inclusive: boolean;
}

/** `launch { ... }` — fire-and-forget coroutine */
export interface LaunchExpr {
  readonly kind: "LaunchExpr";
  readonly span: Span;
  readonly context: Expr | null;
  readonly body: Block;
}

/** `async { ... }` — returns a Deferred<T> */
export interface AsyncExpr {
  readonly kind: "AsyncExpr";
  readonly span: Span;
  readonly context: Expr | null;
  readonly body: Block;
}

export interface CollectionLiteralExpr {
  readonly kind: "CollectionLiteralExpr";
  readonly span: Span;
  readonly collectionKind: "list" | "set" | "map";
  readonly elements: ReadonlyArray<Expr | MapEntry>;
}

export interface MapEntry {
  readonly kind: "MapEntry";
  readonly span: Span;
  readonly key: Expr;
  readonly value: Expr;
}

export interface ObjectExpr {
  readonly kind: "ObjectExpr";
  readonly span: Span;
  readonly superTypes: ReadonlyArray<SuperTypeEntry>;
  readonly body: ClassBody;
}

export interface ParenExpr {
  readonly kind: "ParenExpr";
  readonly span: Span;
  readonly expr: Expr;
}

export interface BreakExpr {
  readonly kind: "BreakExpr";
  readonly span: Span;
  readonly label: string | null;
}

export interface ContinueExpr {
  readonly kind: "ContinueExpr";
  readonly span: Span;
  readonly label: string | null;
}

export interface ReturnExpr {
  readonly kind: "ReturnExpr";
  readonly span: Span;
  readonly label: string | null;
  readonly value: Expr | null;
}

// ---------------------------------------------------------------------------
// Resolved type representation (produced by type checker)
// ---------------------------------------------------------------------------

export type ResolvedType =
  | PrimitiveType
  | ClassType
  | NullableResolvedType
  | FunctionResolvedType
  | TypeParamType
  | UnionType
  | ErrorType
  | NeverType
  | UnknownType;

export type PrimitiveKind =
  | "Int" | "Long" | "Float" | "Double"
  | "Boolean" | "String" | "Char"
  | "Byte" | "Short" | "Unit" | "Any";

export interface PrimitiveType {
  readonly kind: "PrimitiveType";
  readonly primitive: PrimitiveKind;
}

export interface ClassType {
  readonly kind: "ClassType";
  readonly name: string;
  readonly typeArgs: ReadonlyArray<ResolvedType>;
}

export interface NullableResolvedType {
  readonly kind: "NullableResolvedType";
  readonly base: ResolvedType;
}

export interface FunctionResolvedType {
  readonly kind: "FunctionResolvedType";
  readonly params: ReadonlyArray<ResolvedType>;
  readonly returnType: ResolvedType;
}

export interface TypeParamType {
  readonly kind: "TypeParamType";
  readonly name: string;
}

export interface UnionType {
  readonly kind: "UnionType";
  readonly members: ReadonlyArray<ResolvedType>;
}

export interface ErrorType {
  readonly kind: "ErrorType";
  readonly message: string;
}

export interface NeverType {
  readonly kind: "NeverType";
}

export interface UnknownType {
  readonly kind: "UnknownType";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function spanFrom(start: Span, end: Span): Span {
  return {
    file: start.file,
    startLine: start.startLine,
    startCol: start.startCol,
    endLine: end.endLine,
    endCol: end.endCol,
    startOffset: start.startOffset,
    endOffset: end.endOffset,
  };
}

export function isExpr(node: Stmt | Expr): node is Expr {
  const exprKinds = new Set([
    "IntLiteralExpr", "LongLiteralExpr", "FloatLiteralExpr", "DoubleLiteralExpr",
    "BooleanLiteralExpr", "NullLiteralExpr", "StringLiteralExpr", "StringTemplateExpr",
    "NameExpr", "ThisExpr", "SuperExpr", "CallExpr", "IndexExpr", "MemberExpr",
    "SafeMemberExpr", "UnaryExpr", "BinaryExpr", "AssignExpr", "CompoundAssignExpr",
    "IncrDecrExpr", "LambdaExpr", "IfExpr", "WhenExpr", "TryCatchExpr",
    "TypeCheckExpr", "TypeCastExpr", "SafeCastExpr", "NotNullExpr", "ElvisExpr",
    "RangeExpr", "LaunchExpr", "AsyncExpr", "CollectionLiteralExpr", "ObjectExpr",
    "ParenExpr", "BreakExpr", "ContinueExpr", "ReturnExpr",
  ]);
  return exprKinds.has((node as { kind: string }).kind);
}
