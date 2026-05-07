// ─────────────────────────────────────────────────────────────────────────────
// Jalvin Parser — recursive-descent, produces a fully-typed AST
//
// Grammar overview (informal EBNF):
//   program        = packageDecl? importDecl* topLevelDecl*
//   topLevelDecl   = funDecl | componentDecl | classDecl | dataClassDecl
//                  | sealedClassDecl | interfaceDecl | objectDecl
//                  | typeAliasDecl | propertyDecl | extensionFunDecl
//   ...
// ─────────────────────────────────────────────────────────────────────────────

import * as AST from "./ast.js";
import { TokenKind, Lexer, type Token } from "./lexer.js";
import {
  DiagnosticBag,
  E_UNEXPECTED_TOKEN,
  E_EXPECTED_TOKEN,
  E_EXPECTED_EXPRESSION,
  E_EXPECTED_TYPE,
  E_DUPLICATE_MODIFIER,
  E_INCOMPATIBLE_MODIFIERS,
} from "./diagnostics.js";

// ---------------------------------------------------------------------------
// Parser class
// ---------------------------------------------------------------------------

export class Parser {
  private pos = 0;
  private readonly tokens: Token[];
  private readonly diag: DiagnosticBag;
  private readonly file: string;
  private readonly source: string;
  private depth = 0;


  constructor(tokens: Token[], file: string, diag: DiagnosticBag, source = "") {
    this.tokens = tokens;
    this.diag = diag;
    this.file = file;
    this.source = source;
  }

  // ── Entry point ────────────────────────────────────────────────────────────

  parseProgram(): AST.Program {
    const start = this.current().span;

    let packageDecl: AST.PackageDecl | null = null;
    if (this.check(TokenKind.KwPackage)) {
      packageDecl = this.parsePackageDecl();
    }

    const imports: AST.ImportDecl[] = [];
    while (this.check(TokenKind.KwImport)) {
      imports.push(this.parseImportDecl());
    }

    const declarations: AST.TopLevelDecl[] = [];
    while (!this.check(TokenKind.EOF)) {
      // skip stray semicolons
      while (this.check(TokenKind.Semicolon)) this.advance();
      if (this.check(TokenKind.EOF)) break;
      const decl = this.parseTopLevelDecl();
      if (decl) declarations.push(decl);
    }

    const end = this.current().span;
    return {
      kind: "Program",
      span: AST.spanFrom(start, end),
      packageDecl,
      imports,
      declarations,
    };
  }

  // ── Package & imports ──────────────────────────────────────────────────────

  private parsePackageDecl(): AST.PackageDecl {
    const start = this.expect(TokenKind.KwPackage).span;
    const path = this.parseDottedName();
    this.eatSemicolon();
    return { kind: "PackageDecl", span: start, path };
  }

  private parseImportDecl(): AST.ImportDecl {
    const start = this.expect(TokenKind.KwImport).span;

    const path: string[] = [];
    if (this.check(TokenKind.At)) {
      this.advance();
      path.push("@" + this.expectIdentOrKeyword());
    } else {
      path.push(this.expectIdentOrKeyword());
    }

    while (this.check(TokenKind.Dot) || this.check(TokenKind.Slash)) {
      this.advance();
      if (this.check(TokenKind.Star)) {
        this.advance();
        this.eatSemicolon();
        return { kind: "ImportDecl", span: start, path, star: true, alias: null };
      }
      path.push(this.expectIdentOrKeyword());
    }

    let alias: string | null = null;
    if (this.check(TokenKind.KwAs)) {
      this.advance();
      alias = this.expectIdentifier();
    }

    this.eatSemicolon();
    return { kind: "ImportDecl", span: start, path, star: false, alias };
  }

  // ── Top-level declarations ─────────────────────────────────────────────────

  private parseTopLevelDecl(): AST.TopLevelDecl | null {
    // Collect modifiers and annotations
    const mods = this.parseModifiers();

    if (this.check(TokenKind.KwFun)) {
      return this.parseFunOrExtension(mods);
    }
    if (this.check(TokenKind.KwComponent)) {
      return this.parseComponentDecl(mods);
    }
    if (this.check(TokenKind.KwData) && this.checkNext(TokenKind.KwClass)) {
      return this.parseDataClassDecl(mods);
    }
    if (this.check(TokenKind.KwSealed) && this.checkNext(TokenKind.KwClass)) {
      return this.parseSealedClassDecl(mods);
    }
    if (this.check(TokenKind.KwEnum) && this.checkNext(TokenKind.KwClass)) {
      return this.parseEnumClassDecl(mods);
    }
    if (this.check(TokenKind.KwClass)) {
      return this.parseClassDecl(mods);
    }
    if (this.check(TokenKind.KwInterface)) {
      return this.parseInterfaceDecl(mods);
    }
    if (this.check(TokenKind.KwObject)) {
      return this.parseObjectDecl(mods);
    }
    if (this.check(TokenKind.KwTypealias)) {
      return this.parseTypeAliasDecl(mods);
    }
    if (this.check(TokenKind.KwVal) || this.check(TokenKind.KwVar)) {
      if (this.checkNext(TokenKind.LParen)) {
        return this.parseDestructuringDecl(mods);
      }
      return this.parsePropertyDeclTopLevel(mods);
    }

    const tok = this.current();
    this.diag.error(tok.span, E_UNEXPECTED_TOKEN, `Unexpected token '${tok.text}' at top level`);
    this.advance();
    return null;
  }

  // ── Modifiers ──────────────────────────────────────────────────────────────

  private parseModifiers(): AST.Modifiers {
    let visibility: AST.Visibility = "public";
    const modifiers: AST.Modifier[] = [];
    const annotations: AST.Annotation[] = [];
    const seen = new Set<string>();

    // Collect leading annotations: @Name or @Name("...") or @Name(key=val,...)
    while (this.check(TokenKind.At)) {
      const atSpan = this.current().span;
      this.advance(); // consume @
      const name = this.expectIdentOrKeyword();
      let args: string | null = null;
      if (this.check(TokenKind.LParen)) {
        this.advance(); // consume (
        // Collect everything until matching )
        const parts: string[] = [];
        let depth = 1;
        while (!this.check(TokenKind.EOF) && depth > 0) {
          const tok = this.current();
          if (tok.kind === TokenKind.LParen) { depth++; parts.push(tok.text); this.advance(); }
          else if (tok.kind === TokenKind.RParen) { depth--; if (depth > 0) parts.push(tok.text); this.advance(); }
          else { parts.push(tok.text); this.advance(); }
        }
        args = parts.join("");
      }
      annotations.push({ span: AST.spanFrom(atSpan, this.prevSpan()), name, args });
      this.eatSemicolon();
    }

    const addMod = (m: AST.Modifier | AST.Visibility) => {
      if (seen.has(m)) {
        this.diag.error(this.current().span, E_DUPLICATE_MODIFIER, `Duplicate modifier '${m}'`);
        return;
      }
      seen.add(m);
      if (m === "public" || m === "private" || m === "protected" || m === "internal") {
        if (seen.has("public") || seen.has("private") || seen.has("protected") || seen.has("internal")) {
          if (seen.size > 1) {
            this.diag.error(this.current().span, E_INCOMPATIBLE_MODIFIERS, "Multiple visibility modifiers");
          }
        }
        visibility = m as AST.Visibility;
      } else {
        modifiers.push(m as AST.Modifier);
      }
    };

    loop: while (true) {
      switch (this.current().kind) {
        case TokenKind.KwPublic:    addMod("public");    this.advance(); break;
        case TokenKind.KwPrivate:   addMod("private");   this.advance(); break;
        case TokenKind.KwProtected: addMod("protected"); this.advance(); break;
        case TokenKind.KwInternal:  addMod("internal");  this.advance(); break;
        case TokenKind.KwOpen:      addMod("open");      this.advance(); break;
        case TokenKind.KwAbstract:  addMod("abstract");  this.advance(); break;
        case TokenKind.KwOverride:  addMod("override");  this.advance(); break;
        case TokenKind.KwInline:    addMod("inline");    this.advance(); break;
        case TokenKind.KwOperator:  addMod("operator");  this.advance(); break;
        case TokenKind.KwInfix:     addMod("infix");     this.advance(); break;
        case TokenKind.KwExternal:  addMod("external");  this.advance(); break;
        case TokenKind.KwSuspend:   addMod("suspend");   this.advance(); break;
        case TokenKind.KwTailrec:   addMod("tailrec");   this.advance(); break;
        case TokenKind.KwReified:   addMod("reified");   this.advance(); break;
        case TokenKind.KwConst:     addMod("const");     this.advance(); break;
        case TokenKind.KwLateinit:  addMod("lateinit");  this.advance(); break;
        case TokenKind.KwFinal:     addMod("final");     this.advance(); break;
        default: break loop;
      }
    }

    return { visibility, modifiers, annotations };
  }

  // ── function / extension function ─────────────────────────────────────────

