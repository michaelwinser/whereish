// Package store defines the storage interface for Whereish.
// Implementations exist for SQLite, Postgres, and Firestore.
package store

import (
	"context"
	"errors"
	"time"
)

// Common errors returned by store implementations
var (
	ErrNotFound        = errors.New("not found")
	ErrDuplicateKey    = errors.New("duplicate key")
	ErrVersionConflict = errors.New("version conflict")
)

// Store is the main interface for database operations.
// Each method returns a repository for a specific entity type.
type Store interface {
	Users() UserRepository
	Contacts() ContactRepository
	Devices() DeviceRepository
	Locations() LocationRepository
	Sessions() SessionRepository

	// Close releases database resources
	Close() error
}

// User represents a registered user
type User struct {
	ID        string
	Email     string
	GoogleID  string // nullable
	Name      string
	PublicKey string // Base64-encoded X25519 public key
	CreatedAt time.Time
}

// IdentityBackup stores the encrypted identity keypair
type IdentityBackup struct {
	Algorithm  string // e.g., "AES-256-GCM"
	KDF        string // e.g., "PBKDF2-SHA256"
	Iterations int
	Salt       string // Base64
	IV         string // Base64
	Payload    string // Base64 ciphertext
}

// UserData stores the encrypted user data blob
type UserData struct {
	Version   int
	UpdatedAt time.Time
	Blob      string // Base64 ciphertext
}

// UserRepository handles user-related database operations
type UserRepository interface {
	// Create creates a new user
	Create(ctx context.Context, user *User) error

	// GetByID retrieves a user by ID
	GetByID(ctx context.Context, id string) (*User, error)

	// GetByEmail retrieves a user by email
	GetByEmail(ctx context.Context, email string) (*User, error)

	// GetByGoogleID retrieves a user by Google OAuth ID
	GetByGoogleID(ctx context.Context, googleID string) (*User, error)

	// Update updates a user's profile
	Update(ctx context.Context, user *User) error

	// Delete deletes a user and all associated data
	Delete(ctx context.Context, id string) error

	// SetPublicKey sets the user's public key
	SetPublicKey(ctx context.Context, userID, publicKey string) error

	// Identity backup operations
	GetIdentityBackup(ctx context.Context, userID string) (*IdentityBackup, error)
	SetIdentityBackup(ctx context.Context, userID string, backup *IdentityBackup) error

	// User data operations
	GetUserData(ctx context.Context, userID string) (*UserData, error)
	SetUserData(ctx context.Context, userID string, data *UserData, expectedVersion int) error
}

// ContactRequest represents a pending contact request
type ContactRequest struct {
	ID          string
	RequesterID string
	RecipientID string
	Status      string // 'pending', 'accepted', 'declined'
	CreatedAt   time.Time
	AcceptedAt  *time.Time // nullable
}

// Contact represents an accepted contact relationship
type Contact struct {
	UserID    string
	ContactID string
	Name      string
	Email     string
	PublicKey string
	CreatedAt time.Time
}

// ContactRepository handles contact-related database operations
type ContactRepository interface {
	// ListContacts returns all contacts for a user
	ListContacts(ctx context.Context, userID string) ([]*Contact, error)

	// RemoveContact removes a bidirectional contact relationship
	RemoveContact(ctx context.Context, userID, contactID string) error

	// CreateRequest creates a new contact request
	CreateRequest(ctx context.Context, requesterID, recipientID string) (*ContactRequest, error)

	// GetRequest retrieves a contact request by ID
	GetRequest(ctx context.Context, requestID string) (*ContactRequest, error)

	// ListIncomingRequests returns pending requests received by the user
	ListIncomingRequests(ctx context.Context, userID string) ([]*ContactRequest, error)

	// ListOutgoingRequests returns pending requests sent by the user
	ListOutgoingRequests(ctx context.Context, userID string) ([]*ContactRequest, error)

	// AcceptRequest accepts a contact request (creates bidirectional contact)
	AcceptRequest(ctx context.Context, requestID, userID string) error

	// DeclineRequest declines a contact request
	DeclineRequest(ctx context.Context, requestID, userID string) error

	// CancelRequest cancels an outgoing contact request
	CancelRequest(ctx context.Context, requestID, userID string) error

	// CheckExistingRequest checks if a request or contact already exists
	CheckExistingRequest(ctx context.Context, requesterID, recipientID string) (bool, error)

	// AreContacts checks if two users are contacts
	AreContacts(ctx context.Context, userID, otherID string) (bool, error)
}

// Device represents a registered device
type Device struct {
	ID        string
	UserID    string
	Name      string
	Platform  string // 'ios', 'android', 'web', 'cli'
	Token     string // device-specific auth token
	CreatedAt time.Time
	LastSeen  time.Time
	RevokedAt *time.Time // nullable
}

// DeviceRepository handles device-related database operations
type DeviceRepository interface {
	// Create registers a new device
	Create(ctx context.Context, device *Device) error

	// List returns all devices for a user
	List(ctx context.Context, userID string) ([]*Device, error)

	// GetByID retrieves a device by ID
	GetByID(ctx context.Context, deviceID string) (*Device, error)

	// GetByToken retrieves a device by its auth token
	GetByToken(ctx context.Context, token string) (*Device, error)

	// UpdateLastSeen updates the device's last seen timestamp
	UpdateLastSeen(ctx context.Context, deviceID string) error

	// Revoke marks a device as revoked
	Revoke(ctx context.Context, deviceID, userID string) error
}

// EncryptedLocation represents an encrypted location shared between users
type EncryptedLocation struct {
	FromUserID string
	ToUserID   string
	Blob       string // Base64 NaCl box ciphertext
	UpdatedAt  time.Time
}

// LocationRepository handles location-related database operations
type LocationRepository interface {
	// GetLocationsForUser returns all locations shared TO a user
	GetLocationsForUser(ctx context.Context, userID string) ([]*EncryptedLocation, error)

	// SetLocations updates/creates locations shared FROM a user
	SetLocations(ctx context.Context, fromUserID string, locations []*EncryptedLocation) error

	// DeleteLocationsFromUser deletes all locations shared by a user
	DeleteLocationsFromUser(ctx context.Context, userID string) error

	// DeleteLocationsBetween deletes locations between two users
	DeleteLocationsBetween(ctx context.Context, userID, contactID string) error
}

// Session represents an authenticated session
type Session struct {
	Token     string
	UserID    string
	DeviceID  string // optional - may be empty
	CreatedAt time.Time
	ExpiresAt time.Time
}

// SessionRepository handles session-related database operations
type SessionRepository interface {
	// Create creates a new session
	Create(ctx context.Context, session *Session) error

	// GetByToken retrieves a session by token
	GetByToken(ctx context.Context, token string) (*Session, error)

	// Delete deletes a session
	Delete(ctx context.Context, token string) error

	// DeleteForUser deletes all sessions for a user
	DeleteForUser(ctx context.Context, userID string) error

	// DeleteExpired removes expired sessions
	DeleteExpired(ctx context.Context) error
}
