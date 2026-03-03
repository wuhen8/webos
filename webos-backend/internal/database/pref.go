package database

import "encoding/json"

// GetPreference reads a single preference value by key.
// Returns empty string and nil error if the key does not exist.
func GetPreference(key string) (string, error) {
	if db == nil {
		return "", nil
	}
	var val string
	err := db.QueryRow("SELECT value FROM preferences WHERE key = ?", key).Scan(&val)
	if err != nil {
		return "", nil // key not found is not an error
	}
	return val, nil
}

// SetPreference writes a single preference value.
// The value is JSON-encoded (double-encoded string) to match savePreferencesData format.
func SetPreference(key, value string) error {
	encoded, err := json.Marshal(value)
	if err != nil {
		return err
	}
	_, err = db.Exec(
		"INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
		key, string(encoded),
	)
	return err
}
