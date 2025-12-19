// Package client provides a high-level client for the Whereish API.
package client

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	openapi_types "github.com/oapi-codegen/runtime/types"
)

// WhereishClient is a high-level Whereish API client
type WhereishClient struct {
	baseURL    string
	token      string
	httpClient *http.Client
}

// ClientConfig holds client configuration
type ClientConfig struct {
	BaseURL string
	Token   string
	Timeout time.Duration
}

// NewWhereishClient creates a new Whereish client
func NewWhereishClient(cfg ClientConfig) *WhereishClient {
	if cfg.Timeout == 0 {
		cfg.Timeout = 30 * time.Second
	}
	return &WhereishClient{
		baseURL: cfg.BaseURL,
		token:   cfg.Token,
		httpClient: &http.Client{
			Timeout: cfg.Timeout,
		},
	}
}

// SetToken sets the authentication token
func (c *WhereishClient) SetToken(token string) {
	c.token = token
}

// Health checks if the server is healthy
func (c *WhereishClient) Health(ctx context.Context) (*HealthResponse, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", c.baseURL+"/health", nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, c.parseError(resp)
	}

	var health HealthResponse
	if err := json.NewDecoder(resp.Body).Decode(&health); err != nil {
		return nil, err
	}
	return &health, nil
}

// LoginWithGoogle authenticates with a Google ID token
func (c *WhereishClient) LoginWithGoogle(ctx context.Context, idToken string) (*LoginResponse, error) {
	req := GoogleLoginRequest{IdToken: idToken}
	body, err := jsonBody(req)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/auth/google", body)
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, c.parseError(resp)
	}

	var login LoginResponse
	if err := json.NewDecoder(resp.Body).Decode(&login); err != nil {
		return nil, err
	}

	// Store token for future requests
	c.token = login.Token
	return &login, nil
}

// DevLoginRequest is the request for dev login
type DevLoginRequest struct {
	Email string `json:"email"`
	Name  string `json:"name,omitempty"`
}

// DevLogin authenticates with email only (dev mode)
func (c *WhereishClient) DevLogin(ctx context.Context, email, name string) (*LoginResponse, error) {
	req := DevLoginRequest{Email: email, Name: name}
	body, err := jsonBody(req)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/dev/login", body)
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, c.parseError(resp)
	}

	var login LoginResponse
	if err := json.NewDecoder(resp.Body).Decode(&login); err != nil {
		return nil, err
	}

	// Store token for future requests
	c.token = login.Token
	return &login, nil
}

// Logout ends the current session
func (c *WhereishClient) Logout(ctx context.Context) error {
	resp, err := c.doAuth(ctx, "POST", "/auth/logout", nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		return c.parseError(resp)
	}
	c.token = ""
	return nil
}

// GetCurrentUser returns the current user
func (c *WhereishClient) GetCurrentUser(ctx context.Context) (*User, error) {
	resp, err := c.doAuth(ctx, "GET", "/me", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, c.parseError(resp)
	}

	var user User
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return nil, err
	}
	return &user, nil
}

// GetIdentityBackup retrieves the encrypted identity backup
func (c *WhereishClient) GetIdentityBackup(ctx context.Context) (*IdentityBackup, error) {
	resp, err := c.doAuth(ctx, "GET", "/identity/backup", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, c.parseError(resp)
	}

	var backup IdentityBackup
	if err := json.NewDecoder(resp.Body).Decode(&backup); err != nil {
		return nil, err
	}
	return &backup, nil
}

// SetIdentityBackup stores the encrypted identity backup
func (c *WhereishClient) SetIdentityBackup(ctx context.Context, backup *IdentityBackup) error {
	body, err := jsonBody(backup)
	if err != nil {
		return err
	}

	resp, err := c.doAuth(ctx, "PUT", "/identity/backup", body)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		return c.parseError(resp)
	}
	return nil
}

// SetPublicKey registers the user's public key
func (c *WhereishClient) SetPublicKey(ctx context.Context, publicKey string) error {
	req := PublicKeyRequest{PublicKey: publicKey}
	body, err := jsonBody(req)
	if err != nil {
		return err
	}

	resp, err := c.doAuth(ctx, "POST", "/identity/public-key", body)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		return c.parseError(resp)
	}
	return nil
}

// GetUserData retrieves the encrypted user data
func (c *WhereishClient) GetUserData(ctx context.Context) (*UserData, error) {
	resp, err := c.doAuth(ctx, "GET", "/user-data", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, c.parseError(resp)
	}

	var data UserData
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}
	return &data, nil
}

// SetUserData updates the encrypted user data
func (c *WhereishClient) SetUserData(ctx context.Context, version int, blob string) (*UserData, error) {
	req := UserDataUpdate{Version: version, Blob: blob}
	body, err := jsonBody(req)
	if err != nil {
		return nil, err
	}

	resp, err := c.doAuth(ctx, "PUT", "/user-data", body)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, c.parseError(resp)
	}

	var data UserData
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}
	return &data, nil
}

// ListContacts returns all contacts
func (c *WhereishClient) ListContacts(ctx context.Context) (*ContactList, error) {
	resp, err := c.doAuth(ctx, "GET", "/contacts", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, c.parseError(resp)
	}

	var contacts ContactList
	if err := json.NewDecoder(resp.Body).Decode(&contacts); err != nil {
		return nil, err
	}
	return &contacts, nil
}

// SendContactRequest sends a contact request by email
func (c *WhereishClient) SendContactRequest(ctx context.Context, email string) (*ContactRequest, error) {
	req := ContactRequestCreate{Email: Email(email)}
	body, err := jsonBody(req)
	if err != nil {
		return nil, err
	}

	resp, err := c.doAuth(ctx, "POST", "/contacts/request", body)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		return nil, c.parseError(resp)
	}

	var request ContactRequest
	if err := json.NewDecoder(resp.Body).Decode(&request); err != nil {
		return nil, err
	}
	return &request, nil
}

