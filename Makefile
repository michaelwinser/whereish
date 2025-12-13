# Whereish Makefile
# Run 'make help' to see available targets

.PHONY: help test test-smoke test-unit run build docker-run clean clean-all clean-db lint lint-python lint-js lint-md venv install install-dev install-hooks pre-commit

# Default target
.DEFAULT_GOAL := help

# =============================================================================
# Python Environment
# =============================================================================

VENV := .venv
VENV_PYTHON := $(VENV)/bin/python3
VENV_PIP := $(VENV)/bin/pip

# Use venv python if it exists, otherwise system python3
PYTHON := $(shell [ -f $(VENV_PYTHON) ] && echo $(VENV_PYTHON) || echo python3)

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

venv: ## Create Python virtual environment
	@echo "Creating virtual environment..."
	python3 -m venv $(VENV)
	$(VENV_PIP) install --upgrade pip
	@echo "✓ Virtual environment created at $(VENV)"
	@echo "  Activate with: source $(VENV)/bin/activate"

install: venv ## Install production dependencies
	@echo "Installing dependencies..."
	$(VENV_PIP) install -r server/requirements.txt
	@echo "✓ Dependencies installed"

install-dev: install install-hooks ## Install development dependencies
	@echo "Installing dev dependencies..."
	$(VENV_PIP) install -r server/requirements-dev.txt
	@echo "✓ Dev dependencies installed"

install-hooks: ## Install git hooks
	@echo "Installing git hooks..."
	@cp scripts/hooks/pre-commit .git/hooks/pre-commit
	@chmod +x .git/hooks/pre-commit
	@echo "✓ Git hooks installed"

# =============================================================================
# Development
# =============================================================================

run: ## Run dev server (API + static files on :8080)
	@echo "Starting Whereish on http://localhost:8080"
	@echo "Press Ctrl+C to stop"
	cd server && SERVE_STATIC=true PORT=8080 $(PYTHON) run.py

# =============================================================================
# Testing
# =============================================================================

test: test-smoke lint ## Run all tests (smoke + lint)

pre-commit: test ## Run pre-commit checks (currently same as test)

test-smoke: ## Run fast smoke tests (~7 seconds)
	@echo "Running smoke tests..."
	@# Server smoke tests
	@if [ -f smoke_test.py ]; then \
		$(PYTHON) smoke_test.py; \
	else \
		echo "  [SKIP] smoke_test.py not found (see Issue #5)"; \
	fi
	@# Client syntax check
	@echo "Checking JavaScript syntax..."
	@node --check app/storage.js
	@node --check app/geofence.js
	@node --check app/api.js
	@node --check app/views.js
	@node --check app/app.js
	@echo "✓ JavaScript syntax OK"

test-unit: ## Run unit tests (not yet implemented - Issue #5)
	@echo "[TODO] Unit tests not yet implemented (see Issue #5)"
	@exit 1

test-integration: ## Run integration tests (not yet implemented - Issue #5)
	@echo "[TODO] Integration tests not yet implemented (see Issue #5)"
	@exit 1

# =============================================================================
# Linting
# =============================================================================

lint: lint-python lint-js lint-md ## Run all linters

lint-python: ## Lint Python code with ruff
	@echo "Linting Python..."
	@$(PYTHON) -m ruff check server/ smoke_test.py
	@$(PYTHON) -m ruff format --check server/ smoke_test.py
	@echo "✓ Python lint OK"

lint-js: ## Lint JavaScript code with eslint
	@echo "Linting JavaScript..."
	@npx eslint app/*.js --no-error-on-unmatched-pattern
	@echo "✓ JavaScript lint OK"

lint-md: ## Lint Markdown files
	@echo "Linting Markdown..."
	@npx markdownlint-cli@0.41.0 '**/*.md' --ignore node_modules --ignore .venv
	@echo "✓ Markdown lint OK"

# =============================================================================
# Docker
# =============================================================================

build: ## Build Docker image
	docker build -t whereish .

docker-run: build ## Run Docker container locally
	@echo "Starting Whereish container on http://localhost:8080"
	@echo "Press Ctrl+C to stop"
	docker run --rm -p 8080:8080 -v whereish-data:/app/data -e SECRET_KEY=dev-secret-for-local-testing whereish

# =============================================================================
# Utility
# =============================================================================

clean: ## Remove build artifacts and caches
	@echo "Cleaning up..."
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	find . -type f -name ".DS_Store" -delete 2>/dev/null || true
	rm -rf .ruff_cache 2>/dev/null || true
	@echo "✓ Clean complete"

clean-all: clean ## Remove everything including venv
	@echo "Removing virtual environment..."
	rm -rf $(VENV)
	@echo "✓ Full clean complete"

clean-db: ## Clear the development database
	@echo "Removing development database..."
	rm -f server/whereish.db
	@echo "✓ Database cleared"

kill-servers: ## Kill any running dev servers
	@echo "Stopping servers..."
	@-pkill -f "python run.py" 2>/dev/null || true
	@-pkill -f "python -m http.server 8080" 2>/dev/null || true
	@echo "✓ Servers stopped"
