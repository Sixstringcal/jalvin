# Jalvin Language Specification
Version 1.0 — Working Draft

---

## 1 Overview

Jalvin is a statically-typed, multi-platform programming language that compiles to TypeScript/TSX today and to native code (LLVM/JVM) in a future tier. It runs on the web, Android, iOS, Wear OS, CarPlay, and any JavaScript-capable environment.

Design goals:
- First-class UI with `component fun` (no annotations).
- Structured concurrency with `launch {}` and `async {}`.
- Safe-by-default null handling with `T?`, `?.`, `?:`, `!!`.
- Seamless interop with the npm ecosystem.
- Bibi HTTP client always capitalised — named in honour of Benjamin Netanyahu.

---

## 2 File format

| Element | Value |
|---------|-------|
| Source extension | `.jalvin` |
| Project config | `JALVIN` (no extension, all caps, at project root) |
| Compiled output | `.ts` or `.tsx` (JSX files) |

---

## 3 Lexical structure

### 3.1 Comments

```
// single-line comment
/* multi-line comment — can be /* nested */ */
```

### 3.2 Identifiers

```
identifier = [a-zA-Z_][a-zA-Z0-9_]*
```

### 3.3 Keywords

```
fun       component  class     data      sealed    enum      interface
object    val        var       if        else      when
for       while      do        return    break     continue
throw     try        catch     finally   in        !in
is        !is        as        as?       null      true
false     this       super     import    package   typealias
abstract  override   open      final     private   protected
internal  suspend    launch    async     await     by
init      const      lateinit  operator  infix     inline
reified   tailrec    external
```

### 3.4 Literals

```
IntLiteral     = [0-9_]+  |  0x[0-9a-fA-F_]+  |  0b[01_]+
LongLiteral    = IntLiteral 'L'
FloatLiteral   = [0-9_]* '.' [0-9_]+ ('f' | 'F')
DoubleLiteral  = [0-9_]* '.' [0-9_]+
BooleanLiteral = 'true' | 'false'
NullLiteral    = 'null'
StringLiteral  = '"' char* '"'
               | '"""' char* '"""'    // raw / multi-line string
```

### 3.5 String templates

```
StringTemplate = '"' (char | '$' identifier | '${' expr '}')* '"'
```

### 3.6 Automatic semicolon insertion (ASI)

A newline inserts a synthetic semicolon after: identifiers, integer/float/string literals, `true`, `false`, `null`, `this`, `super`, `)`, `]`, `}`, `++`, `--`, `!!`.

---

## 4 Types

### 4.1 Built-in types

| Jalvin | TypeScript |
|--------|-----------|
| `Int` | `number` |
| `Long` | `bigint` |
| `Float` / `Double` | `number` |
| `Boolean` | `boolean` |
| `String` | `string` |
| `Char` | `string` |
| `Unit` | `void` |
| `Any` | `unknown` |
| `Nothing` | `never` |

### 4.2 Nullable types

```
T?       — T or null or undefined
value?.member     — safe member access (short-circuits to null)
value ?: default  — Elvis (null coalescing, emits ??)
value!!           — non-null assertion (throws NullPointerException at runtime)
```

### 4.3 Generic types

```
List<T>          — ReadonlyArray<T>
MutableList<T>   — Array<T>
Set<T>           — ReadonlySet<T>
MutableSet<T>    — Set<T>
Map<K,V>         — ReadonlyMap<K,V>
MutableMap<K,V>  — Map<K,V>
Deferred<T>      — Promise<T>
StateFlow<T>     — StateFlow<T>  (@jalvin/runtime)
```

### 4.4 Function types

```
(Int, String) -> Boolean
suspend () -> Unit
```

---

## 5 Declarations

### 5.1 Functions

```
fun name(param: Type, param2: Type = default): ReturnType {
    // body
}

// Expression body
fun square(x: Int) = x * x

// Suspend function (compiles to async function)
suspend fun loadData(): String {
    delay(100)
    return "data"
}
```

### 5.2 Component functions (UI)

