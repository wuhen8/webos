package service

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
)

// CronExpr represents a parsed 6-field cron expression: sec min hour dom month dow
// Supports: *, */n, n, n-m, n-m/step, n,m,k, and named months/weekdays.
// Weekday: 0=Sunday, 1=Monday, ..., 6=Saturday (also 7=Sunday).
type CronExpr struct {
	Second []int // 0-59
	Minute []int // 0-59
	Hour   []int // 0-23
	Dom    []int // 1-31
	Month  []int // 1-12
	Dow    []int // 0-6 (0=Sunday)
}

var monthNames = map[string]int{
	"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
	"jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

var dowNames = map[string]int{
	"sun": 0, "mon": 1, "tue": 2, "wed": 3, "thu": 4, "fri": 5, "sat": 6,
}

// ParseCron parses a 6-field cron expression string.
// Fields: second minute hour day-of-month month day-of-week
func ParseCron(expr string) (*CronExpr, error) {
	fields := strings.Fields(expr)
	if len(fields) != 6 {
		return nil, fmt.Errorf("cron: expected 6 fields, got %d", len(fields))
	}

	second, err := parseField(fields[0], 0, 59, nil)
	if err != nil {
		return nil, fmt.Errorf("cron second: %w", err)
	}
	minute, err := parseField(fields[1], 0, 59, nil)
	if err != nil {
		return nil, fmt.Errorf("cron minute: %w", err)
	}
	hour, err := parseField(fields[2], 0, 23, nil)
	if err != nil {
		return nil, fmt.Errorf("cron hour: %w", err)
	}
	dom, err := parseField(fields[3], 1, 31, nil)
	if err != nil {
		return nil, fmt.Errorf("cron day-of-month: %w", err)
	}
	month, err := parseField(fields[4], 1, 12, monthNames)
	if err != nil {
		return nil, fmt.Errorf("cron month: %w", err)
	}
	dow, err := parseField(fields[5], 0, 6, dowNames)
	if err != nil {
		return nil, fmt.Errorf("cron day-of-week: %w", err)
	}
	// Normalize 7 -> 0 for Sunday
	for i, v := range dow {
		if v == 7 {
			dow[i] = 0
		}
	}
	dow = unique(dow)

	return &CronExpr{
		Second: second,
		Minute: minute,
		Hour:   hour,
		Dom:    dom,
		Month:  month,
		Dow:    dow,
	}, nil
}

// Next returns the next time after `from` that matches the cron expression.
func (c *CronExpr) Next(from time.Time) time.Time {
	// Start from the next second
	t := from.Add(1 * time.Second)
	t = t.Truncate(time.Second)

	// Limit search to 4 years to avoid infinite loops
	limit := from.Add(4 * 365 * 24 * time.Hour)

	for t.Before(limit) {
		// Check month
		if !contains(c.Month, int(t.Month())) {
			// Advance to next valid month
			t = advanceMonth(t, c.Month)
			continue
		}

		// Check day-of-month and day-of-week
		if !contains(c.Dom, t.Day()) || !contains(c.Dow, int(t.Weekday())) {
			t = t.AddDate(0, 0, 1)
			t = time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
			continue
		}

		// Check hour
		if !contains(c.Hour, t.Hour()) {
			t = advanceToNext(t, c.Hour, t.Hour(), "hour")
			continue
		}

		// Check minute
		if !contains(c.Minute, t.Minute()) {
			t = advanceToNext(t, c.Minute, t.Minute(), "minute")
			continue
		}

		// Check second
		if !contains(c.Second, t.Second()) {
			next := nextInList(c.Second, t.Second())
			if next <= t.Second() {
				// Wrap to next minute
				t = t.Add(time.Duration(60-t.Second()) * time.Second)
				continue
			}
			t = time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), t.Minute(), next, 0, t.Location())
			continue
		}

		return t
	}

	// Fallback: should not happen with valid expressions
	return from.Add(1 * time.Hour)
}