  private parseFunOrExtension(mods: AST.Modifiers): AST.FunDecl | AST.ExtensionFunDecl {
    const start = this.expect(TokenKind.KwFun).span;
    const typeParams = this.parseTypeParams();

    // Could be `fun Type.name(...) { }` — extension function
    // We parse the first "name" and check for a dot after optional type args
    let receiver: AST.TypeRef | null = null;

    // Peek: if there is a dotted-type followed by `.` before `(`, it's an extension
    const savedPos = this.pos;
    const possibleReceiver = this.tryParseTypeRef();
    if (possibleReceiver && this.check(TokenKind.Dot)) {
      // Pattern: `fun GenericType<T>.name(...)` — receiver fully parsed, `.name` follows
      receiver = possibleReceiver;
      this.advance(); // consume '.'
    } else if (
      possibleReceiver?.kind === "SimpleTypeRef" &&
      possibleReceiver.name.length >= 2 &&
      (this.check(TokenKind.LParen) || this.check(TokenKind.Lt))
    ) {
      // Pattern: `fun Cart.subtotal()` — tryParseTypeRef greedily consumed "Cart.subtotal"
      // as a qualified type name. Split: last component is function name, rest is receiver.
      const parts = possibleReceiver.name;
      const extReceiver: AST.SimpleTypeRef = { kind: "SimpleTypeRef", span: possibleReceiver.span, name: parts.slice(0, -1) };
      const extName = parts[parts.length - 1]!;
      const params = this.parseParamList();
      let returnType: AST.TypeRef | null = null;
      if (this.check(TokenKind.Colon)) { this.advance(); returnType = this.parseTypeRef(); }
      let body: AST.Block | AST.Expr | null = null;
      if (this.check(TokenKind.Eq)) { this.advance(); body = this.parseExpr(); this.eatSemicolon(); }
      else if (this.check(TokenKind.LBrace)) { body = this.parseBlock(); }
      else { this.eatSemicolon(); }
      const span = AST.spanFrom(start, this.prevSpan());
      if (!body) { body = { kind: "Block", span, statements: [] }; }
      return { kind: "ExtensionFunDecl", span, modifiers: mods, name: extName, typeParams, receiver: extReceiver, params, returnType, body: body as AST.Block };
    } else {
      this.pos = savedPos; // backtrack
    }

    const name = this.expectIdentifier();
    const params = this.parseParamList();
    let returnType: AST.TypeRef | null = null;
    if (this.check(TokenKind.Colon)) {
      this.advance();
      returnType = this.parseTypeRef();
    }

    let body: AST.Block | AST.Expr | null = null;
    if (this.check(TokenKind.Eq)) {
      this.advance();
      body = this.parseExpr();
      this.eatSemicolon();
    } else if (this.check(TokenKind.LBrace)) {
      body = this.parseBlock();
    } else {
      this.eatSemicolon();
    }

    const span = AST.spanFrom(start, this.prevSpan());

    if (receiver) {
      if (!body) {
        this.diag.error(span, E_EXPECTED_TOKEN, "Extension function must have a body");
        body = { kind: "Block", span, statements: [] };
      }
      return {
        kind: "ExtensionFunDecl",
        span,
        modifiers: mods,
        name,
        typeParams,
        receiver,
        params,
        returnType,
        body,
      };
    }

    return {
      kind: "FunDecl",
      span,
      modifiers: mods,
      name,
      typeParams,
      receiver: null,
      params,
      returnType,
      body,
    };
  }

  private parseComponentDecl(mods: AST.Modifiers): AST.ComponentDecl {
    const start = this.expect(TokenKind.KwComponent).span;
    this.expect(TokenKind.KwFun);
    const name = this.expectIdentifier();
    const params = this.parseParamList();
    const body = this.parseBlock();
    return {
      kind: "ComponentDecl",
      span: AST.spanFrom(start, body.span),
      modifiers: mods,
      name,
      params,
      body,
    };
  }

  // ── Class declarations ─────────────────────────────────────────────────────

  private parseClassDecl(mods: AST.Modifiers): AST.ClassDecl {
    const start = this.expect(TokenKind.KwClass).span;
    const name = this.expectIdentifier();
    const typeParams = this.parseTypeParams();
    const primaryConstructor = this.parsePrimaryConstructorOpt();
    const superTypes = this.parseSuperTypes();
    const body = this.check(TokenKind.LBrace) ? this.parseClassBody() : null;
    this.eatSemicolon();
    return {
      kind: "ClassDecl",
      span: AST.spanFrom(start, this.prevSpan()),
      modifiers: mods,
      name,
      typeParams,
      primaryConstructor,
      superTypes,
      body,
    };
  }

  private parseDataClassDecl(mods: AST.Modifiers): AST.DataClassDecl {
    const start = this.expect(TokenKind.KwData).span;
    this.expect(TokenKind.KwClass);
    const name = this.expectIdentifier();
    const typeParams = this.parseTypeParams();
    const primaryConstructor = this.parsePrimaryConstructor();
    const superTypes = this.parseSuperTypes();
    const body = this.check(TokenKind.LBrace) ? this.parseClassBody() : null;
    this.eatSemicolon();
    return {
      kind: "DataClassDecl",
      span: AST.spanFrom(start, this.prevSpan()),
      modifiers: mods,
      name,
      typeParams,
      primaryConstructor,
      superTypes,
      body,
    };
  }

  private parseSealedClassDecl(mods: AST.Modifiers): AST.SealedClassDecl {
    const start = this.expect(TokenKind.KwSealed).span;
    this.expect(TokenKind.KwClass);
    const name = this.expectIdentifier();
    const typeParams = this.parseTypeParams();
    const primaryConstructor = this.parsePrimaryConstructorOpt();
    const superTypes = this.parseSuperTypes();
    const body = this.check(TokenKind.LBrace) ? this.parseClassBody() : null;
    this.eatSemicolon();
    return {
      kind: "SealedClassDecl",
      span: AST.spanFrom(start, this.prevSpan()),
      modifiers: mods,
      name,
      typeParams,
      primaryConstructor,
      superTypes,
      body,
    };
  }

  private parseInterfaceDecl(mods: AST.Modifiers): AST.InterfaceDecl {
    const start = this.expect(TokenKind.KwInterface).span;
    const name = this.expectIdentifier();
    const typeParams = this.parseTypeParams();
    const superTypes = this.parseSuperTypes();
    const body = this.check(TokenKind.LBrace) ? this.parseClassBody() : null;
    this.eatSemicolon();
    return {
      kind: "InterfaceDecl",
      span: AST.spanFrom(start, this.prevSpan()),
      modifiers: mods,
      name,
      typeParams,
      superTypes,
      body,
    };
  }

  private parseObjectDecl(mods: AST.Modifiers): AST.ObjectDecl {
    const start = this.expect(TokenKind.KwObject).span;
    let name: string | null = null;
    if (this.check(TokenKind.Identifier)) {
      name = this.advance().text;
    }
    const superTypes = this.parseSuperTypes();
    // Body is optional: `object Foo : Base()` is valid without `{ }`.
    const body = this.check(TokenKind.LBrace)
      ? this.parseClassBody()
      : { span: this.prevSpan(), members: [] as AST.ClassMember[] };
    this.eatSemicolon();
    return {
      kind: "ObjectDecl",
      span: AST.spanFrom(start, body.span),
      modifiers: mods,
      name,
      superTypes,
      body,
    };
  }

  private parseTypeAliasDecl(mods: AST.Modifiers): AST.TypeAliasDecl {
    const start = this.expect(TokenKind.KwTypealias).span;
    const name = this.expectIdentifier();
    const typeParams = this.parseTypeParams();
    this.expect(TokenKind.Eq);
    const type = this.parseTypeRef();
    this.eatSemicolon();
    return {
      kind: "TypeAliasDecl",
      span: AST.spanFrom(start, this.prevSpan()),
      modifiers: mods,
      name,
      typeParams,
      type,
    };
  }

  // ── enum class ────────────────────────────────────────────────────────────

  private parseEnumClassDecl(mods: AST.Modifiers): AST.EnumClassDecl {
    const start = this.expect(TokenKind.KwEnum).span;
    this.expect(TokenKind.KwClass);
    const name = this.expectIdentifier();
    const typeParams = this.parseTypeParams();
    const primaryConstructor = this.parsePrimaryConstructorOpt();
    const superTypes = this.parseSuperTypes();

    const entries: AST.EnumEntry[] = [];
    let body: AST.ClassBody | null = null;

    if (this.check(TokenKind.LBrace)) {
      const bodyStart = this.expect(TokenKind.LBrace).span;
      const members: AST.ClassMember[] = [];

      // Parse enum entries (identifiers at the start of the block, before `;`)
      while (!this.check(TokenKind.RBrace) && !this.check(TokenKind.EOF)) {
        while (this.check(TokenKind.Semicolon)) {
          this.advance();
          // A lone `;` separates entries from the member body
          break;
        }
        if (this.check(TokenKind.RBrace)) break;

        // If we see an identifier and it looks like an enum entry (not a declaration keyword)
        if (
          this.check(TokenKind.Identifier) &&
          !this.isDeclarationKeyword(this.current().kind)
        ) {
          const entrySpan = this.current().span;
          const entryName = this.advance().text;
          let args: AST.CallArg[] = [];
          if (this.check(TokenKind.LParen)) {
            args = this.parseCallArgs();
          }
          let entryBody: AST.ClassBody | null = null;
          if (this.check(TokenKind.LBrace)) {
            entryBody = this.parseClassBody();
          }
          entries.push({ span: AST.spanFrom(entrySpan, this.prevSpan()), name: entryName, args, body: entryBody });
          if (this.check(TokenKind.Comma)) this.advance();
        } else {
          // Non-entry member (method, property, etc.)
          const member = this.parseClassMember();
          if (member) members.push(member);
        }
      }

      const bodyEnd = this.expect(TokenKind.RBrace).span;
      if (members.length > 0) {
        body = { span: AST.spanFrom(bodyStart, bodyEnd), members };
      }
    }

    this.eatSemicolon();
    return {
      kind: "EnumClassDecl",
      span: AST.spanFrom(start, this.prevSpan()),
      modifiers: mods,
      name,
      typeParams,
      primaryConstructor,
      superTypes,
      entries,
      body,
    };
  }

  // ── Destructuring declaration — val (a, b) = expr ─────────────────────────

  private parseDestructuringDecl(mods: AST.Modifiers): AST.DestructuringDecl {
    const start = this.current().span;
    const mutable = this.check(TokenKind.KwVar);
    this.advance(); // val | var

    this.expect(TokenKind.LParen);
    const names: Array<string | null> = [];
    const types: Array<AST.TypeRef | null> = [];

    while (!this.check(TokenKind.RParen) && !this.check(TokenKind.EOF)) {
      if (this.check(TokenKind.Underscore)) {
        this.advance();
        names.push(null);
        types.push(null);
      } else {
        names.push(this.expectIdentifier());
        if (this.check(TokenKind.Colon)) {
          this.advance();
          types.push(this.parseTypeRef());
        } else {
          types.push(null);
        }
      }
      if (this.check(TokenKind.Comma)) this.advance();
    }
    this.expect(TokenKind.RParen);
    this.expect(TokenKind.Eq);
    const initializer = this.parseExpr();
    this.eatSemicolon();

    return {
      kind: "DestructuringDecl",
      span: AST.spanFrom(start, this.prevSpan()),
      modifiers: mods,
      mutable,
      names,
      types,
      initializer,
    };
  }

