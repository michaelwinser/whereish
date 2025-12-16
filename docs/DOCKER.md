# Docker Self-Hosting Guide

Deploy Whereish using Docker for easy self-hosting behind a reverse proxy.

## Quick Start

```bash
# Build the image
docker build -t whereish .

# Create .env file with required variables
cat > .env << EOF
SECRET_KEY=$(openssl rand -hex 32)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
EOF

# Run with docker-compose (recommended)
docker compose up -d

# Or run directly
docker run -d \
  -p 8080:8080 \
  -v whereish-data:/app/data \
  -e SECRET_KEY=$(openssl rand -hex 32) \
  -e GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com \
  whereish
```

Visit http://localhost:8080 to access the app.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SECRET_KEY` | Yes | - | JWT signing key (use `openssl rand -hex 32` to generate) |
| `GOOGLE_CLIENT_ID` | Yes | - | Google OAuth client ID (from Google Cloud Console) |
| `DATABASE_PATH` | No | `/app/data/whereish.db` | SQLite database file path |
| `PORT` | No | `8080` | Server port |
| `SERVE_STATIC` | No | `true` | Serve PWA from Flask (always true in Docker) |
| `BEHIND_PROXY` | No | `false` | Enable reverse proxy header handling |

## Docker Compose

The included `docker-compose.yml` provides the recommended setup:

```yaml
services:
  whereish:
    build: .
    container_name: whereish
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      - SECRET_KEY=${SECRET_KEY:?SECRET_KEY is required}
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:?GOOGLE_CLIENT_ID is required}
      - DATABASE_PATH=/app/data/whereish.db
      - SERVE_STATIC=true
      - BEHIND_PROXY=${BEHIND_PROXY:-false}
    volumes:
      - whereish-data:/app/data

volumes:
  whereish-data:
```

### Usage

```bash
# Start
SECRET_KEY=your-secret-key docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down

# Stop and remove data volume
docker compose down -v
```

## Reverse Proxy Setup

When running behind nginx, traefik, or another reverse proxy, set `BEHIND_PROXY=true` to properly handle `X-Forwarded-*` headers.

### nginx proxy manager

1. Add a new proxy host
2. Configure:
   - Domain: `whereish.yourdomain.com`
   - Scheme: `http`
   - Forward Hostname: `whereish` (container name) or IP
   - Forward Port: `8080`
3. Enable SSL (Let's Encrypt)
4. In the container, set `BEHIND_PROXY=true`

### nginx (manual)

```nginx
server {
    listen 443 ssl;
    server_name whereish.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Traefik (docker labels)

```yaml
services:
  whereish:
    # ... other config ...
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.whereish.rule=Host(`whereish.yourdomain.com`)"
      - "traefik.http.routers.whereish.tls.certresolver=letsencrypt"
      - "traefik.http.services.whereish.loadbalancer.server.port=8080"
    environment:
      - BEHIND_PROXY=true
```

## Data Persistence

SQLite database is stored at `/app/data/whereish.db` inside the container. Mount a volume to persist data:

```bash
# Named volume (recommended)
-v whereish-data:/app/data

# Host directory
-v /path/on/host:/app/data
```

## Health Check

The container includes a health check that polls `/api/health` every 30 seconds.

Check container health:
```bash
docker inspect --format='{{.State.Health.Status}}' whereish
```

## Building from Source

```bash
# Clone repository
git clone https://github.com/michaelwinser/whereish.git
cd whereish

# Build
docker build -t whereish .

# Run
docker run -d -p 8080:8080 -e SECRET_KEY=your-secret whereish
```

## Troubleshooting

### Container won't start

Check logs:
```bash
docker logs whereish
```

Common issues:
- Missing `SECRET_KEY` or `GOOGLE_CLIENT_ID` environment variable
- Port 8080 already in use (change with `-p 8081:8080`)

### Database errors

Ensure volume is mounted correctly and has proper permissions:
```bash
docker exec whereish ls -la /app/data/
```

### Proxy headers not working

Verify `BEHIND_PROXY=true` is set:
```bash
docker exec whereish env | grep BEHIND
```

### PWA not loading

Check static file serving is enabled:
```bash
docker exec whereish env | grep SERVE_STATIC
```

Should show `SERVE_STATIC=true`.

## Security Notes

- **SECRET_KEY**: Use a strong, unique key (32+ random bytes). Never commit to git.
- **HTTPS**: Always use HTTPS in production via reverse proxy.
- **Firewall**: Only expose port 8080 to your reverse proxy, not the public internet.
- **Updates**: Rebuild the image regularly to get security updates.
