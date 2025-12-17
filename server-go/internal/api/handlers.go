package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/whereish/server/internal/auth"
	"github.com/whereish/server/internal/store"
)

const Version = "1.0.0"

// contextKey is a type for context keys
type contextKey string

const (
	userIDKey    contextKey = "userID"
	sessionKey   contextKey = "session"
)

// Server implements the generated ServerInterface
type Server struct {
	store          store.Store
	googleVerifier *auth.GoogleVerifier
	sessionDuration time.Duration
}

// NewServer creates a new API server
func NewServer(s store.Store, googleClientID string, sessionDuration time.Duration) *Server {
	return &Server{
		store:          s,
		googleVerifier: auth.NewGoogleVerifier(googleClientID),
		sessionDuration: sessionDuration,
	}
}

// AuthMiddleware validates session tokens and adds user ID to context
func (s *Server) AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip auth for health endpoint
		if r.URL.Path == "/api/health" || r.URL.Path == "/health" {
			next.ServeHTTP(w, r)
			return
		}

		// Skip auth for login endpoint
		if r.URL.Path == "/api/auth/google" || r.URL.Path == "/auth/google" {
			next.ServeHTTP(w, r)
			return
		}

		token := extractToken(r)
		if token == "" {
			writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
			return
		}

		session, err := s.store.Sessions().GetByToken(r.Context(), token)
		if err != nil {
			if errors.Is(err, store.ErrNotFound) {
				writeError(w, http.StatusUnauthorized, "unauthorized", "Invalid or expired session")
				return
			}
			log.Printf("Error getting session: %v", err)
			writeError(w, http.StatusInternalServerError, "internal_error", "Internal server error")
			return
		}

		// Add user ID and session to context
		ctx := context.WithValue(r.Context(), userIDKey, session.UserID)
		ctx = context.WithValue(ctx, sessionKey, session)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// GetHealth implements health check
func (s *Server) GetHealth(w http.ResponseWriter, r *http.Request) {
	resp := HealthResponse{
		Status:  Healthy,
		Version: ptr(Version),
	}
	writeJSON(w, http.StatusOK, resp)
}

// LoginWithGoogle implements Google OAuth login
func (s *Server) LoginWithGoogle(w http.ResponseWriter, r *http.Request) {
	var req GoogleLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	// Verify Google token
	claims, err := s.googleVerifier.Verify(r.Context(), req.IdToken)
	if err != nil {
		log.Printf("Google token verification failed: %v", err)
		writeError(w, http.StatusUnauthorized, "invalid_token", "Invalid Google token")
		return
	}

	// Find or create user
	user, err := s.store.Users().GetByGoogleID(r.Context(), claims.Sub)
	isNewUser := false

	if errors.Is(err, store.ErrNotFound) {
		// Check if user exists by email (link accounts)
		user, err = s.store.Users().GetByEmail(r.Context(), claims.Email)
		if errors.Is(err, store.ErrNotFound) {
			// Create new user
			user = &store.User{
				Email:    claims.Email,
				GoogleID: claims.Sub,
				Name:     claims.Name,
			}
			if err := s.store.Users().Create(r.Context(), user); err != nil {
				log.Printf("Error creating user: %v", err)
				writeError(w, http.StatusInternalServerError, "internal_error", "Failed to create user")
				return
			}
			isNewUser = true
		} else if err != nil {
			log.Printf("Error getting user by email: %v", err)
			writeError(w, http.StatusInternalServerError, "internal_error", "Internal server error")
			return
		} else {
			// Link Google ID to existing account
			user.GoogleID = claims.Sub
			if err := s.store.Users().Update(r.Context(), user); err != nil {
				log.Printf("Error updating user: %v", err)
			}
		}
	} else if err != nil {
		log.Printf("Error getting user by Google ID: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Internal server error")
		return
	}

	// Create session
	session := &store.Session{
		UserID:    user.ID,
		ExpiresAt: time.Now().Add(s.sessionDuration),
	}
	if err := s.store.Sessions().Create(r.Context(), session); err != nil {
		log.Printf("Error creating session: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Failed to create session")
		return
	}

	// Check for identity backup and user data
	_, identityErr := s.store.Users().GetIdentityBackup(r.Context(), user.ID)
	_, dataErr := s.store.Users().GetUserData(r.Context(), user.ID)

	resp := LoginResponse{
		Token: session.Token,
		User: User{
			Id:                user.ID,
			Email:             Email(user.Email),
			Name:              user.Name,
			CreatedAt:         user.CreatedAt,
			PublicKey:         ptr(user.PublicKey),
			HasIdentityBackup: ptr(!errors.Is(identityErr, store.ErrNotFound)),
			HasUserData:       ptr(!errors.Is(dataErr, store.ErrNotFound)),
		},
		IsNewUser: &isNewUser,
	}
	writeJSON(w, http.StatusOK, resp)
}

