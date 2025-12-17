// Package sqlite provides a SQLite implementation of the store interface.
package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	_ "github.com/mattn/go-sqlite3"
	"github.com/whereish/server/internal/store"
)

// Store implements store.Store using SQLite
type Store struct {
	db *sql.DB
}

// New creates a new SQLite store
func New(dsn string) (*Store, error) {
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	// Enable WAL mode for better concurrent access
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		db.Close()
		return nil, fmt.Errorf("enable WAL: %w", err)
	}

	// Enable foreign keys
	if _, err := db.Exec("PRAGMA foreign_keys=ON"); err != nil {
		db.Close()
		return nil, fmt.Errorf("enable foreign keys: %w", err)
	}

	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}

	return s, nil
}

// migrate creates the database schema
func (s *Store) migrate() error {
	schema := `
	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		email TEXT UNIQUE NOT NULL,
		google_id TEXT UNIQUE,
		name TEXT NOT NULL,
		public_key TEXT,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS identity_backups (
		user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
		algorithm TEXT NOT NULL,
		kdf TEXT NOT NULL,
		iterations INTEGER NOT NULL,
		salt TEXT NOT NULL,
		iv TEXT NOT NULL,
		payload TEXT NOT NULL
	);

	CREATE TABLE IF NOT EXISTS user_data (
		user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
		version INTEGER NOT NULL DEFAULT 1,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		blob TEXT NOT NULL
	);

	CREATE TABLE IF NOT EXISTS contact_requests (
		id TEXT PRIMARY KEY,
		requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		status TEXT NOT NULL DEFAULT 'pending',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		accepted_at TIMESTAMP,
		UNIQUE(requester_id, recipient_id)
	);

	CREATE TABLE IF NOT EXISTS contacts (
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		contact_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (user_id, contact_id)
	);

	CREATE TABLE IF NOT EXISTS devices (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		platform TEXT NOT NULL,
		token TEXT UNIQUE NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		revoked_at TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS encrypted_locations (
		from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		blob TEXT NOT NULL,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (from_user_id, to_user_id)
	);

	CREATE TABLE IF NOT EXISTS sessions (
		token TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		expires_at TIMESTAMP NOT NULL
	);

	CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
	CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
	CREATE INDEX IF NOT EXISTS idx_contact_requests_recipient ON contact_requests(recipient_id);
	CREATE INDEX IF NOT EXISTS idx_contact_requests_requester ON contact_requests(requester_id);
	CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);
	CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);
	CREATE INDEX IF NOT EXISTS idx_devices_token ON devices(token);
	CREATE INDEX IF NOT EXISTS idx_locations_to ON encrypted_locations(to_user_id);
	CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
	CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
	`

	_, err := s.db.Exec(schema)
	return err
}

func (s *Store) Users() store.UserRepository       { return &userRepo{db: s.db} }
func (s *Store) Contacts() store.ContactRepository { return &contactRepo{db: s.db} }
func (s *Store) Devices() store.DeviceRepository   { return &deviceRepo{db: s.db} }
func (s *Store) Locations() store.LocationRepository {
	return &locationRepo{db: s.db}
}
func (s *Store) Sessions() store.SessionRepository { return &sessionRepo{db: s.db} }
func (s *Store) Close() error                      { return s.db.Close() }

// userRepo implements store.UserRepository
type userRepo struct {
	db *sql.DB
}

func (r *userRepo) Create(ctx context.Context, user *store.User) error {
	if user.ID == "" {
		user.ID = uuid.New().String()
	}
	if user.CreatedAt.IsZero() {
		user.CreatedAt = time.Now()
	}

	_, err := r.db.ExecContext(ctx, `
		INSERT INTO users (id, email, google_id, name, public_key, created_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`, user.ID, strings.ToLower(user.Email), nullString(user.GoogleID), user.Name, nullString(user.PublicKey), user.CreatedAt)

	if err != nil && strings.Contains(err.Error(), "UNIQUE") {
		return store.ErrDuplicateKey
	}
	return err
}

