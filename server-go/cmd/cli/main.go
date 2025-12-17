// Package main is the entry point for the Whereish CLI.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/whereish/server/pkg/client"
)

// Config file location
var configPath = filepath.Join(os.Getenv("HOME"), ".whereish", "config.json")

// Config holds CLI configuration
type config struct {
	ServerURL string `json:"server_url"`
	Token     string `json:"token"`
}

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	cmd := os.Args[1]
	args := os.Args[2:]

	switch cmd {
	case "help", "--help", "-h":
		printUsage()
	case "config":
		handleConfig(args)
	case "health":
		handleHealth()
	case "whoami":
		handleWhoami()
	case "logout":
		handleLogout()
	case "contacts":
		handleContacts(args)
	case "requests":
		handleRequests(args)
	case "locations":
		handleLocations(args)
	case "devices":
		handleDevices(args)
	case "identity":
		handleIdentity(args)
	case "data":
		handleData(args)
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n", cmd)
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Println(`Whereish CLI

Usage: whereish <command> [args]

Commands:
  config set <url>           Set server URL
  config show                Show current config
  health                     Check server health
  whoami                     Show current user
  logout                     End session

  contacts list              List contacts
  contacts add <email>       Send contact request
  contacts remove <id>       Remove contact

  requests list              List pending requests
  requests accept <id>       Accept contact request
  requests decline <id>      Decline contact request
  requests cancel <id>       Cancel outgoing request

  locations get              Get locations from contacts
  locations share            Share location (not implemented - needs encryption)

  devices list               List devices
  devices register <name>    Register new device
  devices revoke <id>        Revoke device

  identity get               Get identity backup info
  identity set               Set identity backup (not implemented - needs encryption)

  data get                   Get user data info
  data set                   Set user data (not implemented - needs encryption)

Environment:
  WHEREISH_URL   Server URL (overrides config)
  WHEREISH_TOKEN Auth token (overrides config)
`)
}

func loadConfig() *config {
	cfg := &config{ServerURL: "http://localhost:8080/api"}

	data, err := os.ReadFile(configPath)
	if err == nil {
		json.Unmarshal(data, cfg)
	}

	// Environment overrides
	if url := os.Getenv("WHEREISH_URL"); url != "" {
		cfg.ServerURL = url
	}
	if token := os.Getenv("WHEREISH_TOKEN"); token != "" {
		cfg.Token = token
	}

	return cfg
}

func saveConfig(cfg *config) error {
	dir := filepath.Dir(configPath)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(configPath, data, 0600)
}

func getClient() *client.WhereishClient {
	cfg := loadConfig()
	return client.NewWhereishClient(client.ClientConfig{
		BaseURL: cfg.ServerURL,
		Token:   cfg.Token,
	})
}

func handleConfig(args []string) {
	if len(args) == 0 {
		args = []string{"show"}
	}

	switch args[0] {
	case "show":
		cfg := loadConfig()
		fmt.Printf("Server URL: %s\n", cfg.ServerURL)
		if cfg.Token != "" {
			fmt.Printf("Token: %s...%s\n", cfg.Token[:8], cfg.Token[len(cfg.Token)-4:])
		} else {
			fmt.Println("Token: (not set)")
		}
		fmt.Printf("Config file: %s\n", configPath)

	case "set":
		if len(args) < 2 {
			fmt.Fprintln(os.Stderr, "Usage: whereish config set <url>")
			os.Exit(1)
		}
		cfg := loadConfig()
		cfg.ServerURL = args[1]
		if err := saveConfig(cfg); err != nil {
			fatal("Failed to save config: %v", err)
		}
		fmt.Printf("Server URL set to: %s\n", cfg.ServerURL)

	case "token":
		if len(args) < 2 {
			fmt.Fprintln(os.Stderr, "Usage: whereish config token <token>")
			os.Exit(1)
		}
		cfg := loadConfig()
		cfg.Token = args[1]
		if err := saveConfig(cfg); err != nil {
			fatal("Failed to save config: %v", err)
		}
		fmt.Println("Token saved")

	default:
		fmt.Fprintf(os.Stderr, "Unknown config command: %s\n", args[0])
		os.Exit(1)
	}
}

