package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/whereish/server/internal/store"
	"github.com/whereish/server/internal/store/sqlite"
)

// testServer creates a test server with an in-memory SQLite store
func testServer(t *testing.T) (*Server, *sqlite.Store) {
	t.Helper()

	st, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("failed to create test store: %v", err)
	}
	t.Cleanup(func() { st.Close() })

	server := NewServer(st, "test-google-client-id", 24*time.Hour)
	return server, st
}

// testRouter creates a router with all handlers mounted
func testRouter(t *testing.T, server *Server) *chi.Mux {
	t.Helper()

	r := chi.NewRouter()
	r.Use(server.AuthMiddleware)
	HandlerFromMuxWithBaseURL(server, r, "/api")
	r.Post("/api/dev/login", server.DevLogin)

	return r
}

// createTestUser creates a user and returns a session token
func createTestUser(t *testing.T, st *sqlite.Store, email, name string) (string, *store.User) {
	t.Helper()
	ctx := context.Background()

	user := &store.User{
		Email: email,
		Name:  name,
	}
	if err := st.Users().Create(ctx, user); err != nil {
		t.Fatalf("failed to create test user: %v", err)
	}

	session := &store.Session{
		UserID:    user.ID,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}
	if err := st.Sessions().Create(ctx, session); err != nil {
		t.Fatalf("failed to create test session: %v", err)
	}

	return session.Token, user
}

// doRequest performs an HTTP request and returns the response
func doRequest(t *testing.T, r http.Handler, method, path string, body interface{}, token string) *httptest.ResponseRecorder {
	t.Helper()

	var reqBody *bytes.Buffer
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("failed to marshal request body: %v", err)
		}
		reqBody = bytes.NewBuffer(data)
	} else {
		reqBody = &bytes.Buffer{}
	}

	req := httptest.NewRequest(method, path, reqBody)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

// =============================================================================
// Health Tests
// =============================================================================

func TestGetHealth(t *testing.T) {
	server, _ := testServer(t)
	r := testRouter(t, server)

	rec := doRequest(t, r, "GET", "/api/health", nil, "")

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var resp HealthResponse
	json.NewDecoder(rec.Body).Decode(&resp)

	if resp.Status != "healthy" {
		t.Errorf("status = %q, want %q", resp.Status, "healthy")
	}
}

// =============================================================================
// Auth Tests
// =============================================================================

func TestDevLogin(t *testing.T) {
	server, _ := testServer(t)
	r := testRouter(t, server)

	body := map[string]string{
		"email": "test@example.com",
		"name":  "Test User",
	}

	rec := doRequest(t, r, "POST", "/api/dev/login", body, "")

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d; body = %s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var resp LoginResponse
	json.NewDecoder(rec.Body).Decode(&resp)

	if resp.Token == "" {
		t.Error("expected token to be set")
	}
	if resp.User.Email != "test@example.com" {
		t.Errorf("email = %q, want %q", resp.User.Email, "test@example.com")
	}
}

func TestDevLogin_ExistingUser(t *testing.T) {
	server, st := testServer(t)
	r := testRouter(t, server)

	// Create existing user
	ctx := context.Background()
	user := &store.User{Email: "existing@example.com", Name: "Existing"}
	st.Users().Create(ctx, user)

	body := map[string]string{"email": "existing@example.com"}
	rec := doRequest(t, r, "POST", "/api/dev/login", body, "")

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var resp LoginResponse
	json.NewDecoder(rec.Body).Decode(&resp)

	if resp.User.Id != user.ID {
		t.Errorf("user ID = %q, want %q", resp.User.Id, user.ID)
	}
}

func TestLogout(t *testing.T) {
	server, st := testServer(t)
	r := testRouter(t, server)

	token, _ := createTestUser(t, st, "test@example.com", "Test")

	rec := doRequest(t, r, "POST", "/api/auth/logout", nil, token)

	if rec.Code != http.StatusNoContent {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusNoContent)
	}

	// Token should no longer work
	rec = doRequest(t, r, "GET", "/api/me", nil, token)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 after logout, got %d", rec.Code)
	}
}

