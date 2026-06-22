# Dockerfile for PowerDime Hydration Scripts
# Usage:
#   docker build -t hydrate .
#   docker run --rm --env-file .env hydrate python check_da_lmp_status.py
#   docker run --rm --env-file .env hydrate python da_lmp_new.py

FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (for psycopg2 and SSH)
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir \
    psycopg2-binary \
    python-dotenv \
    requests \
    supabase \
    sshtunnel \
    pymysql \
    pandas \
    xlrd \
    openpyxl

# Copy all hydrate scripts
COPY *.py ./
COPY connectors/ ./connectors/
COPY ERCOT/ ./ERCOT/
COPY MISO/ ./MISO/

# Default command
CMD ["python", "check_da_lmp_status.py"]