  private isDeclarationKeyword(kind: TokenKind): boolean {
    return (
      kind === TokenKind.KwFun ||
      kind === TokenKind.KwVal ||
      kind === TokenKind.KwVar ||
      kind === TokenKind.KwClass ||
      kind === TokenKind.KwInterface ||
      kind === TokenKind.KwObject ||
      kind === TokenKind.KwData ||
      kind === TokenKind.KwSealed ||
      kind === TokenKind.KwEnum ||
      kind === TokenKind.KwOverride ||
      kind === TokenKind.KwAbstract ||
      kind === TokenKind.KwOpen ||
      kind === TokenKind.KwPrivate ||
      kind === TokenKind.KwProtected ||
      kind === TokenKind.KwInternal ||
      kind === TokenKind.KwPublic ||
      kind === TokenKind.KwSuspend ||
      kind === TokenKind.KwInline ||
      kind === TokenKind.KwLateinit
    );
  }

  private parsePropertyDeclTopLevel(mods: AST.Modifiers): AST.PropertyDecl {
    return this.parsePropertyDecl(mods);
  }

  // ── Class body ─────────────────────────────────────────────────────────────

  private parseClassBody(): AST.ClassBody {
    const start = this.expect(TokenKind.LBrace).span;
    const members: AST.ClassMember[] = [];

    while (!this.check(TokenKind.RBrace) && !this.check(TokenKind.EOF)) {
      while (this.check(TokenKind.Semicolon)) this.advance();
      if (this.check(TokenKind.RBrace)) break;

      const m = this.parseClassMember();
      if (m) members.push(m);
    }

    const end = this.expect(TokenKind.RBrace).span;
    return { span: AST.spanFrom(start, end), members };
  }

  private parseClassMember(): AST.ClassMember | null {
    if (this.check(TokenKind.KwInit)) {
      return this.parseInitBlock();
    }
    if (this.check(TokenKind.KwConstructor)) {
      return this.parseSecondaryConstructor();
    }
    if (this.check(TokenKind.KwCompanion)) {
      return this.parseCompanionObject();
    }

    const mods = this.parseModifiers();

    if (this.check(TokenKind.KwFun)) return this.parseFunOrExtension(mods);
    if (this.check(TokenKind.KwComponent)) return this.parseComponentDecl(mods);
    if (this.check(TokenKind.KwVal) || this.check(TokenKind.KwVar)) {
      return this.parsePropertyDecl(mods);
    }
    if (this.check(TokenKind.KwData) && this.checkNext(TokenKind.KwClass)) {
      return this.parseDataClassDecl(mods);
    }
    if (this.check(TokenKind.KwSealed) && this.checkNext(TokenKind.KwClass)) {
      return this.parseSealedClassDecl(mods);
    }
    if (this.check(TokenKind.KwEnum) && this.checkNext(TokenKind.KwClass)) {
      return this.parseEnumClassDecl(mods);
    }
    if (this.check(TokenKind.KwClass)) return this.parseClassDecl(mods);
    if (this.check(TokenKind.KwObject)) return this.parseObjectDecl(mods);

    const tok = this.current();
    this.diag.error(tok.span, E_UNEXPECTED_TOKEN, `Unexpected token '${tok.text}' in class body`);
    this.advance();
    return null;
  }

  private parseInitBlock(): AST.InitBlock {
    const start = this.expect(TokenKind.KwInit).span;
    const body = this.parseBlock();
    return { kind: "InitBlock", span: AST.spanFrom(start, body.span), body };
  }

  private parseSecondaryConstructor(): AST.SecondaryConstructor {
    const start = this.expect(TokenKind.KwConstructor).span;
    const mods = AST.DEFAULT_MODIFIERS;
    const params = this.parseParamList();

    let delegation: "this" | "super" | null = null;
    const delegateArgs: AST.CallArg[] = [];

    if (this.check(TokenKind.Colon)) {
      this.advance();
      if (this.check(TokenKind.KwThis)) {
        delegation = "this";
        this.advance();
      } else if (this.check(TokenKind.KwSuper)) {
        delegation = "super";
        this.advance();
      }
      delegateArgs.push(...this.parseCallArgs());
    }

    const body = this.parseBlock();
    return {
      kind: "SecondaryConstructor",
      span: AST.spanFrom(start, body.span),
      modifiers: mods,
      params,
      delegation,
      delegateArgs,
      body,
    };
  }

  private parseCompanionObject(): AST.CompanionObject {
    const start = this.expect(TokenKind.KwCompanion).span;
    this.expect(TokenKind.KwObject);
    let name: string | null = null;
    if (this.check(TokenKind.Identifier)) {
      name = this.advance().text;
    }
    const superTypes = this.parseSuperTypes();
    const body = this.parseClassBody();
    return {
      kind: "CompanionObject",
      span: AST.spanFrom(start, body.span),
      name,
      superTypes,
      body,
    };
  }

  // ── Property declaration ───────────────────────────────────────────────────

  private parsePropertyDecl(mods: AST.Modifiers): AST.PropertyDecl {
    const start = this.current().span;
    const mutable = this.check(TokenKind.KwVar);
    this.advance(); // val | var

    const typeParams = this.parseTypeParams();
    const name = this.expectIdentifier();

    let type: AST.TypeRef | null = null;
    if (this.check(TokenKind.Colon)) {
      this.advance();
      type = this.parseTypeRef();
    }

    let initializer: AST.Expr | null = null;
    let delegate: AST.Expr | null = null;

    if (this.check(TokenKind.Eq)) {
      this.advance();
      initializer = this.parseExpr();
    } else if (this.check(TokenKind.KwBy)) {
      this.advance();
      delegate = this.parseExpr();
    }

    let getter: AST.PropertyAccessor | null = null;
    let setter: AST.PropertyAccessor | null = null;

    // Parse get/set accessors
    while (true) {
      if (this.checkIdent("get")) {
        getter = this.parsePropertyAccessor();
      } else if (this.checkIdent("set")) {
        setter = this.parsePropertyAccessor();
      } else {
        break;
      }
    }

    this.eatSemicolon();

    return {
      kind: "PropertyDecl",
      span: AST.spanFrom(start, this.prevSpan()),
      modifiers: mods,
      mutable,
      name,
      typeParams,
      type,
      initializer,
      delegate,
      getter,
      setter,
    };
  }

  private parsePropertyAccessor(): AST.PropertyAccessor {
    const start = this.advance().span; // consume 'get' | 'set'
    const params: AST.Param[] = [];

    if (this.check(TokenKind.LParen)) {
      this.advance();
      if (!this.check(TokenKind.RParen)) {
        params.push(this.parseParam());
      }
      this.expect(TokenKind.RParen);
    }

    let body: AST.Block | AST.Expr | null = null;
    if (this.check(TokenKind.Eq)) {
      this.advance();
      body = this.parseExpr();
      this.eatSemicolon();
    } else if (this.check(TokenKind.LBrace)) {
      body = this.parseBlock();
    } else {
      this.eatSemicolon();
    }

    return {
      span: AST.spanFrom(start, this.prevSpan()),
      modifiers: AST.DEFAULT_MODIFIERS,
      params,
      body,
    };
  }

  // ── Constructor / params ───────────────────────────────────────────────────

  private parsePrimaryConstructor(): AST.PrimaryConstructor {
    const start = this.current().span;
    let mods = AST.DEFAULT_MODIFIERS;
    if (this.check(TokenKind.KwConstructor)) {
      this.advance();
    }
    const params = this.parseParamList();
    return { span: AST.spanFrom(start, this.prevSpan()), modifiers: mods, params };
  }

  private parsePrimaryConstructorOpt(): AST.PrimaryConstructor | null {
    if (this.check(TokenKind.LParen) || this.check(TokenKind.KwConstructor)) {
      return this.parsePrimaryConstructor();
    }
    return null;
  }

  private parseParamList(): AST.Param[] {
    this.expect(TokenKind.LParen);
    const params: AST.Param[] = [];
    while (!this.check(TokenKind.RParen) && !this.check(TokenKind.EOF)) {
      // Skip ASI-inserted semicolons between params
      while (this.check(TokenKind.Semicolon)) this.advance();
      if (this.check(TokenKind.RParen) || this.check(TokenKind.EOF)) break;
      const prevPos = this.pos;
      params.push(this.parseParam());
      // Safety: if parseParam made no progress, break to avoid infinite loop
      if (this.pos === prevPos) break;
      // Skip trailing semicolons/ASI before the comma or close paren
      while (this.check(TokenKind.Semicolon)) this.advance();
      if (!this.check(TokenKind.RParen)) this.expect(TokenKind.Comma);
    }
    this.expect(TokenKind.RParen);
    return params;
  }

  private parseParam(): AST.Param {
    const start = this.current().span;
    let vararg = false;
    let propertyKind: "val" | "var" | null = null;

    if (this.checkIdent("vararg")) { vararg = true; this.advance(); }
    if (this.check(TokenKind.KwVal)) { propertyKind = "val"; this.advance(); }
    else if (this.check(TokenKind.KwVar)) { propertyKind = "var"; this.advance(); }

    const name = this.expectIdentOrKeyword();
    this.expect(TokenKind.Colon);
    const type = this.parseTypeRef();

    let defaultValue: AST.Expr | null = null;
    if (this.check(TokenKind.Eq)) {
      this.advance();
      defaultValue = this.parseExpr();
    }

    return {
      span: AST.spanFrom(start, this.prevSpan()),
      propertyKind,
      name,
      type,
      defaultValue,
      vararg,
    };
  }

  // ── Super types ────────────────────────────────────────────────────────────

  private parseSuperTypes(): AST.SuperTypeEntry[] {
    const entries: AST.SuperTypeEntry[] = [];
    if (!this.check(TokenKind.Colon)) return entries;
    this.advance();

    entries.push(this.parseSuperTypeEntry());
    while (this.check(TokenKind.Comma)) {
      this.advance();
      entries.push(this.parseSuperTypeEntry());
    }
    return entries;
  }

  private parseSuperTypeEntry(): AST.SuperTypeEntry {
    const start = this.current().span;
    const type = this.parseTypeRef();
    let delegateArgs: AST.CallArg[] | null = null;
    if (this.check(TokenKind.LParen)) {
      delegateArgs = this.parseCallArgs();
    }
    return { span: AST.spanFrom(start, this.prevSpan()), type, delegateArgs };
  }

  // ── Type references ────────────────────────────────────────────────────────

  private parseTypeRef(): AST.TypeRef {
    const t = this.parseTypeRefInner();
    if (this.check(TokenKind.Question)) {
      const span = this.advance().span;
      return { kind: "NullableTypeRef", span: AST.spanFrom(t.span, span), base: t };
    }
    return t;
  }