// Logout implements session termination
func (s *Server) Logout(w http.ResponseWriter, r *http.Request) {
	session := r.Context().Value(sessionKey).(*store.Session)
	if err := s.store.Sessions().Delete(r.Context(), session.Token); err != nil {
		log.Printf("Error deleting session: %v", err)
	}
	w.WriteHeader(http.StatusNoContent)
}

// DeleteAccount implements account deletion
func (s *Server) DeleteAccount(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(userIDKey).(string)

	// Delete user (cascades to all related data)
	if err := s.store.Users().Delete(r.Context(), userID); err != nil {
		log.Printf("Error deleting user: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Failed to delete account")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GetCurrentUser implements /me endpoint
func (s *Server) GetCurrentUser(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(userIDKey).(string)

	user, err := s.store.Users().GetByID(r.Context(), userID)
	if err != nil {
		log.Printf("Error getting user: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Internal server error")
		return
	}

	// Check for identity backup and user data
	_, identityErr := s.store.Users().GetIdentityBackup(r.Context(), user.ID)
	_, dataErr := s.store.Users().GetUserData(r.Context(), user.ID)

	resp := User{
		Id:                user.ID,
		Email:             Email(user.Email),
		Name:              user.Name,
		CreatedAt:         user.CreatedAt,
		PublicKey:         ptr(user.PublicKey),
		HasIdentityBackup: ptr(!errors.Is(identityErr, store.ErrNotFound)),
		HasUserData:       ptr(!errors.Is(dataErr, store.ErrNotFound)),
	}
	writeJSON(w, http.StatusOK, resp)
}

// GetIdentityBackup retrieves the encrypted identity backup
func (s *Server) GetIdentityBackup(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(userIDKey).(string)

	backup, err := s.store.Users().GetIdentityBackup(r.Context(), userID)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "No identity backup exists")
		return
	}
	if err != nil {
		log.Printf("Error getting identity backup: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Internal server error")
		return
	}

	resp := IdentityBackup{
		Algorithm:  IdentityBackupAlgorithm(backup.Algorithm),
		Kdf:        IdentityBackupKdf(backup.KDF),
		Iterations: backup.Iterations,
		Salt:       backup.Salt,
		Iv:         backup.IV,
		Payload:    backup.Payload,
	}
	writeJSON(w, http.StatusOK, resp)
}