func TestGetCurrentUser(t *testing.T) {
	server, st := testServer(t)
	r := testRouter(t, server)

	token, user := createTestUser(t, st, "test@example.com", "Test User")

	rec := doRequest(t, r, "GET", "/api/me", nil, token)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var resp User
	json.NewDecoder(rec.Body).Decode(&resp)

	if string(resp.Email) != user.Email {
		t.Errorf("email = %q, want %q", resp.Email, user.Email)
	}
}

func TestGetCurrentUser_Unauthorized(t *testing.T) {
	server, _ := testServer(t)
	r := testRouter(t, server)

	rec := doRequest(t, r, "GET", "/api/me", nil, "")

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

// =============================================================================
// Identity Tests
// =============================================================================

func TestIdentityBackup(t *testing.T) {
	server, st := testServer(t)
	r := testRouter(t, server)

	token, _ := createTestUser(t, st, "test@example.com", "Test")

	// Initially no backup
	rec := doRequest(t, r, "GET", "/api/identity/backup", nil, token)
	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404 for no backup, got %d", rec.Code)
	}

	// Set backup
	backup := IdentityBackup{
		Algorithm:  "AES-256-GCM",
		Kdf:        "PBKDF2-SHA256",
		Iterations: 100000,
		Salt:       "dGVzdHNhbHQ=",
		Iv:         "dGVzdGl2",
		Payload:    "ZW5jcnlwdGVk",
	}

	rec = doRequest(t, r, "PUT", "/api/identity/backup", backup, token)
	if rec.Code != http.StatusNoContent {
		t.Errorf("PUT status = %d, want %d; body = %s", rec.Code, http.StatusNoContent, rec.Body.String())
	}

	// Get backup
	rec = doRequest(t, r, "GET", "/api/identity/backup", nil, token)
	if rec.Code != http.StatusOK {
		t.Errorf("GET status = %d, want %d", rec.Code, http.StatusOK)
	}

	var got IdentityBackup
	json.NewDecoder(rec.Body).Decode(&got)

	if got.Algorithm != backup.Algorithm {
		t.Errorf("algorithm = %q, want %q", got.Algorithm, backup.Algorithm)
	}
}

func TestSetPublicKey(t *testing.T) {
	server, st := testServer(t)
	r := testRouter(t, server)

	token, user := createTestUser(t, st, "test@example.com", "Test")

	body := PublicKeyRequest{PublicKey: "base64publickey"}
	rec := doRequest(t, r, "POST", "/api/identity/public-key", body, token)

	if rec.Code != http.StatusNoContent {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusNoContent)
	}

	// Verify via store
	ctx := context.Background()
	got, _ := st.Users().GetByID(ctx, user.ID)
	if got.PublicKey != "base64publickey" {
		t.Errorf("publicKey = %q, want %q", got.PublicKey, "base64publickey")
	}
}

// =============================================================================
// Contact Tests
// =============================================================================

func TestListContacts_Empty(t *testing.T) {
	server, st := testServer(t)
	r := testRouter(t, server)

	token, _ := createTestUser(t, st, "test@example.com", "Test")

	rec := doRequest(t, r, "GET", "/api/contacts", nil, token)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var resp ContactList
	json.NewDecoder(rec.Body).Decode(&resp)

	if len(resp.Contacts) != 0 {
		t.Errorf("contacts = %d, want 0", len(resp.Contacts))
	}
}

