# Whereish Server Makefile

.PHONY: all generate build test clean run lint

# Default target
all: generate build

# Install code generation tools
.PHONY: tools
tools:
	go install github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@latest

# Generate code from OpenAPI spec
generate: tools
	oapi-codegen -generate types,server,spec -package api api/openapi.yaml > internal/api/generated.go
	oapi-codegen -generate types,client -package client api/openapi.yaml > pkg/client/generated.go

# Build the server binary
build:
	go build -o bin/server ./cmd/server

# Build the CLI binary
build-cli:
	go build -o bin/whereish ./cmd/cli

# Build all binaries
build-all: build build-cli

# Run tests
test:
	go test -v ./...

# Run tests with coverage
test-coverage:
	go test -v -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html

# Run the server locally
run:
	go run ./cmd/server

# Run linter
lint:
	golangci-lint run ./...

# Clean build artifacts
clean:
	rm -rf bin/
	rm -f coverage.out coverage.html

# Validate OpenAPI spec
validate:
	@command -v swagger-cli >/dev/null 2>&1 || { echo "Install: npm install -g @apidevtools/swagger-cli"; exit 1; }
	swagger-cli validate api/openapi.yaml

# Development: run with hot reload (requires air)
dev:
	@command -v air >/dev/null 2>&1 || { echo "Install: go install github.com/cosmtrek/air@latest"; exit 1; }
	air

# Database migrations (placeholder)
migrate-up:
	@echo "TODO: Run migrations"

migrate-down:
	@echo "TODO: Rollback migrations"