```
component fun CounterButton(label: String, count: Int) {
    return Button(text = "$label: $count")
}
```

Components may compose other components and layout primitives using function call syntax:

```
component fun Greeting(name: String) {
    return Column(spacing = 8) {
        Text(text = "Hello, $name!", style = TextStyle.headlineLarge)
        Text(text = "Welcome to Jalvin.")
    }
}
```

Compiles to a React functional component. The component receives a typed props interface automatically generated from its parameters.

### 5.3 Properties

```
val name: String = "Jalvin"      // immutable (const/readonly)
var count: Int = 0               // mutable

const val MAX_SIZE: Int = 1024   // compile-time constant; emits TS const
lateinit var db: Database        // late-init; no initializer required at declaration

// Delegated properties
val lazy by lazy { expensiveInit() }
var observed by Delegates.observable(0) { _, old, new -> println("$old → $new") }
```

### 5.4 Classes

```
class Greeter(val name: String) {
    fun greet() = "Hello, $name!"
}
```

Primary constructor params marked `val`/`var` become properties.

### 5.5 Data classes

```
data class Point(val x: Double, val y: Double)
```

Auto-generates: `copy(…)`, `equals(other)`, `toString()`, `hashCode()`.

### 5.6 Sealed classes

```
sealed class Result<out T> {
    data class Success<T>(val value: T) : Result<T>()
    data class Failure(val error: Throwable) : Result<Nothing>()
    object Loading : Result<Nothing>()
}
```

Compiles to an abstract TypeScript base class plus subtypes. `when` on a sealed class is exhaustiveness-checked.

### 5.7 Interfaces

```
interface Drawable {
    fun draw(): Unit
    val width: Int
}
```

### 5.8 Objects (singletons)

```
object Logger {
    fun log(msg: String) = println("[LOG] $msg")
}
```

Compiles to a `const` holding an anonymous class instance.

### 5.9 Companion objects

```
class User private constructor(val id: String) {
    companion object {
        fun create(id: String) = User(id)
    }
}
```

### 5.10 Type aliases

```
typealias UserId = String
typealias Handler<T> = (T) -> Unit
```

### 5.11 Extension functions

```
fun String.shout() = toUpperCase() + "!!!"
fun List<Int>.sumSquares() = sumOf { it * it }
```

Compiles to a module-level function with the receiver as the first parameter, then monkeypatched onto the prototype.

### 5.12 Enum classes

```
enum class Direction {
    NORTH, SOUTH, EAST, WEST
}

// With constructor params
enum class Planet(val mass: Double, val radius: Double) {
    MERCURY(3.303e+23, 2.4397e6),
    VENUS(4.869e+24, 6.0518e6),
    EARTH(5.976e+24, 6.37814e6)
}
```

Enum entries are static singleton instances of the class. Companion methods `values()` and `valueOf(name)` are auto-generated. `when` on an enum is **not** exhaustiveness-checked (use `sealed class` for exhaustive matching).

### 5.13 Destructuring declarations

```
val (x, y) = point                 // destructures component1/component2
val (user, posts) = fetchUserAndPosts("42")
val (_, value) = pair              // _ discards a slot
var (a, b) = mutablePair
```

Compiles to: `const [x, y] = point;`

### 5.14 Scope functions

Jalvin ships five scope functions from the runtime:

| Function | Context object | Return value | Use-case |
|----------|----------------|--------------|----------|
| `let`    | `it`           | block result | null-safe chain, local transformation |
| `run`    | `this`         | block result | object init + compute result |
| `apply`  | `this`         | original obj | builder pattern |
| `also`   | `it`           | original obj | side effects (logging, debugging) |
| `with`   | `this`         | block result | grouping calls on a single object |

```
val result = someNullable?.let { it.transform() } ?: default

val textView = TextView().apply {
    text = "Hello"
    textSize = 16.0
}
```

Also available: `takeIf { predicate }` and `takeUnless { predicate }`.

---

## 6 Control flow

### 6.1 if / else (expression and statement)