func advanceMonth(t time.Time, months []int) time.Time {
	cur := int(t.Month())
	next := nextInList(months, cur)
	if next <= cur {
		// Wrap to next year
		return time.Date(t.Year()+1, time.Month(next), 1, 0, 0, 0, 0, t.Location())
	}
	return time.Date(t.Year(), time.Month(next), 1, 0, 0, 0, 0, t.Location())
}

func advanceToNext(t time.Time, list []int, cur int, unit string) time.Time {
	next := nextInList(list, cur)
	switch unit {
	case "hour":
		if next <= cur {
			// Wrap to next day
			t = t.AddDate(0, 0, 1)
			return time.Date(t.Year(), t.Month(), t.Day(), next, 0, 0, 0, t.Location())
		}
		return time.Date(t.Year(), t.Month(), t.Day(), next, 0, 0, 0, t.Location())
	case "minute":
		if next <= cur {
			// Wrap to next hour
			t = t.Add(time.Duration(60-t.Minute()) * time.Minute)
			t = t.Truncate(time.Minute)
			return t
		}
		return time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), next, 0, 0, t.Location())
	}
	return t
}

// nextInList returns the smallest value in sorted list > cur, or list[0] if wrapping.
func nextInList(list []int, cur int) int {
	for _, v := range list {
		if v > cur {
			return v
		}
	}
	return list[0]
}

func contains(list []int, val int) bool {
	for _, v := range list {
		if v == val {
			return true
		}
	}
	return false
}