func handleHealth() {
	c := getClient()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	health, err := c.Health(ctx)
	if err != nil {
		fatal("Health check failed: %v", err)
	}

	fmt.Printf("Status: %s\n", health.Status)
	if health.Version != nil {
		fmt.Printf("Version: %s\n", *health.Version)
	}
}

func handleWhoami() {
	c := getClient()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	user, err := c.GetCurrentUser(ctx)
	if err != nil {
		fatal("Failed to get user: %v", err)
	}

	fmt.Printf("ID: %s\n", user.Id)
	fmt.Printf("Email: %s\n", user.Email)
	fmt.Printf("Name: %s\n", user.Name)
	fmt.Printf("Created: %s\n", user.CreatedAt.Format(time.RFC3339))
	if user.PublicKey != nil && *user.PublicKey != "" {
		fmt.Printf("Public Key: %s...%s\n", (*user.PublicKey)[:8], (*user.PublicKey)[len(*user.PublicKey)-4:])
	}
	if user.HasIdentityBackup != nil {
		fmt.Printf("Has Identity Backup: %v\n", *user.HasIdentityBackup)
	}
	if user.HasUserData != nil {
		fmt.Printf("Has User Data: %v\n", *user.HasUserData)
	}
}

func handleLogout() {
	c := getClient()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := c.Logout(ctx); err != nil {
		fatal("Logout failed: %v", err)
	}

	// Clear token from config
	cfg := loadConfig()
	cfg.Token = ""
	saveConfig(cfg)

	fmt.Println("Logged out successfully")
}

func handleContacts(args []string) {
	if len(args) == 0 {
		args = []string{"list"}
	}

	c := getClient()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	switch args[0] {
	case "list":
		contacts, err := c.ListContacts(ctx)
		if err != nil {
			fatal("Failed to list contacts: %v", err)
		}

		if len(contacts.Contacts) == 0 {
			fmt.Println("No contacts")
			return
		}

		w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
		fmt.Fprintln(w, "ID\tNAME\tEMAIL\tSINCE")
		for _, contact := range contacts.Contacts {
			fmt.Fprintf(w, "%s\t%s\t%s\t%s\n",
				truncate(contact.Id, 8),
				contact.Name,
				contact.Email,
				contact.CreatedAt.Format("2006-01-02"),
			)
		}
		w.Flush()

	case "add":
		if len(args) < 2 {
			fmt.Fprintln(os.Stderr, "Usage: whereish contacts add <email>")
			os.Exit(1)
		}
		req, err := c.SendContactRequest(ctx, args[1])
		if err != nil {
			fatal("Failed to send request: %v", err)
		}
		fmt.Printf("Request sent to %s (ID: %s)\n", args[1], req.Id)

	case "remove":
		if len(args) < 2 {
			fmt.Fprintln(os.Stderr, "Usage: whereish contacts remove <id>")
			os.Exit(1)
		}
		if err := c.RemoveContact(ctx, args[1]); err != nil {
			fatal("Failed to remove contact: %v", err)
		}
		fmt.Println("Contact removed")

	default:
		fmt.Fprintf(os.Stderr, "Unknown contacts command: %s\n", args[0])
		os.Exit(1)
	}
}