  private tryParseTypeRef(): AST.TypeRef | null {
    const saved = this.pos;
    try {
      const t = this.parseTypeRef();
      return t;
    } catch {
      this.pos = saved;
      return null;
    }
  }

  private parseTypeRefInner(): AST.TypeRef {
    const start = this.current().span;

    // Function type: (A, B) -> C  or  Receiver.(A) -> B
    // Use lookahead to confirm `(...) ->` before speculatively parsing.
    if (this.check(TokenKind.LParen) && this.looksLikeFunctionType()) {
      const saved = this.pos;
      try {
        return this.parseFunctionType(null);
      } catch {
        this.pos = saved;
        // fall through to simple type
      }
    }

    // Parenthesized type: (T) — supports nullable function types like (() -> Unit)?
    if (this.check(TokenKind.LParen)) {
      const saved = this.pos;
      try {
        this.advance(); // consume (
        const inner = this.parseTypeRef();
        if (this.check(TokenKind.RParen)) {
          this.advance(); // consume )
          return inner;
        }
        this.pos = saved;
      } catch {
        this.pos = saved;
      }
    }

    // Simple or generic type
    const name = [this.expectIdentOrKeyword()];
    while (this.check(TokenKind.Dot) && !this.check(TokenKind.DotDot)) {
      this.advance();
      name.push(this.expectIdentOrKeyword());
    }

    const simple: AST.SimpleTypeRef = {
      kind: "SimpleTypeRef",
      span: AST.spanFrom(start, this.prevSpan()),
      name,
    };

    if (this.check(TokenKind.Lt)) {
      const args = this.parseTypeArgs();
      return {
        kind: "GenericTypeRef",
        span: AST.spanFrom(start, this.prevSpan()),
        base: simple,
        args,
      };
    }

    return simple;
  }

  private parseFunctionType(receiver: AST.TypeRef | null): AST.FunctionTypeRef {
    const start = this.current().span;
    this.expect(TokenKind.LParen);
    const params: AST.TypeRef[] = [];
    while (!this.check(TokenKind.RParen) && !this.check(TokenKind.EOF)) {
      // Named param: `name: Type` — we just discard the name
      if (this.check(TokenKind.Identifier) && this.checkNext(TokenKind.Colon)) {
        this.advance(); this.advance();
      }
      const prevPos = this.pos;
      params.push(this.parseTypeRef());
      // Safety: if parseTypeRef didn't advance, bail to prevent infinite loop
      if (this.pos === prevPos) break;
      if (!this.check(TokenKind.RParen)) this.expect(TokenKind.Comma);
    }
    this.expect(TokenKind.RParen);
    this.expect(TokenKind.Arrow);
    const returnType = this.parseTypeRef();
    return {
      kind: "FunctionTypeRef",
      span: AST.spanFrom(start, this.prevSpan()),
      receiver,
      params,
      returnType,
    };
  }

  /** Lookahead: scan past matching parens to see if followed by `->` */
  private looksLikeFunctionType(): boolean {
    let i = this.pos + 1; // skip the opening `(`
    let depth = 1;
    while (i < this.tokens.length && depth > 0) {
      const k = this.tokens[i]!.kind;
      if (k === TokenKind.LParen) depth++;
      else if (k === TokenKind.RParen) depth--;
      else if (k === TokenKind.EOF) return false;
      i++;
    }
    // After closing `)`, the next token must be `->`
    return this.tokens[i]?.kind === TokenKind.Arrow;
  }

  private parseTypeArgs(): AST.TypeArg[] {
    this.expect(TokenKind.Lt);
    const args: AST.TypeArg[] = [];
    while (!this.check(TokenKind.Gt) && !this.check(TokenKind.EOF)) {
      const prevPos = this.pos;
      const span = this.current().span;
      if (this.check(TokenKind.Star)) {
        this.advance();
        args.push({ span, variance: null, star: true, type: null });
      } else {
        let variance: "in" | "out" | null = null;
        if (this.check(TokenKind.KwIn)) { variance = "in"; this.advance(); }
        else if (this.checkIdent("out")) { variance = "out"; this.advance(); }
        const t = this.parseTypeRef();
        args.push({ span: AST.spanFrom(span, t.span), variance, star: false, type: t });
      }
      // Safety: if no progress was made, break to prevent infinite loop
      if (this.pos === prevPos) break;
      if (!this.check(TokenKind.Gt)) this.expect(TokenKind.Comma);
    }
    this.expect(TokenKind.Gt);
    return args;
  }

  private parseTypeParams(): AST.TypeParam[] {
    if (!this.check(TokenKind.Lt)) return [];
    this.advance();
    const params: AST.TypeParam[] = [];
    while (!this.check(TokenKind.Gt) && !this.check(TokenKind.EOF)) {
      const span = this.current().span;
      let reified = false;
      let variance: "in" | "out" | null = null;
      if (this.checkIdent("reified")) { reified = true; this.advance(); }
      if (this.check(TokenKind.KwIn)) { variance = "in"; this.advance(); }
      else if (this.checkIdent("out")) { variance = "out"; this.advance(); }
      const name = this.expectIdentifier();
      let upperBound: AST.TypeRef | null = null;
      if (this.check(TokenKind.Colon)) {
        this.advance();
        upperBound = this.parseTypeRef();
      }
      params.push({ span: AST.spanFrom(span, this.prevSpan()), name, variance, reified, upperBound });
      if (!this.check(TokenKind.Gt)) this.expect(TokenKind.Comma);
    }
    this.expect(TokenKind.Gt);
    return params;
  }

  // ── Block ──────────────────────────────────────────────────────────────────

  private parseBlock(): AST.Block {
    const start = this.expect(TokenKind.LBrace).span;
    const statements: AST.Stmt[] = [];

    while (!this.check(TokenKind.RBrace) && !this.check(TokenKind.EOF)) {
      while (this.check(TokenKind.Semicolon)) this.advance();
      if (this.check(TokenKind.RBrace)) break;
      const s = this.parseStmt();
      if (s) statements.push(s);
    }

    const end = this.expect(TokenKind.RBrace).span;
    return { kind: "Block", span: AST.spanFrom(start, end), statements };
  }

  // ── Statements ─────────────────────────────────────────────────────────────

  private parseStmt(): AST.Stmt | null {
    const tok = this.current();

    switch (tok.kind) {
      case TokenKind.KwVal:
      case TokenKind.KwVar:
        if (this.checkNext(TokenKind.LParen)) {
          return this.parseDestructuringDecl(AST.DEFAULT_MODIFIERS);
        }
        return this.parseLocalProperty();
      case TokenKind.KwReturn:
        return this.parseReturnStmt();
      case TokenKind.KwThrow:
        return this.parseThrowStmt();
      case TokenKind.KwBreak:
        return this.parseBreakStmt();
      case TokenKind.KwContinue:
        return this.parseContinueStmt();
      case TokenKind.KwIf:
        return this.parseIfStmt();
      case TokenKind.KwWhen:
        return this.parseWhenStmt();
      case TokenKind.KwFor:
        return this.parseForStmt();
      case TokenKind.KwWhile:
        return this.parseWhileStmt();
      case TokenKind.KwDo:
        return this.parseDoWhileStmt();
      case TokenKind.KwTry:
        return this.parseTryCatchStmt();
      case TokenKind.LBrace:
        return this.parseBlock();
      default: {
        // Could be a labeled statement: `label@ while (...) {}`
        if (tok.kind === TokenKind.Identifier && this.checkNext(TokenKind.At)) {
          return this.parseLabeledStmt();
        }
        // Expression statement (assignment, call, etc.)
        const expr = this.parseExpr();
        this.eatSemicolon();
        return { kind: "ExprStmt", span: expr.span, expr };
      }
    }
  }

  private parseLocalProperty(): AST.PropertyDecl {
    return this.parsePropertyDecl(AST.DEFAULT_MODIFIERS);
  }

  private parseReturnStmt(): AST.ReturnStmt {
    const start = this.expect(TokenKind.KwReturn).span;
    let label: string | null = null;
    if (this.check(TokenKind.At)) {
      this.advance();
      label = this.expectIdentifier();
    }
    let value: AST.Expr | null = null;
    if (!this.check(TokenKind.Semicolon) && !this.check(TokenKind.RBrace) && !this.check(TokenKind.EOF)) {
      value = this.parseExpr();
    }
    this.eatSemicolon();
    return { kind: "ReturnStmt", span: AST.spanFrom(start, this.prevSpan()), label, value };
  }

  private parseThrowStmt(): AST.ThrowStmt {
    const start = this.expect(TokenKind.KwThrow).span;
    const value = this.parseExpr();
    this.eatSemicolon();
    return { kind: "ThrowStmt", span: AST.spanFrom(start, value.span), value };
  }

  private parseBreakStmt(): AST.BreakStmt {
    const start = this.expect(TokenKind.KwBreak).span;
    let label: string | null = null;
    if (this.check(TokenKind.At)) { this.advance(); label = this.expectIdentifier(); }
    this.eatSemicolon();
    return { kind: "BreakStmt", span: AST.spanFrom(start, this.prevSpan()), label };
  }

  private parseContinueStmt(): AST.ContinueStmt {
    const start = this.expect(TokenKind.KwContinue).span;
    let label: string | null = null;
    if (this.check(TokenKind.At)) { this.advance(); label = this.expectIdentifier(); }
    this.eatSemicolon();
    return { kind: "ContinueStmt", span: AST.spanFrom(start, this.prevSpan()), label };
  }

  private parseIfStmt(): AST.IfStmt {
    const start = this.expect(TokenKind.KwIf).span;
    this.expect(TokenKind.LParen);
    const condition = this.parseExpr();
    this.expect(TokenKind.RParen);
    const then = this.parseBlock();
    // Skip ASI-inserted semicolons between the then-block's `}` and `else`
    while (this.check(TokenKind.Semicolon)) this.advance();
    let elseClause: AST.Block | AST.IfStmt | null = null;
    if (this.check(TokenKind.KwElse)) {
      this.advance();
      if (this.check(TokenKind.KwIf)) {
        elseClause = this.parseIfStmt();
      } else {
        elseClause = this.parseBlock();
      }
    }
    return {
      kind: "IfStmt",
      span: AST.spanFrom(start, this.prevSpan()),
      condition,
      then,
      else: elseClause,
    };
  }

