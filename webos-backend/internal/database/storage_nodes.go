package database

import "fmt"

type StorageNodeRow struct {
	ID     string
	Name   string
	Type   string
	Config string
}

func ListStorageNodes() ([]StorageNodeRow, error) {
	rows, err := db.Query("SELECT id, name, type, config FROM storage_nodes")
	if err != nil {
		return nil, fmt.Errorf("list storage nodes: %w", err)
	}
	defer rows.Close()

	var nodes []StorageNodeRow
	for rows.Next() {
		var n StorageNodeRow
		if err := rows.Scan(&n.ID, &n.Name, &n.Type, &n.Config); err != nil {
			return nil, fmt.Errorf("scan storage node: %w", err)
		}
		nodes = append(nodes, n)
	}
	return nodes, rows.Err()
}

func InsertStorageNode(row StorageNodeRow) error {
	_, err := db.Exec(
		"INSERT INTO storage_nodes(id, name, type, config) VALUES(?, ?, ?, ?)",
		row.ID, row.Name, row.Type, row.Config,
	)
	return err
}

func UpdateStorageNode(row StorageNodeRow) error {
	res, err := db.Exec(
		"UPDATE storage_nodes SET name=?, type=?, config=? WHERE id=?",
		row.Name, row.Type, row.Config, row.ID,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("storage node %q not found", row.ID)
	}
	return nil
}

func DeleteStorageNode(id string) error {
	res, err := db.Exec("DELETE FROM storage_nodes WHERE id=?", id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("storage node %q not found", id)
	}
	return nil
}
