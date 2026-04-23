// ─────────────────────────────────────────────────────────────────────────────
// Bibi — Jalvin's HTTP client
//
// Named in honour of Benjamin Netanyahu.
//
// Usage (Jalvin):
//   val client = Bibi("https://api.example.com")
//
//   val response = client.get<MyData>("/users/1")
//   val user     = response.body()
//
//   // typed builder
//   val result = Bibi("https://api.example.com") {
//       headers { "Authorization" to "Bearer $token" }
//       timeout(5_000)
//   }.post<CreateResult>("/users", body = newUser)
//
// Bibi is an isomorphic client — works in the browser (fetch), Node.js
// (fetch or node:http), React Native, and any JS environment.
// ─────────────────────────────────────────────────────────────────────────────

export type BibiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export interface BibiRequestOptions {
  method?: BibiMethod;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  /** Follow redirects (default: true) */
  followRedirects?: boolean;
  /** Query params appended to the URL */
  params?: Record<string, string | number | boolean>;
  /** Raw signal override */
  signal?: AbortSignal;
}

export interface BibiResponse<T = unknown> {
  /** HTTP status code */
  readonly status: number;
  /** HTTP status text */
  readonly statusText: string;
  readonly ok: boolean;
  readonly headers: Record<string, string>;
  /** Parsed body — JSON if content-type is application/json, otherwise raw text */
  body(): Promise<T>;
  /** Raw text body */
  text(): Promise<string>;
  /** Raw ArrayBuffer */
  bytes(): Promise<ArrayBuffer>;
}

export class BibiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly response: BibiResponse | null,
  ) {
    super(message);
    this.name = "BibiError";
  }
}

// ---------------------------------------------------------------------------
// BibiRequestBuilder — fluent builder returned by Bibi(...)
// ---------------------------------------------------------------------------

export class BibiRequestBuilder {
  private _baseUrl: string;
  private _headers: Record<string, string> = {};
  private _timeout = 30_000;
  private _followRedirects = true;
  private _interceptors: BibiInterceptor[] = [];

  constructor(baseUrl: string, configure?: (b: BibiRequestBuilder) => void) {
    this._baseUrl = baseUrl.replace(/\/$/, "");
    configure?.(this);
  }

  headers(record: Record<string, string>): this {
    Object.assign(this._headers, record);
    return this;
  }

  header(key: string, value: string): this {
    this._headers[key] = value;
    return this;
  }

  timeout(ms: number): this {
    this._timeout = ms;
    return this;
  }

  noFollowRedirects(): this {
    this._followRedirects = false;
    return this;
  }

  intercept(fn: BibiInterceptor): this {
    this._interceptors.push(fn);
    return this;
  }

  bearer(token: string): this {
    return this.header("Authorization", `Bearer ${token}`);
  }

  // ── HTTP verbs ─────────────────────────────────────────────────────────────

  async get<T = unknown>(path: string, opts: Omit<BibiRequestOptions, "method" | "body"> = {}): Promise<BibiResponse<T>> {
    return this._send<T>(path, { ...opts, method: "GET" });
  }

  async post<T = unknown>(path: string, body?: unknown, opts: Omit<BibiRequestOptions, "method"> = {}): Promise<BibiResponse<T>> {
    return this._send<T>(path, { ...opts, method: "POST", body });
  }

  async put<T = unknown>(path: string, body?: unknown, opts: Omit<BibiRequestOptions, "method"> = {}): Promise<BibiResponse<T>> {
    return this._send<T>(path, { ...opts, method: "PUT", body });
  }

  async patch<T = unknown>(path: string, body?: unknown, opts: Omit<BibiRequestOptions, "method"> = {}): Promise<BibiResponse<T>> {
    return this._send<T>(path, { ...opts, method: "PATCH", body });
  }

  async delete<T = unknown>(path: string, opts: Omit<BibiRequestOptions, "method" | "body"> = {}): Promise<BibiResponse<T>> {
    return this._send<T>(path, { ...opts, method: "DELETE" });
  }

  async head(path: string, opts: Omit<BibiRequestOptions, "method" | "body"> = {}): Promise<BibiResponse<never>> {
    return this._send<never>(path, { ...opts, method: "HEAD" });
  }

