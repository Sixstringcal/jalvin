import { describe, it, expect } from "vitest";
import { compile } from "../../dist/index.js";

function compileOk(src: string) {
  const result = compile(src, "<test>");
  return result;
}

function errors(src: string) {
  return compile(src, "<test>").diagnostics.items.filter((d) => d.severity === "error");
}

function warnings(src: string) {
  return compile(src, "<test>").diagnostics.items.filter((d) => d.severity === "warning");
}

describe("Typechecker — undefined symbols", () => {
  it("errors on undefined variable", () => {
    const errs = errors(`fun f() { println(x) }`);
    expect(errs.some((e) => e.code === "E0301")).toBe(true);
  });

  it("no error for defined variable", () => {
    const errs = errors(`fun f() { val x = 1; println(x) }`);
    expect(errs.filter((e) => e.code === "E0301")).toHaveLength(0);
  });
});

describe("Typechecker — null safety", () => {
  it("warns on safe call on non-nullable", () => {
    const result = compile(`val s: String = "hi"
fun f() { val n = s?.length }`, "<test>");
    expect(result.diagnostics.items.some((d) => d.code === "E0302")).toBe(true);
  });

  it("errors on unsafe member access on nullable", () => {
    const errs = errors(`fun f(x: String?) { val n = x.length }`);
    expect(errs.some((e) => e.code === "E0303")).toBe(true);
  });

  it("allows safe access on nullable", () => {
    const errs = errors(`fun f(x: String?) { val n = x?.length }`);
    expect(errs.filter((e) => e.code === "E0303")).toHaveLength(0);
  });
});

describe("Typechecker — const val reassignment", () => {
  it("errors when reassigning a val", () => {
    const errs = errors(`fun f() { val x = 1; x = 2 }`);
    expect(errs.some((e) => e.code === "E0320")).toBe(true);
  });

  it("allows reassigning a var", () => {
    const errs = errors(`fun f() { var x = 1; x = 2 }`);
    expect(errs.filter((e) => e.code === "E0320")).toHaveLength(0);
  });
});

describe("Typechecker — sealed class exhaustiveness", () => {
  it("errors when when is non-exhaustive on sealed class", () => {
    const errs = errors(`
sealed class Res {
  data class Ok(val v: Int) : Res()
  data class Err(val msg: String) : Res()
}
fun f(r: Res) {
  when (r) {
    is Res.Ok -> println("ok")
  }
}`);
    expect(errs.some((e) => e.code === "E0306")).toBe(true);
  });

  it("no error when all sealed variants covered", () => {
    const errs = errors(`
sealed class Res {
  data class Ok(val v: Int) : Res()
  data class Err(val msg: String) : Res()
}
fun f(r: Res) {
  when (r) {
    is Res.Ok -> println("ok")
    is Res.Err -> println("err")
  }
}`);
    expect(errs.filter((e) => e.code === "E0306")).toHaveLength(0);
  });

  it("no error when else branch covers sealed", () => {
    const errs = errors(`
sealed class S { object A : S(); object B : S() }
fun f(s: S) { when (s) { is S.A -> 1; else -> 2 } }`);
    expect(errs.filter((e) => e.code === "E0306")).toHaveLength(0);
  });
});

describe("Typechecker — override / abstract", () => {
  it("errors when overriding non-existent method", () => {
    const errs = errors(`
open class A { }
class B : A() {
  override fun ghost() { }
}`);
    expect(errs.some((e) => e.code === "E0311")).toBe(true);
  });

  it("errors when abstract method not implemented", () => {
    const errs = errors(`
abstract class A { abstract fun doIt() }
class B : A() { }`);
    expect(errs.some((e) => e.code === "E0310")).toBe(true);
  });
});

