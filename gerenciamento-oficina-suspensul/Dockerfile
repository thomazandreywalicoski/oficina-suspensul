FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    default-libmysqlclient-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/uploads /app/static/uploads

EXPOSE 5000

CMD ["sh", "-c", "python -c \"from app import run_migrations; run_migrations()\" && gunicorn --bind 0.0.0.0:5000 --workers 2 --timeout 120 app:app"]