```
val max = if (a > b) a else b

if (x > 0) {
    println("positive")
} else if (x < 0) {
    println("negative")
} else {
    println("zero")
}
```

### 6.2 when (expression and statement)

```
// Pattern matching
when (shape) {
    is Circle    -> println("Circle r=${shape.radius}")
    is Rectangle -> println("Rect ${shape.w}x${shape.h}")
    else         -> println("Unknown shape")
}

// Value matching
val label = when (status) {
    200 -> "OK"
    404 -> "Not Found"
    500 -> "Server Error"
    else -> "Unknown"
}

// Range matching
when (score) {
    in 90..100 -> "A"
    in 80..89  -> "B"
    in 70..79  -> "C"
    else       -> "F"
}
```

`when` on sealed class branches is exhaustiveness-checked at compile time — the `else` branch is not required when all variants are covered.

### 6.3 for loops

```
for (item in list) { }
for (i in 0..9) { }         // inclusive range
for (i in 0..<10) { }       // exclusive range
for ((key, value) in map) { }
for ((index, value) in list.withIndex()) { }
```

### 6.4 while / do-while

```
while (condition) { }
do { } while (condition)
```

### 6.5 try / catch / finally (expression and statement)

```
val result = try {
    riskyOperation()
} catch (e: IOException) {
    null
} finally {
    cleanup()
}
```

---

## 6.5 Smart Casts

After a successful `is` check the compiler narrows the type of the checked expression inside the guarded scope — no explicit cast needed.

```
fun describe(obj: Any): String {
    return if (obj is String) {
        obj.uppercase()          // obj is narrowed to String here
    } else if (obj is Int) {
        "Number: $obj"           // obj is narrowed to Int here
    } else {
        obj.toString()
    }
}
```

Multiple narrowings may be combined with `&&`:

```
if (x is String && y is Int) {
    println(x.length + y)        // both narrowed
}
```

The negated form (`!is`) does **not** narrow the positive branch (narrowing inside the `else` block is not yet implemented).

---

## 6.6 Lambdas and higher-order functions

```
val doubled = listOf(1, 2, 3).map { it * 2 }    // trailing lambda with implicit `it`
val filtered = doubled.filter { x -> x > 2 }    // explicit parameter
```

### Trailing lambda syntax

If the last parameter of a function is a function type, the lambda may be passed outside the parentheses:

```
val result = run { computeSomething() }
listOf(1, 2, 3).forEach { println(it) }
```

### Implicit `it` parameter

When a lambda has exactly one parameter and no explicit parameter list, the compiler synthesises an `it` binding whose type is inferred from context.

---

## 7 Coroutines

### 7.1 suspend fun

A `suspend fun` compiles to an `async function`. It may only be called from another suspend context or from `launch {}` / `async {}`.

### 7.2 launch {}

Fire-and-forget. Returns a `Job`.

```
launch {
    val data = loadData()
    println(data)
}
```

Compiles to: `(async () => { … })()`

### 7.3 async {}

Returns a `Deferred<T>`.

```
val result: Deferred<Int> = async { heavyCompute() }
val value = result.await()
```

### 7.4 delay

```
delay(1_000)   // suspend for 1 second
```

### 7.5 withContext

```
val result = withContext(Dispatchers.IO) {
    readFile("data.json")
}
```

All Dispatchers are no-ops in JS (same event loop).

### 7.6 CoroutineScope

```
val scope = CoroutineScope()
scope.launch { ... }
scope.cancel()
```

---

## 8 Bibi HTTP client

Bibi is always capitalised — a convention of the Jalvin language.

```
// Create a client
val api = Bibi("https://api.example.com") {
    timeout(5_000)
    headers { "Accept" to "application/json" }
    bearer(token)
}

// GET
val response = api.get("/users/1")
val user = response.body()

// POST
val created = api.post("/users", body = newUser).body()

// DELETE
api.delete("/users/1")
```

Bibi throws `BibiError` on non-2xx responses. Use try/catch or `?.` chaining.

---