  private parseWhenStmt(): AST.WhenStmt {
    const start = this.expect(TokenKind.KwWhen).span;
    let subject: AST.WhenSubject | null = null;
    if (this.check(TokenKind.LParen)) {
      const subStart = this.advance().span;
      let binding: string | null = null;
      if (this.check(TokenKind.KwVal) && this.peekKindAt(2) === TokenKind.Eq) {
        this.advance();
        binding = this.expectIdentifier();
        this.expect(TokenKind.Eq);
      }
      const expr = this.parseExpr();
      this.expect(TokenKind.RParen);
      subject = { span: AST.spanFrom(subStart, this.prevSpan()), binding, expr };
    }
    this.expect(TokenKind.LBrace);
    const branches: AST.WhenBranch[] = [];
    while (!this.check(TokenKind.RBrace) && !this.check(TokenKind.EOF)) {
      branches.push(this.parseWhenBranch());
      while (this.check(TokenKind.Semicolon)) this.advance();
    }
    const end = this.expect(TokenKind.RBrace).span;
    return { kind: "WhenStmt", span: AST.spanFrom(start, end), subject, branches };
  }

  private parseWhenBranch(): AST.WhenBranch {
    const start = this.current().span;
    let isElse = false;
    const conditions: AST.WhenCondition[] = [];

    if (this.check(TokenKind.KwElse)) {
      isElse = true;
      this.advance();
    } else {
      conditions.push(this.parseWhenCondition());
      while (this.check(TokenKind.Comma)) {
        this.advance();
        conditions.push(this.parseWhenCondition());
      }
    }

    this.expect(TokenKind.Arrow);

    let body: AST.Block | AST.Expr;
    if (this.check(TokenKind.LBrace)) {
      body = this.parseBlock();
    } else {
      body = this.parseExpr();
      this.eatSemicolon();
    }

    return { span: AST.spanFrom(start, this.prevSpan()), conditions, isElse, body };
  }

  private parseWhenCondition(): AST.WhenCondition {
    const span = this.current().span;
    const negated = this.check(TokenKind.Bang);
    if (negated) this.advance();

    if (this.check(TokenKind.KwIs)) {
      this.advance();
      const type = this.parseTypeRef();
      return { kind: "WhenIsCondition", span, negated, type };
    }
    if (this.check(TokenKind.KwIn)) {
      this.advance();
      const expr = this.parseExpr();
      return { kind: "WhenInCondition", span, negated, expr };
    }
    const expr = this.parseExpr();
    return { kind: "WhenExprCondition", span, expr };
  }

  private parseForStmt(): AST.ForStmt {
    const start = this.expect(TokenKind.KwFor).span;
    this.expect(TokenKind.LParen);
    const binding = this.parseForBinding();
    this.expect(TokenKind.KwIn);
    const iterable = this.parseExpr();
    this.expect(TokenKind.RParen);
    const body = this.parseBlock();
    return { kind: "ForStmt", span: AST.spanFrom(start, body.span), binding, iterable, body };
  }

  private parseForBinding(): AST.ForStmt["binding"] {
    if (this.check(TokenKind.LParen)) {
      this.advance();
      const names: (string | null)[] = [];
      while (!this.check(TokenKind.RParen) && !this.check(TokenKind.EOF)) {
        if (this.check(TokenKind.Underscore)) { names.push(null); this.advance(); }
        else names.push(this.expectIdentifier());
        if (!this.check(TokenKind.RParen)) this.expect(TokenKind.Comma);
      }
      this.expect(TokenKind.RParen);
      return { kind: "TupleDestructure", names };
    }
    return this.expectIdentifier();
  }

  private parseWhileStmt(): AST.WhileStmt {
    const start = this.expect(TokenKind.KwWhile).span;
    this.expect(TokenKind.LParen);
    const condition = this.parseExpr();
    this.expect(TokenKind.RParen);
    const body = this.parseBlock();
    return { kind: "WhileStmt", span: AST.spanFrom(start, body.span), condition, body };
  }

  private parseDoWhileStmt(): AST.DoWhileStmt {
    const start = this.expect(TokenKind.KwDo).span;
    const body = this.parseBlock();
    this.expect(TokenKind.KwWhile);
    this.expect(TokenKind.LParen);
    const condition = this.parseExpr();
    this.expect(TokenKind.RParen);
    this.eatSemicolon();
    return { kind: "DoWhileStmt", span: AST.spanFrom(start, this.prevSpan()), body, condition };
  }

  private parseTryCatchStmt(): AST.TryCatchStmt {
    const start = this.expect(TokenKind.KwTry).span;
    const body = this.parseBlock();
    const catches: AST.CatchClause[] = [];
    while (this.check(TokenKind.KwCatch)) {
      catches.push(this.parseCatchClause());
    }
    let fin: AST.Block | null = null;
    if (this.check(TokenKind.KwFinally)) {
      this.advance();
      fin = this.parseBlock();
    }
    return { kind: "TryCatchStmt", span: AST.spanFrom(start, this.prevSpan()), body, catches, finally: fin };
  }

  private parseCatchClause(): AST.CatchClause {
    const start = this.expect(TokenKind.KwCatch).span;
    this.expect(TokenKind.LParen);
    const name = this.expectIdentifier();
    this.expect(TokenKind.Colon);
    const type = this.parseTypeRef();
    this.expect(TokenKind.RParen);
    const body = this.parseBlock();
    return { span: AST.spanFrom(start, body.span), name, type, body };
  }

  private parseLabeledStmt(): AST.LabeledStmt {
    const start = this.current().span;
    const label = this.advance().text; // label name
    this.expect(TokenKind.At);
    const body = this.parseStmt()!;
    return { kind: "LabeledStmt", span: AST.spanFrom(start, body.span), label, body };
  }

  // ── Expressions (Pratt parser / precedence climbing) ──────────────────────

  private parseExpr(): AST.Expr {
    if (this.depth++ > 200) throw new Error(`Infinite recursion detected in parser at Pos ${this.pos} (${this.current().kind})`);

    const res = this.parseAssign();
    this.depth--;
    return res;
  }

  private parseAssign(): AST.Expr {
    const left = this.parseElvis();

    const assignOps: Partial<Record<TokenKind, AST.CompoundOp | "=">> = {
      [TokenKind.Eq]: "=",
      [TokenKind.PlusEq]: "+=",
      [TokenKind.MinusEq]: "-=",
      [TokenKind.StarEq]: "*=",
      [TokenKind.SlashEq]: "/=",
      [TokenKind.PercentEq]: "%=",
    };

    const op = assignOps[this.current().kind];
    if (op) {
      this.advance();
      const right = this.parseAssign();
      if (op === "=") {
        return {
          kind: "AssignExpr",
          span: AST.spanFrom(left.span, right.span),
          target: left as AST.AssignTarget,
          value: right,
        };
      }
      return {
        kind: "CompoundAssignExpr",
        span: AST.spanFrom(left.span, right.span),
        op: op as AST.CompoundOp,
        target: left as AST.AssignTarget,
        value: right,
      };
    }

    return left;
  }

  private parseElvis(): AST.Expr {
    let left = this.parseOr();
    while (this.check(TokenKind.QuestionColon)) {
      this.advance();
      const right = this.parseOr();
      left = { kind: "ElvisExpr", span: AST.spanFrom(left.span, right.span), left, right };
    }
    return left;
  }

  private parseOr(): AST.Expr {
    let left = this.parseAnd();
    while (this.check(TokenKind.PipePipe)) {
      this.advance();
      const right = this.parseAnd();
      left = { kind: "BinaryExpr", span: AST.spanFrom(left.span, right.span), op: "||", left, right };
    }
    return left;
  }

  private parseAnd(): AST.Expr {
    let left = this.parseEquality();
    while (this.check(TokenKind.AmpAmp)) {
      this.advance();
      const right = this.parseEquality();
      left = { kind: "BinaryExpr", span: AST.spanFrom(left.span, right.span), op: "&&", left, right };
    }
    return left;
  }

  private parseEquality(): AST.Expr {
    let left = this.parseComparison();
    while (true) {
      let op: AST.BinaryOp | null = null;
      if (this.check(TokenKind.EqEq)) op = "==";
      else if (this.check(TokenKind.BangEq)) op = "!=";
      else if (this.check(TokenKind.EqEqEq)) op = "===";
      else if (this.check(TokenKind.BangEqEq)) op = "!==";
      else break;
      this.advance();
      const right = this.parseComparison();
      left = { kind: "BinaryExpr", span: AST.spanFrom(left.span, right.span), op, left, right };
    }
    return left;
  }

  private parseComparison(): AST.Expr {
    let left = this.parseRange();
    while (true) {
      let op: AST.BinaryOp | null = null;
      if (this.check(TokenKind.Lt)) op = "<";
      else if (this.check(TokenKind.Gt)) op = ">";
      else if (this.check(TokenKind.LtEq)) op = "<=";
      else if (this.check(TokenKind.GtEq)) op = ">=";
      else break;
      this.advance();
      const right = this.parseRange();
      left = { kind: "BinaryExpr", span: AST.spanFrom(left.span, right.span), op, left, right };
    }
    return left;
  }

  private parseRange(): AST.Expr {
    const left = this.parseInfix();
    if (this.check(TokenKind.DotDot)) {
      this.advance();
      const right = this.parseInfix();
      return { kind: "RangeExpr", span: AST.spanFrom(left.span, right.span), from: left, to: right, inclusive: true };
    }
    if (this.check(TokenKind.DotDotLt)) {
      this.advance();
      const right = this.parseInfix();
      return { kind: "RangeExpr", span: AST.spanFrom(left.span, right.span), from: left, to: right, inclusive: false };
    }
    return left;
  }

