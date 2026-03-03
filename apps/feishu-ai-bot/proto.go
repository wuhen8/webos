// proto.go — 精简版 protobuf Frame 编解码器
// 与飞书 SDK 的 pbbp2.proto 兼容，无需引入任何 protobuf 依赖
package main

import "fmt"

// ==================== 数据结构 ====================

type pbHeader struct {
	Key   string
	Value string
}

type pbFrame struct {
	SeqID           uint64
	LogID           uint64
	Service         int32
	Method          int32
	Headers         []pbHeader
	PayloadEncoding string
	PayloadType     string
	Payload         []byte
	LogIDNew        string
}

// ==================== Headers 辅助方法 ====================

func headersGet(hs []pbHeader, key string) string {
	for _, h := range hs {
		if h.Key == key {
			return h.Value
		}
	}
	return ""
}

func headersAdd(hs []pbHeader, key, value string) []pbHeader {
	return append(hs, pbHeader{Key: key, Value: value})
}

// ==================== Marshal ====================

func (f *pbFrame) marshal() []byte {
	// 预估大小
	buf := make([]byte, 0, 256+len(f.Payload))

	// field 1: SeqID (varint)
	buf = appendTag(buf, 1, 0)
	buf = appendVarint(buf, f.SeqID)

	// field 2: LogID (varint)
	buf = appendTag(buf, 2, 0)
	buf = appendVarint(buf, f.LogID)

	// field 3: Service (varint)
	buf = appendTag(buf, 3, 0)
	buf = appendVarint(buf, uint64(f.Service))

	// field 4: Method (varint)
	buf = appendTag(buf, 4, 0)
	buf = appendVarint(buf, uint64(f.Method))

	// field 5: Headers (repeated, length-delimited)
	for _, h := range f.Headers {
		hBytes := marshalHeader(h)
		buf = appendTag(buf, 5, 2)
		buf = appendVarint(buf, uint64(len(hBytes)))
		buf = append(buf, hBytes...)
	}

	// field 6: PayloadEncoding (string)
	buf = appendTag(buf, 6, 2)
	buf = appendVarint(buf, uint64(len(f.PayloadEncoding)))
	buf = append(buf, f.PayloadEncoding...)

	// field 7: PayloadType (string)
	buf = appendTag(buf, 7, 2)
	buf = appendVarint(buf, uint64(len(f.PayloadType)))
	buf = append(buf, f.PayloadType...)

	// field 8: Payload (bytes)
	if f.Payload != nil {
		buf = appendTag(buf, 8, 2)
		buf = appendVarint(buf, uint64(len(f.Payload)))
		buf = append(buf, f.Payload...)
	}

	// field 9: LogIDNew (string)
	buf = appendTag(buf, 9, 2)
	buf = appendVarint(buf, uint64(len(f.LogIDNew)))
	buf = append(buf, f.LogIDNew...)

	return buf
}

func marshalHeader(h pbHeader) []byte {
	buf := make([]byte, 0, len(h.Key)+len(h.Value)+10)
	// field 1: Key
	buf = appendTag(buf, 1, 2)
	buf = appendVarint(buf, uint64(len(h.Key)))
	buf = append(buf, h.Key...)
	// field 2: Value
	buf = appendTag(buf, 2, 2)
	buf = appendVarint(buf, uint64(len(h.Value)))
	buf = append(buf, h.Value...)
	return buf
}

// ==================== Unmarshal ====================

func unmarshalFrame(data []byte) (pbFrame, error) {
	var f pbFrame
	pos := 0
	for pos < len(data) {
		fieldNum, wireType, n := decodeTag(data[pos:])
		if n == 0 {
			break
		}
		pos += n

		switch wireType {
		case 0: // varint
			val, n := decodeVarint(data[pos:])
			if n == 0 {
				return f, errProto
			}
			pos += n
			switch fieldNum {
			case 1:
				f.SeqID = val
			case 2:
				f.LogID = val
			case 3:
				f.Service = int32(val)
			case 4:
				f.Method = int32(val)
			}
		case 2: // length-delimited
			length, n := decodeVarint(data[pos:])
			if n == 0 {
				return f, errProto
			}
			pos += n
			if pos+int(length) > len(data) {
				return f, errProto
			}
			chunk := data[pos : pos+int(length)]
			pos += int(length)
			switch fieldNum {
			case 5:
				h, err := unmarshalHeader(chunk)
				if err != nil {
					return f, err
				}
				f.Headers = append(f.Headers, h)
			case 6:
				f.PayloadEncoding = string(chunk)
			case 7:
				f.PayloadType = string(chunk)
			case 8:
				f.Payload = make([]byte, len(chunk))
				copy(f.Payload, chunk)
			case 9:
				f.LogIDNew = string(chunk)
			}
		default:
			// skip unknown wire types
			return f, errProto
		}
	}
	return f, nil
}

func unmarshalHeader(data []byte) (pbHeader, error) {
	var h pbHeader
	pos := 0
	for pos < len(data) {
		fieldNum, wireType, n := decodeTag(data[pos:])
		if n == 0 || wireType != 2 {
			break
		}
		pos += n
		length, n := decodeVarint(data[pos:])
		if n == 0 {
			return h, errProto
		}
		pos += n
		if pos+int(length) > len(data) {
			return h, errProto
		}
		switch fieldNum {
		case 1:
			h.Key = string(data[pos : pos+int(length)])
		case 2:
			h.Value = string(data[pos : pos+int(length)])
		}
		pos += int(length)
	}
	return h, nil
}

// ==================== Protobuf 原语 ====================

var errProto = fmt.Errorf("protobuf decode error")

func appendTag(buf []byte, fieldNum uint32, wireType uint32) []byte {
	return appendVarint(buf, uint64(fieldNum<<3|wireType))
}

func appendVarint(buf []byte, v uint64) []byte {
	for v >= 0x80 {
		buf = append(buf, byte(v&0x7f|0x80))
		v >>= 7
	}
	buf = append(buf, byte(v))
	return buf
}

func decodeTag(data []byte) (fieldNum uint32, wireType uint32, n int) {
	val, n := decodeVarint(data)
	if n == 0 {
		return 0, 0, 0
	}
	return uint32(val >> 3), uint32(val & 0x7), n
}

func decodeVarint(data []byte) (uint64, int) {
	var val uint64
	for i := 0; i < len(data) && i < 10; i++ {
		b := data[i]
		val |= uint64(b&0x7f) << (uint(i) * 7)
		if b < 0x80 {
			return val, i + 1
		}
	}
	return 0, 0
}

// ==================== 构造辅助 ====================

// newPingFrame 构造飞书心跳 ping 帧
func newPingFrame(serviceID int32) []byte {
	f := pbFrame{
		Method:  0, // FrameTypeControl
		Service: serviceID,
		Headers: []pbHeader{{Key: "type", Value: "ping"}},
	}
	return f.marshal()
}

// newResponseFrame 构造事件响应帧（ACK）
func newResponseFrame(original pbFrame, statusCode int, respPayload []byte) []byte {
	resp := pbFrame{
		SeqID:   original.SeqID,
		LogID:   original.LogID,
		Service: original.Service,
		Method:  original.Method,
		Headers: original.Headers,
		Payload: respPayload,
	}
	return resp.marshal()
}
