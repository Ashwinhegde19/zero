package tools

import (
	"fmt"
	"strconv"
	"strings"
)

// argtolerance.go is the shared, model-agnostic argument-tolerance layer for the
// tools package. Different models (weak ones like minimax-m3 as well as strong
// ones) emit the same conceptual argument under different key spellings. These
// helpers let every tool accept the natural variants instead of hard-erroring,
// while preserving the existing TYPE-strictness contract (a present-but-non-string
// value still errors, scalars are never silently coerced to strings).

// aliasedStringArg reads a string argument, trying each key in order (the primary
// key first, then aliases) and returning the first present non-nil value. It
// preserves the exact semantics of stringArg/stringArgWithEmpty:
//
//   - A present-but-non-string value errors "<primaryKey> must be a string"
//     (type-strictness is preserved; scalars are NOT coerced to strings). The
//     error always names the PRIMARY key so messages stay stable regardless of
//     which alias the model happened to use.
//   - Missing + required errors "<primaryKey> is required".
//   - Missing + optional returns the fallback.
//   - allowEmpty controls whether an empty string is accepted (when false, a
//     present empty string errors "<primaryKey> must be a non-empty string").
//
// keys must be non-empty; keys[0] is the canonical/primary key used in errors.
func aliasedStringArg(args map[string]any, keys []string, fallback string, required bool, allowEmpty bool) (string, error) {
	primary := ""
	if len(keys) > 0 {
		primary = keys[0]
	}
	for _, key := range keys {
		value, ok := args[key]
		if !ok || value == nil {
			continue
		}
		text, ok := value.(string)
		if !ok {
			return "", fmt.Errorf("%s must be a string", primary)
		}
		if !allowEmpty && text == "" {
			return "", fmt.Errorf("%s must be a non-empty string", primary)
		}
		return text, nil
	}
	if required {
		return "", fmt.Errorf("%s is required", primary)
	}
	return fallback, nil
}

// coerceStringSlice turns whatever a model put in an array-shaped argument into a
// string slice without ever failing. It accepts a []string, a []any of
// strings/scalars/objects (label/value/text/name/title/option), or a single
// newline-delimited string. Presentation-hint style arguments (e.g. ask_user
// options) use this so a malformed shape never breaks the whole call.
func coerceStringSlice(value any) []string {
	switch v := value.(type) {
	case nil:
		return nil
	case []string:
		return v
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			if s := scalarOrLabelString(item); s != "" {
				out = append(out, s)
			}
		}
		return out
	case string:
		lines := strings.Split(strings.ReplaceAll(v, "\r\n", "\n"), "\n")
		out := make([]string, 0, len(lines))
		for _, line := range lines {
			if t := strings.TrimSpace(line); t != "" {
				out = append(out, t)
			}
		}
		return out
	default:
		if s := scalarOrLabelString(value); s != "" {
			return []string{s}
		}
		return nil
	}
}

// scalarOrLabelString best-effort renders a single list element to a string:
// trimmed strings, scalars (bool/number), or an object's common label keys.
// Returns "" when nothing usable is present.
func scalarOrLabelString(item any) string {
	switch v := item.(type) {
	case string:
		return strings.TrimSpace(v)
	case bool:
		return strconv.FormatBool(v)
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case int:
		return strconv.Itoa(v)
	case map[string]any:
		for _, key := range []string{"label", "value", "text", "name", "title", "option"} {
			if s, ok := v[key].(string); ok && strings.TrimSpace(s) != "" {
				return strings.TrimSpace(s)
			}
		}
	}
	return ""
}