func unique(list []int) []int {
	seen := make(map[int]bool)
	out := make([]int, 0, len(list))
	for _, v := range list {
		if !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	sort.Ints(out)
	return out
}

// parseField parses a single cron field (e.g. "*/5", "1,3,5", "10-20/2", "*").
func parseField(field string, min, max int, names map[string]int) ([]int, error) {
	var result []int
	parts := strings.Split(field, ",")
	for _, part := range parts {
		vals, err := parsePart(part, min, max, names)
		if err != nil {
			return nil, err
		}
		result = append(result, vals...)
	}
	result = unique(result)
	if len(result) == 0 {
		return nil, fmt.Errorf("empty field")
	}
	return result, nil
}

func parsePart(part string, min, max int, names map[string]int) ([]int, error) {
	// Handle step: */n or range/n
	var step int
	if idx := strings.Index(part, "/"); idx != -1 {
		s, err := strconv.Atoi(part[idx+1:])
		if err != nil || s <= 0 {
			return nil, fmt.Errorf("invalid step: %s", part)
		}
		step = s
		part = part[:idx]
	}

	var rangeMin, rangeMax int

	if part == "*" {
		rangeMin = min
		rangeMax = max
	} else if idx := strings.Index(part, "-"); idx != -1 {
		lo, err := resolveValue(part[:idx], names)
		if err != nil {
			return nil, err
		}
		hi, err := resolveValue(part[idx+1:], names)
		if err != nil {
			return nil, err
		}
		if lo < min || hi > max || lo > hi {
			return nil, fmt.Errorf("range out of bounds: %s", part)
		}
		rangeMin = lo
		rangeMax = hi
	} else {
		val, err := resolveValue(part, names)
		if err != nil {
			return nil, err
		}
		if val < min || val > max {
			// Allow 7 for dow (Sunday alias)
			if !(min == 0 && max == 6 && val == 7) {
				return nil, fmt.Errorf("value %d out of range [%d-%d]", val, min, max)
			}
		}
		if step > 0 {
			rangeMin = val
			rangeMax = max
		} else {
			return []int{val}, nil
		}
	}

	if step == 0 {
		step = 1
	}

	var result []int
	for i := rangeMin; i <= rangeMax; i += step {
		result = append(result, i)
	}
	return result, nil
}

func resolveValue(s string, names map[string]int) (int, error) {
	if names != nil {
		if v, ok := names[strings.ToLower(s)]; ok {
			return v, nil
		}
	}
	v, err := strconv.Atoi(s)
	if err != nil {
		return 0, fmt.Errorf("invalid value: %s", s)
	}
	return v, nil
}

// IntervalToCron converts a simple interval in seconds to a cron expression.
// Used for backward compatibility with old interval_sec data.
func IntervalToCron(sec int) string {
	if sec <= 0 {
		sec = 60
	}
	if sec < 60 {
		// Every N seconds
		return fmt.Sprintf("*/%d * * * * *", sec)
	}
	if sec < 3600 {
		m := sec / 60
		return fmt.Sprintf("0 */%d * * * *", m)
	}
	if sec < 86400 {
		h := sec / 3600
		return fmt.Sprintf("0 0 */%d * * *", h)
	}
	// Daily
	return "0 0 0 * * *"
}

// Describe returns a human-readable Chinese description of the cron expression.
func (c *CronExpr) Describe() string {
	// Simple patterns
	if isAll(c.Month, 1, 12) && isAll(c.Dow, 0, 6) && isAll(c.Dom, 1, 31) {
		if isAll(c.Hour, 0, 23) && isAll(c.Minute, 0, 59) {
			if len(c.Second) == 1 && c.Second[0] == 0 {
				return "每分钟"
			}
			if isStep(c.Second, 0, 59) {
				return fmt.Sprintf("每%d秒", c.Second[1]-c.Second[0])
			}
		}
		if isAll(c.Hour, 0, 23) && len(c.Second) == 1 && c.Second[0] == 0 {
			if len(c.Minute) == 1 && c.Minute[0] == 0 {
				return "每小时"
			}
			if isStep(c.Minute, 0, 59) {
				return fmt.Sprintf("每%d分钟", c.Minute[1]-c.Minute[0])
			}
		}
		if len(c.Second) == 1 && c.Second[0] == 0 && len(c.Minute) == 1 && len(c.Hour) == 1 {
			return fmt.Sprintf("每天 %02d:%02d", c.Hour[0], c.Minute[0])
		}
		if len(c.Second) == 1 && c.Second[0] == 0 && len(c.Minute) == 1 {
			if isStep(c.Hour, 0, 23) {
				return fmt.Sprintf("每%d小时", c.Hour[1]-c.Hour[0])
			}
		}
	}
	// Weekly
	if isAll(c.Month, 1, 12) && isAll(c.Dom, 1, 31) && !isAll(c.Dow, 0, 6) {
		if len(c.Second) == 1 && c.Second[0] == 0 && len(c.Minute) == 1 && len(c.Hour) == 1 {
			days := dowListStr(c.Dow)
			return fmt.Sprintf("每周%s %02d:%02d", days, c.Hour[0], c.Minute[0])
		}
	}
	// Monthly
	if isAll(c.Month, 1, 12) && isAll(c.Dow, 0, 6) && !isAll(c.Dom, 1, 31) {
		if len(c.Second) == 1 && c.Second[0] == 0 && len(c.Minute) == 1 && len(c.Hour) == 1 {
			return fmt.Sprintf("每月%s日 %02d:%02d", intListStr(c.Dom), c.Hour[0], c.Minute[0])
		}
	}
	return ""
}

func isAll(list []int, min, max int) bool {
	if len(list) != max-min+1 {
		return false
	}
	for i, v := range list {
		if v != min+i {
			return false
		}
	}
	return true
}

func isStep(list []int, min, max int) bool {
	if len(list) < 2 {
		return false
	}
	step := list[1] - list[0]
	if step <= 0 {
		return false
	}
	expected := 0
	for i := min; i <= max; i += step {
		if expected >= len(list) || list[expected] != i {
			return false
		}
		expected++
	}
	return expected == len(list)
}

var dowChinese = []string{"日", "一", "二", "三", "四", "五", "六"}

func dowListStr(list []int) string {
	parts := make([]string, len(list))
	for i, v := range list {
		parts[i] = dowChinese[v]
	}
	return strings.Join(parts, ",")
}

func intListStr(list []int) string {
	parts := make([]string, len(list))
	for i, v := range list {
		parts[i] = strconv.Itoa(v)
	}
	return strings.Join(parts, ",")
}
