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

EXPOSE 3000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "3000"]