// SetIdentityBackup stores the encrypted identity backup
func (s *Server) SetIdentityBackup(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(userIDKey).(string)

	var req IdentityBackup
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	backup := &store.IdentityBackup{
		Algorithm:  string(req.Algorithm),
		KDF:        string(req.Kdf),
		Iterations: req.Iterations,
		Salt:       req.Salt,
		IV:         req.Iv,
		Payload:    req.Payload,
	}

	if err := s.store.Users().SetIdentityBackup(r.Context(), userID, backup); err != nil {
		log.Printf("Error setting identity backup: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Failed to store identity backup")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// SetPublicKey registers the user's public key
func (s *Server) SetPublicKey(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(userIDKey).(string)

	var req PublicKeyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	if err := s.store.Users().SetPublicKey(r.Context(), userID, req.PublicKey); err != nil {
		log.Printf("Error setting public key: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Failed to set public key")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GetUserData retrieves the encrypted user data blob
func (s *Server) GetUserData(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(userIDKey).(string)

	data, err := s.store.Users().GetUserData(r.Context(), userID)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "No user data exists")
		return
	}
	if err != nil {
		log.Printf("Error getting user data: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Internal server error")
		return
	}

	resp := UserData{
		Version:   data.Version,
		UpdatedAt: data.UpdatedAt,
		Blob:      &data.Blob,
	}
	writeJSON(w, http.StatusOK, resp)
}

// SetUserData updates the encrypted user data blob
func (s *Server) SetUserData(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(userIDKey).(string)

	var req UserDataUpdate
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	data := &store.UserData{
		Blob: req.Blob,
	}

	if err := s.store.Users().SetUserData(r.Context(), userID, data, req.Version); err != nil {
		if errors.Is(err, store.ErrVersionConflict) {
			// Get current version for conflict response
			current, _ := s.store.Users().GetUserData(r.Context(), userID)
			version := 0
			if current != nil {
				version = current.Version
			}
			resp := ConflictError{
				CurrentVersion: version,
				Error: struct {
					Code    string `json:"code"`
					Message string `json:"message"`
				}{
					Code:    "version_conflict",
					Message: "Data has been modified by another device",
				},
			}
			writeJSON(w, http.StatusConflict, resp)
			return
		}
		log.Printf("Error setting user data: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Failed to update user data")
		return
	}

	resp := UserData{
		Version:   data.Version,
		UpdatedAt: data.UpdatedAt,
		Blob:      &data.Blob,
	}
	writeJSON(w, http.StatusOK, resp)
}

// ListContacts returns all contacts for the user
func (s *Server) ListContacts(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(userIDKey).(string)

	contacts, err := s.store.Contacts().ListContacts(r.Context(), userID)
	if err != nil {
		log.Printf("Error listing contacts: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Internal server error")
		return
	}

	apiContacts := make([]Contact, 0, len(contacts))
	for _, c := range contacts {
		apiContacts = append(apiContacts, Contact{
			Id:        c.ContactID,
			Email:     Email(c.Email),
			Name:      c.Name,
			PublicKey: c.PublicKey,
			CreatedAt: c.CreatedAt,
		})
	}

	resp := ContactList{Contacts: apiContacts}
	writeJSON(w, http.StatusOK, resp)
}

// RemoveContact removes a contact
func (s *Server) RemoveContact(w http.ResponseWriter, r *http.Request, contactId ContactId) {
	userID := r.Context().Value(userIDKey).(string)

	// Verify they are contacts
	areContacts, err := s.store.Contacts().AreContacts(r.Context(), userID, string(contactId))
	if err != nil {
		log.Printf("Error checking contacts: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Internal server error")
		return
	}
	if !areContacts {
		writeError(w, http.StatusNotFound, "not_found", "Contact not found")
		return
	}

	// Remove contact and locations
	if err := s.store.Contacts().RemoveContact(r.Context(), userID, string(contactId)); err != nil {
		log.Printf("Error removing contact: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Failed to remove contact")
		return
	}

	// Clean up locations between users
	s.store.Locations().DeleteLocationsBetween(r.Context(), userID, string(contactId))

	w.WriteHeader(http.StatusNoContent)
}

// SendContactRequest sends a contact request
func (s *Server) SendContactRequest(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(userIDKey).(string)

	var req ContactRequestCreate
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	// Find recipient by email
	recipient, err := s.store.Users().GetByEmail(r.Context(), string(req.Email))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "user_not_found", "User not found")
		return
	}
	if err != nil {
		log.Printf("Error finding user: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Internal server error")
		return
	}

	// Check not self
	if recipient.ID == userID {
		writeError(w, http.StatusBadRequest, "invalid_request", "Cannot send request to yourself")
		return
	}

	// Check not already contacts
	areContacts, err := s.store.Contacts().AreContacts(r.Context(), userID, recipient.ID)
	if err != nil {
		log.Printf("Error checking contacts: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Internal server error")
		return
	}
	if areContacts {
		writeError(w, http.StatusConflict, "already_contacts", "Already contacts with this user")
		return
	}

	// Check for existing pending request
	exists, err := s.store.Contacts().CheckExistingRequest(r.Context(), userID, recipient.ID)
	if err != nil {
		log.Printf("Error checking existing request: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Internal server error")
		return
	}
	if exists {
		writeError(w, http.StatusConflict, "request_exists", "A pending request already exists")
		return
	}

	// Create request
	request, err := s.store.Contacts().CreateRequest(r.Context(), userID, recipient.ID)
	if err != nil {
		log.Printf("Error creating request: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Failed to create request")
		return
	}

	resp := ContactRequest{
		Id:        request.ID,
		Email:     req.Email,
		Name:      &recipient.Name,
		Status:    Pending,
		Direction: ptr(Outgoing),
		CreatedAt: request.CreatedAt,
	}
	writeJSON(w, http.StatusCreated, resp)
}

