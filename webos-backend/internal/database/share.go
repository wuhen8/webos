package database

import "fmt"

type ShareLinkRow struct {
	Token     string
	NodeID    string
	Path      string
	Filename  string
	CreatedAt int64
	ExpiresAt *int64
}

func InsertShareLink(row ShareLinkRow) error {
	_, err := db.Exec(
		"INSERT INTO share_links(token, node_id, path, filename, created_at, expires_at) VALUES(?, ?, ?, ?, ?, ?)",
		row.Token, row.NodeID, row.Path, row.Filename, row.CreatedAt, row.ExpiresAt,
	)
	return err
}

func GetShareLink(token string) (*ShareLinkRow, error) {
	row := db.QueryRow("SELECT token, node_id, path, filename, created_at, expires_at FROM share_links WHERE token=?", token)
	var r ShareLinkRow
	if err := row.Scan(&r.Token, &r.NodeID, &r.Path, &r.Filename, &r.CreatedAt, &r.ExpiresAt); err != nil {
		return nil, fmt.Errorf("share link not found: %w", err)
	}
	return &r, nil
}

func GetShareLinkByFile(nodeID, path string) (*ShareLinkRow, error) {
	row := db.QueryRow("SELECT token, node_id, path, filename, created_at, expires_at FROM share_links WHERE node_id=? AND path=?", nodeID, path)
	var r ShareLinkRow
	if err := row.Scan(&r.Token, &r.NodeID, &r.Path, &r.Filename, &r.CreatedAt, &r.ExpiresAt); err != nil {
		return nil, err
	}
	return &r, nil
}

func ListShareLinks() ([]ShareLinkRow, error) {
	rows, err := db.Query("SELECT token, node_id, path, filename, created_at, expires_at FROM share_links ORDER BY created_at DESC")
	if err != nil {
		return nil, fmt.Errorf("list share links: %w", err)
	}
	defer rows.Close()

	var links []ShareLinkRow
	for rows.Next() {
		var r ShareLinkRow
		if err := rows.Scan(&r.Token, &r.NodeID, &r.Path, &r.Filename, &r.CreatedAt, &r.ExpiresAt); err != nil {
			return nil, fmt.Errorf("scan share link: %w", err)
		}
		links = append(links, r)
	}
	return links, rows.Err()
}

func DeleteShareLink(token string) error {
	res, err := db.Exec("DELETE FROM share_links WHERE token=?", token)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("share link %q not found", token)
	}
	return nil
}