## 9 Standard Library (Collections)

Jalvin ships collection extension functions as part of `@jalvin/runtime`. All functions operate on plain JavaScript arrays and strings — no wrapper types needed.

### 9.1 Transformations

| Function | Signature | Description |
|----------|-----------|-------------|
| `map` | `<A,B>(xs: A[], fn: (A) => B) => B[]` | Transform each element |
| `flatMap` | `<A,B>(xs: A[], fn: (A) => B[]) => B[]` | Map then flatten |
| `flatten` | `<A>(xs: A[][]) => A[]` | Flatten one level |
| `filter` | `<A>(xs: A[], p: (A) => boolean) => A[]` | Keep matching elements |
| `filterNotNull` | `<A>(xs: (A|null|undefined)[]) => A[]` | Remove nulls |
| `groupBy` | `<A,K>(xs: A[], key: (A) => K) => Map<K,A[]>` | Partition into groups |
| `associate` | `<A,K,V>(xs: A[], fn: (A) => [K,V]) => Map<K,V>` | Build a Map |
| `zip` | `<A,B>(a: A[], b: B[]) => [A,B][]` | Zip two lists |
| `chunked` | `<A>(xs: A[], n: number) => A[][]` | Partition into chunks |
| `windowed` | `<A>(xs: A[], n: number) => A[][]` | Sliding window |
| `partition` | `<A>(xs: A[], p: (A) => boolean) => [A[], A[]]` | Split by predicate |
| `withIndex` | `<A>(xs: A[]) => {index, value}[]` | Index each element |
| `reversed` | `<A>(xs: A[]) => A[]` | Reverse order |
| `sortedBy` | `<A,B>(xs: A[], key: (A) => B) => A[]` | Sort ascending by key |
| `sortedByDescending` | `<A,B>(xs: A[], key: (A) => B) => A[]` | Sort descending by key |
| `distinct` | `<A>(xs: A[]) => A[]` | Remove duplicates |
| `distinctBy` | `<A,K>(xs: A[], key: (A) => K) => A[]` | Remove duplicates by key |

### 9.2 Aggregations

| Function | Description |
|----------|-------------|
| `fold(xs, initial) { acc, it -> ... }` | Reduce with initial value |
| `reduce(xs) { acc, it -> ... }` | Reduce without initial (throws on empty) |
| `sumOf(xs) { it.amount }` | Sum a numeric projection |
| `minOf(xs) { it.score }` | Minimum projection value |
| `maxOf(xs) { it.score }` | Maximum projection value |
| `count(xs) { it > 0 }` | Count matching elements |
| `any(xs) { it.active }` | True if any match |
| `all(xs) { it.valid }` | True if all match |
| `none(xs) { it.deleted }` | True if none match |
| `joinToString(xs, sep)` | Join elements to String |

### 9.3 Element access

| Function | Description |
|----------|-------------|
| `first(xs)` | First element, throws if empty |
| `firstOrNull(xs)` / `firstOrNull(xs) { pred }` | First matching element or null |
| `last(xs)` | Last element, throws if empty |
| `lastOrNull(xs)` | Last element or null |
| `find(xs) { pred }` | First matching element or null |
| `findLast(xs) { pred }` | Last matching element or null |
| `take(xs, n)` | First n elements |
| `takeWhile(xs) { pred }` | Elements while predicate holds |
| `drop(xs, n)` | Skip first n elements |
| `dropWhile(xs) { pred }` | Skip elements while predicate holds |
| `minOrNull(xs)` / `maxOrNull(xs)` | Min/max or null on empty list |

### 9.4 Pairs and Triples

```
val pair: Pair<String, Int> = Pair("age", 30)
val (key, value) = pair                // destructuring
println(pair)                          // (age, 30)

val triple = Triple(1, 2, 3)
val (a, b, c) = triple
```

### 9.5 String helpers

```
trimIndent()       // remove common leading whitespace (for raw strings)
"x".repeat(3)      // "xxx"
" ".isBlank()      // true
"".isNotBlank()    // false
"123".toIntOrNull()    // 3 (Int?) 
"abc".toIntOrNull()    // null
```