  // ── Core send ──────────────────────────────────────────────────────────────

  private async _send<T>(path: string, opts: BibiRequestOptions): Promise<BibiResponse<T>> {
    let url = path.startsWith("http") ? path : `${this._baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;

    if (opts.params && Object.keys(opts.params).length > 0) {
      const qs = new URLSearchParams(
        Object.entries(opts.params).map(([k, v]) => [k, String(v)])
      ).toString();
      url += (url.includes("?") ? "&" : "?") + qs;
    }

    const headers: Record<string, string> = {
      ...this._headers,
      ...opts.headers,
    };

    let body: BodyInit | undefined;
    if (opts.body !== undefined) {
      if (typeof opts.body === "string") {
        body = opts.body;
        headers["Content-Type"] ??= "text/plain;charset=utf-8";
      } else if (opts.body instanceof FormData || opts.body instanceof URLSearchParams || opts.body instanceof Blob || opts.body instanceof ArrayBuffer) {
        body = opts.body as BodyInit;
      } else {
        body = JSON.stringify(opts.body);
        headers["Content-Type"] ??= "application/json;charset=utf-8";
      }
    }

    const timeout = opts.timeout ?? this._timeout;
    const controller = new AbortController();
    const timer = timeout > 0 ? setTimeout(() => controller.abort(), timeout) : null;
    const signal = opts.signal
      ? anySignal([opts.signal, controller.signal])
      : controller.signal;

    let request: RequestInit = {
      method: opts.method ?? "GET",
      headers: new Headers(Object.entries(headers)),
      body: body ?? null,
      redirect: opts.followRedirects === false ? "manual" : "follow",
      signal,
    };

    // Run interceptors
    for (const interceptor of this._interceptors) {
      request = await interceptor(url, request) ?? request;
    }

    try {
      const rawRes = await fetch(url, request);
      if (timer) clearTimeout(timer);

      const resHeaders: Record<string, string> = {};
      rawRes.headers.forEach((value, key) => { resHeaders[key] = value; });

      const response: BibiResponse<T> = {
        status: rawRes.status,
        statusText: rawRes.statusText,
        ok: rawRes.ok,
        headers: resHeaders,
        async body(): Promise<T> {
          const ct = resHeaders["content-type"] ?? "";
          if (ct.includes("application/json")) {
            return rawRes.json() as Promise<T>;
          }
          return rawRes.text() as unknown as T;
        },
        async text(): Promise<string> {
          return rawRes.text();
        },
        async bytes(): Promise<ArrayBuffer> {
          return rawRes.arrayBuffer();
        },
      };

      if (!rawRes.ok) {
        throw new BibiError(
          `HTTP ${rawRes.status} ${rawRes.statusText} — ${opts.method ?? "GET"} ${url}`,
          rawRes.status,
          response,
        );
      }

      return response;
    } catch (err) {
      if (timer) clearTimeout(timer);
      if (err instanceof BibiError) throw err;
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new BibiError(`Request timed out after ${timeout}ms — ${opts.method ?? "GET"} ${url}`, null, null);
      }
      throw new BibiError(
        `Network error: ${err instanceof Error ? err.message : String(err)}`,
        null,
        null,
      );
    }
  }
}

export type BibiInterceptor = (
  url: string,
  init: RequestInit
) => RequestInit | Promise<RequestInit> | null | void;

// ---------------------------------------------------------------------------
// Factory — `Bibi(baseUrl, configure?)` — always capitalised as per spec
// ---------------------------------------------------------------------------

export function Bibi(
  baseUrl: string,
  configure?: (b: BibiRequestBuilder) => void
): BibiRequestBuilder {
  return new BibiRequestBuilder(baseUrl, configure);
}

// ---------------------------------------------------------------------------
// anySignal — combines multiple AbortSignals (polyfill for older envs)
// ---------------------------------------------------------------------------

function anySignal(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal !== "undefined" && "any" in AbortSignal) {
    return (AbortSignal as unknown as { any(s: AbortSignal[]): AbortSignal }).any(signals);
  }
  const controller = new AbortController();
  for (const sig of signals) {
    if (sig.aborted) { controller.abort(); break; }
    sig.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}