func handleRequests(args []string) {
	if len(args) == 0 {
		args = []string{"list"}
	}

	c := getClient()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	switch args[0] {
	case "list":
		requests, err := c.ListContactRequests(ctx)
		if err != nil {
			fatal("Failed to list requests: %v", err)
		}

		if len(requests.Incoming) == 0 && len(requests.Outgoing) == 0 {
			fmt.Println("No pending requests")
			return
		}

		if len(requests.Incoming) > 0 {
			fmt.Println("Incoming requests:")
			w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
			fmt.Fprintln(w, "  ID\tFROM\tDATE")
			for _, req := range requests.Incoming {
				name := string(req.Email)
				if req.Name != nil {
					name = *req.Name
				}
				fmt.Fprintf(w, "  %s\t%s\t%s\n",
					truncate(req.Id, 8),
					name,
					req.CreatedAt.Format("2006-01-02"),
				)
			}
			w.Flush()
		}

		if len(requests.Outgoing) > 0 {
			fmt.Println("Outgoing requests:")
			w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
			fmt.Fprintln(w, "  ID\tTO\tDATE")
			for _, req := range requests.Outgoing {
				name := string(req.Email)
				if req.Name != nil {
					name = *req.Name
				}
				fmt.Fprintf(w, "  %s\t%s\t%s\n",
					truncate(req.Id, 8),
					name,
					req.CreatedAt.Format("2006-01-02"),
				)
			}
			w.Flush()
		}

	case "accept":
		if len(args) < 2 {
			fmt.Fprintln(os.Stderr, "Usage: whereish requests accept <id>")
			os.Exit(1)
		}
		contact, err := c.AcceptContactRequest(ctx, args[1])
		if err != nil {
			fatal("Failed to accept request: %v", err)
		}
		fmt.Printf("Accepted! Now contacts with %s (%s)\n", contact.Name, contact.Email)

	case "decline":
		if len(args) < 2 {
			fmt.Fprintln(os.Stderr, "Usage: whereish requests decline <id>")
			os.Exit(1)
		}
		if err := c.DeclineContactRequest(ctx, args[1]); err != nil {
			fatal("Failed to decline request: %v", err)
		}
		fmt.Println("Request declined")

	case "cancel":
		if len(args) < 2 {
			fmt.Fprintln(os.Stderr, "Usage: whereish requests cancel <id>")
			os.Exit(1)
		}
		if err := c.CancelContactRequest(ctx, args[1]); err != nil {
			fatal("Failed to cancel request: %v", err)
		}
		fmt.Println("Request cancelled")

	default:
		fmt.Fprintf(os.Stderr, "Unknown requests command: %s\n", args[0])
		os.Exit(1)
	}
}

func handleLocations(args []string) {
	if len(args) == 0 {
		args = []string{"get"}
	}

	c := getClient()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	switch args[0] {
	case "get":
		locations, err := c.GetLocations(ctx)
		if err != nil {
			fatal("Failed to get locations: %v", err)
		}

		if len(locations.Locations) == 0 {
			fmt.Println("No locations shared with you")
			return
		}

		w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
		fmt.Fprintln(w, "FROM\tUPDATED\tBLOB (truncated)")
		for _, loc := range locations.Locations {
			fmt.Fprintf(w, "%s\t%s\t%s...\n",
				truncate(loc.FromUserId, 8),
				loc.UpdatedAt.Format("2006-01-02 15:04"),
				truncate(loc.Blob, 20),
			)
		}
		w.Flush()
		fmt.Println("\nNote: Locations are encrypted. Decryption requires your identity key.")

	case "share":
		fmt.Println("Location sharing not implemented in CLI.")
		fmt.Println("Sharing requires client-side encryption with NaCl box.")
		fmt.Println("Use the web client or implement encryption in the CLI.")

	default:
		fmt.Fprintf(os.Stderr, "Unknown locations command: %s\n", args[0])
		os.Exit(1)
	}
}

