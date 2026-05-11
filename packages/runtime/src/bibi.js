// ─────────────────────────────────────────────────────────────────────────────
// Bibi — Jalvin's built-in HTTP client
//
// Usage (Jalvin):
//   val client = Bibi("https://api.example.com")
//
//   val response = client.get<MyData>("/users/1")
//   val user     = response.body()
//
//   // Typed builder with configuration
//   val result = Bibi("https://api.example.com") {
//       headers { "Authorization" to "Bearer $token" }
//       timeout(5_000)
//   }.post<CreateResult>("/users", body = newUser)
//
// Bibi is isomorphic — works in the browser (fetch), Node.js, and any
// JS environment with a global `fetch`.
// ─────────────────────────────────────────────────────────────────────────────
/** Default request timeout in milliseconds. Override per-request or at the builder level. */
const DEFAULT_TIMEOUT_MS = 30_000;
export class BibiError extends Error {
    status;
    response;
    constructor(message, status, response) {
        super(message);
        this.status = status;
        this.response = response;
        this.name = "BibiError";
    }
}
// ---------------------------------------------------------------------------
// BibiRequestBuilder — fluent builder returned by Bibi(...)
// ---------------------------------------------------------------------------
export class BibiRequestBuilder {
    _baseUrl;
    _headers = {};
    _timeout = DEFAULT_TIMEOUT_MS;
    _followRedirects = true;
    _interceptors = [];
    constructor(baseUrl, configure) {
        this._baseUrl = baseUrl.replace(/\/$/, "");
        configure?.(this);
    }
    headers(record) {
        Object.assign(this._headers, record);
        return this;
    }
    header(key, value) {
        this._headers[key] = value;
        return this;
    }
    timeout(ms) {
        this._timeout = ms;
        return this;
    }
    noFollowRedirects() {
        this._followRedirects = false;
        return this;
    }
    intercept(fn) {
        this._interceptors.push(fn);
        return this;
    }
    bearer(token) {
        return this.header("Authorization", `Bearer ${token}`);
    }
    // ── HTTP verbs ─────────────────────────────────────────────────────────────
    async get(path, opts = {}) {
        return this._send(path, { ...opts, method: "GET" });
    }
    async post(path, body, opts = {}) {
        return this._send(path, { ...opts, method: "POST", body });
    }
    async put(path, body, opts = {}) {
        return this._send(path, { ...opts, method: "PUT", body });
    }
    async patch(path, body, opts = {}) {
        return this._send(path, { ...opts, method: "PATCH", body });
    }
    async delete(path, opts = {}) {
        return this._send(path, { ...opts, method: "DELETE" });
    }
    async head(path, opts = {}) {
        return this._send(path, { ...opts, method: "HEAD" });
    }
    // ── Core send ──────────────────────────────────────────────────────────────
    /**
     * Resolves the full URL from base + path, appending query params if present.
     */
    _buildRequestUrl(path, params) {
        let url = path.startsWith("http")
            ? path
            : `${this._baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
        if (params && Object.keys(params).length > 0) {
            const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
            url += (url.includes("?") ? "&" : "?") + qs;
        }
        return url;
    }
    /**
     * Merges headers and serialises the request body.
     * Returns the merged headers map and the serialised BodyInit.
     */
    _buildRequestInit(body, headers) {
        const merged = { ...this._headers, ...headers };
        let serialisedBody = null;
        if (body !== undefined) {
            if (typeof body === "string") {
                serialisedBody = body;
                merged["Content-Type"] ??= "text/plain;charset=utf-8";
            }
            else if (body instanceof FormData ||
                body instanceof URLSearchParams ||
                body instanceof Blob ||
                body instanceof ArrayBuffer) {
                serialisedBody = body;
            }
            else {
                serialisedBody = JSON.stringify(body);
                merged["Content-Type"] ??= "application/json;charset=utf-8";
            }
        }
        return { headers: merged, body: serialisedBody };
    }
    async _send(path, opts) {
        const url = this._buildRequestUrl(path, opts.params);
        const { headers, body } = this._buildRequestInit(opts.body, opts.headers ?? {});
        const timeout = opts.timeout ?? this._timeout;
        const controller = new AbortController();
        const timer = timeout > 0 ? setTimeout(() => controller.abort(), timeout) : null;
        const signal = opts.signal
            ? anySignal([opts.signal, controller.signal])
            : controller.signal;
        let request = {
            method: opts.method ?? "GET",
            headers: new Headers(Object.entries(headers)),
            body,
            redirect: opts.followRedirects === false ? "manual" : "follow",
            signal,
        };
        // Run interceptors
        for (const interceptor of this._interceptors) {
            request = await interceptor(url, request) ?? request;
        }
        try {
            const rawRes = await fetch(url, request);
            if (timer)
                clearTimeout(timer);
            const resHeaders = {};
            rawRes.headers.forEach((value, key) => { resHeaders[key] = value; });
            const response = {
                status: rawRes.status,
                statusText: rawRes.statusText,
                ok: rawRes.ok,
                headers: resHeaders,
                async body() {
                    const ct = resHeaders["content-type"] ?? "";
                    if (ct.includes("application/json")) {
                        return rawRes.json();
                    }
                    return rawRes.text();
                },
                async text() {
                    return rawRes.text();
                },
                async bytes() {
                    return rawRes.arrayBuffer();
                },
            };
            if (!rawRes.ok) {
                throw new BibiError(`HTTP ${rawRes.status} ${rawRes.statusText} — ${opts.method ?? "GET"} ${url}`, rawRes.status, response);
            }
            return response;
        }
        catch (err) {
            if (timer)
                clearTimeout(timer);
            if (err instanceof BibiError)
                throw err;
            if (err instanceof DOMException && err.name === "AbortError") {
                throw new BibiError(`Request timed out after ${timeout}ms — ${opts.method ?? "GET"} ${url}`, null, null);
            }
            throw new BibiError(`Network error: ${err instanceof Error ? err.message : String(err)}`, null, null);
        }
    }
}
// ---------------------------------------------------------------------------
// Factory — `Bibi(baseUrl, configure?)` — always capitalised as per spec
// ---------------------------------------------------------------------------
export function Bibi(baseUrl, configure) {
    return new BibiRequestBuilder(baseUrl, configure);
}
// ---------------------------------------------------------------------------
// anySignal — combines multiple AbortSignals (polyfill for older envs)
// ---------------------------------------------------------------------------
function anySignal(signals) {
    if (typeof AbortSignal !== "undefined" && "any" in AbortSignal) {
        return AbortSignal.any(signals);
    }
    const controller = new AbortController();
    for (const sig of signals) {
        if (sig.aborted) {
            controller.abort();
            break;
        }
        sig.addEventListener("abort", () => controller.abort(), { once: true });
    }
    return controller.signal;
}
//# sourceMappingURL=bibi.js.map