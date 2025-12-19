# Whereish Makefile
# Run 'make help' to see available targets

.PHONY: help test test-server test-client test-all run build docker-run clean lint lint-js lint-md lint-ui-sync install-hooks pre-commit

# Default target
.DEFAULT_GOAL := help

# =============================================================================
# Help
# =============================================================================

help: ## Show this help message
	@echo "Whereish - Available targets:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
	@echo ""

# =============================================================================
# Setup
# =============================================================================

install-hooks: ## Install git hooks
	@echo "Installing git hooks..."
	@cp scripts/hooks/pre-commit .git/hooks/pre-commit
	@chmod +x .git/hooks/pre-commit
	@echo "✓ Git hooks installed"

# =============================================================================
# Development
# =============================================================================

run: ## Run dev server (Go server + static files on :8080)
	@echo "Starting Whereish on http://localhost:8080"
	@echo "Press Ctrl+C to stop"
	@cd server && go run ./cmd/server

run-client: ## Serve PWA client only (for testing without server)
	@echo "Starting client on http://localhost:8080"
	@cd app && python3 -m http.server 8080

# =============================================================================
# Testing
# =============================================================================

test: lint ## Run lints (quick check)

pre-commit: test ## Run pre-commit checks

test-server: ## Run Go server tests
	@echo "Running server tests..."
	@cd server && go test ./...
	@echo "✓ Server tests OK"

test-client: ## Run client tests (Playwright)
	@echo "Running client tests..."
	@npx playwright test
	@echo "✓ Client tests OK"

test-all: test-server test-client ## Run all tests (server + client)

# =============================================================================
# Linting
# =============================================================================

lint: lint-js lint-md lint-ui-sync ## Run all linters

lint-js: ## Lint JavaScript code with eslint
	@echo "Linting JavaScript..."
	@npx eslint app/*.js --no-error-on-unmatched-pattern --no-warn-ignored
	@echo "✓ JavaScript lint OK"

lint-md: ## Lint Markdown files
	@echo "Linting Markdown..."
	@npx markdownlint-cli@0.41.0 docs/*.md reviews/*.md '*.md'
	@echo "✓ Markdown lint OK"

lint-ui-sync: ## Check UI sync pattern violations
	@echo "Checking UI sync patterns..."
	@./scripts/lint-ui-sync.sh
	@echo "✓ UI sync check complete"

lint-go: ## Lint Go code
	@echo "Linting Go..."
	@cd server && go vet ./...
	@echo "✓ Go lint OK"

# =============================================================================
# Build
# =============================================================================

build: ## Build Go server binary
	@echo "Building server..."
	@cd server && go build -o bin/whereish-server ./cmd/server
	@cd server && go build -o bin/whereish ./cmd/cli
	@echo "✓ Build complete"

build-docker: update-build-info ## Build Docker image
	docker build -t whereish .

docker-run: build-docker ## Run Docker container locally
	@echo "Starting Whereish container on http://localhost:8080"
	@echo "Press Ctrl+C to stop"
	@docker run --rm -p 8080:8080 -v whereish-data:/app/data \
		-e GOOGLE_CLIENT_ID="$${GOOGLE_CLIENT_ID}" \
		-e DEV_MODE=true \
		whereish

# =============================================================================
# Code Generation
# =============================================================================

generate: generate-server generate-client generate-types ## Generate all code

generate-server: ## Generate Go server code from OpenAPI
	@echo "Generating Go server code..."
	@cd server && oapi-codegen -generate types,chi-server,spec -package api api/openapi.yaml > internal/api/generated.go
	@echo "✓ Server code generated"

generate-client: ## Generate Go client code from OpenAPI
	@echo "Generating Go client code..."
	@cd server && oapi-codegen -generate types,client -package client api/openapi.yaml > pkg/client/generated.go
	@echo "✓ Client code generated"

generate-types: ## Generate TypeScript types from OpenAPI
	@echo "Generating TypeScript types..."
	@npm run generate:types
	@echo "✓ TypeScript types generated"

# =============================================================================
# Utility
# =============================================================================

clean: ## Remove build artifacts and caches
	@echo "Cleaning up..."
	@rm -rf server/bin/
	@rm -rf client-ts/dist/
	@find . -type f -name ".DS_Store" -delete 2>/dev/null || true
	@echo "✓ Clean complete"

clean-db: ## Clear the local development database
	@echo "Removing local development database..."
	@rm -f server/*.db
	@echo "✓ Local database cleared"

clean-docker-db: ## Clear the Docker database volume
	@echo "Removing Docker database volume..."
	@-docker volume rm whereish-data 2>/dev/null || true
	@echo "✓ Docker database cleared"

# =============================================================================
# Version Management
# =============================================================================

bump-version: ## Bump version number in all files
	@./scripts/bump-version.sh

update-build-info: ## Update build info (time, git commit) without bumping version
	@BUILD_TIME=$$(date -u +"%Y-%m-%dT%H:%M:%SZ"); \
	GIT_COMMIT=$$(git rev-parse --short HEAD 2>/dev/null || echo "unknown"); \
	VERSION=$$(grep -oE "version: [0-9]+" app/version.js | grep -oE "[0-9]+"); \
	echo "/**" > app/version.js; \
	echo " * Whereish Version Information" >> app/version.js; \
	echo " *" >> app/version.js; \
	echo " * This file is updated by the build process." >> app/version.js; \
	echo " * Do not edit manually - use 'make bump-version' instead." >> app/version.js; \
	echo " */" >> app/version.js; \
	echo "" >> app/version.js; \
	echo "/* exported BUILD_INFO */" >> app/version.js; \
	echo "const BUILD_INFO = {" >> app/version.js; \
	echo "    version: $$VERSION," >> app/version.js; \
	echo "    buildTime: '$$BUILD_TIME'," >> app/version.js; \
	echo "    gitCommit: '$$GIT_COMMIT'" >> app/version.js; \
	echo "};" >> app/version.js; \
	echo "✓ Build info updated: version=$$VERSION, commit=$$GIT_COMMIT"
