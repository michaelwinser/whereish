// Package config handles configuration for Whereish server.
package config

import (
	"os"
	"strconv"
	"time"
)

// Config holds all configuration for the server
type Config struct {
	// Server configuration
	Port string
	Host string

	// Database configuration
	DatabaseURL  string
	DatabaseType string // "sqlite", "postgres", "firestore"

	// Google OAuth
	GoogleClientID string

	// Session configuration
	SessionDuration time.Duration

	// Development mode
	DevMode bool
}

// Load loads configuration from environment variables
func Load() *Config {
	cfg := &Config{
		Port:            getEnv("PORT", "8080"),
		Host:            getEnv("HOST", ""),
		DatabaseURL:     getEnv("DATABASE_URL", "whereish.db"),
		DatabaseType:    getEnv("DATABASE_TYPE", "sqlite"),
		GoogleClientID:  getEnv("GOOGLE_CLIENT_ID", ""),
		SessionDuration: getDuration("SESSION_DURATION", 7*24*time.Hour),
		DevMode:         getBool("DEV_MODE", false),
	}

	return cfg
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func getBool(key string, defaultVal bool) bool {
	if val := os.Getenv(key); val != "" {
		b, err := strconv.ParseBool(val)
		if err == nil {
			return b
		}
	}
	return defaultVal
}

func getDuration(key string, defaultVal time.Duration) time.Duration {
	if val := os.Getenv(key); val != "" {
		d, err := time.ParseDuration(val)
		if err == nil {
			return d
		}
	}
	return defaultVal
}