// ListContactRequests returns pending contact requests
func (c *WhereishClient) ListContactRequests(ctx context.Context) (*ContactRequestList, error) {
	resp, err := c.doAuth(ctx, "GET", "/contacts/requests", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, c.parseError(resp)
	}

	var requests ContactRequestList
	if err := json.NewDecoder(resp.Body).Decode(&requests); err != nil {
		return nil, err
	}
	return &requests, nil
}

// AcceptContactRequest accepts a contact request
func (c *WhereishClient) AcceptContactRequest(ctx context.Context, requestID string) (*Contact, error) {
	resp, err := c.doAuth(ctx, "POST", "/contacts/requests/"+requestID+"/accept", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, c.parseError(resp)
	}

	var contact Contact
	if err := json.NewDecoder(resp.Body).Decode(&contact); err != nil {
		return nil, err
	}
	return &contact, nil
}

// DeclineContactRequest declines a contact request
func (c *WhereishClient) DeclineContactRequest(ctx context.Context, requestID string) error {
	resp, err := c.doAuth(ctx, "POST", "/contacts/requests/"+requestID+"/decline", nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		return c.parseError(resp)
	}
	return nil
}

// CancelContactRequest cancels an outgoing contact request
func (c *WhereishClient) CancelContactRequest(ctx context.Context, requestID string) error {
	resp, err := c.doAuth(ctx, "DELETE", "/contacts/requests/"+requestID, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		return c.parseError(resp)
	}
	return nil
}

// RemoveContact removes a contact
func (c *WhereishClient) RemoveContact(ctx context.Context, contactID string) error {
	resp, err := c.doAuth(ctx, "DELETE", "/contacts/"+contactID, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		return c.parseError(resp)
	}
	return nil
}

// GetLocations retrieves encrypted locations from contacts
func (c *WhereishClient) GetLocations(ctx context.Context) (*LocationList, error) {
	resp, err := c.doAuth(ctx, "GET", "/locations", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, c.parseError(resp)
	}

	var locations LocationList
	if err := json.NewDecoder(resp.Body).Decode(&locations); err != nil {
		return nil, err
	}
	return &locations, nil
}

// ShareLocations publishes encrypted locations to contacts
func (c *WhereishClient) ShareLocations(ctx context.Context, locations []LocationShare) error {
	req := LocationShareRequest{Locations: locations}
	body, err := jsonBody(req)
	if err != nil {
		return err
	}

	resp, err := c.doAuth(ctx, "POST", "/locations", body)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		return c.parseError(resp)
	}
	return nil
}

// ListDevices returns all devices
func (c *WhereishClient) ListDevices(ctx context.Context) (*DeviceList, error) {
	resp, err := c.doAuth(ctx, "GET", "/devices", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, c.parseError(resp)
	}

	var devices DeviceList
	if err := json.NewDecoder(resp.Body).Decode(&devices); err != nil {
		return nil, err
	}
	return &devices, nil
}

// RegisterDevice registers a new device
func (c *WhereishClient) RegisterDevice(ctx context.Context, name, platform string) (*DeviceWithToken, error) {
	req := DeviceCreate{Name: name, Platform: DeviceCreatePlatform(platform)}
	body, err := jsonBody(req)
	if err != nil {
		return nil, err
	}

	resp, err := c.doAuth(ctx, "POST", "/devices", body)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		return nil, c.parseError(resp)
	}

	var device DeviceWithToken
	if err := json.NewDecoder(resp.Body).Decode(&device); err != nil {
		return nil, err
	}
	return &device, nil
}

// RevokeDevice revokes a device
func (c *WhereishClient) RevokeDevice(ctx context.Context, deviceID string) error {
	resp, err := c.doAuth(ctx, "DELETE", "/devices/"+deviceID, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		return c.parseError(resp)
	}
	return nil
}

// DeleteAccount permanently deletes the user account
func (c *WhereishClient) DeleteAccount(ctx context.Context) error {
	resp, err := c.doAuth(ctx, "DELETE", "/auth/account", nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		return c.parseError(resp)
	}
	return nil
}

// doAuth performs an authenticated HTTP request
func (c *WhereishClient) doAuth(ctx context.Context, method, path string, body io.Reader) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
	if err != nil {
		return nil, err
	}

	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	return c.httpClient.Do(req)
}

// parseError parses an error response
func (c *WhereishClient) parseError(resp *http.Response) error {
	body, _ := io.ReadAll(resp.Body)

	var apiErr Error
	if err := json.Unmarshal(body, &apiErr); err == nil && apiErr.Error.Code != "" {
		return &APIError{
			StatusCode: resp.StatusCode,
			Code:       apiErr.Error.Code,
			Message:    apiErr.Error.Message,
		}
	}

	return &APIError{
		StatusCode: resp.StatusCode,
		Code:       "unknown",
		Message:    string(body),
	}
}

// APIError represents an API error
type APIError struct {
	StatusCode int
	Code       string
	Message    string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("%s: %s (HTTP %d)", e.Code, e.Message, e.StatusCode)
}

// Email type alias for generated type
type Email = openapi_types.Email

// jsonBody creates a JSON body reader
func jsonBody(v interface{}) (io.Reader, error) {
	data, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	return &jsonReader{data: data}, nil
}

type jsonReader struct {
	data []byte
	pos  int
}

func (r *jsonReader) Read(p []byte) (n int, err error) {
	if r.pos >= len(r.data) {
		return 0, io.EOF
	}
	n = copy(p, r.data[r.pos:])
	r.pos += n
	return n, nil
}
