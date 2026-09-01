FROM python:3.12-slim

WORKDIR /app

# Prevent Python from buffering stdout/stderr and writing .pyc files
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend and frontend
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Run as non-root user for security
RUN adduser --disabled-password --gecos '' --no-create-home appuser
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:3000/api/health')" || exit 1

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "3000"]
