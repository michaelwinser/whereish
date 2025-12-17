// Package main is the entry point for the Whereish server.
package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/whereish/server/internal/api"
	"github.com/whereish/server/internal/config"
	"github.com/whereish/server/internal/store"
	"github.com/whereish/server/internal/store/sqlite"
)

func main() {
	// Load configuration
	cfg := config.Load()

	// Initialize store
	var st store.Store
	var err error

	switch cfg.DatabaseType {
	case "sqlite":
		st, err = sqlite.New(cfg.DatabaseURL)
	case "postgres":
		log.Fatal("Postgres not yet implemented")
	case "firestore":
		log.Fatal("Firestore not yet implemented")
	default:
		log.Fatalf("Unknown database type: %s", cfg.DatabaseType)
	}

	if err != nil {
		log.Fatalf("Failed to initialize store: %v", err)
	}
	defer st.Close()

	// Validate required config
	if cfg.GoogleClientID == "" && !cfg.DevMode {
		log.Fatal("GOOGLE_CLIENT_ID is required (or set DEV_MODE=true)")
	}

	// Create API server
	server := api.NewServer(st, cfg.GoogleClientID, cfg.SessionDuration)

	// Setup router
	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RealIP)
	r.Use(corsMiddleware)
	r.Use(server.AuthMiddleware)

	// Mount API routes with /api prefix
	api.HandlerFromMuxWithBaseURL(server, r, "/api")

	// Start server
	addr := fmt.Sprintf("%s:%s", cfg.Host, cfg.Port)
	log.Printf("Starting server on %s", addr)
	log.Printf("Database: %s (%s)", cfg.DatabaseType, cfg.DatabaseURL)

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan
		log.Println("Shutting down...")
		st.Close()
		os.Exit(0)
	}()

	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

// corsMiddleware adds CORS headers
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
