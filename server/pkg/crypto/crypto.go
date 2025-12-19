// Package crypto provides encryption utilities for Whereish.
// Uses NaCl (libsodium) for all cryptographic operations.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"

	"golang.org/x/crypto/nacl/box"
	"golang.org/x/crypto/pbkdf2"
)

const (
	// PBKDF2 parameters for PIN-derived key
	PBKDF2Iterations = 100000
	SaltSize         = 16
	KeySize          = 32 // AES-256
	NonceSize        = 12 // AES-GCM nonce

	// NaCl key sizes
	PublicKeySize  = 32
	PrivateKeySize = 32
)

// Identity holds the user's X25519 keypair
type Identity struct {
	PublicKey  [PublicKeySize]byte
	PrivateKey [PrivateKeySize]byte
}

// IdentityBackup is the encrypted identity structure
type IdentityBackup struct {
	Algorithm  string `json:"algorithm"`
	KDF        string `json:"kdf"`
	Iterations int    `json:"iterations"`
	Salt       string `json:"salt"`       // Base64
	IV         string `json:"iv"`         // Base64
	Payload    string `json:"payload"`    // Base64 ciphertext
}

// identityPayload is the decrypted identity structure
type identityPayload struct {
	PrivateKey string `json:"privateKey"` // Base64
	PublicKey  string `json:"publicKey"`  // Base64
}

// GenerateIdentity creates a new X25519 keypair
func GenerateIdentity() (*Identity, error) {
	pub, priv, err := box.GenerateKey(rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("generate keypair: %w", err)
	}
	return &Identity{
		PublicKey:  *pub,
		PrivateKey: *priv,
	}, nil
}

// PublicKeyBase64 returns the public key as base64
func (id *Identity) PublicKeyBase64() string {
	return base64.StdEncoding.EncodeToString(id.PublicKey[:])
}

// PrivateKeyBase64 returns the private key as base64
func (id *Identity) PrivateKeyBase64() string {
	return base64.StdEncoding.EncodeToString(id.PrivateKey[:])
}

// EncryptIdentity encrypts the identity with a PIN-derived key
func EncryptIdentity(identity *Identity, pin string) (*IdentityBackup, error) {
	// Generate random salt
	salt := make([]byte, SaltSize)
	if _, err := rand.Read(salt); err != nil {
		return nil, fmt.Errorf("generate salt: %w", err)
	}

	// Derive key from PIN using PBKDF2
	key := pbkdf2.Key([]byte(pin), salt, PBKDF2Iterations, KeySize, sha256.New)

	// Create AES-GCM cipher
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("create GCM: %w", err)
	}

	// Generate random nonce
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, fmt.Errorf("generate nonce: %w", err)
	}

	// Serialize identity
	payload := identityPayload{
		PrivateKey: identity.PrivateKeyBase64(),
		PublicKey:  identity.PublicKeyBase64(),
	}
	plaintext, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal payload: %w", err)
	}

	// Encrypt
	ciphertext := gcm.Seal(nil, nonce, plaintext, nil)

	return &IdentityBackup{
		Algorithm:  "AES-256-GCM",
		KDF:        "PBKDF2-SHA256",
		Iterations: PBKDF2Iterations,
		Salt:       base64.StdEncoding.EncodeToString(salt),
		IV:         base64.StdEncoding.EncodeToString(nonce),
		Payload:    base64.StdEncoding.EncodeToString(ciphertext),
	}, nil
}

// DecryptIdentity decrypts the identity backup with a PIN
func DecryptIdentity(backup *IdentityBackup, pin string) (*Identity, error) {
	// Decode base64 values
	salt, err := base64.StdEncoding.DecodeString(backup.Salt)
	if err != nil {
		return nil, fmt.Errorf("decode salt: %w", err)
	}

	nonce, err := base64.StdEncoding.DecodeString(backup.IV)
	if err != nil {
		return nil, fmt.Errorf("decode IV: %w", err)
	}

	ciphertext, err := base64.StdEncoding.DecodeString(backup.Payload)
	if err != nil {
		return nil, fmt.Errorf("decode payload: %w", err)
	}

	// Derive key from PIN
	iterations := backup.Iterations
	if iterations == 0 {
		iterations = PBKDF2Iterations
	}
	key := pbkdf2.Key([]byte(pin), salt, iterations, KeySize, sha256.New)

	// Create AES-GCM cipher
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("create GCM: %w", err)
	}

	// Decrypt
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, errors.New("decryption failed: invalid PIN or corrupted data")
	}

	// Parse payload
	var payload identityPayload
	if err := json.Unmarshal(plaintext, &payload); err != nil {
		return nil, fmt.Errorf("unmarshal payload: %w", err)
	}

	// Decode keys
	privKeyBytes, err := base64.StdEncoding.DecodeString(payload.PrivateKey)
	if err != nil {
		return nil, fmt.Errorf("decode private key: %w", err)
	}

	pubKeyBytes, err := base64.StdEncoding.DecodeString(payload.PublicKey)
	if err != nil {
		return nil, fmt.Errorf("decode public key: %w", err)
	}

	if len(privKeyBytes) != PrivateKeySize || len(pubKeyBytes) != PublicKeySize {
		return nil, errors.New("invalid key size in backup")
	}

	identity := &Identity{}
	copy(identity.PrivateKey[:], privKeyBytes)
	copy(identity.PublicKey[:], pubKeyBytes)

	return identity, nil
}

