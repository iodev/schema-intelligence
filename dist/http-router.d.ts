/**
 * Lightweight HTTP Router
 *
 * Minimal router built on top of node:http with path parameter parsing,
 * query string parsing, JSON body parsing, CORS headers, and error handling.
 */
import { IncomingMessage, ServerResponse } from 'node:http';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS';
export interface RouteParams {
    [key: string]: string;
}
export interface ParsedRequest {
    method: HttpMethod;
    path: string;
    params: RouteParams;
    query: Record<string, string>;
    body: unknown;
    raw: IncomingMessage;
}
export interface RouteResponse {
    status: number;
    body: unknown;
    headers?: Record<string, string>;
}
export type RouteHandler = (req: ParsedRequest) => Promise<RouteResponse> | RouteResponse;
export type ErrorHandler = (error: unknown, req: ParsedRequest) => RouteResponse;
/**
 * Create a JSON success response
 */
export declare function jsonResponse(data: unknown, status?: number): RouteResponse;
/**
 * Create an error response with a status code and message
 */
export declare function errorResponse(message: string, status?: number, details?: Record<string, unknown>): RouteResponse;
export declare class HttpRouter {
    private routes;
    private _errorHandler;
    private corsOrigin;
    constructor(options?: {
        corsOrigin?: string;
    });
    /**
     * Register a route
     */
    route(method: HttpMethod, pattern: string, handler: RouteHandler): void;
    /** Convenience: register a GET route */
    get(pattern: string, handler: RouteHandler): void;
    /** Convenience: register a POST route */
    post(pattern: string, handler: RouteHandler): void;
    /**
     * Set a custom error handler
     */
    onError(handler: ErrorHandler): void;
    /**
     * Match a request against registered routes
     */
    private matchRoute;
    /**
     * Write CORS headers to the response
     */
    private writeCorsHeaders;
    /**
     * Write a RouteResponse to the ServerResponse
     */
    private writeResponse;
    /**
     * Handle an incoming HTTP request
     */
    handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
}
//# sourceMappingURL=http-router.d.ts.map