# Whereish - Unified Docker Image
# Serves both API and PWA from a single container

# Build stage - compile Go binary
FROM golang:1.24-alpine AS builder

WORKDIR /build

# Copy Go modules first for caching
COPY server/go.mod server/go.sum ./
RUN go mod download

# Copy source and build (CGO disabled - using pure Go SQLite)
COPY server/ ./
RUN CGO_ENABLED=0 go build -o whereish-server ./cmd/server

# Runtime stage - minimal image
FROM alpine:latest

WORKDIR /app

# Install CA certificates for HTTPS
RUN apk add --no-cache ca-certificates

# Copy binary from builder
COPY --from=builder /build/whereish-server /app/

# Copy PWA static files
COPY app/ /app/static/

# Create data directory for SQLite persistence
RUN mkdir -p /app/data

# Environment variables
ENV PORT=8080
ENV DATABASE_URL=/app/data/whereish.db
ENV STATIC_DIR=/app/static

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost:8080/api/health || exit 1

# Run server
CMD ["/app/whereish-server"]