  private parseInfix(): AST.Expr {
    let left = this.parseAdditive();
    // Infix function calls: `a infixFun b` → `a.infixFun(b)`
    // An identifier at this position (not a keyword, not the start of a block) is an infix call.
    while (this.check(TokenKind.Identifier)) {
      // Disambiguate: peek to see if the token after the identifier is a valid start of an expression.
      // If the next next token is `(`, it's a regular call like `foo bar(...)`, not infix.
      // We accept any identifier followed by a non-( expression start.
      const saved = this.pos;
      const name = this.current().text;
      this.advance(); // consume identifier
      // If followed immediately by `(` it looks like a regular call, not infix — back off
      if (this.check(TokenKind.LParen)) {
        this.pos = saved;
        break;
      }
      // Try to parse the right-hand operand
      const right = this.parseAdditive();
      const callee: AST.MemberExpr = {
        kind: "MemberExpr",
        span: left.span,
        target: left,
        member: name,
      };
      const callArg: AST.CallArg = {
        span: right.span,
        name: null,
        spread: false,
        value: right,
      };
      left = {
        kind: "CallExpr",
        span: AST.spanFrom(left.span, right.span),
        callee,
        typeArgs: [],
        args: [callArg],
        trailingLambda: null,
      };
    }
    // `is` and `!is` checks
    while (this.check(TokenKind.KwIs) || (this.check(TokenKind.Bang) && this.checkNext(TokenKind.KwIs))) {
      const negated = this.check(TokenKind.Bang);
      if (negated) this.advance();
      this.advance(); // `is`
      const type = this.parseTypeRef();
      left = { kind: "TypeCheckExpr", span: AST.spanFrom(left.span, type.span), negated, expr: left, type };
    }
    // `as` and `as?`
    while (this.check(TokenKind.KwAs)) {
      this.advance();
      const safe = this.check(TokenKind.Question);
      if (safe) this.advance();
      const type = this.parseTypeRef();
      if (safe) {
        left = { kind: "SafeCastExpr", span: AST.spanFrom(left.span, type.span), expr: left, type };
      } else {
        left = { kind: "TypeCastExpr", span: AST.spanFrom(left.span, type.span), expr: left, type };
      }
    }
    return left;
  }

  private parseAdditive(): AST.Expr {
    let left = this.parseMultiplicative();
    while (this.check(TokenKind.Plus) || this.check(TokenKind.Minus)) {
      const op: AST.BinaryOp = this.check(TokenKind.Plus) ? "+" : "-";
      this.advance();
      const right = this.parseMultiplicative();
      left = { kind: "BinaryExpr", span: AST.spanFrom(left.span, right.span), op, left, right };
    }
    return left;
  }

  private parseMultiplicative(): AST.Expr {
    let left = this.parseUnary();
    while (this.check(TokenKind.Star) || this.check(TokenKind.Slash) || this.check(TokenKind.Percent)) {
      const op: AST.BinaryOp = this.check(TokenKind.Star) ? "*" : this.check(TokenKind.Slash) ? "/" : "%";
      this.advance();
      const right = this.parseUnary();
      left = { kind: "BinaryExpr", span: AST.spanFrom(left.span, right.span), op, left, right };
    }
    return left;
  }

