package txjournal

import (
	"encoding/json"
	"regexp"
	"strings"
)

var sensitiveText = regexp.MustCompile(`(?i)private.?key|secret|authorization|bearer|signature|signed.?invocation|calldata|proof|capsule|decrypted|request\s*(body|payload)|api[_-]?key`)
var urls = regexp.MustCompile(`https?://[^\s"<>]+`)

// Fail closed on request-bearing messages, including SDK errors that embed an
// entire request. Public RPC URLs can contain credentials, so omit all URLs.
func SafeText(value string) string {
	if sensitiveText.MatchString(value) {
		return "[sensitive error details omitted]"
	}
	value = urls.ReplaceAllString(value, "[endpoint omitted]")
	if len(value) > 1000 {
		value = value[:1000] + "..."
	}
	return value
}

func SafeData(value string) string {
	if value == "" {
		return ""
	}
	if len(value) > 64*1024 {
		return `"[oversized error data omitted]"`
	}
	var decoded any
	if json.Unmarshal([]byte(value), &decoded) != nil {
		return SafeText(value)
	}
	encoded, _ := json.Marshal(safeValue(decoded, 0))
	if len(encoded) > 8192 {
		return `"[oversized error data omitted]"`
	}
	return string(encoded)
}

func safeValue(value any, depth int) any {
	if depth > 8 {
		return "[nested error omitted]"
	}
	switch value := value.(type) {
	case string:
		return SafeText(value)
	case map[string]any:
		result := make(map[string]any)
		for key, item := range value {
			switch strings.ToLower(key) {
			case "code", "message", "error", "error_message", "execution_error", "revert_error", "revert_reason", "contract_address", "entry_point_selector", "selector", "class_hash", "transaction_index":
				result[key] = safeValue(item, depth+1)
			}
		}
		return result
	case []any:
		if len(value) > 16 {
			return "[error array omitted]"
		}
		result := make([]any, len(value))
		for i, item := range value {
			result[i] = safeValue(item, depth+1)
		}
		return result
	case float64, bool, nil:
		return value
	default:
		return "[error details omitted]"
	}
}