func TestContactRequestFlow(t *testing.T) {
	server, st := testServer(t)
	r := testRouter(t, server)

	// Create two users
	tokenA, _ := createTestUser(t, st, "alice@example.com", "Alice")
	tokenB, userB := createTestUser(t, st, "bob@example.com", "Bob")

	// Alice sends request to Bob
	body := ContactRequestCreate{Email: "bob@example.com"}
	rec := doRequest(t, r, "POST", "/api/contacts/request", body, tokenA)

	if rec.Code != http.StatusCreated {
		t.Errorf("send request status = %d, want %d; body = %s", rec.Code, http.StatusCreated, rec.Body.String())
	}

	var req ContactRequest
	json.NewDecoder(rec.Body).Decode(&req)
	requestID := req.Id

	// Bob checks incoming requests
	rec = doRequest(t, r, "GET", "/api/contacts/requests", nil, tokenB)
	if rec.Code != http.StatusOK {
		t.Errorf("list requests status = %d, want %d", rec.Code, http.StatusOK)
	}

	var requests ContactRequestList
	json.NewDecoder(rec.Body).Decode(&requests)

	if len(requests.Incoming) != 1 {
		t.Errorf("incoming = %d, want 1", len(requests.Incoming))
	}

	// Bob accepts
	rec = doRequest(t, r, "POST", "/api/contacts/requests/"+requestID+"/accept", nil, tokenB)
	if rec.Code != http.StatusOK {
		t.Errorf("accept status = %d, want %d; body = %s", rec.Code, http.StatusOK, rec.Body.String())
	}

	// Both should see each other as contacts
	rec = doRequest(t, r, "GET", "/api/contacts", nil, tokenA)
	var contactsA ContactList
	json.NewDecoder(rec.Body).Decode(&contactsA)

	if len(contactsA.Contacts) != 1 {
		t.Errorf("Alice contacts = %d, want 1", len(contactsA.Contacts))
	}
	if contactsA.Contacts[0].Id != userB.ID {
		t.Errorf("Alice's contact ID = %q, want %q", contactsA.Contacts[0].Id, userB.ID)
	}

	rec = doRequest(t, r, "GET", "/api/contacts", nil, tokenB)
	var contactsB ContactList
	json.NewDecoder(rec.Body).Decode(&contactsB)

	if len(contactsB.Contacts) != 1 {
		t.Errorf("Bob contacts = %d, want 1", len(contactsB.Contacts))
	}
}

func TestContactRequestDecline(t *testing.T) {
	server, st := testServer(t)
	r := testRouter(t, server)

	tokenA, _ := createTestUser(t, st, "alice@example.com", "Alice")
	tokenB, _ := createTestUser(t, st, "bob@example.com", "Bob")

	// Alice sends request
	body := ContactRequestCreate{Email: "bob@example.com"}
	rec := doRequest(t, r, "POST", "/api/contacts/request", body, tokenA)

	var req ContactRequest
	json.NewDecoder(rec.Body).Decode(&req)

	// Bob declines
	rec = doRequest(t, r, "POST", "/api/contacts/requests/"+req.Id+"/decline", nil, tokenB)
	if rec.Code != http.StatusNoContent {
		t.Errorf("decline status = %d, want %d", rec.Code, http.StatusNoContent)
	}

	// No contacts created
	rec = doRequest(t, r, "GET", "/api/contacts", nil, tokenA)
	var contacts ContactList
	json.NewDecoder(rec.Body).Decode(&contacts)

	if len(contacts.Contacts) != 0 {
		t.Errorf("contacts after decline = %d, want 0", len(contacts.Contacts))
	}
}

