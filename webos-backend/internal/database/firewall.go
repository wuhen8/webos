package database

import "time"

// ==================== Firewall Config ====================

// FWConfigGet reads a firewall config value by key.
func FWConfigGet(key string) string {
	if db == nil {
		return ""
	}
	var val string
	if err := db.QueryRow("SELECT value FROM firewall_config WHERE key = ?", key).Scan(&val); err != nil {
		return ""
	}
	return val
}

// FWConfigSet writes a firewall config value.
func FWConfigSet(key, value string) error {
	_, err := db.Exec(
		"INSERT INTO firewall_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
		key, value,
	)
	return err
}

// ==================== Firewall Rules ====================

// FirewallRule represents a persisted iptables rule.
type FirewallRule struct {
	ID        int64  `json:"id"`
	Table     string `json:"table"`     // filter, nat
	Chain     string `json:"chain"`     // INPUT, FORWARD, OUTPUT, PREROUTING, POSTROUTING
	RuleSpec  string `json:"ruleSpec"`  // e.g. "-p tcp -s 1.2.3.4 --dport 80 -j ACCEPT"
	SortOrder int    `json:"sortOrder"`
	Comment   string `json:"comment"`
	Source    string `json:"source"`    // user, ip_guard, system
	CreatedAt int64  `json:"createdAt"`
}

// FWRuleAdd inserts a new firewall rule.
func FWRuleAdd(tableName, chain, ruleSpec, comment, source string) (int64, error) {
	now := time.Now().Unix()
	// Get next sort order
	var maxOrder int
	db.QueryRow("SELECT COALESCE(MAX(sort_order), 0) FROM firewall_rules WHERE table_name = ? AND chain = ?",
		tableName, chain).Scan(&maxOrder)

	res, err := db.Exec(
		`INSERT INTO firewall_rules (table_name, chain, rule_spec, sort_order, comment, source, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		tableName, chain, ruleSpec, maxOrder+1, comment, source, now,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// FWRuleInsertFirst inserts a rule at the beginning (sort_order = 0, shift others).
func FWRuleInsertFirst(tableName, chain, ruleSpec, comment, source string) (int64, error) {
	now := time.Now().Unix()
	// Shift existing rules
	db.Exec("UPDATE firewall_rules SET sort_order = sort_order + 1 WHERE table_name = ? AND chain = ?",
		tableName, chain)

	res, err := db.Exec(
		`INSERT INTO firewall_rules (table_name, chain, rule_spec, sort_order, comment, source, created_at)
		 VALUES (?, ?, ?, 0, ?, ?, ?)`,
		tableName, chain, ruleSpec, comment, source, now,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// FWRuleRemove deletes a rule by ID.
func FWRuleRemove(id int64) error {
	_, err := db.Exec("DELETE FROM firewall_rules WHERE id = ?", id)
	return err
}

// FWRuleRemoveBySource deletes all rules with the given source.
func FWRuleRemoveBySource(source string) error {
	_, err := db.Exec("DELETE FROM firewall_rules WHERE source = ?", source)
	return err
}

// FWRuleList returns all rules for a given table and chain, ordered by sort_order.
func FWRuleList(tableName, chain string) ([]FirewallRule, error) {
	rows, err := db.Query(
		`SELECT id, table_name, chain, rule_spec, sort_order, comment, source, created_at
		 FROM firewall_rules WHERE table_name = ? AND chain = ? ORDER BY sort_order`,
		tableName, chain,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []FirewallRule
	for rows.Next() {
		var r FirewallRule
		if err := rows.Scan(&r.ID, &r.Table, &r.Chain, &r.RuleSpec, &r.SortOrder, &r.Comment, &r.Source, &r.CreatedAt); err != nil {
			continue
		}
		list = append(list, r)
	}
	return list, nil
}

// FWRuleListAll returns all rules for a given table, ordered by chain then sort_order.
func FWRuleListAll(tableName string) ([]FirewallRule, error) {
	rows, err := db.Query(
		`SELECT id, table_name, chain, rule_spec, sort_order, comment, source, created_at
		 FROM firewall_rules WHERE table_name = ? ORDER BY chain, sort_order`,
		tableName,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []FirewallRule
	for rows.Next() {
		var r FirewallRule
		if err := rows.Scan(&r.ID, &r.Table, &r.Chain, &r.RuleSpec, &r.SortOrder, &r.Comment, &r.Source, &r.CreatedAt); err != nil {
			continue
		}
		list = append(list, r)
	}
	return list, nil
}