// LocationData is the plaintext location structure
type LocationData struct {
	Hierarchy     map[string]string `json:"hierarchy"`
	NamedLocation string            `json:"namedLocation,omitempty"`
	Timestamp     string            `json:"timestamp"`
}

// EncryptLocation encrypts location data using NaCl box
// sender is your identity, recipientPubKey is base64-encoded
func EncryptLocation(data *LocationData, sender *Identity, recipientPubKeyB64 string) (string, error) {
	// Decode recipient public key
	recipientPubKeyBytes, err := base64.StdEncoding.DecodeString(recipientPubKeyB64)
	if err != nil {
		return "", fmt.Errorf("decode recipient public key: %w", err)
	}

	if len(recipientPubKeyBytes) != PublicKeySize {
		return "", errors.New("invalid recipient public key size")
	}

	var recipientPubKey [PublicKeySize]byte
	copy(recipientPubKey[:], recipientPubKeyBytes)

	// Serialize location data
	plaintext, err := json.Marshal(data)
	if err != nil {
		return "", fmt.Errorf("marshal location: %w", err)
	}

	// Generate random nonce
	var nonce [24]byte
	if _, err := rand.Read(nonce[:]); err != nil {
		return "", fmt.Errorf("generate nonce: %w", err)
	}

	// Encrypt using NaCl box
	encrypted := box.Seal(nonce[:], plaintext, &nonce, &recipientPubKey, &sender.PrivateKey)

	return base64.StdEncoding.EncodeToString(encrypted), nil
}

// DecryptLocation decrypts location data using NaCl box
// recipient is your identity, senderPubKey is base64-encoded
func DecryptLocation(encryptedB64 string, recipient *Identity, senderPubKeyB64 string) (*LocationData, error) {
	// Decode encrypted data
	encrypted, err := base64.StdEncoding.DecodeString(encryptedB64)
	if err != nil {
		return nil, fmt.Errorf("decode encrypted data: %w", err)
	}

	if len(encrypted) < 24 {
		return nil, errors.New("encrypted data too short")
	}

	// Decode sender public key
	senderPubKeyBytes, err := base64.StdEncoding.DecodeString(senderPubKeyB64)
	if err != nil {
		return nil, fmt.Errorf("decode sender public key: %w", err)
	}

	if len(senderPubKeyBytes) != PublicKeySize {
		return nil, errors.New("invalid sender public key size")
	}

	var senderPubKey [PublicKeySize]byte
	copy(senderPubKey[:], senderPubKeyBytes)

	// Extract nonce (first 24 bytes)
	var nonce [24]byte
	copy(nonce[:], encrypted[:24])

	// Decrypt using NaCl box
	plaintext, ok := box.Open(nil, encrypted[24:], &nonce, &senderPubKey, &recipient.PrivateKey)
	if !ok {
		return nil, errors.New("decryption failed")
	}

	// Parse location data
	var data LocationData
	if err := json.Unmarshal(plaintext, &data); err != nil {
		return nil, fmt.Errorf("unmarshal location: %w", err)
	}

	return &data, nil
}

// EncryptUserData encrypts user data using NaCl box to self
func EncryptUserData(data []byte, identity *Identity) (string, error) {
	// Generate random nonce
	var nonce [24]byte
	if _, err := rand.Read(nonce[:]); err != nil {
		return "", fmt.Errorf("generate nonce: %w", err)
	}

	// Encrypt to self using NaCl box
	encrypted := box.Seal(nonce[:], data, &nonce, &identity.PublicKey, &identity.PrivateKey)

	return base64.StdEncoding.EncodeToString(encrypted), nil
}

// DecryptUserData decrypts user data encrypted with NaCl box to self
func DecryptUserData(encryptedB64 string, identity *Identity) ([]byte, error) {
	// Decode encrypted data
	encrypted, err := base64.StdEncoding.DecodeString(encryptedB64)
	if err != nil {
		return nil, fmt.Errorf("decode encrypted data: %w", err)
	}

	if len(encrypted) < 24 {
		return nil, errors.New("encrypted data too short")
	}

	// Extract nonce (first 24 bytes)
	var nonce [24]byte
	copy(nonce[:], encrypted[:24])

	// Decrypt from self
	plaintext, ok := box.Open(nil, encrypted[24:], &nonce, &identity.PublicKey, &identity.PrivateKey)
	if !ok {
		return nil, errors.New("decryption failed")
	}

	return plaintext, nil
}