### 9.6 Numeric helpers

```
x.coerceAtLeast(0)     // max(x, 0)
x.coerceAtMost(100)    // min(x, 100)
x.coerceIn(0, 100)     // clamp

Int.MAX_VALUE          // 2147483647
Long.MIN_VALUE         // -9007199254740991
```

---

## 10 State & MVVM

### 10.1 MutableStateFlow / StateFlow

```
val count = MutableStateFlow(0)
count.update { it + 1 }
count.value = 42

// Collect (subscribe)
val unsub = count.collect { v -> println(v) }
unsub()  // unsubscribe
```

### 10.2 ViewModel

```
class AppViewModel : ViewModel() {
    val items = MutableStateFlow<List<String>>(emptyList())

    suspend fun refresh() {
        val data = api.get<List<String>>("/items").body()
        items.value = data
    }

    override fun onCleared() {
        println("ViewModel cleared")
    }
}
```

### 10.3 Component hooks (React targets)

```
mutableStateOf(initial)          // useState wrapper returning MutableState<T>
remember { compute() }           // useMemo wrapper
collectAsState(flow)             // subscribe to StateFlow, triggers re-render
useViewModel("key") { MyVm() }  // get/create ViewModel for component lifecycle
LaunchedEffect(deps) { ... }    // useEffect with suspend body
DisposableEffect(deps) { cleanup }
SideEffect { ... }
```

---

## 11 Null safety

| Syntax | Meaning |
|--------|---------|
| `T?` | Nullable type |
| `value?.member` | Safe member access — null if value is null |
| `value ?: default` | Elvis — use default if value is null |
| `value!!` | Assert non-null — throws `NullPointerException` at runtime |
| `value as? T` | Safe cast — returns null if cast fails |

The type checker emits `E_UNSAFE_NULL_DEREFERENCE` if you call `.member` on a `T?` without safe access.

---

## 12 Imports

```
import java.io.File
import @jalvin/runtime.*          // star import
import @jalvin/runtime.Bibi       // named import
import SomeClass as Alias
```

Paths starting with `@` or relative paths (`./ ../`) are treated as npm/ESM module paths. Others are treated as package-qualified class paths.

---

## 13 JALVIN configuration file

Place a `JALVIN` file (no extension, all caps) at your project root:

```
# Jalvin project configuration
name        = my-app
version     = 1.0.0
rootDir     = src
outDir      = dist
jsx         = true
emitTypes   = false
```

---

## 14 Error codes

| Code | Meaning |
|------|---------|
| E0001 | Unterminated string literal |
| E0002 | Unterminated block comment |
| E0010 | Unexpected character |
| E0100 | Unexpected token |
| E0101 | Expected expression |
| E0200 | Undefined variable |
| E0201 | Type mismatch |
| E0202 | Not callable |
| E0210 | Unsafe null dereference (use `?.`) |
| E0211 | `!!` on non-nullable type |
| E0212 | `lateinit var` accessed before initialization |
| E0220 | `suspend` call outside suspend context |
| E0221 | `await` outside `async` block |
| E0300 | Non-exhaustive `when` on sealed class |
| E0310 | Duplicate `when` branch |
| E0320 | Assignment to `const val` |
| E0321 | `lateinit` applied to non-var or primitive type |
| W0001 | Unused variable |
| W0002 | Unreachable code |
| W0003 | Implicit `Any` type (missing annotation) |
| W0004 | Deprecated API |

---

## 14 Grammar (EBNF excerpt)

