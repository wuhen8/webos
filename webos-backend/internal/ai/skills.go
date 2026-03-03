package ai

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"webos-backend/internal/config"

	"gopkg.in/yaml.v3"
)

const (
	maxSinglePromptBytes = 20 * 1024  // 20KB per skill
	maxTotalPromptBytes  = 200 * 1024 // 200KB total
)

// ScriptSkill is no longer used — kept as placeholder for potential future use.

// skillFrontmatter holds parsed SKILL.md frontmatter (yaml.v3).
type skillFrontmatter struct {
	Name        string `yaml:"name"`
	Description string `yaml:"description"`
}

// SkillCatalogEntry is a lightweight summary of a skill (name + description).
type SkillCatalogEntry struct {
	Name        string
	DirName     string
	Description string
}

// SkillActivation holds the full content loaded on demand when a skill is activated.
type SkillActivation struct {
	Body string
}

// maxActivatedSkills is the maximum number of concurrently activated skills.
// When exceeded, the least recently activated skill is evicted.
const maxActivatedSkills = 10

// SkillsContext is the top-level skills state for a conversation.
// SystemPrompt is loaded eagerly (system.md); skills are loaded on demand.
type SkillsContext struct {
	SystemPrompt string
	Catalog      []SkillCatalogEntry
	SkillsDir    string
	mu           sync.Mutex
	Activated    map[string]*SkillActivation
	activOrder   []string // tracks activation order for LRU eviction
	lastConvID   string   // last conversation ID; cache cleared on change
}

// LoadSkillsCatalog reads system.md in full and scans subdirectories for
// SKILL.md frontmatter (name + description only). No full skill body or
// scripts are loaded at this stage.
func LoadSkillsCatalog(dir string) *SkillsContext {
	sc := &SkillsContext{
		SkillsDir: dir,
		Activated: make(map[string]*SkillActivation),
	}

	// Read all root-level .md files eagerly.
	// system.md is the system prompt; other .md files are auxiliary context (long-term memory, notes, etc.).
	entries, err := os.ReadDir(dir)
	if err != nil {
		return sc
	}

	var auxParts []string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if strings.ToLower(filepath.Ext(entry.Name())) != ".md" {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			continue
		}
		if strings.ToLower(entry.Name()) == "system.md" {
			sc.SystemPrompt = string(data)
		} else {
			auxParts = append(auxParts, string(data))
		}
	}
	if len(auxParts) > 0 {
		sc.SystemPrompt += "\n\n" + strings.Join(auxParts, "\n\n")
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		subDir := filepath.Join(dir, entry.Name())
		skillMdPath := filepath.Join(subDir, "SKILL.md")
		data, err := os.ReadFile(skillMdPath)
		if err != nil {
			continue // no SKILL.md, skip
		}

		fm, _ := parseFrontmatter(string(data))
		name := fm.Name
		if name == "" {
			name = entry.Name()
		} else if name != entry.Name() {
			log.Printf("[skills] 警告: 目录名 %q 与 frontmatter name %q 不匹配，以目录名为准", entry.Name(), name)
			name = entry.Name()
		}

		sc.Catalog = append(sc.Catalog, SkillCatalogEntry{
			Name:        name,
			DirName:     entry.Name(),
			Description: fm.Description,
		})
	}

	return sc
}