func (r *userRepo) GetByID(ctx context.Context, id string) (*store.User, error) {
	user := &store.User{}
	var googleID, publicKey sql.NullString
	err := r.db.QueryRowContext(ctx, `
		SELECT id, email, google_id, name, public_key, created_at
		FROM users WHERE id = ?
	`, id).Scan(&user.ID, &user.Email, &googleID, &user.Name, &publicKey, &user.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, store.ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	user.GoogleID = googleID.String
	user.PublicKey = publicKey.String
	return user, nil
}

func (r *userRepo) GetByEmail(ctx context.Context, email string) (*store.User, error) {
	user := &store.User{}
	var googleID, publicKey sql.NullString
	err := r.db.QueryRowContext(ctx, `
		SELECT id, email, google_id, name, public_key, created_at
		FROM users WHERE email = ?
	`, strings.ToLower(email)).Scan(&user.ID, &user.Email, &googleID, &user.Name, &publicKey, &user.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, store.ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	user.GoogleID = googleID.String
	user.PublicKey = publicKey.String
	return user, nil
}

func (r *userRepo) GetByGoogleID(ctx context.Context, googleID string) (*store.User, error) {
	user := &store.User{}
	var gid, publicKey sql.NullString
	err := r.db.QueryRowContext(ctx, `
		SELECT id, email, google_id, name, public_key, created_at
		FROM users WHERE google_id = ?
	`, googleID).Scan(&user.ID, &user.Email, &gid, &user.Name, &publicKey, &user.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, store.ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	user.GoogleID = gid.String
	user.PublicKey = publicKey.String
	return user, nil
}

func (r *userRepo) Update(ctx context.Context, user *store.User) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE users SET email = ?, name = ?, google_id = ?
		WHERE id = ?
	`, strings.ToLower(user.Email), user.Name, nullString(user.GoogleID), user.ID)

	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return store.ErrNotFound
	}
	return nil
}

func (r *userRepo) Delete(ctx context.Context, id string) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM users WHERE id = ?`, id)
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return store.ErrNotFound
	}
	return nil
}

func (r *userRepo) SetPublicKey(ctx context.Context, userID, publicKey string) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE users SET public_key = ? WHERE id = ?
	`, publicKey, userID)

	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return store.ErrNotFound
	}
	return nil
}

func (r *userRepo) GetIdentityBackup(ctx context.Context, userID string) (*store.IdentityBackup, error) {
	backup := &store.IdentityBackup{}
	err := r.db.QueryRowContext(ctx, `
		SELECT algorithm, kdf, iterations, salt, iv, payload
		FROM identity_backups WHERE user_id = ?
	`, userID).Scan(&backup.Algorithm, &backup.KDF, &backup.Iterations, &backup.Salt, &backup.IV, &backup.Payload)

	if err == sql.ErrNoRows {
		return nil, store.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return backup, nil
}

func (r *userRepo) SetIdentityBackup(ctx context.Context, userID string, backup *store.IdentityBackup) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO identity_backups (user_id, algorithm, kdf, iterations, salt, iv, payload)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(user_id) DO UPDATE SET
			algorithm = excluded.algorithm,
			kdf = excluded.kdf,
			iterations = excluded.iterations,
			salt = excluded.salt,
			iv = excluded.iv,
			payload = excluded.payload
	`, userID, backup.Algorithm, backup.KDF, backup.Iterations, backup.Salt, backup.IV, backup.Payload)

	return err
}

func (r *userRepo) GetUserData(ctx context.Context, userID string) (*store.UserData, error) {
	data := &store.UserData{}
	err := r.db.QueryRowContext(ctx, `
		SELECT version, updated_at, blob FROM user_data WHERE user_id = ?
	`, userID).Scan(&data.Version, &data.UpdatedAt, &data.Blob)

	if err == sql.ErrNoRows {
		return nil, store.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return data, nil
}

func (r *userRepo) SetUserData(ctx context.Context, userID string, data *store.UserData, expectedVersion int) error {
	data.UpdatedAt = time.Now()

	// For new data (version 0), just insert
	if expectedVersion == 0 {
		data.Version = 1
		_, err := r.db.ExecContext(ctx, `
			INSERT INTO user_data (user_id, version, updated_at, blob)
			VALUES (?, ?, ?, ?)
		`, userID, data.Version, data.UpdatedAt, data.Blob)
		if err != nil && strings.Contains(err.Error(), "UNIQUE") {
			return store.ErrVersionConflict
		}
		return err
	}

	// For updates, check version
	result, err := r.db.ExecContext(ctx, `
		UPDATE user_data SET version = version + 1, updated_at = ?, blob = ?
		WHERE user_id = ? AND version = ?
	`, data.UpdatedAt, data.Blob, userID, expectedVersion)

	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return store.ErrVersionConflict
	}
	data.Version = expectedVersion + 1
	return nil
}