  private parseUnary(): AST.Expr {
    const span = this.current().span;
    if (this.check(TokenKind.Bang)) {
      this.advance();
      const operand = this.parseUnary();
      return { kind: "UnaryExpr", span: AST.spanFrom(span, operand.span), op: "!", operand, prefix: true };
    }
    if (this.check(TokenKind.Minus)) {
      this.advance();
      const operand = this.parseUnary();
      return { kind: "UnaryExpr", span: AST.spanFrom(span, operand.span), op: "-", operand, prefix: true };
    }
    if (this.check(TokenKind.Plus)) {
      this.advance();
      return this.parseUnary();
    }
    // Prefix ++ / --
    if (this.check(TokenKind.PlusPlus) || this.check(TokenKind.MinusMinus)) {
      const op = this.check(TokenKind.PlusPlus) ? "++" : "--";
      this.advance();
      const target = this.parsePostfix() as AST.AssignTarget;
      return { kind: "IncrDecrExpr", span: AST.spanFrom(span, target.span), op, target, prefix: true };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): AST.Expr {
    let expr = this.parsePrimary();

    loop: while (true) {
      switch (this.current().kind) {
        case TokenKind.Dot: {
          this.advance();
          const member = this.expectIdentOrKeyword();
          expr = { kind: "MemberExpr", span: AST.spanFrom(expr.span, this.prevSpan()), target: expr, member };
          break;
        }
        case TokenKind.QuestionDot: {
          this.advance();
          // x?.() — safe invocation of a nullable function value
          if (this.check(TokenKind.LParen)) {
            const args = this.parseCallArgs();
            let trailingLambda: AST.LambdaExpr | null = null;
            const savedPosAfterArgs = this.pos;
            while (this.check(TokenKind.Semicolon)) this.advance();
            if (this.check(TokenKind.LBrace)) {
              trailingLambda = this.parseLambda();
            } else {
              this.pos = savedPosAfterArgs;
            }
            expr = {
              kind: "SafeCallExpr",
              span: AST.spanFrom(expr.span, this.prevSpan()),
              callee: expr,
              args,
              trailingLambda,
            };
            break;
          }
          const member = this.expectIdentOrKeyword();
          expr = { kind: "SafeMemberExpr", span: AST.spanFrom(expr.span, this.prevSpan()), target: expr, member };
          break;
        }
        case TokenKind.BangBang: {
          const span = this.advance().span;
          expr = { kind: "NotNullExpr", span: AST.spanFrom(expr.span, span), expr };
          break;
        }
        case TokenKind.LParen: {
          const args = this.parseCallArgs();
          let trailingLambda: AST.LambdaExpr | null = null;
          // Eat ASI-inserted semicolons between ) and { so trailing-lambda
          // syntax `foo(args) \n { ... }` works.
          // Restore position if no { follows so statement boundaries are preserved.
          const savedPosAfterArgs = this.pos;
          while (this.check(TokenKind.Semicolon)) this.advance();
          if (this.check(TokenKind.LBrace)) {
            trailingLambda = this.parseLambda();
          } else {
            this.pos = savedPosAfterArgs;
          }
          expr = {
            kind: "CallExpr",
            span: AST.spanFrom(expr.span, this.prevSpan()),
            callee: expr,
            typeArgs: [],
            args,
            trailingLambda,
          };
          break;
        }
        case TokenKind.Lt: {
          if (this.current().span.startOffset > 0 && this.source[this.current().span.startOffset - 1] === "\n") break loop;
          // Only attempt type-arg parsing when the next token can actually start a type
          // argument (* or `in` or an Identifier). All other tokens should be treated as
          // the < comparison operator.
          const nextKind = this.tokens[this.pos + 1]?.kind;
          if (nextKind !== TokenKind.Star && nextKind !== TokenKind.KwIn && nextKind !== TokenKind.Identifier) break loop;
          const saved = this.pos;
          const diagCheckpoint = this.diag.checkpoint();
          try {
            const typeArgs = this.parseTypeArgs();
            if (this.check(TokenKind.LParen)) {
              const args = this.parseCallArgs();
              let trailingLambda: AST.LambdaExpr | null = null;
              if (this.check(TokenKind.LBrace)) {
                trailingLambda = this.parseLambda();
              }
              expr = {
                kind: "CallExpr",
                span: AST.spanFrom(expr.span, this.prevSpan()),
                callee: expr,
                typeArgs,
                args,
                trailingLambda,
              };
              break;
            }
          } catch { /**/ }
          this.pos = saved;
          this.diag.rollback(diagCheckpoint);
          break loop;
        }
        case TokenKind.LBracket: {
          this.advance();
          const index = this.parseExpr();
          const end = this.expect(TokenKind.RBracket).span;
          expr = { kind: "IndexExpr", span: AST.spanFrom(expr.span, end), target: expr, index };
          break;
        }
        case TokenKind.PlusPlus:
        case TokenKind.MinusMinus: {
          const op = this.check(TokenKind.PlusPlus) ? "++" : "--";
          const end = this.advance().span;
          expr = {
            kind: "IncrDecrExpr",
            span: AST.spanFrom(expr.span, end),
            op,
            target: expr as AST.AssignTarget,
            prefix: false,
          };
          break;
        }
        case TokenKind.LBrace: {
          if (!this.isStartOfNewStatement()) {
            const lambda = this.parseLambda();
            expr = {
              kind: "CallExpr",
              span: AST.spanFrom(expr.span, lambda.span),
              callee: expr,
              typeArgs: [],
              args: [],
              trailingLambda: lambda,
            };
          } else {
            break loop;
          }
          break;
        }
        default:
          break loop;
      }
    }
    return expr;
  }

  private parsePrimary(): AST.Expr {
    const tok = this.current();

    switch (tok.kind) {
      case TokenKind.IntLiteral:
        this.advance();
        return { kind: "IntLiteralExpr", span: tok.span, value: tok.value as number };
      case TokenKind.LongLiteral:
        this.advance();
        return { kind: "LongLiteralExpr", span: tok.span, value: tok.value as bigint };
      case TokenKind.FloatLiteral:
        this.advance();
        return { kind: "FloatLiteralExpr", span: tok.span, value: tok.value as number };
      case TokenKind.DoubleLiteral:
        this.advance();
        return { kind: "DoubleLiteralExpr", span: tok.span, value: tok.value as number };
      case TokenKind.BooleanLiteral:
        this.advance();
        return { kind: "BooleanLiteralExpr", span: tok.span, value: tok.value as boolean };
      case TokenKind.NullLiteral:
        this.advance();
        return { kind: "NullLiteralExpr", span: tok.span };
      case TokenKind.StringLiteral:
        return this.parseStringLiteralExpr();
      case TokenKind.RawStringLiteral: {
        this.advance();
        return { kind: "StringLiteralExpr", span: tok.span, value: tok.value as string, raw: true };
      }
      case TokenKind.Identifier:
        this.advance();
        return { kind: "NameExpr", span: tok.span, name: tok.text };
      case TokenKind.KwThis: {
        this.advance();
        let label: string | null = null;
        if (this.check(TokenKind.At)) { this.advance(); label = this.expectIdentifier(); }
        return { kind: "ThisExpr", span: tok.span, label };
      }
      case TokenKind.KwSuper: {
        this.advance();
        let label: string | null = null;
        if (this.check(TokenKind.At)) { this.advance(); label = this.expectIdentifier(); }
        return { kind: "SuperExpr", span: tok.span, label };
      }
      case TokenKind.KwIf:
        return this.parseIfExpr();
      case TokenKind.KwWhen:
        return this.parseWhenExpr();
      case TokenKind.KwTry:
        return this.parseTryCatchExpr();
      case TokenKind.KwLaunch:
        return this.parseLaunchExpr();
      case TokenKind.KwAsync:
        return this.parseAsyncExpr();
      case TokenKind.KwReturn: {
        this.advance();
        let label: string | null = null;
        if (this.check(TokenKind.At)) { this.advance(); label = this.expectIdentifier(); }
        let value: AST.Expr | null = null;
        if (!this.check(TokenKind.Semicolon) && !this.check(TokenKind.RBrace)) {
          value = this.parseExpr();
        }
        return { kind: "ReturnExpr", span: AST.spanFrom(tok.span, this.prevSpan()), label, value };
      }
      case TokenKind.KwBreak: {
        this.advance();
        let label: string | null = null;
        if (this.check(TokenKind.At)) { this.advance(); label = this.expectIdentifier(); }
        return { kind: "BreakExpr", span: tok.span, label };
      }
      case TokenKind.KwContinue: {
        this.advance();
        let label: string | null = null;
        if (this.check(TokenKind.At)) { this.advance(); label = this.expectIdentifier(); }
        return { kind: "ContinueExpr", span: tok.span, label };
      }
      case TokenKind.LParen: {
        // Check if this is an arrow function: (params) => body
        if (this.looksLikeArrowFunction()) {
          return this.parseArrowFunction();
        }
        this.advance();
        const expr = this.parseExpr();
        this.expect(TokenKind.RParen);
        return { kind: "ParenExpr", span: AST.spanFrom(tok.span, this.prevSpan()), expr };
      }
      case TokenKind.LBrace:
        return this.parseLambda();
      case TokenKind.KwObject:
        return this.parseObjectExpr();
      case TokenKind.Lt: {
        // JSX: <TagName ...> or <TagName ... />
        // Only treat as JSX if immediately followed by an identifier (tag name)
        if (this.tokens[this.pos + 1]?.kind === TokenKind.Identifier) {
          return this.parseJsxElement();
        }
        // fall through to error
        this.diag.error(tok.span, E_EXPECTED_EXPRESSION, `Expected an expression, got '${tok.text}'`);
        this.advance();
        return { kind: "NullLiteralExpr", span: tok.span };
      }
      // listOf(...), setOf(...), mapOf(...) are stdlib calls, handled normally
      default: {
        this.diag.error(tok.span, E_EXPECTED_EXPRESSION, `Expected an expression, got '${tok.text}'`);
        this.advance();
        // Return a placeholder to allow parser to continue
        return { kind: "NullLiteralExpr", span: tok.span };
      }
    }
  }

  // ── JSX ────────────────────────────────────────────────────────────────────

  private parseJsxElement(): AST.JsxElement {
    const start = this.expect(TokenKind.Lt).span;

    // Tag name (may contain dots: Router.Link)
    let tag = this.current().text;
    this.advance();
    while (this.check(TokenKind.Dot)) {
      this.advance();
      tag += "." + this.current().text;
      this.advance();
    }

    // Attributes
    const attrs: AST.JsxAttr[] = [];
    while (!this.check(TokenKind.Gt) && !this.check(TokenKind.Slash) && !this.check(TokenKind.EOF)) {
      // Skip synthetic semicolons (ASI can insert them in multi-line JSX)
      while (this.check(TokenKind.Semicolon)) this.advance();
      if (this.check(TokenKind.Gt) || this.check(TokenKind.Slash)) break;

      const attrStart = this.current().span;
      const attrName = this.current().text; // accept keywords (class, for) as attr names
      this.advance();

      if (!this.check(TokenKind.Eq)) {
        attrs.push({ span: attrStart, name: attrName, value: null });
        continue;
      }
      this.advance(); // consume "="

      if (this.check(TokenKind.StringLiteral)) {
        const expr = this.parseStringLiteralExpr();
        attrs.push({ span: AST.spanFrom(attrStart, expr.span), name: attrName, value: expr });
      } else if (this.check(TokenKind.LBrace)) {
        this.advance();
        const expr = this.parseExpr();
        while (this.check(TokenKind.Semicolon)) this.advance();
        this.expect(TokenKind.RBrace);
        attrs.push({ span: AST.spanFrom(attrStart, this.prevSpan()), name: attrName, value: expr });
      }
    }
    // Self-closing: />
    if (this.check(TokenKind.Slash)) {
      this.advance();
      this.expect(TokenKind.Gt);
      return { kind: "JsxElement", span: AST.spanFrom(start, this.prevSpan()), tag, attrs, children: [] };
    }

    this.expect(TokenKind.Gt); // consume opening ">"

    const children: AST.JsxChild[] = [];

    while (!this.check(TokenKind.EOF)) {

      while (this.check(TokenKind.Semicolon)) this.advance();

      // Closing tag: </
      if (this.check(TokenKind.Lt) && this.checkNext(TokenKind.Slash)) break;

      // Expression child: { expr }
      if (this.check(TokenKind.LBrace)) {
        const childStart = this.advance().span;
        const expr = this.parseExpr();
        while (this.check(TokenKind.Semicolon)) this.advance();
        this.expect(TokenKind.RBrace);
        children.push({ kind: "JsxExprChild", span: AST.spanFrom(childStart, this.prevSpan()), expr });
        continue;
      }

      // Nested element: < Identifier
      if (this.check(TokenKind.Lt) && this.tokens[this.pos + 1]?.kind === TokenKind.Identifier) {
        children.push(this.parseJsxElement());
        continue;
      }

      // Text content: collect until { or <, extracting raw source text
      const textStartOffset = this.current().span.startOffset;
      const textStartSpan = this.current().span;
      while (
        !this.check(TokenKind.EOF) &&
        !this.check(TokenKind.LBrace) &&
        !this.check(TokenKind.Lt) &&
        !this.check(TokenKind.Semicolon)
      ) {
        this.advance();
      }
      const textEndOffset = this.current().span.startOffset;
      // Extract raw source and normalize whitespace
      const rawText = this.source
        ? this.source.slice(textStartOffset, textEndOffset)
        : "";
      const text = rawText.replace(/\s+/g, " ").trim();
      if (text) {
        children.push({ kind: "JsxTextChild", span: AST.spanFrom(textStartSpan, this.prevSpan()), text });
      }
    }

    // Consume closing tag: </tagname>
    this.expect(TokenKind.Lt);
    this.expect(TokenKind.Slash);
    while (!this.check(TokenKind.Gt) && !this.check(TokenKind.EOF)) this.advance();
    const end = this.expect(TokenKind.Gt).span;

    return { kind: "JsxElement", span: AST.spanFrom(start, end), tag, attrs, children };
  }

  private parseStringLiteralExpr(): AST.StringLiteralExpr | AST.StringTemplateExpr {
    const tok = this.current();
    this.advance();
    const raw = tok.value as string;

    // Check if contains ${...} pattern — if so, parse as template
    if (raw.includes("${")) {
      const parts: AST.StringTemplatePart[] = [];
      let i = 0;
      let cur = "";
      while (i < raw.length) {
        if (raw[i] === "$" && raw[i + 1] === "{") {
          if (cur) parts.push({ kind: "LiteralPart", value: cur });
          cur = "";
          i += 2;
          let depth = 1;
          let exprSrc = "";
          while (i < raw.length && depth > 0) {
            if (raw[i] === "{") depth++;
            else if (raw[i] === "}") { depth--; if (depth === 0) { i++; break; } }
            exprSrc += raw[i++];
          }
          // Re-lex and re-parse the embedded expression
          const innerDiag = new DiagnosticBag();
          const innerTokens = new Lexer(exprSrc, tok.span.file, innerDiag).tokenize();
          const innerParser = new Parser(innerTokens, tok.span.file, innerDiag);
          const innerExpr = innerParser.parseExpr();
          this.diag.merge(innerDiag);
          parts.push({ kind: "ExprPart", expr: innerExpr });
        } else {
          cur += raw[i++];
        }
      }
      if (cur) parts.push({ kind: "LiteralPart", value: cur });
      return { kind: "StringTemplateExpr", span: tok.span, parts };
    }

    return { kind: "StringLiteralExpr", span: tok.span, value: raw, raw: false };
  }

  private parseIfExpr(): AST.IfExpr {
    const start = this.expect(TokenKind.KwIf).span;
    this.expect(TokenKind.LParen);
    const condition = this.parseExpr();
    this.expect(TokenKind.RParen);
    // Skip ASI semicolons inserted between `if (cond)` and the then-branch
    while (this.check(TokenKind.Semicolon)) this.advance();
    const then: AST.Block | AST.Expr = this.check(TokenKind.LBrace)
      ? this.parseBlock()
      : this.parseExpr();
    // Skip synthetic semicolons inserted by ASI between then-branch and else
    while (this.check(TokenKind.Semicolon)) this.advance();
    this.expect(TokenKind.KwElse);
    // Skip ASI semicolons between else and the else-branch
    while (this.check(TokenKind.Semicolon)) this.advance();
    const elseExpr: AST.Block | AST.IfExpr | AST.Expr = this.check(TokenKind.KwIf)
      ? this.parseIfExpr()
      : this.check(TokenKind.LBrace)
        ? this.parseBlock()
        : this.parseExpr();
    return { kind: "IfExpr", span: AST.spanFrom(start, this.prevSpan()), condition, then, else: elseExpr };
  }

  private parseWhenExpr(): AST.WhenExpr {
    const start = this.expect(TokenKind.KwWhen).span;
    let subject: AST.WhenSubject | null = null;
    if (this.check(TokenKind.LParen)) {
      const subStart = this.advance().span;
      let binding: string | null = null;
      if (this.check(TokenKind.KwVal) && this.peekKindAt(2) === TokenKind.Eq) {
        this.advance(); binding = this.expectIdentifier(); this.expect(TokenKind.Eq);
      }
      const expr = this.parseExpr();
      this.expect(TokenKind.RParen);
      subject = { span: AST.spanFrom(subStart, this.prevSpan()), binding, expr };
    }
    this.expect(TokenKind.LBrace);
    const branches: AST.WhenBranch[] = [];
    while (!this.check(TokenKind.RBrace) && !this.check(TokenKind.EOF)) {
      branches.push(this.parseWhenBranch());
      while (this.check(TokenKind.Semicolon)) this.advance();
    }
    const end = this.expect(TokenKind.RBrace).span;
    return { kind: "WhenExpr", span: AST.spanFrom(start, end), subject, branches };
  }

  private parseTryCatchExpr(): AST.TryCatchExpr {
    const start = this.expect(TokenKind.KwTry).span;
    const body = this.parseBlock();
    const catches: AST.CatchClause[] = [];
    while (this.check(TokenKind.KwCatch)) catches.push(this.parseCatchClause());
    let fin: AST.Block | null = null;
    if (this.check(TokenKind.KwFinally)) { this.advance(); fin = this.parseBlock(); }
    return { kind: "TryCatchExpr", span: AST.spanFrom(start, this.prevSpan()), body, catches, finally: fin };
  }

  private parseLaunchExpr(): AST.LaunchExpr {
    const start = this.expect(TokenKind.KwLaunch).span;
    let context: AST.Expr | null = null;
    if (this.check(TokenKind.LParen)) {
      this.advance();
      context = this.parseExpr();
      this.expect(TokenKind.RParen);
    }
    const body = this.parseBlock();
    return { kind: "LaunchExpr", span: AST.spanFrom(start, body.span), context, body };
  }

  private parseAsyncExpr(): AST.AsyncExpr {
    const start = this.expect(TokenKind.KwAsync).span;
    let context: AST.Expr | null = null;
    if (this.check(TokenKind.LParen)) {
      this.advance();
      context = this.parseExpr();
      this.expect(TokenKind.RParen);
    }
    const body = this.parseBlock();
    return { kind: "AsyncExpr", span: AST.spanFrom(start, body.span), context, body };
  }

  private parseObjectExpr(): AST.ObjectExpr {
    const start = this.expect(TokenKind.KwObject).span;
    const superTypes = this.parseSuperTypes();
    const body = this.parseClassBody();
    return { kind: "ObjectExpr", span: AST.spanFrom(start, body.span), superTypes, body };
  }

  private parseLambda(): AST.LambdaExpr {
    const start = this.expect(TokenKind.LBrace).span;
    const params: AST.LambdaParam[] = [];

    // Check if there are explicit params before `->` or `=>`
    const hasParams = this.detectLambdaParams();
    if (hasParams) {
      // Parse params — stop at either -> or =>
      while (!this.check(TokenKind.Arrow) && !this.check(TokenKind.FatArrow) && !this.check(TokenKind.EOF)) {
        const pSpan = this.current().span;
        let name: string | null = null;
        let type: AST.TypeRef | null = null;
        if (this.check(TokenKind.Underscore)) {
          this.advance();
        } else {
          name = this.expectIdentifier();
          if (this.check(TokenKind.Colon)) {
            this.advance();
            type = this.parseTypeRef();
          }
        }
        params.push({ span: AST.spanFrom(pSpan, this.prevSpan()), name, type });
        if (!this.check(TokenKind.Arrow) && !this.check(TokenKind.FatArrow)) this.expect(TokenKind.Comma);
      }
      // Consume either -> or =>
      if (this.check(TokenKind.FatArrow)) this.advance();
      else this.expect(TokenKind.Arrow);
    }

    const body: AST.Stmt[] = [];
    while (!this.check(TokenKind.RBrace) && !this.check(TokenKind.EOF)) {
      while (this.check(TokenKind.Semicolon)) this.advance();
      if (this.check(TokenKind.RBrace)) break;
      const s = this.parseStmt();
      if (s) body.push(s);
    }

    const end = this.expect(TokenKind.RBrace).span;
    return { kind: "LambdaExpr", span: AST.spanFrom(start, end), params, returnType: null, body };
  }

  /** Heuristically determine if this lambda has explicit parameters before `->` or `=>` */
  private detectLambdaParams(): boolean {
    let i = this.pos;
    let depth = 0;
    while (i < this.tokens.length) {
      const k = this.tokens[i]!.kind;
      if (k === TokenKind.LBrace || k === TokenKind.LParen) depth++;
      else if (k === TokenKind.RBrace || k === TokenKind.RParen) {
        if (depth === 0) return false;
        depth--;
      } else if ((k === TokenKind.Arrow || k === TokenKind.FatArrow) && depth === 0) {
        return true;
      } else if (k === TokenKind.Semicolon && depth === 0) {
        return false;
      }
      i++;
    }
    return false;
  }

  /** Heuristic lookahead: return true if we are at `(params) =>` (arrow function). */
  private looksLikeArrowFunction(): boolean {
    let i = this.pos + 1; // skip the opening `(`
    let depth = 1;
    while (i < this.tokens.length) {
      const k = this.tokens[i]!.kind;
      if (k === TokenKind.LParen) depth++;
      else if (k === TokenKind.RParen) {
        depth--;
        if (depth === 0) {
          return this.tokens[i + 1]?.kind === TokenKind.FatArrow;
        }
      } else if (k === TokenKind.EOF) return false;
      i++;
    }
    return false;
  }

  /** Parse `(params) => body` as a LambdaExpr (JS-style arrow function). */
  private parseArrowFunction(): AST.LambdaExpr {
    const start = this.expect(TokenKind.LParen).span;
    const params: AST.LambdaParam[] = [];
    while (!this.check(TokenKind.RParen) && !this.check(TokenKind.EOF)) {
      const pSpan = this.current().span;
      let name: string | null = null;
      let type: AST.TypeRef | null = null;
      if (this.check(TokenKind.Underscore)) {
        this.advance();
      } else {
        name = this.expectIdentifier();
        if (this.check(TokenKind.Colon)) {
          this.advance();
          type = this.parseTypeRef();
        }
      }
      params.push({ span: AST.spanFrom(pSpan, this.prevSpan()), name, type });
      if (!this.check(TokenKind.RParen)) {
        while (this.check(TokenKind.Semicolon)) this.advance();
        if (!this.check(TokenKind.RParen)) this.expect(TokenKind.Comma);
      }
    }
    this.expect(TokenKind.RParen);
    this.expect(TokenKind.FatArrow);
    // Body: block `{ ... }` or single expression
    const body: AST.Stmt[] = [];
    if (this.check(TokenKind.LBrace)) {
      const block = this.parseBlock();
      return { kind: "LambdaExpr", span: AST.spanFrom(start, block.span), params, returnType: null, body: block.statements };
    }
    const expr = this.parseExpr();
    body.push({ kind: "ExprStmt", span: expr.span, expr });
    return { kind: "LambdaExpr", span: AST.spanFrom(start, expr.span), params, returnType: null, body };
  }

  // ── Call arguments ─────────────────────────────────────────────────────────

  private parseCallArgs(): AST.CallArg[] {
    this.expect(TokenKind.LParen);
    const args: AST.CallArg[] = [];
    while (!this.check(TokenKind.RParen) && !this.check(TokenKind.EOF)) {
      while (this.check(TokenKind.Semicolon)) this.advance();
      if (this.check(TokenKind.RParen) || this.check(TokenKind.EOF)) break;
      const prevPos = this.pos;
      args.push(this.parseCallArg());
      if (this.pos === prevPos) break;
      while (this.check(TokenKind.Semicolon)) this.advance();
      if (!this.check(TokenKind.RParen)) this.expect(TokenKind.Comma);
    }
    this.expect(TokenKind.RParen);
    return args;
  }

  private parseCallArg(): AST.CallArg {
    const start = this.current().span;
    let name: string | null = null;
    let spread = false;

    if (this.check(TokenKind.Star)) { spread = true; this.advance(); }

    // Allow any identifier-shaped token (including keywords like `as`, `in`, `is`)
    // as a named argument label when followed by `=`.
    const curTok = this.current();
    const curIsIdentLike = curTok.kind === TokenKind.Identifier ||
      (curTok.text.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/) !== null);
    if (curIsIdentLike && this.checkNext(TokenKind.Eq)) {
      name = this.advance().text;
      this.advance(); // =
    }

    const value = this.parseExpr();
    return { span: AST.spanFrom(start, value.span), name, spread, value };
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

  private current(): Token {
    return this.tokens[this.pos] ?? this.tokens[this.tokens.length - 1]!;
  }

  private advance(): Token {
    const tok = this.current();
    this.pos++;
    return tok;
  }

  private prevSpan(): AST.Span {
    return this.tokens[Math.max(0, this.pos - 1)]!.span;
  }

  private check(kind: TokenKind): boolean {
    return this.current().kind === kind;
  }

  private checkNext(kind: TokenKind): boolean {
    return (this.tokens[this.pos + 1]?.kind ?? TokenKind.EOF) === kind;
  }

  private checkIdent(name: string): boolean {
    const tok = this.current();
    return tok.kind === TokenKind.Identifier && tok.text === name;
  }

  private peekKindAt(offset: number): TokenKind {
    return this.tokens[this.pos + offset]?.kind ?? TokenKind.EOF;
  }

  private expect(kind: TokenKind): Token {
    if (this.check(kind)) return this.advance();
    const tok = this.current();
    this.diag.error(
      tok.span,
      E_EXPECTED_TOKEN,
      `Expected '${kind}' but got '${tok.text}' (${tok.kind})`
    );
    // Return a fake token so parsing can continue
    return { kind, span: tok.span, text: "" };
  }

  private expectIdentifier(): string {
    const tok = this.current();
    if (tok.kind === TokenKind.Identifier) {
      this.advance();
      return tok.text;
    }
    this.diag.error(tok.span, E_EXPECTED_TOKEN, `Expected identifier, got '${tok.text}'`);
    return "<error>";
  }

  private expectIdentOrKeyword(): string {
    const tok = this.current();
    if (tok.kind === TokenKind.Identifier || tok.text.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
      this.advance();
      return tok.text;
    }
    this.diag.error(tok.span, E_EXPECTED_TOKEN, `Expected identifier, got '${tok.text}'`);
    return "<error>";
  }

  private eatSemicolon(): void {
    while (this.check(TokenKind.Semicolon)) this.advance();
  }

  private parseDottedName(): string[] {
    const parts = [this.expectIdentifier()];
    while (this.check(TokenKind.Dot)) {
      this.advance();
      parts.push(this.expectIdentifier());
    }
    return parts;
  }

  /**
   * A trailing `{` is the start of a new statement (not a trailing lambda)
   * when preceded by a newline-induced semicolon.
   */
  private isStartOfNewStatement(): boolean {
    const prev = this.tokens[this.pos - 1];
    return prev?.kind === TokenKind.Semicolon && prev.text === "\n";
  }
}

// ---------------------------------------------------------------------------
// Public helper
// ---------------------------------------------------------------------------

export function parse(tokens: Token[], file: string, diag: DiagnosticBag, source = ""): AST.Program {
  return new Parser(tokens, file, diag, source).parseProgram();
}
