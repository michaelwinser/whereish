# Whereish Backend
# Minimal Python image for Cloud Run deployment

FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY app.py .

# Create non-root user for security
RUN useradd -m -r appuser && chown -R appuser:appuser /app
USER appuser

# Environment variables
ENV PORT=8080
ENV FLASK_DEBUG=false
ENV DATABASE_PATH=/app/data/whereish.db

# Create data directory
RUN mkdir -p /app/data

# Expose port
EXPOSE 8080

# Run with gunicorn for production
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "1", "--threads", "2", "app:app"]