// contactRepo implements store.ContactRepository
type contactRepo struct {
	db *sql.DB
}

func (r *contactRepo) ListContacts(ctx context.Context, userID string) ([]*store.Contact, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT c.contact_id, u.name, u.email, u.public_key, c.created_at
		FROM contacts c
		JOIN users u ON u.id = c.contact_id
		WHERE c.user_id = ?
		ORDER BY u.name
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var contacts []*store.Contact
	for rows.Next() {
		c := &store.Contact{UserID: userID}
		var publicKey sql.NullString
		if err := rows.Scan(&c.ContactID, &c.Name, &c.Email, &publicKey, &c.CreatedAt); err != nil {
			return nil, err
		}
		c.PublicKey = publicKey.String
		contacts = append(contacts, c)
	}
	return contacts, rows.Err()
}

func (r *contactRepo) RemoveContact(ctx context.Context, userID, contactID string) error {
	// Remove both directions
	_, err := r.db.ExecContext(ctx, `
		DELETE FROM contacts
		WHERE (user_id = ? AND contact_id = ?) OR (user_id = ? AND contact_id = ?)
	`, userID, contactID, contactID, userID)
	return err
}

func (r *contactRepo) CreateRequest(ctx context.Context, requesterID, recipientID string) (*store.ContactRequest, error) {
	req := &store.ContactRequest{
		ID:          uuid.New().String(),
		RequesterID: requesterID,
		RecipientID: recipientID,
		Status:      "pending",
		CreatedAt:   time.Now(),
	}

	_, err := r.db.ExecContext(ctx, `
		INSERT INTO contact_requests (id, requester_id, recipient_id, status, created_at)
		VALUES (?, ?, ?, ?, ?)
	`, req.ID, req.RequesterID, req.RecipientID, req.Status, req.CreatedAt)

	if err != nil && strings.Contains(err.Error(), "UNIQUE") {
		return nil, store.ErrDuplicateKey
	}
	return req, err
}

func (r *contactRepo) GetRequest(ctx context.Context, requestID string) (*store.ContactRequest, error) {
	req := &store.ContactRequest{}
	var acceptedAt sql.NullTime
	err := r.db.QueryRowContext(ctx, `
		SELECT id, requester_id, recipient_id, status, created_at, accepted_at
		FROM contact_requests WHERE id = ?
	`, requestID).Scan(&req.ID, &req.RequesterID, &req.RecipientID, &req.Status, &req.CreatedAt, &acceptedAt)

	if err == sql.ErrNoRows {
		return nil, store.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if acceptedAt.Valid {
		req.AcceptedAt = &acceptedAt.Time
	}
	return req, nil
}

func (r *contactRepo) ListIncomingRequests(ctx context.Context, userID string) ([]*store.ContactRequest, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT cr.id, cr.requester_id, cr.recipient_id, cr.status, cr.created_at, u.name, u.email
		FROM contact_requests cr
		JOIN users u ON u.id = cr.requester_id
		WHERE cr.recipient_id = ? AND cr.status = 'pending'
		ORDER BY cr.created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var requests []*store.ContactRequest
	for rows.Next() {
		req := &store.ContactRequest{}
		var name, email string
		if err := rows.Scan(&req.ID, &req.RequesterID, &req.RecipientID, &req.Status, &req.CreatedAt, &name, &email); err != nil {
			return nil, err
		}
		requests = append(requests, req)
	}
	return requests, rows.Err()
}

func (r *contactRepo) ListOutgoingRequests(ctx context.Context, userID string) ([]*store.ContactRequest, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT cr.id, cr.requester_id, cr.recipient_id, cr.status, cr.created_at, u.name, u.email
		FROM contact_requests cr
		JOIN users u ON u.id = cr.recipient_id
		WHERE cr.requester_id = ? AND cr.status = 'pending'
		ORDER BY cr.created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var requests []*store.ContactRequest
	for rows.Next() {
		req := &store.ContactRequest{}
		var name, email string
		if err := rows.Scan(&req.ID, &req.RequesterID, &req.RecipientID, &req.Status, &req.CreatedAt, &name, &email); err != nil {
			return nil, err
		}
		requests = append(requests, req)
	}
	return requests, rows.Err()
}

func (r *contactRepo) AcceptRequest(ctx context.Context, requestID, userID string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Get the request and verify ownership
	var requesterID, recipientID, status string
	err = tx.QueryRowContext(ctx, `
		SELECT requester_id, recipient_id, status FROM contact_requests WHERE id = ?
	`, requestID).Scan(&requesterID, &recipientID, &status)

	if err == sql.ErrNoRows {
		return store.ErrNotFound
	}
	if err != nil {
		return err
	}

	// Verify the user is the recipient
	if recipientID != userID {
		return store.ErrNotFound
	}

	// Verify status is pending
	if status != "pending" {
		return store.ErrNotFound
	}

	// Update request status
	now := time.Now()
	_, err = tx.ExecContext(ctx, `
		UPDATE contact_requests SET status = 'accepted', accepted_at = ? WHERE id = ?
	`, now, requestID)
	if err != nil {
		return err
	}

	// Create bidirectional contact relationship
	_, err = tx.ExecContext(ctx, `
		INSERT INTO contacts (user_id, contact_id, created_at)
		VALUES (?, ?, ?), (?, ?, ?)
	`, requesterID, recipientID, now, recipientID, requesterID, now)
	if err != nil {
		return err
	}

	return tx.Commit()
}

func (r *contactRepo) DeclineRequest(ctx context.Context, requestID, userID string) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE contact_requests SET status = 'declined'
		WHERE id = ? AND recipient_id = ? AND status = 'pending'
	`, requestID, userID)

	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return store.ErrNotFound
	}
	return nil
}

func (r *contactRepo) CancelRequest(ctx context.Context, requestID, userID string) error {
	result, err := r.db.ExecContext(ctx, `
		DELETE FROM contact_requests
		WHERE id = ? AND requester_id = ? AND status = 'pending'
	`, requestID, userID)

	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return store.ErrNotFound
	}
	return nil
}

func (r *contactRepo) CheckExistingRequest(ctx context.Context, requesterID, recipientID string) (bool, error) {
	var count int
	err := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM contact_requests
		WHERE ((requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?))
		AND status = 'pending'
	`, requesterID, recipientID, recipientID, requesterID).Scan(&count)

	return count > 0, err
}