// ListContactRequests returns pending contact requests
func (s *Server) ListContactRequests(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(userIDKey).(string)

	incoming, err := s.store.Contacts().ListIncomingRequests(r.Context(), userID)
	if err != nil {
		log.Printf("Error listing incoming requests: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Internal server error")
		return
	}

	outgoing, err := s.store.Contacts().ListOutgoingRequests(r.Context(), userID)
	if err != nil {
		log.Printf("Error listing outgoing requests: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Internal server error")
		return
	}

	// Convert to API types - need to fetch user info
	apiIncoming := make([]ContactRequest, 0, len(incoming))
	for _, req := range incoming {
		user, _ := s.store.Users().GetByID(r.Context(), req.RequesterID)
		cr := ContactRequest{
			Id:        req.ID,
			Status:    Pending,
			Direction: ptr(Incoming),
			CreatedAt: req.CreatedAt,
		}
		if user != nil {
			cr.Email = Email(user.Email)
			cr.Name = &user.Name
		}
		apiIncoming = append(apiIncoming, cr)
	}

	apiOutgoing := make([]ContactRequest, 0, len(outgoing))
	for _, req := range outgoing {
		user, _ := s.store.Users().GetByID(r.Context(), req.RecipientID)
		cr := ContactRequest{
			Id:        req.ID,
			Status:    Pending,
			Direction: ptr(Outgoing),
			CreatedAt: req.CreatedAt,
		}
		if user != nil {
			cr.Email = Email(user.Email)
			cr.Name = &user.Name
		}
		apiOutgoing = append(apiOutgoing, cr)
	}

	resp := ContactRequestList{
		Incoming: apiIncoming,
		Outgoing: apiOutgoing,
	}
	writeJSON(w, http.StatusOK, resp)
}

// AcceptContactRequest accepts a contact request
func (s *Server) AcceptContactRequest(w http.ResponseWriter, r *http.Request, requestId RequestId) {
	userID := r.Context().Value(userIDKey).(string)

	// Get the request first to return contact info
	request, err := s.store.Contacts().GetRequest(r.Context(), string(requestId))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "Request not found")
		return
	}
	if err != nil {
		log.Printf("Error getting request: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Internal server error")
		return
	}

	// Verify ownership
	if request.RecipientID != userID {
		writeError(w, http.StatusNotFound, "not_found", "Request not found")
		return
	}

	// Accept request
	if err := s.store.Contacts().AcceptRequest(r.Context(), string(requestId), userID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "Request not found")
			return
		}
		log.Printf("Error accepting request: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Failed to accept request")
		return
	}

	// Return the new contact
	requester, err := s.store.Users().GetByID(r.Context(), request.RequesterID)
	if err != nil {
		log.Printf("Error getting requester: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Internal server error")
		return
	}

	resp := Contact{
		Id:        requester.ID,
		Email:     Email(requester.Email),
		Name:      requester.Name,
		PublicKey: requester.PublicKey,
		CreatedAt: time.Now(),
	}
	writeJSON(w, http.StatusOK, resp)
}

// DeclineContactRequest declines a contact request
func (s *Server) DeclineContactRequest(w http.ResponseWriter, r *http.Request, requestId RequestId) {
	userID := r.Context().Value(userIDKey).(string)

	if err := s.store.Contacts().DeclineRequest(r.Context(), string(requestId), userID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "Request not found")
			return
		}
		log.Printf("Error declining request: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Failed to decline request")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// CancelContactRequest cancels an outgoing request
func (s *Server) CancelContactRequest(w http.ResponseWriter, r *http.Request, requestId RequestId) {
	userID := r.Context().Value(userIDKey).(string)

	if err := s.store.Contacts().CancelRequest(r.Context(), string(requestId), userID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "Request not found")
			return
		}
		log.Printf("Error canceling request: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Failed to cancel request")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GetLocations returns encrypted locations from contacts
