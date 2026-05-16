#!/bin/sh
echo "Aguardando MySQL ficar pronto..."
MAX_RETRIES=30
RETRY=0
while [ $RETRY -lt $MAX_RETRIES ]; do
  python -c "
import mysql.connector, os, sys
try:
    conn = mysql.connector.connect(
        host=os.getenv('DB_HOST','mysql'),
        port=int(os.getenv('DB_PORT','3306')),
        user=os.getenv('DB_USER','suspensul'),
        password=os.getenv('DB_PASSWORD',''),
        database=os.getenv('DB_NAME','oficina_suspensul')
    )
    conn.close()
    sys.exit(0)
except Exception as e:
    print(f'MySQL nao pronto: {e}')
    sys.exit(1)
" && break
  RETRY=$((RETRY + 1))
  echo "Tentativa $RETRY/$MAX_RETRIES..."
  sleep 2
done

if [ $RETRY -eq $MAX_RETRIES ]; then
  echo "ERRO: MySQL nao ficou pronto a tempo!"
  exit 1
fi

echo "MySQL pronto! Rodando migracoes..."
python -c "
from app import app
with app.app_context():
    from app import run_migrations
    run_migrations()
    print('Migracoes concluidas com sucesso!')
"

echo "Iniciando gunicorn..."
exec gunicorn --bind 0.0.0.0:5000 --workers 2 --timeout 120 app:app