func (r *contactRepo) AreContacts(ctx context.Context, userID, otherID string) (bool, error) {
	var count int
	err := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM contacts WHERE user_id = ? AND contact_id = ?
	`, userID, otherID).Scan(&count)

	return count > 0, err
}

// deviceRepo implements store.DeviceRepository
type deviceRepo struct {
	db *sql.DB
}

func (r *deviceRepo) Create(ctx context.Context, device *store.Device) error {
	if device.ID == "" {
		device.ID = uuid.New().String()
	}
	if device.Token == "" {
		device.Token = uuid.New().String()
	}
	if device.CreatedAt.IsZero() {
		device.CreatedAt = time.Now()
	}
	device.LastSeen = device.CreatedAt

	_, err := r.db.ExecContext(ctx, `
		INSERT INTO devices (id, user_id, name, platform, token, created_at, last_seen)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, device.ID, device.UserID, device.Name, device.Platform, device.Token, device.CreatedAt, device.LastSeen)

	return err
}

func (r *deviceRepo) List(ctx context.Context, userID string) ([]*store.Device, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, user_id, name, platform, token, created_at, last_seen, revoked_at
		FROM devices WHERE user_id = ?
		ORDER BY last_seen DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var devices []*store.Device
	for rows.Next() {
		d := &store.Device{}
		var revokedAt sql.NullTime
		if err := rows.Scan(&d.ID, &d.UserID, &d.Name, &d.Platform, &d.Token, &d.CreatedAt, &d.LastSeen, &revokedAt); err != nil {
			return nil, err
		}
		if revokedAt.Valid {
			d.RevokedAt = &revokedAt.Time
		}
		devices = append(devices, d)
	}
	return devices, rows.Err()
}

