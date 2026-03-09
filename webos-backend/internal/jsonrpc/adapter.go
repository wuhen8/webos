package jsonrpc

import (
	"encoding/json"
)

// TypedHandler creates a Handler that unmarshals params into P and calls fn.
func TypedHandler[P any](fn func(conn Conn, params P) (interface{}, *Error)) Handler {
	return func(conn Conn, method string, params json.RawMessage) (interface{}, *Error) {
		var p P
		if len(params) > 0 {
			if err := json.Unmarshal(params, &p); err != nil {
				return nil, ErrInvalidParams(err.Error())
			}
		}
		return fn(conn, p)
	}
}

// AsyncHandler creates a Handler that runs fn and converts Go errors to JSON-RPC errors.
func AsyncHandler[P any](fn func(conn Conn, params P) (interface{}, error)) Handler {
	return func(conn Conn, method string, params json.RawMessage) (interface{}, *Error) {
		var p P
		if len(params) > 0 {
			if err := json.Unmarshal(params, &p); err != nil {
				return nil, ErrInvalidParams(err.Error())
			}
		}
		result, err := fn(conn, p)
		if err != nil {
			return nil, ErrFromError(err)
		}
		return result, nil
	}
}