func TestRemoveContact(t *testing.T) {
	server, st := testServer(t)
	r := testRouter(t, server)

	tokenA, _ := createTestUser(t, st, "alice@example.com", "Alice")
	tokenB, userB := createTestUser(t, st, "bob@example.com", "Bob")

	// Create contact
	body := ContactRequestCreate{Email: "bob@example.com"}
	rec := doRequest(t, r, "POST", "/api/contacts/request", body, tokenA)
	var req ContactRequest
	json.NewDecoder(rec.Body).Decode(&req)
	doRequest(t, r, "POST", "/api/contacts/requests/"+req.Id+"/accept", nil, tokenB)

	// Alice removes Bob
	rec = doRequest(t, r, "DELETE", "/api/contacts/"+userB.ID, nil, tokenA)
	if rec.Code != http.StatusNoContent {
		t.Errorf("remove status = %d, want %d", rec.Code, http.StatusNoContent)
	}

	// Both should have no contacts
	rec = doRequest(t, r, "GET", "/api/contacts", nil, tokenA)
	var contactsA ContactList
	json.NewDecoder(rec.Body).Decode(&contactsA)
	if len(contactsA.Contacts) != 0 {
		t.Errorf("Alice contacts after remove = %d, want 0", len(contactsA.Contacts))
	}
}

// =============================================================================
// Location Tests
// =============================================================================

func TestShareAndGetLocations(t *testing.T) {
	server, st := testServer(t)
	r := testRouter(t, server)

	// Create two users and make them contacts
	tokenA, userA := createTestUser(t, st, "alice@example.com", "Alice")
	tokenB, userB := createTestUser(t, st, "bob@example.com", "Bob")

	// Set public keys
	ctx := context.Background()
	st.Users().SetPublicKey(ctx, userA.ID, "alicePubKey")
	st.Users().SetPublicKey(ctx, userB.ID, "bobPubKey")

	// Make contacts
	body := ContactRequestCreate{Email: "bob@example.com"}
	rec := doRequest(t, r, "POST", "/api/contacts/request", body, tokenA)
	var req ContactRequest
	json.NewDecoder(rec.Body).Decode(&req)
	doRequest(t, r, "POST", "/api/contacts/requests/"+req.Id+"/accept", nil, tokenB)

	// Alice shares location
	shareBody := LocationShareRequest{
		Locations: []LocationShare{
			{ToUserId: userB.ID, Blob: "encrypted_location_for_bob"},
		},
	}
	rec = doRequest(t, r, "POST", "/api/locations", shareBody, tokenA)
	if rec.Code != http.StatusNoContent {
		t.Errorf("share status = %d, want %d; body = %s", rec.Code, http.StatusNoContent, rec.Body.String())
	}

	// Bob gets locations
	rec = doRequest(t, r, "GET", "/api/locations", nil, tokenB)
	if rec.Code != http.StatusOK {
		t.Errorf("get locations status = %d, want %d", rec.Code, http.StatusOK)
	}

	var locations LocationList
	json.NewDecoder(rec.Body).Decode(&locations)

	if len(locations.Locations) != 1 {
		t.Errorf("locations = %d, want 1", len(locations.Locations))
	}
	if locations.Locations[0].Blob != "encrypted_location_for_bob" {
		t.Errorf("blob = %q, want %q", locations.Locations[0].Blob, "encrypted_location_for_bob")
	}
}

// =============================================================================
// Device Tests
// =============================================================================