func (r *deviceRepo) GetByID(ctx context.Context, deviceID string) (*store.Device, error) {
	d := &store.Device{}
	var revokedAt sql.NullTime
	err := r.db.QueryRowContext(ctx, `
		SELECT id, user_id, name, platform, token, created_at, last_seen, revoked_at
		FROM devices WHERE id = ?
	`, deviceID).Scan(&d.ID, &d.UserID, &d.Name, &d.Platform, &d.Token, &d.CreatedAt, &d.LastSeen, &revokedAt)

	if err == sql.ErrNoRows {
		return nil, store.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if revokedAt.Valid {
		d.RevokedAt = &revokedAt.Time
	}
	return d, nil
}

func (r *deviceRepo) GetByToken(ctx context.Context, token string) (*store.Device, error) {
	d := &store.Device{}
	var revokedAt sql.NullTime
	err := r.db.QueryRowContext(ctx, `
		SELECT id, user_id, name, platform, token, created_at, last_seen, revoked_at
		FROM devices WHERE token = ?
	`, token).Scan(&d.ID, &d.UserID, &d.Name, &d.Platform, &d.Token, &d.CreatedAt, &d.LastSeen, &revokedAt)

	if err == sql.ErrNoRows {
		return nil, store.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if revokedAt.Valid {
		d.RevokedAt = &revokedAt.Time
	}
	return d, nil
}

func (r *deviceRepo) UpdateLastSeen(ctx context.Context, deviceID string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE devices SET last_seen = ? WHERE id = ?
	`, time.Now(), deviceID)
	return err
}

func (r *deviceRepo) Revoke(ctx context.Context, deviceID, userID string) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE devices SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL
	`, time.Now(), deviceID, userID)

	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return store.ErrNotFound
	}
	return nil
}

// locationRepo implements store.LocationRepository
type locationRepo struct {
	db *sql.DB
}

func (r *locationRepo) GetLocationsForUser(ctx context.Context, userID string) ([]*store.EncryptedLocation, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT from_user_id, to_user_id, blob, updated_at
		FROM encrypted_locations WHERE to_user_id = ?
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var locations []*store.EncryptedLocation
	for rows.Next() {
		loc := &store.EncryptedLocation{}
		if err := rows.Scan(&loc.FromUserID, &loc.ToUserID, &loc.Blob, &loc.UpdatedAt); err != nil {
			return nil, err
		}
		locations = append(locations, loc)
	}
	return locations, rows.Err()
}

func (r *locationRepo) SetLocations(ctx context.Context, fromUserID string, locations []*store.EncryptedLocation) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO encrypted_locations (from_user_id, to_user_id, blob, updated_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(from_user_id, to_user_id) DO UPDATE SET
			blob = excluded.blob,
			updated_at = excluded.updated_at
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	now := time.Now()
	for _, loc := range locations {
		loc.FromUserID = fromUserID
		loc.UpdatedAt = now
		if _, err := stmt.ExecContext(ctx, loc.FromUserID, loc.ToUserID, loc.Blob, loc.UpdatedAt); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (r *locationRepo) DeleteLocationsFromUser(ctx context.Context, userID string) error {
	_, err := r.db.ExecContext(ctx, `
		DELETE FROM encrypted_locations WHERE from_user_id = ?
	`, userID)
	return err
}

func (r *locationRepo) DeleteLocationsBetween(ctx context.Context, userID, contactID string) error {
	_, err := r.db.ExecContext(ctx, `
		DELETE FROM encrypted_locations
		WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)
	`, userID, contactID, contactID, userID)
	return err
}

// sessionRepo implements store.SessionRepository
type sessionRepo struct {
	db *sql.DB
}

func (r *sessionRepo) Create(ctx context.Context, session *store.Session) error {
	if session.Token == "" {
		session.Token = uuid.New().String()
	}
	if session.CreatedAt.IsZero() {
		session.CreatedAt = time.Now()
	}

	_, err := r.db.ExecContext(ctx, `
		INSERT INTO sessions (token, user_id, device_id, created_at, expires_at)
		VALUES (?, ?, ?, ?, ?)
	`, session.Token, session.UserID, nullString(session.DeviceID), session.CreatedAt, session.ExpiresAt)

	return err
}

func (r *sessionRepo) GetByToken(ctx context.Context, token string) (*store.Session, error) {
	s := &store.Session{}
	var deviceID sql.NullString
	err := r.db.QueryRowContext(ctx, `
		SELECT token, user_id, device_id, created_at, expires_at
		FROM sessions WHERE token = ? AND expires_at > ?
	`, token, time.Now()).Scan(&s.Token, &s.UserID, &deviceID, &s.CreatedAt, &s.ExpiresAt)

	if err == sql.ErrNoRows {
		return nil, store.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	s.DeviceID = deviceID.String
	return s, nil
}

func (r *sessionRepo) Delete(ctx context.Context, token string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM sessions WHERE token = ?`, token)
	return err
}

func (r *sessionRepo) DeleteForUser(ctx context.Context, userID string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = ?`, userID)
	return err
}

func (r *sessionRepo) DeleteExpired(ctx context.Context) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at < ?`, time.Now())
	return err
}

// nullString converts an empty string to sql.NullString
func nullString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}
