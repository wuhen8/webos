/**
 * JSON-RPC 2.0 client library.
 * Single source of truth for all three transports:
 * - WebSocket (main frontend)
 * - HTTP (auth, file upload/download)
 * - SDK bridge (static apps / wasm apps)
 */

export const JSONRPC_VERSION = '2.0'

// ==================== Protocol types ====================

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  method: string
  params?: Record<string, any>
  id?: string | number
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  result?: any
  error?: JsonRpcError
  id: string | number | null
}

export interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: any
}

export interface JsonRpcError {
  code: number
  message: string
  data?: any
}

// ==================== Standard error codes ====================

export const ErrorCodes = {
  // JSON-RPC 2.0 standard errors (-32700 to -32600)
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,

  // Server errors (-32000 to -32099, reserved by spec for implementation)
  SERVER_ERROR: -32000,
  UNAUTHORIZED: -32001,
  PERM_DENIED: -32002,

  // Application errors (positive numbers, outside reserved ranges)
  PASSWORD_REQUIRED: 4010,
  PASSWORD_INCORRECT: 4011,
} as const

// ==================== Error class ====================

export class JsonRpcClientError extends Error {
  code: number
  data?: any

  constructor(err: JsonRpcError) {
    super(err.message)
    this.name = 'JsonRpcClientError'
    this.code = err.code
    this.data = err.data
  }
}

// ==================== Helpers ====================

let reqSeq = 0

export function genId(): string {
  return `r_${++reqSeq}_${Date.now()}`
}

export function createRequest(method: string, params?: Record<string, any>, id?: string): JsonRpcRequest {
  return {
    jsonrpc: JSONRPC_VERSION,
    method,
    ...(params !== undefined && { params }),
    ...(id !== undefined && { id }),
  }
}

export function createNotification(method: string, params?: any): JsonRpcNotification {
  return {
    jsonrpc: JSONRPC_VERSION,
    method,
    ...(params !== undefined && { params }),
  }
}

/**
 * Check if a message is a JSON-RPC response (has id + result/error).
 */
export function isResponse(msg: any): msg is JsonRpcResponse {
  return msg?.jsonrpc === '2.0' && 'id' in msg && (msg.result !== undefined || msg.error !== undefined)
}

/**
 * Check if a message is a JSON-RPC notification (has method, no id).
 */
export function isNotification(msg: any): msg is JsonRpcNotification {
  return msg?.jsonrpc === '2.0' && typeof msg.method === 'string' && !('id' in msg)
}

/**
 * Parse a JSON-RPC response, returning the result or throwing on error.
 */
export function unwrapResponse(resp: JsonRpcResponse): any {
  if (resp.error) {
    throw new JsonRpcClientError(resp.error)
  }
  return resp.result
}
