# Whereish - Unified Docker Image
# Serves both API and PWA from a single container

FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install dependencies
COPY server/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt gunicorn

# Copy application code
# Flask expects static files at ../app/ relative to server/
COPY server/ ./server/
COPY app/ ./app/

# Create data directory for SQLite persistence
RUN mkdir -p /app/data

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV SERVE_STATIC=true
ENV DATABASE_PATH=/app/data/whereish.db
ENV PORT=8080

# SECRET_KEY must be provided at runtime
# ENV SECRET_KEY=your-secret-key

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/api/health')" || exit 1

# Run with gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "2", "--chdir", "server", "app:app"]