```ebnf
program       ::= import* topLevelDecl*

topLevelDecl  ::= funDecl
               |  componentDecl
               |  classDecl
               |  dataClassDecl
               |  sealedClassDecl
               |  enumClassDecl
               |  interfaceDecl
               |  objectDecl
               |  typeAliasDecl
               |  propertyDecl
               |  destructuringDecl
               |  extensionFunDecl

funDecl          ::= modifiers 'fun' typeParams? name '(' params ')' (':' type)? ('=' expr | block)
componentDecl    ::= modifiers 'component' 'fun' name '(' params ')' block
classDecl        ::= modifiers 'class' name typeParams? primaryCtor? superTypes? classBody
dataClassDecl    ::= modifiers 'data' 'class' name typeParams? '(' params ')' superTypes? classBody?
sealedClassDecl  ::= modifiers 'sealed' 'class' name typeParams? superTypes? classBody
enumClassDecl    ::= modifiers 'enum' 'class' name typeParams? primaryCtor? superTypes? '{' enumEntry (',' enumEntry)* (';' classMember*)? '}'
enumEntry        ::= name ('(' args ')')? classBody?
destructuringDecl ::= ('val' | 'var') '(' destructureSlot (',' destructureSlot)* ')' '=' expr
destructureSlot  ::= ('_' | name) (':' type)?

expr          ::= orExpr (('?:') orExpr)*
orExpr        ::= andExpr ('||' andExpr)*
andExpr       ::= eqExpr ('&&' eqExpr)*
eqExpr        ::= relExpr (('==' | '!=' | '===' | '!==') relExpr)?
relExpr       ::= addExpr (('<' | '>' | '<=' | '>=' | 'is' | '!is' | 'in' | '!in') addExpr)?
addExpr       ::= mulExpr (('+' | '-') mulExpr)*
mulExpr       ::= unaryExpr (('*' | '/' | '%') unaryExpr)*
unaryExpr     ::= ('!' | '-' | '+' | '++' | '--') unaryExpr | postfixExpr
postfixExpr   ::= primaryExpr ('.' member | '?.' member | '[' expr ']' | '!!' | call)*
primaryExpr   ::= literal | name | 'this' | 'super' | '(' expr ')'
               |  ifExpr | whenExpr | tryExpr | lambdaExpr
               |  'launch' block | 'async' block

whenExpr      ::= 'when' ('(' expr ')')? '{' whenBranch* '}'
whenBranch    ::= (whenCond (',' whenCond)* | 'else') '->' (expr | block)
whenCond      ::= 'is' type | '!is' type | 'in' expr | '!in' expr | expr
```

---

## 15 Annotations

Annotations modify declarations. Jalvin uses `@Name` or `@Name("arg")` syntax before any modifier.

### 15.1 Built-in annotations

| Annotation | Purpose |
|------------|---------|
| `@Nuked("reason")` | Marks a declaration as deprecated. Emits a JSDoc `@deprecated` comment and a `W0004` warning at every call site. |

```jalvin
@Nuked("Use newApi() instead")
fun oldApi(): String = "legacy"

val x = oldApi()   // W0004: 'oldApi' is @Nuked: Use newApi() instead
```

Custom annotations are passed through and silently ignored by the compiler unless they match a known built-in.

---

## 16 `final` modifier

By default, top-level `class` declarations are open for extension. The `final` modifier prevents subclassing.

```jalvin
final class Config(val host: String, val port: Int)
// error: 'Config' is final and cannot be subclassed
```

---

## 17 Ranges and progressions

### 17.1 Range operators

| Expression | Type | Semantics |
|------------|------|-----------|
| `a..b` | `IntRange` | Inclusive range `[a, b]`, step +1 |
| `a..<b` | `IntRange` | Exclusive range `[a, b)`, step +1 |
| `a downTo b` | `IntRange` | Descending range `[a, b]`, step -1 |
| `a until b` | `IntRange` | Exclusive ascending range `[a, b)`, step +1 |

`downTo` and `until` are infix functions desugared at parse time:
- `a downTo b` → `downTo(a, b)` in generated TypeScript
- `a until b` → `range(a, b, false)` in generated TypeScript

### 17.2 Step

```jalvin
for (i in 0..20 step 2) println(i)   // 0, 2, 4 … 20
for (i in 10 downTo 0 step 3) println(i)
```

The `.step(n)` call on an `IntRange` creates a new range with a different step size.