func handleDevices(args []string) {
	if len(args) == 0 {
		args = []string{"list"}
	}

	c := getClient()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	switch args[0] {
	case "list":
		devices, err := c.ListDevices(ctx)
		if err != nil {
			fatal("Failed to list devices: %v", err)
		}

		if len(devices.Devices) == 0 {
			fmt.Println("No devices")
			return
		}

		w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
		fmt.Fprintln(w, "ID\tNAME\tPLATFORM\tLAST SEEN\tSTATUS")
		for _, d := range devices.Devices {
			status := "active"
			if d.IsRevoked != nil && *d.IsRevoked {
				status = "revoked"
			}
			if d.IsCurrent != nil && *d.IsCurrent {
				status = "current"
			}
			fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\n",
				truncate(d.Id, 8),
				d.Name,
				d.Platform,
				d.LastSeen.Format("2006-01-02 15:04"),
				status,
			)
		}
		w.Flush()

	case "register":
		if len(args) < 2 {
			fmt.Fprintln(os.Stderr, "Usage: whereish devices register <name>")
			os.Exit(1)
		}
		device, err := c.RegisterDevice(ctx, args[1], "cli")
		if err != nil {
			fatal("Failed to register device: %v", err)
		}
		fmt.Printf("Device registered: %s\n", device.Id)
		fmt.Printf("Device token: %s\n", device.Token)
		fmt.Println("\nSave this token - it won't be shown again.")

	case "revoke":
		if len(args) < 2 {
			fmt.Fprintln(os.Stderr, "Usage: whereish devices revoke <id>")
			os.Exit(1)
		}
		if err := c.RevokeDevice(ctx, args[1]); err != nil {
			fatal("Failed to revoke device: %v", err)
		}
		fmt.Println("Device revoked")

	default:
		fmt.Fprintf(os.Stderr, "Unknown devices command: %s\n", args[0])
		os.Exit(1)
	}
}

func handleIdentity(args []string) {
	if len(args) == 0 {
		args = []string{"get"}
	}

	c := getClient()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	switch args[0] {
	case "get":
		backup, err := c.GetIdentityBackup(ctx)
		if err != nil {
			if strings.Contains(err.Error(), "not_found") {
				fmt.Println("No identity backup found")
				return
			}
			fatal("Failed to get identity backup: %v", err)
		}

		fmt.Printf("Algorithm: %s\n", backup.Algorithm)
		fmt.Printf("KDF: %s\n", backup.Kdf)
		fmt.Printf("Iterations: %d\n", backup.Iterations)
		fmt.Printf("Salt: %s\n", truncate(backup.Salt, 20))
		fmt.Printf("IV: %s\n", truncate(backup.Iv, 20))
		fmt.Printf("Payload: %s...\n", truncate(backup.Payload, 40))
		fmt.Println("\nNote: Decryption requires your PIN.")

	case "set":
		fmt.Println("Identity backup not implemented in CLI.")
		fmt.Println("Creating identity requires client-side key generation and encryption.")

	default:
		fmt.Fprintf(os.Stderr, "Unknown identity command: %s\n", args[0])
		os.Exit(1)
	}
}

func handleData(args []string) {
	if len(args) == 0 {
		args = []string{"get"}
	}

	c := getClient()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	switch args[0] {
	case "get":
		data, err := c.GetUserData(ctx)
		if err != nil {
			if strings.Contains(err.Error(), "not_found") {
				fmt.Println("No user data found")
				return
			}
			fatal("Failed to get user data: %v", err)
		}

		fmt.Printf("Version: %d\n", data.Version)
		fmt.Printf("Updated: %s\n", data.UpdatedAt.Format(time.RFC3339))
		if data.Blob != nil {
			fmt.Printf("Blob: %s...\n", truncate(*data.Blob, 40))
		}
		fmt.Println("\nNote: Decryption requires your identity key.")

	case "set":
		fmt.Println("User data update not implemented in CLI.")
		fmt.Println("Updating user data requires client-side encryption.")

	default:
		fmt.Fprintf(os.Stderr, "Unknown data command: %s\n", args[0])
		os.Exit(1)
	}
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}

func fatal(format string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, "Error: "+format+"\n", args...)
	os.Exit(1)
}
