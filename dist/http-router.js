/**
 * Lightweight HTTP Router
 *
 * Minimal router built on top of node:http with path parameter parsing,
 * query string parsing, JSON body parsing, CORS headers, and error handling.
 */
import { URL } from 'node:url';
// ── Helpers ─────────────────────────────────────────────────────────────────
/**
 * Create a JSON success response
 */
export function jsonResponse(data, status = 200) {
    return { status, body: data };
}
/**
 * Create an error response with a status code and message
 */
export function errorResponse(message, status = 500, details) {
    return {
        status,
        body: {
            error: message,
            status,
            ...(details ? { details } : {}),
        },
    };
}
const MAX_BODY_BYTES = 1_048_576; // 1 MB
/**
 * Parse JSON body from request with size limit
 */
function parseBody(req) {
    return new Promise((resolve, reject) => {
        const contentType = req.headers['content-type'] ?? '';
        if (!contentType.includes('application/json')) {
            resolve(undefined);
            return;
        }
        const chunks = [];
        let totalBytes = 0;
        req.on('data', (chunk) => {
            totalBytes += chunk.length;
            if (totalBytes > MAX_BODY_BYTES) {
                req.destroy();
                reject(new Error('Request body too large (max 1 MB)'));
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf-8');
            if (raw.length === 0) {
                resolve(undefined);
                return;
            }
            try {
                resolve(JSON.parse(raw));
            }
            catch {
                reject(new SyntaxError('Invalid JSON in request body'));
            }
        });
        req.on('error', reject);
    });
}
/**
 * Parse query string from a URL
 */
function parseQueryString(url, base) {
    const parsed = new URL(url, base);
    const query = {};
    for (const [key, value] of parsed.searchParams.entries()) {
        query[key] = value;
    }
    return query;
}
/**
 * Split a path into segments, ignoring empty strings from leading/trailing slashes
 */
function splitPath(path) {
    return path.split('/').filter(s => s.length > 0);
}
// ── Router ──────────────────────────────────────────────────────────────────
export class HttpRouter {
    routes = [];
    _errorHandler;
    corsOrigin;
    constructor(options) {
        this.corsOrigin = options?.corsOrigin ?? '*';
        // Default error handler – never leaks internals
        this._errorHandler = (_error, _req) => {
            return errorResponse('Internal Server Error', 500);
        };
    }
    /**
     * Register a route
     */
    route(method, pattern, handler) {
        const segments = splitPath(pattern);
        const paramNames = [];
        for (const seg of segments) {
            if (seg.startsWith(':')) {
                paramNames.push(seg.slice(1));
            }
        }
        this.routes.push({ method, pattern, segments, paramNames, handler });
    }
    /** Convenience: register a GET route */
    get(pattern, handler) {
        this.route('GET', pattern, handler);
    }
    /** Convenience: register a POST route */
    post(pattern, handler) {
        this.route('POST', pattern, handler);
    }
    /**
     * Set a custom error handler
     */
    onError(handler) {
        this._errorHandler = handler;
    }
    /**
     * Match a request against registered routes
     */
    matchRoute(method, path) {
        const requestSegments = splitPath(path);
        for (const route of this.routes) {
            if (route.method !== method)
                continue;
            if (route.segments.length !== requestSegments.length)
                continue;
            const params = {};
            let matched = true;
            for (let i = 0; i < route.segments.length; i++) {
                const routeSeg = route.segments[i];
                const reqSeg = requestSegments[i];
                if (routeSeg.startsWith(':')) {
                    params[routeSeg.slice(1)] = decodeURIComponent(reqSeg);
                }
                else if (routeSeg !== reqSeg) {
                    matched = false;
                    break;
                }
            }
            if (matched) {
                return { route, params };
            }
        }
        return null;
    }
    /**
     * Write CORS headers to the response
     */
    writeCorsHeaders(res) {
        res.setHeader('Access-Control-Allow-Origin', this.corsOrigin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Max-Age', '86400');
    }
    /**
     * Write a RouteResponse to the ServerResponse
     */
    writeResponse(res, routeRes) {
        this.writeCorsHeaders(res);
        if (routeRes.headers) {
            for (const [key, value] of Object.entries(routeRes.headers)) {
                res.setHeader(key, value);
            }
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.writeHead(routeRes.status);
        const body = routeRes.body !== undefined ? JSON.stringify(routeRes.body) : '';
        res.end(body);
    }
    /**
     * Handle an incoming HTTP request
     */
    async handle(req, res) {
        const method = (req.method ?? 'GET').toUpperCase();
        const urlPath = (req.url ?? '/').split('?')[0];
        // Handle CORS preflight
        if (method === 'OPTIONS') {
            this.writeCorsHeaders(res);
            res.writeHead(204);
            res.end();
            return;
        }
        // Parse query string
        const base = 'http://localhost';
        const query = parseQueryString(req.url ?? '/', base);
        // Match route
        const match = this.matchRoute(method, urlPath);
        if (!match) {
            this.writeResponse(res, errorResponse('Not Found', 404));
            return;
        }
        // Build parsed request (body will be parsed lazily only for methods that may have one)
        let body;
        try {
            body = await parseBody(req);
        }
        catch (err) {
            if (err instanceof SyntaxError) {
                this.writeResponse(res, errorResponse('Invalid JSON in request body', 400));
                return;
            }
            throw err;
        }
        const parsed = {
            method,
            path: urlPath,
            params: match.params,
            query,
            body,
            raw: req,
        };
        // Execute handler with error handling
        try {
            const routeRes = await match.route.handler(parsed);
            this.writeResponse(res, routeRes);
        }
        catch (error) {
            const errRes = this._errorHandler(error, parsed);
            this.writeResponse(res, errRes);
        }
    }
}
//# sourceMappingURL=http-router.js.map