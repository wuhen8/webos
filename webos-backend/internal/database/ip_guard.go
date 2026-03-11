package database

import (
	"time"
)

// IPRecord represents a known IP in the guard system.
type IPRecord struct {
	ID        int64  `json:"id"`
	IP        string `json:"ip"`
	Status    string `json:"status"` // pending, approved, rejected
	Location  string `json:"location"`
	Note      string `json:"note"`
	ExpiresAt int64  `json:"expiresAt"` // 0 = never
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
}

// IPGuardUpsertPending inserts or updates an IP as pending.
// Returns the record and whether it was newly created.
func IPGuardUpsertPending(ip, location string) (*IPRecord, bool, error) {
	now := time.Now().Unix()

	// Check if exists
	var rec IPRecord
	err := db.QueryRow(`SELECT id, ip, status, location, note, expires_at, created_at, updated_at
		FROM ip_guard WHERE ip = ?`, ip).Scan(
		&rec.ID, &rec.IP, &rec.Status, &rec.Location, &rec.Note, &rec.ExpiresAt, &rec.CreatedAt, &rec.UpdatedAt)

	if err == nil {
		// Already exists — update location if changed
		if location != "" && location != rec.Location {
			db.Exec(`UPDATE ip_guard SET location = ?, updated_at = ? WHERE id = ?`, location, now, rec.ID)
			rec.Location = location
			rec.UpdatedAt = now
		}
		return &rec, false, nil
	}

	// Insert new
	res, err := db.Exec(`INSERT INTO ip_guard (ip, status, location, note, expires_at, created_at, updated_at)
		VALUES (?, 'pending', ?, '', 0, ?, ?)`, ip, location, now, now)
	if err != nil {
		return nil, false, err
	}
	id, _ := res.LastInsertId()
	return &IPRecord{
		ID: id, IP: ip, Status: "pending", Location: location,
		CreatedAt: now, UpdatedAt: now,
	}, true, nil
}

// IPGuardApprove sets an IP to approved with optional TTL (seconds, 0=permanent).
func IPGuardApprove(ip string, ttlSeconds int64) error {
	now := time.Now().Unix()
	var expiresAt int64
	if ttlSeconds > 0 {
		expiresAt = now + ttlSeconds
	}
	_, err := db.Exec(`UPDATE ip_guard SET status = 'approved', expires_at = ?, updated_at = ? WHERE ip = ?`,
		expiresAt, now, ip)
	return err
}

// IPGuardReject sets an IP to rejected.
func IPGuardReject(ip string) error {
	now := time.Now().Unix()
	_, err := db.Exec(`UPDATE ip_guard SET status = 'rejected', updated_at = ? WHERE ip = ?`, now, ip)
	return err
}

// IPGuardRemove deletes an IP record.
func IPGuardRemove(ip string) error {
	_, err := db.Exec(`DELETE FROM ip_guard WHERE ip = ?`, ip)
	return err
}

// IPGuardList returns all IP records.
func IPGuardList() ([]IPRecord, error) {
	rows, err := db.Query(`SELECT id, ip, status, location, note, expires_at, created_at, updated_at
		FROM ip_guard ORDER BY updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []IPRecord
	for rows.Next() {
		var r IPRecord
		if err := rows.Scan(&r.ID, &r.IP, &r.Status, &r.Location, &r.Note, &r.ExpiresAt, &r.CreatedAt, &r.UpdatedAt); err != nil {
			continue
		}
		list = append(list, r)
	}
	return list, nil
}

// IPGuardListApproved returns only approved (non-expired) IPs.
func IPGuardListApproved() ([]IPRecord, error) {
	now := time.Now().Unix()
	rows, err := db.Query(`SELECT id, ip, status, location, note, expires_at, created_at, updated_at
		FROM ip_guard WHERE status = 'approved' AND (expires_at = 0 OR expires_at > ?)
		ORDER BY updated_at DESC`, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []IPRecord
	for rows.Next() {
		var r IPRecord
		if err := rows.Scan(&r.ID, &r.IP, &r.Status, &r.Location, &r.Note, &r.ExpiresAt, &r.CreatedAt, &r.UpdatedAt); err != nil {
			continue
		}
		list = append(list, r)
	}
	return list, nil
}

// IPGuardGetExpired returns approved IPs that have expired.
func IPGuardGetExpired() ([]IPRecord, error) {
	now := time.Now().Unix()
	rows, err := db.Query(`SELECT id, ip, status, location, note, expires_at, created_at, updated_at
		FROM ip_guard WHERE status = 'approved' AND expires_at > 0 AND expires_at <= ?`, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []IPRecord
	for rows.Next() {
		var r IPRecord
		if err := rows.Scan(&r.ID, &r.IP, &r.Status, &r.Location, &r.Note, &r.ExpiresAt, &r.CreatedAt, &r.UpdatedAt); err != nil {
			continue
		}
		list = append(list, r)
	}
	return list, nil
}

// IPGuardGetByIP returns a single record by IP.
func IPGuardGetByIP(ip string) (*IPRecord, error) {
	var r IPRecord
	err := db.QueryRow(`SELECT id, ip, status, location, note, expires_at, created_at, updated_at
		FROM ip_guard WHERE ip = ?`, ip).Scan(
		&r.ID, &r.IP, &r.Status, &r.Location, &r.Note, &r.ExpiresAt, &r.CreatedAt, &r.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &r, nil
}
// IPGuardGetByID returns a single record by ID.
func IPGuardGetByID(id int64) (*IPRecord, error) {
	var r IPRecord
	err := db.QueryRow(`SELECT id, ip, status, location, note, expires_at, created_at, updated_at
		FROM ip_guard WHERE id = ?`, id).Scan(
		&r.ID, &r.IP, &r.Status, &r.Location, &r.Note, &r.ExpiresAt, &r.CreatedAt, &r.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &r, nil
}

// ==================== CIDR Whitelist ====================

// CIDRRecord represents a whitelisted CIDR range.
type CIDRRecord struct {
	ID        int64  `json:"id"`
	CIDR      string `json:"cidr"`
	Note      string `json:"note"`
	AutoAdded bool   `json:"autoAdded"`
	CreatedAt int64  `json:"createdAt"`
}

// IPGuardAddCIDR adds a CIDR range to the whitelist.
func IPGuardAddCIDR(cidr, note string, autoAdded bool) error {
	now := time.Now().Unix()
	auto := 0
	if autoAdded {
		auto = 1
	}
	_, err := db.Exec(`INSERT OR IGNORE INTO ip_guard_cidrs (cidr, note, auto_added, created_at) VALUES (?, ?, ?, ?)`,
		cidr, note, auto, now)
	return err
}

// IPGuardRemoveCIDR removes a CIDR range from the whitelist.
func IPGuardRemoveCIDR(id int64) error {
	_, err := db.Exec(`DELETE FROM ip_guard_cidrs WHERE id = ?`, id)
	return err
}

// IPGuardListCIDRs returns all whitelisted CIDR ranges.
func IPGuardListCIDRs() ([]CIDRRecord, error) {
	rows, err := db.Query(`SELECT id, cidr, note, auto_added, created_at FROM ip_guard_cidrs ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []CIDRRecord
	for rows.Next() {
		var r CIDRRecord
		var auto int
		if err := rows.Scan(&r.ID, &r.CIDR, &r.Note, &auto, &r.CreatedAt); err != nil {
			continue
		}
		r.AutoAdded = auto == 1
		list = append(list, r)
	}
	return list, nil
}