func TestDeviceOperations(t *testing.T) {
	server, st := testServer(t)
	r := testRouter(t, server)

	token, _ := createTestUser(t, st, "test@example.com", "Test")

	// Initially no devices
	rec := doRequest(t, r, "GET", "/api/devices", nil, token)
	if rec.Code != http.StatusOK {
		t.Errorf("list status = %d, want %d", rec.Code, http.StatusOK)
	}

	var devices DeviceList
	json.NewDecoder(rec.Body).Decode(&devices)
	if len(devices.Devices) != 0 {
		t.Errorf("initial devices = %d, want 0", len(devices.Devices))
	}

	// Register device
	regBody := DeviceCreate{Name: "Test Phone", Platform: DeviceCreatePlatformIos}
	rec = doRequest(t, r, "POST", "/api/devices", regBody, token)
	if rec.Code != http.StatusCreated {
		t.Errorf("register status = %d, want %d; body = %s", rec.Code, http.StatusCreated, rec.Body.String())
	}

	var device DeviceWithToken
	json.NewDecoder(rec.Body).Decode(&device)
	deviceID := device.Id
	deviceToken := device.Token

	if deviceToken == "" {
		t.Error("expected device token to be set")
	}

	// List devices
	rec = doRequest(t, r, "GET", "/api/devices", nil, token)
	json.NewDecoder(rec.Body).Decode(&devices)
	if len(devices.Devices) != 1 {
		t.Errorf("devices after register = %d, want 1", len(devices.Devices))
	}

	// Revoke device
	rec = doRequest(t, r, "DELETE", "/api/devices/"+deviceID, nil, token)
	if rec.Code != http.StatusNoContent {
		t.Errorf("revoke status = %d, want %d", rec.Code, http.StatusNoContent)
	}

	// Device should show as revoked
	rec = doRequest(t, r, "GET", "/api/devices", nil, token)
	json.NewDecoder(rec.Body).Decode(&devices)
	if devices.Devices[0].IsRevoked == nil || !*devices.Devices[0].IsRevoked {
		t.Error("expected device to be revoked")
	}
}

// =============================================================================
// User Data Tests
// =============================================================================

func TestUserData(t *testing.T) {
	server, st := testServer(t)
	r := testRouter(t, server)

	token, _ := createTestUser(t, st, "test@example.com", "Test")

	// Initially no user data
	rec := doRequest(t, r, "GET", "/api/user-data", nil, token)
	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404 for no user data, got %d", rec.Code)
	}

	// Set user data
	body := UserDataUpdate{Version: 0, Blob: "encrypted_user_data"}
	rec = doRequest(t, r, "PUT", "/api/user-data", body, token)
	if rec.Code != http.StatusOK {
		t.Errorf("PUT status = %d, want %d; body = %s", rec.Code, http.StatusOK, rec.Body.String())
	}

	// Get user data
	rec = doRequest(t, r, "GET", "/api/user-data", nil, token)
	if rec.Code != http.StatusOK {
		t.Errorf("GET status = %d, want %d", rec.Code, http.StatusOK)
	}

	var data UserData
	json.NewDecoder(rec.Body).Decode(&data)

	if *data.Blob != "encrypted_user_data" {
		t.Errorf("blob = %q, want %q", *data.Blob, "encrypted_user_data")
	}
	if data.Version != 1 {
		t.Errorf("version = %d, want 1", data.Version)
	}

	// Update with correct version
	body = UserDataUpdate{Version: 1, Blob: "updated_data"}
	rec = doRequest(t, r, "PUT", "/api/user-data", body, token)
	if rec.Code != http.StatusOK {
		t.Errorf("update status = %d, want %d", rec.Code, http.StatusOK)
	}

	// Update with wrong version should fail
	body = UserDataUpdate{Version: 1, Blob: "should_fail"}
	rec = doRequest(t, r, "PUT", "/api/user-data", body, token)
	if rec.Code != http.StatusConflict {
		t.Errorf("expected 409 for version conflict, got %d", rec.Code)
	}
}

// =============================================================================
// Delete Account Tests
// =============================================================================

func TestDeleteAccount(t *testing.T) {
	server, st := testServer(t)
	r := testRouter(t, server)

	token, user := createTestUser(t, st, "test@example.com", "Test")

	rec := doRequest(t, r, "DELETE", "/api/auth/account", nil, token)
	if rec.Code != http.StatusNoContent {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusNoContent)
	}

	// User should be gone
	ctx := context.Background()
	_, err := st.Users().GetByID(ctx, user.ID)
	if err != store.ErrNotFound {
		t.Errorf("expected user to be deleted, got err = %v", err)
	}

	// Token should no longer work
	rec = doRequest(t, r, "GET", "/api/me", nil, token)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 after account delete, got %d", rec.Code)
	}
}