describe("Typechecker — lateinit", () => {
  it("errors on lateinit val", () => {
    const errs = errors(`class A { lateinit val name: String }`);
    expect(errs.some((e) => e.code === "E0321")).toBe(true);
  });

  it("errors on lateinit primitive", () => {
    const errs = errors(`class A { lateinit var count: Int }`);
    expect(errs.some((e) => e.code === "E0321")).toBe(true);
  });

  it("allows lateinit on var String", () => {
    const errs = errors(`class A { lateinit var name: String }`);
    expect(errs.filter((e) => e.code === "E0321")).toHaveLength(0);
  });
});

describe("Typechecker — suspend context", () => {
  it("errors when calling suspend fun from non-suspend context", () => {
    const errs = errors(`
suspend fun expensive(): Int = 42
fun normal() { expensive() }`);
    expect(errs.some((e) => e.code === "E0308")).toBe(true);
  });

  it("allows calling suspend fun from suspend context", () => {
    const errs = errors(`
suspend fun expensive(): Int = 42
suspend fun normal() { expensive() }`);
    expect(errs.filter((e) => e.code === "E0308")).toHaveLength(0);
  });
});

describe("Typechecker — @Nuked deprecation", () => {
  it("warns W0004 at call site of @Nuked function", () => {
    const ws = warnings(`
@Nuked("use newApi instead")
fun oldApi(): String = "legacy"
fun f() { oldApi() }`);
    expect(ws.some((w) => w.code === "W0004")).toBe(true);
  });
});

