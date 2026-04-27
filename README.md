# Jalvin

A statically-typed programming language that compiles to TypeScript/TSX — and targets web, Android, iOS, Wear OS, CarPlay, and beyond.

```jalvin
component fun HelloWorld(name: String) {
    return Column(spacing = 8) {
        Text(text = "Hello, $name!", style = TextStyle.headlineLarge)
    }
}

suspend fun main() {
    val user = Bibi("https://api.example.com").get("/me").body()
    println("Welcome back, ${user.name}!")
}
```

---

## Features

| Feature | Description |
|---------|-------------|
| `component fun` | React-compatible UI components — no `@Composable` annotation |
| `Bibi(url) { }` | Built-in HTTP client — always capitalised |
| `suspend fun` / `launch {}` | Coroutines over the JS event loop |
| `StateFlow` + `ViewModel` | First-class reactive state management |
| `data class` | Auto-generated `copy()`, `equals()`, `toString()`, `hashCode()` |
| `sealed class` + `when` | Exhaustive pattern matching, compile-time checked |
| Extension functions | `fun String.shout() = ...` |
| Null safety | `T?`, `?.`, `?:`, `!!` — checks enforced by the type checker |
| npm interop | Import any npm package; drop `.jalvin` files into Vite/webpack projects |
| `JALVIN` config | Top-level project config file — no extension, all caps |

---

## Installation

```bash
npm install -g @jalvin/cli
```

Or add to a project:

```bash
npm install --save-dev @jalvin/cli
npm install @jalvin/runtime
```

---

## Quick start

```bash
jalvin init my-app
cd my-app
npm install
jalvin run src/main.jalvin
```

---

## Compiling

```bash
jalvin build                  # compile src/ → dist/
jalvin build src/Counter.jalvin --out dist/
jalvin check                  # type-check without emitting
jalvin version
```

---

## Vite integration

```bash
npm install --save-dev @jalvin/vite-plugin
```

**vite.config.ts**
```ts
import { defineConfig } from "vite";
import jalvin from "@jalvin/vite-plugin";

export default defineConfig({
  plugins: [jalvin()],
});
```

Now import `.jalvin` files directly:

```ts
import { Counter } from "./Counter.jalvin";
```

---

## Webpack integration

```bash
npm install --save-dev @jalvin/webpack-plugin
```

**webpack.config.js**
```js
const JalvinPlugin = require("@jalvin/webpack-plugin");

module.exports = {
  plugins: [new JalvinPlugin()],
};
```

---

## Language quick reference

### Functions

```jalvin
fun greet(name: String): String = "Hello, $name!"

suspend fun loadUser(id: Int): User {
    delay(100)
    return Bibi("https://api.example.com").get("/users/$id").body()
}
```

### Component functions

```jalvin
component fun Counter(initial: Int = 0) {
    var count = mutableStateOf(initial)

    return Column(spacing = 8) {
        Text(text = "${count.value}")
        Row(spacing = 8) {
            Button(text = "+", onClick = { count.value++ })
            Button(text = "-", onClick = { count.value-- })
        }
    }
}
```

### Data classes

```jalvin
data class User(val id: Int, val name: String, val email: String?)

val user = User(1, "Alice", null)
val copy = user.copy(email = "alice@example.com")
println(user)   // User(id=1, name=Alice, email=null)
```

### Sealed classes + when

```jalvin
sealed class ApiResult<out T> {
    data class Success<T>(val data: T)  : ApiResult<T>()
    data class Error(val message: String) : ApiResult<Nothing>()
    object Loading : ApiResult<Nothing>()
}

when (result) {
    is ApiResult.Success -> showData(result.data)
    is ApiResult.Error   -> showError(result.message)
    is ApiResult.Loading -> showSpinner()
}
```

### Bibi HTTP client

```jalvin
// Create a client
val api = Bibi("https://api.example.com") {
    timeout(5_000)
    headers { "Accept" to "application/json" }
    bearer(token)
}

suspend fun createUser(user: NewUser): User {
    return api.post("/users", body = user).body()
}
```

### Coroutines

```jalvin
// Fire and forget
launch {
    val report = generateReport()
    saveReport(report)
}

// Parallel execution
val (a, b) = Pair(
    async { fetchA() }.await(),
    async { fetchB() }.await()
)

// Repeat with delay
launch {
    repeat(10) { i ->
        delay(1_000)
        println("tick $i")
    }
}
```

### Null safety

```jalvin
val name: String? = findUser()?.name
val display = name ?: "Anonymous"
val upper = name!!.uppercase()    // throws if null
val safe = name?.uppercase()      // null if name is null
```

### Extension functions

```jalvin
fun String.isPalindrome(): Boolean = this == this.reversed()
fun List<Int>.product(): Int = fold(1) { acc, n -> acc * n }

println("racecar".isPalindrome())  // true
println(listOf(2, 3, 4).product()) // 24
```

---

## Project structure

```
jalvin/
├── JALVIN                        ← project configuration
├── src/
│   ├── main.jalvin
│   ├── components/
│   │   └── Counter.jalvin
│   └── viewmodels/
│       └── AppViewModel.jalvin
└── package.json
```

**JALVIN** config file:
```
name     = my-app
version  = 1.0.0
rootDir  = src
outDir   = dist
jsx      = true
```

---

## Packages

| Package | Description |
|---------|-------------|
| `@jalvin/compiler` | Jalvin compiler (lexer → parser → typechecker → codegen) |
| `@jalvin/runtime` | Runtime library (Bibi, coroutines, StateFlow, ViewModel, stdlib shims) |
| `@jalvin/cli` | `jalvin` CLI — build, check, run, init |
| `@jalvin/vite-plugin` | Vite plugin — import `.jalvin` in Vite projects |
| `@jalvin/webpack-plugin` | Webpack loader for `.jalvin` files |

---

## Contributing

```bash
git clone https://github.com/jalvin-lang/jalvin
cd jalvin
pnpm install
pnpm build
pnpm typecheck
```

See [SPEC.md](./SPEC.md) for the full language specification.

---

## License

MIT