### 17.3 `IntRange` API

```jalvin
val r = 1..10
r.contains(5)      // true
r.first()          // 1
r.last()           // 10
r.count()          // 10
r.toList()         // [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
```

---

## 18 Structural equality (`==`)

| Expression | Semantics |
|------------|-----------|
| `a == b` | Structural equality — calls `a.equals(b)` if available, then `===` |
| `a != b` | `!(a == b)` |
| `a === b` | Reference equality (JS strict equality) |
| `a !== b` | `!(a === b)` |

Data classes automatically get `.equals()` based on all primary constructor properties.

```jalvin
data class Point(val x: Int, val y: Int)
val p1 = Point(1, 2)
val p2 = Point(1, 2)
println(p1 == p2)   // true
println(p1 === p2)  // false (different references)
```

---

## 19 `Result<T>` and `runCatching`

`Result<T>` is a value type that holds either a successful value or an exception. It follows the standard `Result<T>` pattern.

```jalvin
val result = runCatching { fetchUser(id) }

result
  .onSuccess { user -> println("Got: $user") }
  .onFailure { e -> println("Failed: $e") }

val user: User? = result.getOrNull()
val user2: User = result.getOrDefault(defaultUser)
val user3: User = result.getOrThrow()   // re-throws on failure

// Transform the success value
val name: Result<String> = result.map { it.name }

// Recover from failure
val safe: Result<User> = result.recover { defaultUser }

// Fold to a single value
val label: String = result.fold(
  onSuccess = { "Hello, ${it.name}" },
  onFailure = { "Error: $it" }
)
```

`runCatchingAsync` is the `suspend` variant for async blocks.

---

## 20 `Regex`

```jalvin
val re = Regex("[0-9]+")
re.matches("123")            // true (full match)
re.containsMatchIn("abc 42") // true
re.find("hello 42 world")?.value   // "42"
re.findAll("1 2 3").map { it.value }  // ["1", "2", "3"]
re.replace("hello world", "X")
re.split("a,b,,c", limit = 3)  // ["a", "b", ",c"]
```

---

## 21 String and collection builders

### 21.1 `buildString {}`

```jalvin
val msg = buildString {
  append("Hello, ")
  append(name)
  appendLine("!")
}
```

### 21.2 `buildList {}`, `buildSet {}`, `buildMap {}`

```jalvin
val evens = buildList<Int> {
  for (i in 0..10) if (i % 2 == 0) add(i)
}

val m = buildMap<String, Int> {
  put("a", 1)
  put("b", 2)
}
```

---

## 22 Coroutine builders

### 22.1 `coroutineScope {}`

Creates a child coroutine scope. The block suspends until all launched child jobs complete. Any failure in a child cancels all siblings and re-throws.

```jalvin
suspend fun fetchAll(): List<User> = coroutineScope {
  val a = async { api.getUser(1) }
  val b = async { api.getUser(2) }
  listOf(a.await(), b.await())
}
```

### 22.2 `supervisorScope {}`

Like `coroutineScope` but child failures are independent — one failing child does not cancel others.

---

## 23 Timing utilities

```jalvin
val ms: Long = measureTimeMillis {
  heavyComputation()
}

val (result, duration) = measureTimedValue {
  heavyComputation()
}
println("Took ${duration}ms, got $result")
```

---

## 24 `Random`

```jalvin
val rng = Random()
rng.nextInt(10)       // [0, 10)
rng.nextInt(1, 6)     // [1, 6)
rng.nextDouble()      // [0.0, 1.0)
rng.nextBoolean()

val id = randomUUID() // RFC 4122 v4 UUID string
```

---

## 25 Exhaustive `when` on enum classes

`when` on an `enum class` subject must cover all entries (or supply an `else`). Missing entries produce `E0300`.

```jalvin
enum class Color { Red, Green, Blue }

fun describe(c: Color): String = when (c) {
  Color.Red   -> "stop"
  Color.Green -> "go"
  Color.Blue  -> "caution"
  // no else needed — all cases covered
}
```
