// Package auth handles authentication for Whereish.
package auth

import (
	"context"
	"fmt"

	"google.golang.org/api/idtoken"
)

// GoogleClaims contains the relevant claims from a Google ID token
type GoogleClaims struct {
	Sub   string // Unique Google user ID
	Email string
	Name  string
}

// GoogleVerifier verifies Google ID tokens
type GoogleVerifier struct {
	clientID string
}

// NewGoogleVerifier creates a new Google token verifier
func NewGoogleVerifier(clientID string) *GoogleVerifier {
	return &GoogleVerifier{clientID: clientID}
}

// Verify validates a Google ID token and returns the claims
func (v *GoogleVerifier) Verify(ctx context.Context, token string) (*GoogleClaims, error) {
	payload, err := idtoken.Validate(ctx, token, v.clientID)
	if err != nil {
		return nil, fmt.Errorf("invalid token: %w", err)
	}

	claims := &GoogleClaims{
		Sub: payload.Subject,
	}

	if email, ok := payload.Claims["email"].(string); ok {
		claims.Email = email
	}
	if name, ok := payload.Claims["name"].(string); ok {
		claims.Name = name
	}

	if claims.Email == "" {
		return nil, fmt.Errorf("token missing email claim")
	}

	return claims, nil
}
