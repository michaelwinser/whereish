package sqlite

import (
	"context"
	"testing"
	"time"

	"github.com/whereish/server/internal/store"
)

// newTestStore creates an in-memory SQLite store for testing
func newTestStore(t *testing.T) *Store {
	t.Helper()
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("failed to create test store: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

// =============================================================================
// UserRepository Tests
// =============================================================================

func TestUserRepository_Create(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	user := &store.User{
		Email:    "test@example.com",
		GoogleID: "google123",
		Name:     "Test User",
	}

	err := s.Users().Create(ctx, user)
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	if user.ID == "" {
		t.Error("expected user ID to be set")
	}
	if user.CreatedAt.IsZero() {
		t.Error("expected CreatedAt to be set")
	}
}

func TestUserRepository_Create_DuplicateEmail(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	user1 := &store.User{Email: "test@example.com", Name: "User 1"}
	user2 := &store.User{Email: "test@example.com", Name: "User 2"}

	if err := s.Users().Create(ctx, user1); err != nil {
		t.Fatalf("Create user1 failed: %v", err)
	}

	err := s.Users().Create(ctx, user2)
	if err != store.ErrDuplicateKey {
		t.Errorf("expected ErrDuplicateKey, got %v", err)
	}
}

func TestUserRepository_GetByID(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	user := &store.User{Email: "test@example.com", Name: "Test User"}
	s.Users().Create(ctx, user)

	got, err := s.Users().GetByID(ctx, user.ID)
	if err != nil {
		t.Fatalf("GetByID failed: %v", err)
	}

	if got.Email != user.Email {
		t.Errorf("email = %q, want %q", got.Email, user.Email)
	}
	if got.Name != user.Name {
		t.Errorf("name = %q, want %q", got.Name, user.Name)
	}
}

func TestUserRepository_GetByID_NotFound(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	_, err := s.Users().GetByID(ctx, "nonexistent")
	if err != store.ErrNotFound {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestUserRepository_GetByEmail(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	user := &store.User{Email: "test@example.com", Name: "Test User"}
	s.Users().Create(ctx, user)

	got, err := s.Users().GetByEmail(ctx, "test@example.com")
	if err != nil {
		t.Fatalf("GetByEmail failed: %v", err)
	}

	if got.ID != user.ID {
		t.Errorf("ID = %q, want %q", got.ID, user.ID)
	}
}

func TestUserRepository_GetByGoogleID(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	user := &store.User{
		Email:    "test@example.com",
		GoogleID: "google123",
		Name:     "Test User",
	}
	s.Users().Create(ctx, user)

	got, err := s.Users().GetByGoogleID(ctx, "google123")
	if err != nil {
		t.Fatalf("GetByGoogleID failed: %v", err)
	}

	if got.ID != user.ID {
		t.Errorf("ID = %q, want %q", got.ID, user.ID)
	}
}

func TestUserRepository_Update(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	user := &store.User{Email: "test@example.com", Name: "Original Name"}
	s.Users().Create(ctx, user)

	user.Name = "Updated Name"
	if err := s.Users().Update(ctx, user); err != nil {
		t.Fatalf("Update failed: %v", err)
	}

	got, _ := s.Users().GetByID(ctx, user.ID)
	if got.Name != "Updated Name" {
		t.Errorf("name = %q, want %q", got.Name, "Updated Name")
	}
}

func TestUserRepository_Delete(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	user := &store.User{Email: "test@example.com", Name: "Test User"}
	s.Users().Create(ctx, user)

	if err := s.Users().Delete(ctx, user.ID); err != nil {
		t.Fatalf("Delete failed: %v", err)
	}

	_, err := s.Users().GetByID(ctx, user.ID)
	if err != store.ErrNotFound {
		t.Errorf("expected ErrNotFound after delete, got %v", err)
	}
}

func TestUserRepository_SetPublicKey(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	user := &store.User{Email: "test@example.com", Name: "Test User"}
	s.Users().Create(ctx, user)

	publicKey := "base64encodedpublickey"
	if err := s.Users().SetPublicKey(ctx, user.ID, publicKey); err != nil {
		t.Fatalf("SetPublicKey failed: %v", err)
	}

	got, _ := s.Users().GetByID(ctx, user.ID)
	if got.PublicKey != publicKey {
		t.Errorf("publicKey = %q, want %q", got.PublicKey, publicKey)
	}
}

func TestUserRepository_IdentityBackup(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	user := &store.User{Email: "test@example.com", Name: "Test User"}
	s.Users().Create(ctx, user)

	// Initially no backup
	_, err := s.Users().GetIdentityBackup(ctx, user.ID)
	if err != store.ErrNotFound {
		t.Errorf("expected ErrNotFound for new user, got %v", err)
	}

	// Set backup
	backup := &store.IdentityBackup{
		Algorithm:  "AES-256-GCM",
		KDF:        "PBKDF2-SHA256",
		Iterations: 100000,
		Salt:       "somesalt",
		IV:         "someiv",
		Payload:    "encryptedpayload",
	}

	if err := s.Users().SetIdentityBackup(ctx, user.ID, backup); err != nil {
		t.Fatalf("SetIdentityBackup failed: %v", err)
	}

	// Get backup
	got, err := s.Users().GetIdentityBackup(ctx, user.ID)
	if err != nil {
		t.Fatalf("GetIdentityBackup failed: %v", err)
	}

	if got.Algorithm != backup.Algorithm {
		t.Errorf("Algorithm = %q, want %q", got.Algorithm, backup.Algorithm)
	}
	if got.Iterations != backup.Iterations {
		t.Errorf("Iterations = %d, want %d", got.Iterations, backup.Iterations)
	}
}

func TestUserRepository_UserData(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	user := &store.User{Email: "test@example.com", Name: "Test User"}
	s.Users().Create(ctx, user)

	// Initially no user data
	_, err := s.Users().GetUserData(ctx, user.ID)
	if err != store.ErrNotFound {
		t.Errorf("expected ErrNotFound for new user, got %v", err)
	}

	// Set user data (version 0 = create)
	data := &store.UserData{
		Version: 1,
		Blob:    "encryptedblob",
	}

	if err := s.Users().SetUserData(ctx, user.ID, data, 0); err != nil {
		t.Fatalf("SetUserData failed: %v", err)
	}

	// Get user data
	got, err := s.Users().GetUserData(ctx, user.ID)
	if err != nil {
		t.Fatalf("GetUserData failed: %v", err)
	}

	if got.Blob != data.Blob {
		t.Errorf("Blob = %q, want %q", got.Blob, data.Blob)
	}
	if got.Version != 1 {
		t.Errorf("Version = %d, want 1", got.Version)
	}

	// Update with correct version
	data.Blob = "updatedblob"
	if err := s.Users().SetUserData(ctx, user.ID, data, 1); err != nil {
		t.Fatalf("SetUserData update failed: %v", err)
	}

	got, _ = s.Users().GetUserData(ctx, user.ID)
	if got.Version != 2 {
		t.Errorf("Version = %d, want 2", got.Version)
	}

	// Update with wrong version should fail
	err = s.Users().SetUserData(ctx, user.ID, data, 1)
	if err != store.ErrVersionConflict {
		t.Errorf("expected ErrVersionConflict, got %v", err)
	}
}

// =============================================================================
// ContactRepository Tests
// =============================================================================

func createTestUsers(t *testing.T, s *Store, n int) []*store.User {
	t.Helper()
	ctx := context.Background()
	users := make([]*store.User, n)
	for i := 0; i < n; i++ {
		users[i] = &store.User{
			Email:     "user" + string(rune('a'+i)) + "@example.com",
			Name:      "User " + string(rune('A'+i)),
			PublicKey: "publickey" + string(rune('a'+i)),
		}
		if err := s.Users().Create(ctx, users[i]); err != nil {
			t.Fatalf("failed to create test user %d: %v", i, err)
		}
	}
	return users
}

func TestContactRepository_CreateRequest(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	users := createTestUsers(t, s, 2)

	req, err := s.Contacts().CreateRequest(ctx, users[0].ID, users[1].ID)
	if err != nil {
		t.Fatalf("CreateRequest failed: %v", err)
	}

	if req.ID == "" {
		t.Error("expected request ID to be set")
	}
	if req.RequesterID != users[0].ID {
		t.Errorf("RequesterID = %q, want %q", req.RequesterID, users[0].ID)
	}
	if req.RecipientID != users[1].ID {
		t.Errorf("RecipientID = %q, want %q", req.RecipientID, users[1].ID)
	}
	if req.Status != "pending" {
		t.Errorf("Status = %q, want %q", req.Status, "pending")
	}
}

func TestContactRepository_CreateRequest_Duplicate(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	users := createTestUsers(t, s, 2)

	_, err := s.Contacts().CreateRequest(ctx, users[0].ID, users[1].ID)
	if err != nil {
		t.Fatalf("first CreateRequest failed: %v", err)
	}

	// Check that duplicate is detected
	exists, err := s.Contacts().CheckExistingRequest(ctx, users[0].ID, users[1].ID)
	if err != nil {
		t.Fatalf("CheckExistingRequest failed: %v", err)
	}
	if !exists {
		t.Error("expected existing request to be found")
	}
}

func TestContactRepository_ListRequests(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	users := createTestUsers(t, s, 3)

	// User A sends request to User B
	s.Contacts().CreateRequest(ctx, users[0].ID, users[1].ID)
	// User C sends request to User A
	s.Contacts().CreateRequest(ctx, users[2].ID, users[0].ID)

	// Check incoming for User A
	incoming, err := s.Contacts().ListIncomingRequests(ctx, users[0].ID)
	if err != nil {
		t.Fatalf("ListIncomingRequests failed: %v", err)
	}
	if len(incoming) != 1 {
		t.Errorf("incoming count = %d, want 1", len(incoming))
	}

	// Check outgoing for User A
	outgoing, err := s.Contacts().ListOutgoingRequests(ctx, users[0].ID)
	if err != nil {
		t.Fatalf("ListOutgoingRequests failed: %v", err)
	}
	if len(outgoing) != 1 {
		t.Errorf("outgoing count = %d, want 1", len(outgoing))
	}
}

func TestContactRepository_AcceptRequest(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	users := createTestUsers(t, s, 2)

	req, _ := s.Contacts().CreateRequest(ctx, users[0].ID, users[1].ID)

	// User B accepts
	if err := s.Contacts().AcceptRequest(ctx, req.ID, users[1].ID); err != nil {
		t.Fatalf("AcceptRequest failed: %v", err)
	}

	// Both users should now see each other as contacts
	contactsA, _ := s.Contacts().ListContacts(ctx, users[0].ID)
	contactsB, _ := s.Contacts().ListContacts(ctx, users[1].ID)

	if len(contactsA) != 1 {
		t.Errorf("user A contacts = %d, want 1", len(contactsA))
	}
	if len(contactsB) != 1 {
		t.Errorf("user B contacts = %d, want 1", len(contactsB))
	}

	// Verify bidirectional
	if contactsA[0].ContactID != users[1].ID {
		t.Errorf("user A contact ID = %q, want %q", contactsA[0].ContactID, users[1].ID)
	}
	if contactsB[0].ContactID != users[0].ID {
		t.Errorf("user B contact ID = %q, want %q", contactsB[0].ContactID, users[0].ID)
	}
}

func TestContactRepository_DeclineRequest(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	users := createTestUsers(t, s, 2)

	req, _ := s.Contacts().CreateRequest(ctx, users[0].ID, users[1].ID)

	if err := s.Contacts().DeclineRequest(ctx, req.ID, users[1].ID); err != nil {
		t.Fatalf("DeclineRequest failed: %v", err)
	}

	// Request should be gone from pending
	incoming, _ := s.Contacts().ListIncomingRequests(ctx, users[1].ID)
	if len(incoming) != 0 {
		t.Errorf("incoming after decline = %d, want 0", len(incoming))
	}

	// No contacts created
	contacts, _ := s.Contacts().ListContacts(ctx, users[0].ID)
	if len(contacts) != 0 {
		t.Errorf("contacts after decline = %d, want 0", len(contacts))
	}
}

func TestContactRepository_CancelRequest(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	users := createTestUsers(t, s, 2)

	req, _ := s.Contacts().CreateRequest(ctx, users[0].ID, users[1].ID)

	// User A cancels their own request
	if err := s.Contacts().CancelRequest(ctx, req.ID, users[0].ID); err != nil {
		t.Fatalf("CancelRequest failed: %v", err)
	}

	outgoing, _ := s.Contacts().ListOutgoingRequests(ctx, users[0].ID)
	if len(outgoing) != 0 {
		t.Errorf("outgoing after cancel = %d, want 0", len(outgoing))
	}
}

func TestContactRepository_RemoveContact(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	users := createTestUsers(t, s, 2)

	// Create contact relationship
	req, _ := s.Contacts().CreateRequest(ctx, users[0].ID, users[1].ID)
	s.Contacts().AcceptRequest(ctx, req.ID, users[1].ID)

	// Remove contact (from user A's perspective)
	if err := s.Contacts().RemoveContact(ctx, users[0].ID, users[1].ID); err != nil {
		t.Fatalf("RemoveContact failed: %v", err)
	}

	// Both should have no contacts (bidirectional removal)
	contactsA, _ := s.Contacts().ListContacts(ctx, users[0].ID)
	contactsB, _ := s.Contacts().ListContacts(ctx, users[1].ID)

	if len(contactsA) != 0 {
		t.Errorf("user A contacts after remove = %d, want 0", len(contactsA))
	}
	if len(contactsB) != 0 {
		t.Errorf("user B contacts after remove = %d, want 0", len(contactsB))
	}
}

func TestContactRepository_AreContacts(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	users := createTestUsers(t, s, 2)

	// Not contacts yet
	are, _ := s.Contacts().AreContacts(ctx, users[0].ID, users[1].ID)
	if are {
		t.Error("expected not contacts before request")
	}

	// Create and accept
	req, _ := s.Contacts().CreateRequest(ctx, users[0].ID, users[1].ID)
	s.Contacts().AcceptRequest(ctx, req.ID, users[1].ID)

	// Now contacts
	are, _ = s.Contacts().AreContacts(ctx, users[0].ID, users[1].ID)
	if !are {
		t.Error("expected contacts after accept")
	}

	// Check reverse direction
	are, _ = s.Contacts().AreContacts(ctx, users[1].ID, users[0].ID)
	if !are {
		t.Error("expected contacts in reverse direction")
	}
}

// =============================================================================
// DeviceRepository Tests
// =============================================================================

func TestDeviceRepository_Create(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	users := createTestUsers(t, s, 1)

	device := &store.Device{
		UserID:   users[0].ID,
		Name:     "Test Phone",
		Platform: "ios",
	}

	if err := s.Devices().Create(ctx, device); err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	if device.ID == "" {
		t.Error("expected device ID to be set")
	}
	if device.Token == "" {
		t.Error("expected device Token to be set")
	}
}

func TestDeviceRepository_List(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	users := createTestUsers(t, s, 2)

	// Create devices for user A
	d1 := &store.Device{UserID: users[0].ID, Name: "Phone", Platform: "ios"}
	d2 := &store.Device{UserID: users[0].ID, Name: "Tablet", Platform: "android"}
	s.Devices().Create(ctx, d1)
	s.Devices().Create(ctx, d2)

	// Create device for user B
	d3 := &store.Device{UserID: users[1].ID, Name: "Laptop", Platform: "web"}
	s.Devices().Create(ctx, d3)

	// List user A's devices
	devices, err := s.Devices().List(ctx, users[0].ID)
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}

	if len(devices) != 2 {
		t.Errorf("device count = %d, want 2", len(devices))
	}
}

func TestDeviceRepository_GetByToken(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	users := createTestUsers(t, s, 1)

	device := &store.Device{
		UserID:   users[0].ID,
		Name:     "Test Device",
		Platform: "cli",
	}
	s.Devices().Create(ctx, device)

	got, err := s.Devices().GetByToken(ctx, device.Token)
	if err != nil {
		t.Fatalf("GetByToken failed: %v", err)
	}

	if got.ID != device.ID {
		t.Errorf("ID = %q, want %q", got.ID, device.ID)
	}
}

func TestDeviceRepository_Revoke(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	users := createTestUsers(t, s, 1)

	device := &store.Device{
		UserID:   users[0].ID,
		Name:     "Test Device",
		Platform: "web",
	}
	s.Devices().Create(ctx, device)

	if err := s.Devices().Revoke(ctx, device.ID, users[0].ID); err != nil {
		t.Fatalf("Revoke failed: %v", err)
	}

	got, _ := s.Devices().GetByID(ctx, device.ID)
	if got.RevokedAt == nil {
		t.Error("expected RevokedAt to be set after revoke")
	}
}

func TestDeviceRepository_UpdateLastSeen(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	users := createTestUsers(t, s, 1)

	device := &store.Device{
		UserID:   users[0].ID,
		Name:     "Test Device",
		Platform: "ios",
	}
	s.Devices().Create(ctx, device)

	originalLastSeen := device.LastSeen

	// Small delay to ensure time difference
	time.Sleep(10 * time.Millisecond)

	if err := s.Devices().UpdateLastSeen(ctx, device.ID); err != nil {
		t.Fatalf("UpdateLastSeen failed: %v", err)
	}

	got, _ := s.Devices().GetByID(ctx, device.ID)
	if !got.LastSeen.After(originalLastSeen) {
		t.Error("expected LastSeen to be updated")
	}
}

// =============================================================================
// LocationRepository Tests
// =============================================================================

func TestLocationRepository_SetAndGet(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	users := createTestUsers(t, s, 3)

	// Make users 0 and 1 contacts, and users 0 and 2 contacts
	req1, _ := s.Contacts().CreateRequest(ctx, users[0].ID, users[1].ID)
	s.Contacts().AcceptRequest(ctx, req1.ID, users[1].ID)
	req2, _ := s.Contacts().CreateRequest(ctx, users[0].ID, users[2].ID)
	s.Contacts().AcceptRequest(ctx, req2.ID, users[2].ID)

	// User 0 shares location to users 1 and 2
	locations := []*store.EncryptedLocation{
		{ToUserID: users[1].ID, Blob: "encrypted_for_user1"},
		{ToUserID: users[2].ID, Blob: "encrypted_for_user2"},
	}

	if err := s.Locations().SetLocations(ctx, users[0].ID, locations); err != nil {
		t.Fatalf("SetLocations failed: %v", err)
	}

	// User 1 gets locations (should see user 0's location)
	got, err := s.Locations().GetLocationsForUser(ctx, users[1].ID)
	if err != nil {
		t.Fatalf("GetLocationsForUser failed: %v", err)
	}

	if len(got) != 1 {
		t.Errorf("location count for user 1 = %d, want 1", len(got))
	}
	if got[0].Blob != "encrypted_for_user1" {
		t.Errorf("blob = %q, want %q", got[0].Blob, "encrypted_for_user1")
	}

	// User 2 gets locations (should see user 0's location)
	got, _ = s.Locations().GetLocationsForUser(ctx, users[2].ID)
	if len(got) != 1 {
		t.Errorf("location count for user 2 = %d, want 1", len(got))
	}
}

func TestLocationRepository_UpdateLocation(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	users := createTestUsers(t, s, 2)

	// Make contacts
	req, _ := s.Contacts().CreateRequest(ctx, users[0].ID, users[1].ID)
	s.Contacts().AcceptRequest(ctx, req.ID, users[1].ID)

	// Initial location
	s.Locations().SetLocations(ctx, users[0].ID, []*store.EncryptedLocation{
		{ToUserID: users[1].ID, Blob: "initial"},
	})

	// Update location
	s.Locations().SetLocations(ctx, users[0].ID, []*store.EncryptedLocation{
		{ToUserID: users[1].ID, Blob: "updated"},
	})

	got, _ := s.Locations().GetLocationsForUser(ctx, users[1].ID)
	if len(got) != 1 {
		t.Fatalf("location count = %d, want 1", len(got))
	}
	if got[0].Blob != "updated" {
		t.Errorf("blob = %q, want %q", got[0].Blob, "updated")
	}
}

func TestLocationRepository_DeleteLocationsBetween(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	users := createTestUsers(t, s, 2)

	// Make contacts
	req, _ := s.Contacts().CreateRequest(ctx, users[0].ID, users[1].ID)
	s.Contacts().AcceptRequest(ctx, req.ID, users[1].ID)

	// Both share locations
	s.Locations().SetLocations(ctx, users[0].ID, []*store.EncryptedLocation{
		{ToUserID: users[1].ID, Blob: "from0to1"},
	})
	s.Locations().SetLocations(ctx, users[1].ID, []*store.EncryptedLocation{
		{ToUserID: users[0].ID, Blob: "from1to0"},
	})

	// Delete locations between them
	if err := s.Locations().DeleteLocationsBetween(ctx, users[0].ID, users[1].ID); err != nil {
		t.Fatalf("DeleteLocationsBetween failed: %v", err)
	}

	// Neither should see locations
	got0, _ := s.Locations().GetLocationsForUser(ctx, users[0].ID)
	got1, _ := s.Locations().GetLocationsForUser(ctx, users[1].ID)

	if len(got0) != 0 {
		t.Errorf("user 0 locations = %d, want 0", len(got0))
	}
	if len(got1) != 0 {
		t.Errorf("user 1 locations = %d, want 0", len(got1))
	}
}

// =============================================================================
// SessionRepository Tests
// =============================================================================

func TestSessionRepository_Create(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	users := createTestUsers(t, s, 1)

	session := &store.Session{
		UserID:    users[0].ID,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}

	if err := s.Sessions().Create(ctx, session); err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	if session.Token == "" {
		t.Error("expected session Token to be set")
	}
}

func TestSessionRepository_GetByToken(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	users := createTestUsers(t, s, 1)

	session := &store.Session{
		UserID:    users[0].ID,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}
	s.Sessions().Create(ctx, session)

	got, err := s.Sessions().GetByToken(ctx, session.Token)
	if err != nil {
		t.Fatalf("GetByToken failed: %v", err)
	}

	if got.UserID != users[0].ID {
		t.Errorf("UserID = %q, want %q", got.UserID, users[0].ID)
	}
}

func TestSessionRepository_Delete(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	users := createTestUsers(t, s, 1)

	session := &store.Session{
		UserID:    users[0].ID,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}
	s.Sessions().Create(ctx, session)

	if err := s.Sessions().Delete(ctx, session.Token); err != nil {
		t.Fatalf("Delete failed: %v", err)
	}

	_, err := s.Sessions().GetByToken(ctx, session.Token)
	if err != store.ErrNotFound {
		t.Errorf("expected ErrNotFound after delete, got %v", err)
	}
}

func TestSessionRepository_DeleteForUser(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	users := createTestUsers(t, s, 1)

	// Create multiple sessions
	s1 := &store.Session{UserID: users[0].ID, ExpiresAt: time.Now().Add(24 * time.Hour)}
	s2 := &store.Session{UserID: users[0].ID, ExpiresAt: time.Now().Add(24 * time.Hour)}
	s.Sessions().Create(ctx, s1)
	s.Sessions().Create(ctx, s2)

	if err := s.Sessions().DeleteForUser(ctx, users[0].ID); err != nil {
		t.Fatalf("DeleteForUser failed: %v", err)
	}

	_, err1 := s.Sessions().GetByToken(ctx, s1.Token)
	_, err2 := s.Sessions().GetByToken(ctx, s2.Token)

	if err1 != store.ErrNotFound || err2 != store.ErrNotFound {
		t.Error("expected all sessions to be deleted")
	}
}

func TestSessionRepository_DeleteExpired(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	users := createTestUsers(t, s, 1)

	// Create expired session
	expired := &store.Session{
		UserID:    users[0].ID,
		ExpiresAt: time.Now().Add(-1 * time.Hour), // already expired
	}
	s.Sessions().Create(ctx, expired)

	// Create valid session
	valid := &store.Session{
		UserID:    users[0].ID,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}
	s.Sessions().Create(ctx, valid)

	if err := s.Sessions().DeleteExpired(ctx); err != nil {
		t.Fatalf("DeleteExpired failed: %v", err)
	}

	// Expired should be gone
	_, err := s.Sessions().GetByToken(ctx, expired.Token)
	if err != store.ErrNotFound {
		t.Error("expected expired session to be deleted")
	}

	// Valid should still exist
	_, err = s.Sessions().GetByToken(ctx, valid.Token)
	if err != nil {
		t.Errorf("expected valid session to still exist, got %v", err)
	}
}
