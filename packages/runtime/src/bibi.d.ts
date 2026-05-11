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
export declare class BibiError extends Error {
    readonly status: number | null;
    readonly response: BibiResponse | null;
    constructor(message: string, status: number | null, response: BibiResponse | null);
}
export declare class BibiRequestBuilder {
    private _baseUrl;
    private _headers;
    private _timeout;
    private _followRedirects;
    private _interceptors;
    constructor(baseUrl: string, configure?: (b: BibiRequestBuilder) => void);
    headers(record: Record<string, string>): this;
    header(key: string, value: string): this;
    timeout(ms: number): this;
    noFollowRedirects(): this;
    intercept(fn: BibiInterceptor): this;
    bearer(token: string): this;
    get<T = unknown>(path: string, opts?: Omit<BibiRequestOptions, "method" | "body">): Promise<BibiResponse<T>>;
    post<T = unknown>(path: string, body?: unknown, opts?: Omit<BibiRequestOptions, "method">): Promise<BibiResponse<T>>;
    put<T = unknown>(path: string, body?: unknown, opts?: Omit<BibiRequestOptions, "method">): Promise<BibiResponse<T>>;
    patch<T = unknown>(path: string, body?: unknown, opts?: Omit<BibiRequestOptions, "method">): Promise<BibiResponse<T>>;
    delete<T = unknown>(path: string, opts?: Omit<BibiRequestOptions, "method" | "body">): Promise<BibiResponse<T>>;
    head(path: string, opts?: Omit<BibiRequestOptions, "method" | "body">): Promise<BibiResponse<never>>;
    /**
     * Resolves the full URL from base + path, appending query params if present.
     */
    private _buildRequestUrl;
    /**
     * Merges headers and serialises the request body.
     * Returns the merged headers map and the serialised BodyInit.
     */
    private _buildRequestInit;
    private _send;
}
export type BibiInterceptor = (url: string, init: RequestInit) => RequestInit | Promise<RequestInit> | null | void;
export declare function Bibi(baseUrl: string, configure?: (b: BibiRequestBuilder) => void): BibiRequestBuilder;
//# sourceMappingURL=bibi.d.ts.map