describe("Typechecker — warnings", () => {
  it("warns W0001 on unused variable", () => {
    const ws = warnings(`fun f() { val unused = 42 }`);
    expect(ws.some((w) => w.code === "W0001")).toBe(true);
  });

  it("does not warn on _-prefixed variable", () => {
    const ws = warnings(`fun f() { val _unused = 42 }`);
    expect(ws.filter((w) => w.code === "W0001")).toHaveLength(0);
  });

  it("warns W0002 on unreachable code after return", () => {
    const ws = warnings(`
fun f(): Int {
  return 1
  val x = 2
}`);
    expect(ws.some((w) => w.code === "W0002")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug-fix tests — v2.0.13
// ─────────────────────────────────────────────────────────────────────────────

describe("Typechecker — safe invocation ?.()", () => {
  it("no error when safely invoking a nullable function property", () => {
    const errs = errors(`
class Timer {
  var onExpired: (() -> Unit)? = null
  fun tick() { onExpired?.() }
}`);
    expect(errs.filter((e) => e.code === "E0301")).toHaveLength(0);
  });

  it("no error for ?.() with an argument", () => {
    const errs = errors(`
fun call(cb: ((Int) -> Unit)?) { cb?.(42) }`);
    expect(errs.filter((e) => e.code === "E0301")).toHaveLength(0);
  });
});

describe("Typechecker — nullable function type properties", () => {
  it("no error declaring (() -> Unit)?", () => {
    const errs = errors(`class A { var onExpired: (() -> Unit)? = null }`);
    expect(errs).toHaveLength(0);
  });

  it("no error declaring ((Int) -> String)?", () => {
    const errs = errors(`var mapper: ((Int) -> String)? = null`);
    expect(errs).toHaveLength(0);
  });
});

describe("Typechecker — implicit 'it' parameter", () => {
  it("resolves 'it' in a trailing lambda even without type context", () => {
    const errs = errors(`fun f() { val xs = listOf(1, 2, 3); xs.forEach { println(it) } }`);
    expect(errs.filter((e) => e.code === "E0301" && e.message.includes("'it'"))).toHaveLength(0);
  });

  it("resolves 'it' in a no-arg lambda passed to an unknown-type function", () => {
    const errs = errors(`
import @jalvin/runtime.*
fun f() { someList.forEach { println(it) } }`);
    expect(errs.filter((e) => e.code === "E0301" && e.message.includes("'it'"))).toHaveLength(0);
  });
});

describe("Typechecker — Unit as a value", () => {
  it("no error when Unit is used as a call argument", () => {
    const errs = errors(`fun f() { LaunchedEffect(Unit) { } }`);
    expect(errs.filter((e) => e.code === "E0301" && e.message.includes("Unit"))).toHaveLength(0);
  });

  it("no error assigning Unit to a val", () => {
    const errs = errors(`val sentinel = Unit`);
    expect(errs.filter((e) => e.code === "E0301")).toHaveLength(0);
  });
});

describe("Typechecker — browser globals (confirm / alert)", () => {
  it("no error calling confirm()", () => {
    const errs = errors(`fun f() { val ok = confirm("Are you sure?") }`);
    expect(errs.filter((e) => e.code === "E0301")).toHaveLength(0);
  });

  it("no error calling alert()", () => {
    const errs = errors(`fun f() { alert("Hello") }`);
    expect(errs.filter((e) => e.code === "E0301")).toHaveLength(0);
  });

  it("no error calling prompt()", () => {
    const errs = errors(`fun f() { val ans = prompt("Name?") }`);
    expect(errs.filter((e) => e.code === "E0301")).toHaveLength(0);
  });
});

describe("Typechecker — class method scope", () => {
  it("no error calling a sibling method by bare name", () => {
    const errs = errors(`
class Game {
  fun setScramble(s: String) { }
  fun reset() { setScramble("hello") }
}`);
    expect(errs.filter((e) => e.code === "E0301")).toHaveLength(0);
  });

  it("no error accessing a sibling property by bare name", () => {
    const errs = errors(`
class Counter {
  var count: Int = 0
  fun increment() { count = count + 1 }
}`);
    expect(errs.filter((e) => e.code === "E0301")).toHaveLength(0);
  });

  it("no error referencing primary constructor val by bare name in method", () => {
    const errs = errors(`
class Greeter(val name: String) {
  fun greet() { println(name) }
}`);
    expect(errs.filter((e) => e.code === "E0301")).toHaveLength(0);
  });

  it("resolves 'this' without explicit this. prefix inside a method", () => {
    const errs = errors(`
class Foo(val x: Int) {
  fun bar(): Int { return x }
}`);
    expect(errs.filter((e) => e.code === "E0301")).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug-fix tests — null-check smart-cast
// ─────────────────────────────────────────────────────────────────────────────

describe("Typechecker — null-check smart-cast (!= null / == null)", () => {
  it("no E0303 on direct member access after x != null guard", () => {
    const errs = errors(
`fun f(x: String?) {
  if (x != null) {
    val n = x.length
  }
}`);
    expect(errs.filter((e) => e.code === "E0303")).toHaveLength(0);
  });

  it("no E0303 on method call after x !== null guard", () => {
    const errs = errors(
`fun f(x: String?) {
  if (x !== null) {
    val up = x.uppercase()
  }
}`);
    expect(errs.filter((e) => e.code === "E0303")).toHaveLength(0);
  });

  it("narrows in else branch of x == null check", () => {
    const errs = errors(
`fun f(x: String?) {
  if (x == null) {
    println("null")
  } else {
    val n = x.length
  }
}`);
    expect(errs.filter((e) => e.code === "E0303")).toHaveLength(0);
  });

  it("narrows in else branch of x === null check", () => {
    const errs = errors(
`fun f(x: String?) {
  if (x === null) {
    println("null")
  } else {
    val n = x.length
  }
}`);
    expect(errs.filter((e) => e.code === "E0303")).toHaveLength(0);
  });

  it("does NOT narrow outside the if-block", () => {
    const errs = errors(
`fun f(x: String?) {
  if (x != null) { }
  val n = x.length
}`);
    expect(errs.some((e) => e.code === "E0303")).toBe(true);
  });

  it("smart-cast works alongside existing is-check narrowing in same condition", () => {
    const errs = errors(
`fun f(x: String?) {
  if (x != null) {
    val up = x.uppercase()
    val n  = x.length
  }
}`);
    expect(errs.filter((e) => e.code === "E0303")).toHaveLength(0);
  });
});
