# Use official Python 3.11 slim image
FROM python:3.11-slim

# Set environment variables for Python runtime and PYTHONPATH
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app

# Set working directory inside container
WORKDIR /app

# Install runtime system dependencies (curl for healthchecks)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy dependencies first for Docker layer caching optimization
COPY requirements.txt /app/

# Install python packages
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy the entire backend workspace (relative to context) into /app/backend
COPY . /app/backend

# Switch working directory to backend folder so alembic and other commands run in context
WORKDIR /app/backend

# Expose backend port
EXPOSE 8000

# Default startup command (overridden in compose if running celery)
CMD ["sh", "-c", "alembic upgrade head && uvicorn backend.main:app --host 0.0.0.0 --port 8000"]