func (s *Server) GetLocations(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(userIDKey).(string)

	locations, err := s.store.Locations().GetLocationsForUser(r.Context(), userID)
	if err != nil {
		log.Printf("Error getting locations: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Internal server error")
		return
	}

	apiLocations := make([]EncryptedLocation, 0, len(locations))
	for _, loc := range locations {
		apiLocations = append(apiLocations, EncryptedLocation{
			FromUserId: loc.FromUserID,
			Blob:       loc.Blob,
			UpdatedAt:  loc.UpdatedAt,
		})
	}

	resp := LocationList{Locations: apiLocations}
	writeJSON(w, http.StatusOK, resp)
}

// ShareLocations publishes encrypted locations to contacts
func (s *Server) ShareLocations(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(userIDKey).(string)

	var req LocationShareRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	// Verify all recipients are contacts
	for _, loc := range req.Locations {
		areContacts, err := s.store.Contacts().AreContacts(r.Context(), userID, loc.ToUserId)
		if err != nil {
			log.Printf("Error checking contacts: %v", err)
			writeError(w, http.StatusInternalServerError, "internal_error", "Internal server error")
			return
		}
		if !areContacts {
			writeError(w, http.StatusBadRequest, "invalid_recipient", "Can only share with contacts")
			return
		}
	}

	// Convert to store type
	storeLocations := make([]*store.EncryptedLocation, 0, len(req.Locations))
	for _, loc := range req.Locations {
		storeLocations = append(storeLocations, &store.EncryptedLocation{
			ToUserID: loc.ToUserId,
			Blob:     loc.Blob,
		})
	}

	if err := s.store.Locations().SetLocations(r.Context(), userID, storeLocations); err != nil {
		log.Printf("Error setting locations: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Failed to share locations")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ListDevices returns all devices for the user
func (s *Server) ListDevices(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(userIDKey).(string)
	session := r.Context().Value(sessionKey).(*store.Session)

	devices, err := s.store.Devices().List(r.Context(), userID)
	if err != nil {
		log.Printf("Error listing devices: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Internal server error")
		return
	}

	apiDevices := make([]Device, 0, len(devices))
	for _, d := range devices {
		device := Device{
			Id:        d.ID,
			Name:      d.Name,
			Platform:  DevicePlatform(d.Platform),
			CreatedAt: d.CreatedAt,
			LastSeen:  d.LastSeen,
			IsCurrent: ptr(d.ID == session.DeviceID),
			IsRevoked: ptr(d.RevokedAt != nil),
		}
		apiDevices = append(apiDevices, device)
	}

	resp := DeviceList{Devices: apiDevices}
	writeJSON(w, http.StatusOK, resp)
}

// RegisterDevice registers a new device
func (s *Server) RegisterDevice(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(userIDKey).(string)

	var req DeviceCreate
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	device := &store.Device{
		UserID:   userID,
		Name:     req.Name,
		Platform: string(req.Platform),
	}

	if err := s.store.Devices().Create(r.Context(), device); err != nil {
		log.Printf("Error creating device: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Failed to register device")
		return
	}

	resp := DeviceWithToken{
		Id:        device.ID,
		Name:      device.Name,
		Platform:  DeviceWithTokenPlatform(device.Platform),
		CreatedAt: device.CreatedAt,
		LastSeen:  device.LastSeen,
		Token:     device.Token,
	}
	writeJSON(w, http.StatusCreated, resp)
}

// RevokeDevice revokes a device
func (s *Server) RevokeDevice(w http.ResponseWriter, r *http.Request, deviceId DeviceId) {
	userID := r.Context().Value(userIDKey).(string)

	if err := s.store.Devices().Revoke(r.Context(), string(deviceId), userID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "Device not found")
			return
		}
		log.Printf("Error revoking device: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Failed to revoke device")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Helper functions

func extractToken(r *http.Request) string {
	auth := r.Header.Get("Authorization")
	if auth == "" {
		return ""
	}

	parts := strings.SplitN(auth, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}

	// Token may include device token: "sessionToken:deviceToken"
	// For now, just use the session token part
	token := parts[1]
	if idx := strings.Index(token, ":"); idx > 0 {
		token = token[:idx]
	}

	return token
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	resp := Error{
		Error: struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		}{
			Code:    code,
			Message: message,
		},
	}
	writeJSON(w, status, resp)
}

func ptr[T any](v T) *T {
	return &v
}

// Email is an alias for the generated email type
type Email = openapi_types.Email