// ActivateSkill loads the full SKILL.md body and registers script tools for
// the named skill. It is idempotent and concurrency-safe.
// When the activation limit is reached, the least recently activated skill is evicted.
func (sc *SkillsContext) ActivateSkill(name string) (*SkillActivation, error) {
	sc.mu.Lock()
	defer sc.mu.Unlock()

	// Idempotent: return existing activation, move to end (most recent)
	if act, ok := sc.Activated[name]; ok {
		sc.touchOrder(name)
		return act, nil
	}

	// Find catalog entry
	var entry *SkillCatalogEntry
	for i := range sc.Catalog {
		if sc.Catalog[i].Name == name {
			entry = &sc.Catalog[i]
			break
		}
	}
	if entry == nil {
		return nil, fmt.Errorf("skill %q 不存在", name)
	}

	// Evict oldest if at capacity
	if len(sc.Activated) >= maxActivatedSkills && len(sc.activOrder) > 0 {
		evict := sc.activOrder[0]
		sc.activOrder = sc.activOrder[1:]
		delete(sc.Activated, evict)
		log.Printf("[skills] 已淘汰最早激活的 skill: %s", evict)
	}

	// Read SKILL.md
	skillMdPath := filepath.Join(sc.SkillsDir, entry.DirName, "SKILL.md")
	data, err := os.ReadFile(skillMdPath)
	if err != nil {
		return nil, fmt.Errorf("读取 SKILL.md 失败: %w", err)
	}

	_, body := parseFrontmatter(string(data))

	// Replace template variables
	body = strings.ReplaceAll(body, "{{DATA_DIR}}", config.DataDir())
	// Enforce size limit on body
	if len(body) > maxSinglePromptBytes {
		body = body[:maxSinglePromptBytes]
	}

	act := &SkillActivation{
		Body: body,
	}

	sc.Activated[name] = act
	sc.activOrder = append(sc.activOrder, name)
	return act, nil
}

// touchOrder moves a name to the end of activOrder (most recently used).
func (sc *SkillsContext) touchOrder(name string) {
	for i, n := range sc.activOrder {
		if n == name {
			sc.activOrder = append(sc.activOrder[:i], sc.activOrder[i+1:]...)
			break
		}
	}
	sc.activOrder = append(sc.activOrder, name)
}

// SearchSkills searches the catalog by keyword, matching against name and description.
// Returns up to maxResults matching entries.
func (sc *SkillsContext) SearchSkills(keyword string, maxResults int) []SkillCatalogEntry {
	// Split by spaces/commas so "视频 影视 太平年" matches any single token
	raw := strings.ToLower(keyword)
	for _, sep := range []string{",", "，", "、"} {
		raw = strings.ReplaceAll(raw, sep, " ")
	}
	var tokens []string
	for _, t := range strings.Fields(raw) {
		if t != "" {
			tokens = append(tokens, t)
		}
	}
	if len(tokens) == 0 {
		return nil
	}

	var results []SkillCatalogEntry
	for _, entry := range sc.Catalog {
		haystack := strings.ToLower(entry.Name) + " " + strings.ToLower(entry.Description)
		for _, tok := range tokens {
			if strings.Contains(haystack, tok) {
				results = append(results, entry)
				if len(results) >= maxResults {
					return results
				}
				break
			}
		}
	}
	return results
}

// parseFrontmatter extracts YAML frontmatter from a SKILL.md file.
// Expects --- delimiters. Returns parsed metadata and the body after frontmatter.
func parseFrontmatter(content string) (skillFrontmatter, string) {
	var fm skillFrontmatter

	if !strings.HasPrefix(content, "---") {
		return fm, content
	}

	// Find the closing ---
	rest := content[3:] // skip opening ---
	// Skip the newline after opening ---
	if idx := strings.IndexByte(rest, '\n'); idx >= 0 {
		rest = rest[idx+1:]
	} else {
		return fm, content
	}

	endIdx := strings.Index(rest, "\n---")
	if endIdx < 0 {
		return fm, content
	}

	fmRaw := rest[:endIdx]
	body := rest[endIdx+4:] // skip \n---
	// Skip newline after closing ---
	if len(body) > 0 && body[0] == '\n' {
		body = body[1:]
	}

	if err := yaml.Unmarshal([]byte(fmRaw), &fm); err != nil {
		log.Printf("[skills] 解析 SKILL.md frontmatter 失败: %v", err)
		return skillFrontmatter{}, content
	}

	return fm, body
}

// EnsureSystemSkill checks if system.md exists in the skills directory.
// If not, creates it with the default system prompt.
func EnsureSystemSkill(skillsDir string) {
	if err := os.MkdirAll(skillsDir, 0755); err != nil {
		log.Printf("[skills] 创建 skills 目录失败: %v", err)
		return
	}
	systemMdPath := filepath.Join(skillsDir, "system.md")
	if _, err := os.Stat(systemMdPath); err == nil {
		return // already exists
	}
	if err := os.WriteFile(systemMdPath, []byte(defaultSystemPrompt), 0644); err != nil {
		log.Printf("[skills] 生成 system.md 失败: %v", err)
	}
}
