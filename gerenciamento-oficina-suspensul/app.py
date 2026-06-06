import os
import time
import uuid
import secrets
from datetime import datetime, date, timedelta
from decimal import Decimal
from functools import wraps
from flask import Flask, render_template, request, jsonify, send_from_directory, abort, redirect, url_for, session
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from werkzeug.middleware.proxy_fix import ProxyFix
import mysql.connector
from mysql.connector import pooling

load_dotenv()

app = Flask(__name__)
SECRET_KEY = os.getenv('SECRET_KEY')
if not SECRET_KEY:
    raise RuntimeError('SECRET_KEY deve ser definida no .env')
app.secret_key = SECRET_KEY
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'static', 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=24)
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = os.getenv('SESSION_COOKIE_SECURE', 'false').lower() == 'true'
PUBLIC_BASE_URL = os.getenv('PUBLIC_BASE_URL', '').rstrip('/')
app.config['PUBLIC_BASE_URL'] = PUBLIC_BASE_URL
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)
cookie_domain = os.getenv('SESSION_COOKIE_DOMAIN', '')
if cookie_domain:
    app.config['SESSION_COOKIE_DOMAIN'] = cookie_domain
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

ADMIN_EMAIL = os.getenv('ADMIN_EMAIL', '').strip().lower()
ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD')
ADMIN_PASSWORD_HASH = os.getenv('ADMIN_PASSWORD_HASH')
if not ADMIN_EMAIL or not (ADMIN_PASSWORD_HASH or ADMIN_PASSWORD):
    raise RuntimeError('ADMIN_EMAIL e ADMIN_PASSWORD ou ADMIN_PASSWORD_HASH devem ser definidos no .env')
if not ADMIN_PASSWORD_HASH:
    ADMIN_PASSWORD_HASH = generate_password_hash(ADMIN_PASSWORD)
LOGIN_ATTEMPTS = {}
LOGIN_MAX_ATTEMPTS = int(os.getenv('LOGIN_MAX_ATTEMPTS', 5))
LOGIN_LOCK_SECONDS = int(os.getenv('LOGIN_LOCK_SECONDS', 7200))

DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': int(os.getenv('DB_PORT', 3306)),
    'user': os.getenv('DB_USER', 'suspensul'),
    'password': os.getenv('DB_PASSWORD', 'suspensul123'),
    'database': os.getenv('DB_NAME', 'oficina_suspensul'),
    'charset': 'utf8mb4',
    'use_unicode': True,
}

# Aguarda MySQL ficar pronto
def init_pool(retries=30, delay=2):
    for i in range(retries):
        try:
            return pooling.MySQLConnectionPool(pool_name="suspensul_pool", pool_size=8, **DB_CONFIG)
        except mysql.connector.Error as e:
            print(f"Aguardando MySQL... ({i+1}/{retries}): {e}")
            time.sleep(delay)
    raise RuntimeError("Não foi possível conectar ao MySQL")

pool = None
_migrations_done = False
ORCAMENTOS_TEMP = {}

def get_db():
    global pool
    if pool is None:
        pool = init_pool()
    return pool.get_connection()

def run_migrations():
    global _migrations_done
    if _migrations_done:
        return
    try:
        conn = get_db()
        cur = conn.cursor()
        # ── Criar tabelas base (caso init.sql não tenha rodado) ──
        cur.execute("""CREATE TABLE IF NOT EXISTS clientes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome_completo VARCHAR(150) NOT NULL,
            cpf VARCHAR(20) NULL UNIQUE,
            whatsapp VARCHAR(25),
            ativo TINYINT(1) NOT NULL DEFAULT 1,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci""")
        cur.execute("""CREATE TABLE IF NOT EXISTS fornecedores (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(150) NOT NULL,
            cnpj VARCHAR(25) NOT NULL UNIQUE,
            whatsapp VARCHAR(25),
            ativo TINYINT(1) NOT NULL DEFAULT 1,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci""")
        cur.execute("""CREATE TABLE IF NOT EXISTS veiculos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            placa VARCHAR(15) NULL UNIQUE,
            marca VARCHAR(60),
            modelo VARCHAR(80),
            ano INT,
            km INT DEFAULT 0,
            chassi VARCHAR(50),
            motorizacao VARCHAR(50),
            cor VARCHAR(60),
            combustivel VARCHAR(60),
            imagem VARCHAR(255),
            cliente_id INT,
            ativo TINYINT(1) NOT NULL DEFAULT 1,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci""")
        cur.execute("""CREATE TABLE IF NOT EXISTS agendamentos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            cliente_id INT NOT NULL,
            veiculo_id INT NOT NULL,
            data_agendamento DATE NOT NULL,
            horario TIME NOT NULL,
            observacoes TEXT,
            status ENUM('Agendado', 'Nao_Trouxe', 'Cancelado', 'Concluido') DEFAULT 'Agendado',
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
            FOREIGN KEY (veiculo_id) REFERENCES veiculos(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci""")
        cur.execute("""CREATE TABLE IF NOT EXISTS ordens_servico (
            id INT AUTO_INCREMENT PRIMARY KEY,
            numero INT NOT NULL UNIQUE,
            cliente_id INT NOT NULL,
            veiculo_id INT NOT NULL,
            data_emissao DATE NOT NULL,
            valor_mao_obra DECIMAL(10,2) DEFAULT 0,
            status ENUM('Pendente', 'Paga') DEFAULT 'Pendente',
            observacoes TEXT,
            ativo TINYINT(1) NOT NULL DEFAULT 1,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
            FOREIGN KEY (veiculo_id) REFERENCES veiculos(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci""")
        cur.execute("""CREATE TABLE IF NOT EXISTS ordens_servico_pecas (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ordem_id INT NOT NULL,
            codigo VARCHAR(50),
            descricao VARCHAR(200) NOT NULL,
            fornecedor_id INT NULL,
            quantidade INT NOT NULL DEFAULT 1,
            valor_custo DECIMAL(10,2) NOT NULL DEFAULT 0,
            lucro_percentual DECIMAL(6,2) NOT NULL DEFAULT 0,
            desconto_percentual DECIMAL(6,2) NOT NULL DEFAULT 0,
            valor_venda DECIMAL(10,2) NOT NULL DEFAULT 0,
            FOREIGN KEY (ordem_id) REFERENCES ordens_servico(id) ON DELETE CASCADE,
            FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci""")
        cur.execute("""CREATE TABLE IF NOT EXISTS despesas (
            id INT AUTO_INCREMENT PRIMARY KEY,
            descricao VARCHAR(200) NOT NULL,
            valor DECIMAL(10,2) NOT NULL,
            tipo VARCHAR(20) NOT NULL DEFAULT 'saida',
            data_despesa DATE NOT NULL,
            ativo TINYINT(1) NOT NULL DEFAULT 1,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci""")
        cur.execute("""CREATE TABLE IF NOT EXISTS configuracoes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome_oficina VARCHAR(150) DEFAULT 'Oficina Suspensul',
            cnpj VARCHAR(25),
            endereco VARCHAR(255),
            email VARCHAR(150),
            whatsapp VARCHAR(25),
            logo VARCHAR(255),
            atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci""")
        cur.execute("SELECT COUNT(*) FROM configuracoes")
        (cnt,) = cur.fetchone()
        if cnt == 0:
            cur.execute("""INSERT INTO configuracoes (nome_oficina, cnpj, endereco, email, whatsapp)
                           VALUES ('Oficina Suspensul', '00.000.000/0001-00', 'Rua das Molas, 123 - Mafra/SC', 'contato@suspensul.com.br', '(47) 99999-0000')""")
        conn.commit()
        print("Tabelas base verificadas/criadas com sucesso")
        # ── Migrações incrementais ──
        cur.execute("""SELECT COUNT(*) FROM information_schema.COLUMNS
                       WHERE TABLE_SCHEMA = DATABASE()
                         AND TABLE_NAME = 'ordens_servico_pecas'
                         AND COLUMN_NAME = 'fornecedor_id'""")
        (existe,) = cur.fetchone()
        if not existe:
            cur.execute("ALTER TABLE ordens_servico_pecas ADD COLUMN fornecedor_id INT NULL")
            try:
                cur.execute("""ALTER TABLE ordens_servico_pecas
                               ADD CONSTRAINT fk_pecas_fornecedor
                               FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)
                               ON DELETE SET NULL""")
            except Exception as fe:
                print(f"FK fornecedor_id já existe ou falhou: {fe}")
            conn.commit()
            print("Migração: coluna fornecedor_id adicionada em ordens_servico_pecas")
        cur.execute("""SELECT COUNT(*) FROM information_schema.COLUMNS
                       WHERE TABLE_SCHEMA = DATABASE()
                         AND TABLE_NAME = 'ordens_servico_pecas'
                         AND COLUMN_NAME = 'desconto_percentual'""")
        (existe,) = cur.fetchone()
        if not existe:
            cur.execute("ALTER TABLE ordens_servico_pecas ADD COLUMN desconto_percentual DECIMAL(6,2) NOT NULL DEFAULT 0 AFTER lucro_percentual")
            conn.commit()
            print("Migração: coluna desconto_percentual adicionada em ordens_servico_pecas")
        cur.execute("""SELECT COUNT(*) FROM information_schema.COLUMNS
                       WHERE TABLE_SCHEMA = DATABASE()
                         AND TABLE_NAME = 'ordens_servico_pecas'
                         AND COLUMN_NAME = 'valor_venda_sem_desconto'""")
        (existe,) = cur.fetchone()
        if not existe:
            cur.execute("ALTER TABLE ordens_servico_pecas ADD COLUMN valor_venda_sem_desconto DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER desconto_percentual")
            conn.commit()
            print("Migração: coluna valor_venda_sem_desconto adicionada em ordens_servico_pecas")
        cur.execute("""SELECT COUNT(*) FROM information_schema.COLUMNS
                       WHERE TABLE_SCHEMA = DATABASE()
                         AND TABLE_NAME = 'ordens_servico_pecas'
                         AND COLUMN_NAME = 'valor_desconto'""")
        (existe,) = cur.fetchone()
        if not existe:
            cur.execute("ALTER TABLE ordens_servico_pecas ADD COLUMN valor_desconto DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER valor_venda_sem_desconto")
            conn.commit()
            print("Migração: coluna valor_desconto adicionada em ordens_servico_pecas")
        # Migração: imagem2, imagem3 em veiculos
        for col in ('imagem2', 'imagem3'):
            cur.execute("""SELECT COUNT(*) FROM information_schema.COLUMNS
                           WHERE TABLE_SCHEMA = DATABASE()
                             AND TABLE_NAME = 'veiculos'
                             AND COLUMN_NAME = %s""", (col,))
            (existe,) = cur.fetchone()
            if not existe:
                cur.execute(f"ALTER TABLE veiculos ADD COLUMN {col} VARCHAR(255)")
                conn.commit()
                print(f"Migração: coluna {col} adicionada em veiculos")
        # Migração: cor, combustivel em veiculos
        for col in ('cor', 'combustivel'):
            cur.execute("""SELECT COUNT(*) FROM information_schema.COLUMNS
                           WHERE TABLE_SCHEMA = DATABASE()
                             AND TABLE_NAME = 'veiculos'
                             AND COLUMN_NAME = %s""", (col,))
            (existe,) = cur.fetchone()
            if not existe:
                cur.execute(f"ALTER TABLE veiculos ADD COLUMN {col} VARCHAR(60) NULL")
                conn.commit()
                print(f"Migração: coluna {col} adicionada em veiculos")
        cur.execute("""CREATE TABLE IF NOT EXISTS orcamentos (
                         id INT AUTO_INCREMENT PRIMARY KEY,
                         slug VARCHAR(255) NOT NULL,
                         veiculo_id INT NULL,
                         pecas JSON NOT NULL,
                         criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                         UNIQUE KEY uniq_slug (slug)
                       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
        conn.commit()
        # Colunas adicionais em orcamentos
        for col, ctype in [('fornecedores_ids', 'JSON NULL'), ('mensagem', 'TEXT NULL')]:
            cur.execute(f"""SELECT COUNT(*) FROM information_schema.COLUMNS
                           WHERE TABLE_SCHEMA = DATABASE()
                           AND TABLE_NAME = 'orcamentos'
                           AND COLUMN_NAME = '{col}'""")
            (existe,) = cur.fetchone()
            if not existe:
                cur.execute(f"ALTER TABLE orcamentos ADD COLUMN {col} {ctype}")
                conn.commit()
                print(f"Migração: coluna {col} adicionada em orcamentos")
        cur.execute("""SELECT COUNT(*) FROM information_schema.COLUMNS
                       WHERE TABLE_SCHEMA = DATABASE()
                         AND TABLE_NAME = 'ordens_servico'
                         AND COLUMN_NAME = 'data_pagamento'""")
        (existe,) = cur.fetchone()
        if not existe:
            cur.execute("ALTER TABLE ordens_servico ADD COLUMN data_pagamento DATE NULL AFTER data_emissao")
            conn.commit()
            print("Migração: coluna data_pagamento adicionada em ordens_servico")
        cur.execute("""SELECT COUNT(*) FROM information_schema.COLUMNS
                       WHERE TABLE_SCHEMA = DATABASE()
                         AND TABLE_NAME = 'despesas'
                         AND COLUMN_NAME = 'tipo'""")
        (existe,) = cur.fetchone()
        if not existe:
            cur.execute("ALTER TABLE despesas ADD COLUMN tipo VARCHAR(20) NOT NULL DEFAULT 'saida' AFTER valor")
            conn.commit()
            print("Migração: coluna tipo adicionada em despesas")
        cur.execute("""CREATE TABLE IF NOT EXISTS estoque_produtos (
                         id INT AUTO_INCREMENT PRIMARY KEY,
                         descricao VARCHAR(200) NOT NULL,
                         quantidade INT NOT NULL DEFAULT 0,
                         valor_compra DECIMAL(10,2) NOT NULL DEFAULT 0,
                         lucro_percentual DECIMAL(6,2) NOT NULL DEFAULT 0,
                         valor_venda DECIMAL(10,2) NOT NULL DEFAULT 0,
                         ativo TINYINT(1) NOT NULL DEFAULT 1,
                         criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                         atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci""")
        conn.commit()
        cur.execute("""CREATE TABLE IF NOT EXISTS estoque_movimentacoes (
                         id INT AUTO_INCREMENT PRIMARY KEY,
                         produto_id INT NOT NULL,
                         tipo ENUM('entrada', 'saida') NOT NULL,
                         quantidade INT NOT NULL,
                         valor_unitario DECIMAL(10,2) NOT NULL DEFAULT 0,
                         valor_total DECIMAL(10,2) NOT NULL DEFAULT 0,
                         motivo VARCHAR(255),
                         data_movimentacao DATE NOT NULL,
                         despesa_id INT NULL,
                         criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                         FOREIGN KEY (produto_id) REFERENCES estoque_produtos(id) ON DELETE CASCADE,
                         FOREIGN KEY (despesa_id) REFERENCES despesas(id) ON DELETE SET NULL
                       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci""")
        conn.commit()
        cur.execute("""CREATE TABLE IF NOT EXISTS orcamentos_propostas (
                         id INT AUTO_INCREMENT PRIMARY KEY,
                         numero INT NOT NULL,
                         cliente_id INT NOT NULL,
                         veiculo_id INT NOT NULL,
                         valor_mao_obra DECIMAL(10,2) NOT NULL DEFAULT 0,
                         mao_obra_texto VARCHAR(255) NULL,
                         status VARCHAR(20) NOT NULL DEFAULT 'Pendente',
                         os_id INT NULL,
                         criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                         FOREIGN KEY (cliente_id) REFERENCES clientes(id),
                         FOREIGN KEY (veiculo_id) REFERENCES veiculos(id)
                       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
        conn.commit()
        cur.execute("""CREATE TABLE IF NOT EXISTS orcamentos_propostas_pecas (
                         id INT AUTO_INCREMENT PRIMARY KEY,
                         proposta_id INT NOT NULL,
                         descricao VARCHAR(255) NOT NULL,
                         fornecedor_id INT NULL,
                         quantidade INT NOT NULL DEFAULT 1,
                         valor_custo DECIMAL(10,2) NOT NULL DEFAULT 0,
                         lucro_percentual DECIMAL(6,2) NOT NULL DEFAULT 0,
                         desconto_percentual DECIMAL(6,2) NOT NULL DEFAULT 0,
                         valor_venda_sem_desconto DECIMAL(10,2) NOT NULL DEFAULT 0,
                         valor_desconto DECIMAL(10,2) NOT NULL DEFAULT 0,
                         valor_venda DECIMAL(10,2) NOT NULL DEFAULT 0,
                         FOREIGN KEY (proposta_id) REFERENCES orcamentos_propostas(id) ON DELETE CASCADE
                       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
        conn.commit()
        # Migração: mao_obra_texto em orcamentos_propostas
        cur.execute("""SELECT COUNT(*) FROM information_schema.COLUMNS
                       WHERE TABLE_SCHEMA = DATABASE()
                       AND TABLE_NAME = 'orcamentos_propostas'
                       AND COLUMN_NAME = 'mao_obra_texto'""")
        (existe,) = cur.fetchone()
        if not existe:
            cur.execute("ALTER TABLE orcamentos_propostas ADD COLUMN mao_obra_texto VARCHAR(255) NULL AFTER valor_mao_obra")
            conn.commit()
            print("Migração: coluna mao_obra_texto adicionada em orcamentos_propostas")
        # Migração: slug em orcamentos_propostas
        cur.execute("""SELECT COUNT(*) FROM information_schema.COLUMNS
                       WHERE TABLE_SCHEMA = DATABASE()
                       AND TABLE_NAME = 'orcamentos_propostas'
                       AND COLUMN_NAME = 'slug'""")
        (existe,) = cur.fetchone()
        if not existe:
            cur.execute("ALTER TABLE orcamentos_propostas ADD COLUMN slug VARCHAR(255) NULL UNIQUE AFTER numero")
            conn.commit()
            print("Migração: coluna slug adicionada em orcamentos_propostas")
        # Migração: slug em ordens_servico
        cur.execute("""SELECT COUNT(*) FROM information_schema.COLUMNS
                       WHERE TABLE_SCHEMA = DATABASE()
                       AND TABLE_NAME = 'ordens_servico'
                       AND COLUMN_NAME = 'slug'""")
        (existe,) = cur.fetchone()
        if not existe:
            cur.execute("ALTER TABLE ordens_servico ADD COLUMN slug VARCHAR(255) NULL UNIQUE AFTER numero")
            conn.commit()
            print("Migração: coluna slug adicionada em ordens_servico")
        # Backfill slugs para registros existentes sem slug
        import re as _re, unicodedata as _ud
        def _make_slug(marca, modelo, ano, placa, numero):
            import secrets
            token = secrets.token_hex(8)
            partes = [marca or '', modelo or '', str(ano or ''), placa or '']
            base = '-'.join(p for p in partes if p)
            base = _ud.normalize('NFKD', base).encode('ascii', 'ignore').decode('ascii').lower()
            base = _re.sub(r'[^a-z0-9]+', '-', base).strip('-') or 'veiculo'
            return f"{base}-{numero:06d}-{token}"
        # Backfill ordens_servico
        os_rows = query("SELECT os.id, os.numero, v.marca, v.modelo, v.ano, v.placa FROM ordens_servico os JOIN veiculos v ON os.veiculo_id=v.id WHERE os.slug IS NULL", fetch=True)
        if os_rows:
            for r in os_rows:
                slug = _make_slug(r['marca'], r['modelo'], r['ano'], r['placa'], r['numero'])
                try:
                    cur.execute("UPDATE ordens_servico SET slug=%s WHERE id=%s", (slug, r['id']))
                    conn.commit()
                except Exception:
                    conn.rollback()
            print(f"Migração: {len(os_rows)} slugs backfill em ordens_servico")
        # Backfill orcamentos_propostas
        prop_rows = query("SELECT op.id, op.numero, v.marca, v.modelo, v.ano, v.placa FROM orcamentos_propostas op JOIN veiculos v ON op.veiculo_id=v.id WHERE op.slug IS NULL", fetch=True)
        if prop_rows:
            for r in prop_rows:
                slug = _make_slug(r['marca'], r['modelo'], r['ano'], r['placa'], r['numero'])
                try:
                    cur.execute("UPDATE orcamentos_propostas SET slug=%s WHERE id=%s", (slug, r['id']))
                    conn.commit()
                except Exception:
                    conn.rollback()
            print(f"Migração: {len(prop_rows)} slugs backfill em orcamentos_propostas")
        # Backfill orcamentos (solicitacao)
        orc_rows = query("SELECT o.id, v.marca, v.modelo, v.ano, v.placa FROM orcamentos o JOIN veiculos v ON o.veiculo_id=v.id WHERE o.slug IS NULL OR o.slug LIKE 'solicitacao-orcamento%'", fetch=True)
        if orc_rows:
            for r in orc_rows:
                slug = _make_slug(r['marca'], r['modelo'], r['ano'], r['placa'], r['id'])
                try:
                    cur.execute("UPDATE orcamentos SET slug=%s WHERE id=%s", (slug, r['id']))
                    conn.commit()
                except Exception:
                    conn.rollback()
            print(f"Migração: {len(orc_rows)} slugs backfill em orcamentos")
        # Corrigir slugs existentes que têm prefixo duplicado (comprovante-pagamento-..., orcamento-..., solicitacao-orcamento-...)
        for table, prefix in [('ordens_servico', 'comprovante-pagamento-'), ('orcamentos_propostas', 'orcamento-'), ('orcamentos', 'solicitacao-orcamento-')]:
            rows = query(f"SELECT id, slug FROM {table} WHERE slug LIKE '{prefix}%%'", fetch=True)
            if rows:
                for r in rows:
                    new_slug = r['slug'][len(prefix):]
                    try:
                        cur.execute(f"UPDATE {table} SET slug=%s WHERE id=%s", (new_slug, r['id']))
                        conn.commit()
                    except Exception:
                        conn.rollback()
                print(f"Migração: {len(rows)} slugs corrigidos em {table} (prefixo duplicado removido)")
        # Migração: CPF nullable
        cur.execute("""SELECT COUNT(*) FROM information_schema.COLUMNS
                       WHERE TABLE_SCHEMA = DATABASE()
                         AND TABLE_NAME = 'clientes'
                         AND COLUMN_NAME = 'cpf'""")
        (existe,) = cur.fetchone()
        if existe:
            cur.execute("ALTER TABLE clientes CHANGE COLUMN cpf cpf VARCHAR(20) NULL")
            conn.commit()
            print("Migração: coluna cpf tornada nullable em clientes")
        # Migração: placa nullable
        cur.execute("""SELECT COUNT(*) FROM information_schema.COLUMNS
                       WHERE TABLE_SCHEMA = DATABASE()
                         AND TABLE_NAME = 'veiculos'
                         AND COLUMN_NAME = 'placa'""")
        (existe_placa,) = cur.fetchone()
        if existe_placa:
            cur.execute("ALTER TABLE veiculos CHANGE COLUMN placa placa VARCHAR(15) NULL UNIQUE")
            conn.commit()
            print("Migração: coluna placa tornada nullable em veiculos")
        # ── Tabela de Dívidas ──
        cur.execute("""CREATE TABLE IF NOT EXISTS dividas (
                         id INT AUTO_INCREMENT PRIMARY KEY,
                         nome VARCHAR(200) NOT NULL,
                         pessoa ENUM('Oficina','Thomaz','Cassiano','Paulo','Jonas','Ari') NOT NULL,
                         data_divida DATE NOT NULL,
                         valor DECIMAL(10,2) NOT NULL,
                         valor_pago DECIMAL(10,2) NOT NULL DEFAULT 0,
                         status ENUM('Pendente','Paga') NOT NULL DEFAULT 'Pendente',
                         criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                         atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci""")
        conn.commit()
        cur.close()
        conn.close()
        _migrations_done = True
    except Exception as e:
        print(f"Erro em run_migrations: {e}")

def query(sql, params=None, fetch=False, one=False, commit=False):
    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(sql, params or ())
        if commit:
            conn.commit()
            last_id = cursor.lastrowid
            cursor.close()
            conn.close()
            return last_id
        if fetch:
            data = cursor.fetchone() if one else cursor.fetchall()
            cursor.close()
            conn.close()
            return data
        cursor.close()
        conn.close()
    except Exception as e:
        conn.rollback()
        cursor.close()
        conn.close()
        raise e

def gerar_slug(veiculo_id, numero):
    """Gera slug SEO-friendly: marca-modelo-ano-placa-00000X-token"""
    import re, unicodedata, secrets
    token = secrets.token_hex(8)
    veiculo = query("SELECT marca, modelo, ano, placa FROM veiculos WHERE id=%s", (veiculo_id,), fetch=True, one=True)
    if not veiculo:
        return f"{numero:06d}-{token}"
    partes = [veiculo.get('marca') or '', veiculo.get('modelo') or '', str(veiculo.get('ano') or ''), veiculo.get('placa') or '']
    base = '-'.join(p for p in partes if p)
    base = unicodedata.normalize('NFKD', base).encode('ascii', 'ignore').decode('ascii').lower()
    base = re.sub(r'[^a-z0-9]+', '-', base).strip('-') or 'veiculo'
    return f"{base}-{numero:06d}-{token}"

def serialize(obj):
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, timedelta):
        total = int(obj.total_seconds())
        h = total // 3600
        m = (total % 3600) // 60
        s = total % 60
        return f"{h:02d}:{m:02d}:{s:02d}"
    if isinstance(obj, Decimal):
        return float(obj)
    return obj

def to_json(rows):
    if rows is None:
        return None
    if isinstance(rows, list):
        return [{k: serialize(v) for k, v in r.items()} for r in rows]
    return {k: serialize(v) for k, v in rows.items()}

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if session.get('admin_logged_in'):
            return f(*args, **kwargs)
        if request.path.startswith('/api/'):
            return jsonify({'erro': 'Não autenticado'}), 401
        return redirect(url_for('login'))
    return decorated

@app.before_request
def exigir_login():
    rotas_livres = {'login', 'static', 'visualizar_solicitacao_orcamento', 'visualizar_orcamento_proposta', 'visualizar_comprovante'}
    if request.endpoint in rotas_livres or request.path.startswith('/uploads/'):
        return None
    if session.get('admin_logged_in'):
        return None
    if request.path.startswith('/api/'):
        return jsonify({'erro': 'Não autenticado'}), 401
    return redirect(url_for('login'))

# ===================== ROTAS DE PÁGINAS =====================

@app.route('/login', methods=['GET', 'POST'])
def login():
    if session.get('admin_logged_in'):
        return redirect(url_for('index'))
    erro = None
    if request.method == 'POST':
        email = (request.form.get('email') or '').strip().lower()
        senha = request.form.get('senha') or ''
        login_key = request.remote_addr or 'unknown'
        attempt = LOGIN_ATTEMPTS.get(login_key, {'count': 0, 'locked_until': 0})
        now = time.time()
        if attempt['locked_until'] > now:
            erro = 'Muitas tentativas! Tente novamente mais tarde'
            return render_template('login.html', erro=erro), 429
        if email == ADMIN_EMAIL and check_password_hash(ADMIN_PASSWORD_HASH, senha):
            LOGIN_ATTEMPTS.pop(login_key, None)
            session.clear()
            session['admin_logged_in'] = True
            session['admin_email'] = email
            session.permanent = True
            return redirect(url_for('index'))
        attempt['count'] += 1
        if attempt['count'] >= LOGIN_MAX_ATTEMPTS:
            attempt['count'] = 0
            attempt['locked_until'] = now + LOGIN_LOCK_SECONDS
        LOGIN_ATTEMPTS[login_key] = attempt
        erro = 'Email ou senha inválidos'
    return render_template('login.html', erro=erro)


@app.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return redirect(url_for('login'))


@app.route('/')
@login_required
def index():
    return render_template('index.html')

@app.route('/os/<int:os_id>/imprimir')
@login_required
def imprimir_os(os_id):
    os_data = query("""
        SELECT os.*, c.nome_completo, c.cpf, c.whatsapp,
               v.placa, v.marca, v.modelo, v.ano, v.km, v.chassi, v.motorizacao
        FROM ordens_servico os
        JOIN clientes c ON os.cliente_id = c.id
        JOIN veiculos v ON os.veiculo_id = v.id
        WHERE os.id = %s
    """, (os_id,), fetch=True, one=True)
    if not os_data:
        abort(404)
    pecas = query("SELECT * FROM ordens_servico_pecas WHERE ordem_id = %s", (os_id,), fetch=True)
    config = query("SELECT * FROM configuracoes ORDER BY id LIMIT 1", fetch=True, one=True)
    formato = request.args.get('formato', 'a4')
    return render_template('os_print.html',
                           os=to_json(os_data),
                           pecas=to_json(pecas),
                           config=to_json(config),
                           formato=formato)

@app.route('/uploads/<path:filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

# ===================== API: CLIENTES =====================

@app.route('/api/clientes', methods=['GET'])
def listar_clientes():
    search = request.args.get('q', '').strip()
    incluir_inativos = request.args.get('incluir_inativos') == 'true'
    where = [] if incluir_inativos else ["ativo = 1"]
    params = []
    if search:
        where.append("(nome_completo LIKE %s OR cpf LIKE %s OR whatsapp LIKE %s)")
        params.extend([f'%{search}%', f'%{search}%', f'%{search}%'])
    sql = "SELECT * FROM clientes"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY nome_completo"
    rows = query(sql, tuple(params), fetch=True)
    return jsonify(to_json(rows))

@app.route('/api/clientes', methods=['POST'])
def criar_cliente():
    d = request.json
    cpf_val = d.get('cpf', '').strip() or None
    cid = query("INSERT INTO clientes (nome_completo, cpf, whatsapp) VALUES (%s, %s, %s)",
                (d['nome_completo'], cpf_val, d.get('whatsapp')), commit=True)
    return jsonify({'id': cid}), 201

@app.route('/api/clientes/<int:cid>', methods=['PUT'])
def atualizar_cliente(cid):
    d = request.json
    cpf_val = d.get('cpf', '').strip() or None
    query("UPDATE clientes SET nome_completo=%s, cpf=%s, whatsapp=%s WHERE id=%s",
          (d['nome_completo'], cpf_val, d.get('whatsapp'), cid), commit=True)
    return jsonify({'ok': True})

@app.route('/api/clientes/<int:cid>/toggle-ativo', methods=['PATCH'])
def alternar_cliente(cid):
    query("UPDATE clientes SET ativo = 1 - ativo WHERE id=%s", (cid,), commit=True)
    row = query("SELECT ativo FROM clientes WHERE id=%s", (cid,), fetch=True, one=True)
    return jsonify({'ok': True, 'ativo': bool(row['ativo']) if row else None})

# ===================== API: FORNECEDORES =====================

@app.route('/api/fornecedores', methods=['GET'])
def listar_fornecedores():
    search = request.args.get('q', '').strip()
    incluir_inativos = request.args.get('incluir_inativos') == 'true'
    where = [] if incluir_inativos else ["ativo = 1"]
    params = []
    if search:
        where.append("(nome LIKE %s OR cnpj LIKE %s)")
        params.extend([f'%{search}%', f'%{search}%'])
    sql = "SELECT * FROM fornecedores"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY nome"
    rows = query(sql, tuple(params), fetch=True)
    return jsonify(to_json(rows))

@app.route('/api/fornecedores', methods=['POST'])
def criar_fornecedor():
    d = request.json
    fid = query("INSERT INTO fornecedores (nome, cnpj, whatsapp) VALUES (%s, %s, %s)",
                (d['nome'], d['cnpj'], d.get('whatsapp')), commit=True)
    return jsonify({'id': fid}), 201

@app.route('/api/fornecedores/<int:fid>', methods=['PUT'])
def atualizar_fornecedor(fid):
    d = request.json
    query("UPDATE fornecedores SET nome=%s, cnpj=%s, whatsapp=%s WHERE id=%s",
          (d['nome'], d['cnpj'], d.get('whatsapp'), fid), commit=True)
    return jsonify({'ok': True})

@app.route('/api/fornecedores/<int:fid>/toggle-ativo', methods=['PATCH'])
def alternar_fornecedor(fid):
    query("UPDATE fornecedores SET ativo = 1 - ativo WHERE id=%s", (fid,), commit=True)
    row = query("SELECT ativo FROM fornecedores WHERE id=%s", (fid,), fetch=True, one=True)
    return jsonify({'ok': True, 'ativo': bool(row['ativo']) if row else None})

# ===================== API: ORÇAMENTOS =====================

@app.route('/api/orcamentos/anexo', methods=['POST'])
def criar_anexo_orcamento():
    import json as _json, re, unicodedata
    d = request.json or {}
    veiculo_id = d.get('veiculo_id')
    pecas = d.get('pecas') or []
    if not veiculo_id or not pecas:
        return jsonify({'error': 'Informe veículo e peças/produtos'}), 400
    veiculo = query("""SELECT v.*, c.nome_completo as cliente_nome
                       FROM veiculos v
                       LEFT JOIN clientes c ON v.cliente_id = c.id
                       WHERE v.id = %s""", (veiculo_id,), fetch=True, one=True)
    if not veiculo:
        abort(404)
    row = query("SELECT COALESCE(MAX(id),0) AS m FROM orcamentos", fetch=True, one=True)
    proximo = int(row['m']) + 1
    slug = gerar_slug(veiculo_id, proximo)
    fornecedores_ids = d.get('fornecedores_ids') or []
    mensagem = d.get('mensagem') or None
    query("INSERT INTO orcamentos (slug, veiculo_id, pecas, fornecedores_ids, mensagem) VALUES (%s, %s, %s, %s, %s)",
          (slug, veiculo_id, _json.dumps(pecas), _json.dumps(fornecedores_ids), mensagem), commit=True)
    return jsonify({'id': query("SELECT LAST_INSERT_ID() AS id", fetch=True, one=True)['id'], 'url': f'/solicitacao-orcamento/{slug}', 'slug': slug})

@app.route('/api/orcamentos', methods=['GET'])
def listar_orcamentos():
    rows = query("""SELECT o.*, v.placa, v.marca, v.modelo, v.ano, v.motorizacao,
                           c.nome_completo as cliente_nome
                    FROM orcamentos o
                    LEFT JOIN veiculos v ON o.veiculo_id = v.id
                    LEFT JOIN clientes c ON v.cliente_id = c.id
                    ORDER BY o.criado_em DESC""", fetch=True)
    return jsonify(to_json(rows))

@app.route('/api/orcamentos/<int:oid>', methods=['PUT'])
def atualizar_orcamento(oid):
    import json as _json
    d = request.json
    veiculo_id = d.get('veiculo_id')
    pecas = d.get('pecas') or []
    fornecedores_ids = d.get('fornecedores_ids') or []
    mensagem = d.get('mensagem') or None
    if not veiculo_id or not pecas:
        return jsonify({'error': 'Informe veículo e peças/produtos'}), 400
    query("""UPDATE orcamentos SET veiculo_id=%s, pecas=%s, fornecedores_ids=%s, mensagem=%s WHERE id=%s""",
          (veiculo_id, _json.dumps(pecas), _json.dumps(fornecedores_ids), mensagem, oid), commit=True)
    return jsonify({'ok': True})

@app.route('/api/orcamentos/<int:oid>', methods=['DELETE'])
def excluir_orcamento(oid):
    query("DELETE FROM orcamentos WHERE id=%s", (oid,), commit=True)
    return jsonify({'ok': True})

# ===================== API: VEÍCULOS =====================

@app.route('/api/veiculos', methods=['GET'])
def listar_veiculos():
    search = request.args.get('q', '').strip()
    incluir_inativos = request.args.get('incluir_inativos') == 'true'
    base = """SELECT v.*, c.nome_completo as cliente_nome FROM veiculos v
              LEFT JOIN clientes c ON v.cliente_id = c.id"""
    where = [] if incluir_inativos else ["v.ativo = 1"]
    params = []
    if search:
        where.append("(v.placa LIKE %s OR v.marca LIKE %s OR v.modelo LIKE %s OR v.ano LIKE %s OR v.motorizacao LIKE %s OR v.chassi LIKE %s OR c.nome_completo LIKE %s)")
        params.extend([f'%{search}%', f'%{search}%', f'%{search}%', f'%{search}%', f'%{search}%', f'%{search}%', f'%{search}%'])
    sql = base
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY v.placa"
    rows = query(sql, tuple(params), fetch=True)
    return jsonify(to_json(rows))

def _salvar_imagens_request():
    """Recebe request com possíveis 'imagem', 'imagem2', 'imagem3' e retorna dict {col: filename or None}."""
    paths = {'imagem': None, 'imagem2': None, 'imagem3': None}
    for key in paths.keys():
        if key in request.files:
            f = request.files[key]
            if f and f.filename:
                fname = f"{int(time.time())}_{key}_{secure_filename(f.filename)}"
                f.save(os.path.join(app.config['UPLOAD_FOLDER'], fname))
                paths[key] = fname
    return paths

@app.route('/api/veiculos', methods=['POST'])
def criar_veiculo():
    if (request.content_type or '').startswith('multipart/form-data'):
        d = request.form.to_dict()
        imgs = _salvar_imagens_request()
    else:
        d = request.json or {}
        imgs = {'imagem': None, 'imagem2': None, 'imagem3': None}

    placa_val = d.get('placa', '').strip() or None
    vid = query("""INSERT INTO veiculos (placa, marca, modelo, ano, km, motorizacao, cor, combustivel, imagem, imagem2, imagem3, cliente_id)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (placa_val, d.get('marca'), d.get('modelo'),
                 int(d.get('ano') or 0) or None, int(d.get('km') or 0),
                 d.get('motorizacao'), d.get('cor'), d.get('combustivel'),
                 imgs['imagem'], imgs['imagem2'], imgs['imagem3'],
                 int(d['cliente_id']) if d.get('cliente_id') else None), commit=True)
    return jsonify({'id': vid}), 201

@app.route('/api/veiculos/<int:vid>', methods=['PUT'])
def atualizar_veiculo(vid):
    if (request.content_type or '').startswith('multipart/form-data'):
        d = request.form.to_dict()
        imgs = _salvar_imagens_request()
    else:
        d = request.json or {}
        imgs = {'imagem': None, 'imagem2': None, 'imagem3': None}

    # Atualiza campos básicos
    placa_val = d.get('placa', '').strip() or None
    query("""UPDATE veiculos SET placa=%s, marca=%s, modelo=%s, ano=%s, km=%s,
             motorizacao=%s, cor=%s, combustivel=%s, cliente_id=%s WHERE id=%s""",
          (placa_val, d.get('marca'), d.get('modelo'),
           int(d.get('ano') or 0) or None, int(d.get('km') or 0),
           d.get('motorizacao'), d.get('cor'), d.get('combustivel'),
           int(d['cliente_id']) if d.get('cliente_id') else None, vid), commit=True)

    # Atualiza apenas as imagens enviadas
    for col, fname in imgs.items():
        if fname:
            query(f"UPDATE veiculos SET {col}=%s WHERE id=%s", (fname, vid), commit=True)
    return jsonify({'ok': True})

@app.route('/api/consulta-placa/<placa>', methods=['GET'])
def consulta_placa(placa):
    placa = (placa or '').strip().replace('-', '').upper()
    if len(placa) != 7 or not placa.isalnum():
        return jsonify({'message': 'Placa Inválida! Favor usar o formato AAA0X00 ou AAA9999'}), 400
    
    token = os.getenv('APIPLACAS')
    if not token:
        return jsonify({'message': 'Token APIPLACAS não configurado nas variáveis de ambiente!'}), 400
    
    import urllib.request
    import urllib.error
    import json
    import re
    
    url = f"https://wdapi2.com.br/consulta/{placa}/{token}"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as response:
            res_data = response.read().decode('utf-8')
            data = json.loads(res_data)
            
            # The API might return 200 but contain a message indicating an error
            if data.get('mensagemRetorno') and 'sem erros' not in data.get('mensagemRetorno').lower():
                # check if there's an error message
                msg = data.get('mensagemRetorno') or 'Sem resultados!'
                return jsonify({'message': msg}), 400
            
            marca = data.get('marca') or data.get('MARCA') or ''
            modelo = data.get('modelo') or data.get('MODELO') or ''
            cor = data.get('cor') or ''
            ano = data.get('ano') or data.get('anoModelo') or ''
            
            extra = data.get('extra') or {}
            combustivel = extra.get('combustivel') or ''
            
            motorizacao = ''
            fipe = data.get('fipe') or {}
            fipe_dados = fipe.get('dados') or []
            if fipe_dados:
                texto_modelo = fipe_dados[0].get('texto_modelo', '')
                match = re.search(r'\b(1\.[0-9]|2\.[0-9]|3\.[0-9]|4\.[0-9]|v6|v8)\b', texto_modelo, re.IGNORECASE)
                if match:
                    motorizacao = match.group(1)
            
            if not motorizacao and extra.get('cilindradas'):
                try:
                    cils = int(extra.get('cilindradas'))
                    if cils > 0:
                        motorizacao = f"{round(cils / 1000, 1)}"
                except:
                    pass
            
            return jsonify({
                'placa': placa,
                'marca': marca,
                'modelo': modelo,
                'cor': cor,
                'ano': ano,
                'combustivel': combustivel,
                'motorizacao': motorizacao
            })
    except urllib.error.HTTPError as e:
        try:
            err_data = e.read().decode('utf-8')
            err_json = json.loads(err_data)
            return jsonify({'message': err_json.get('message') or err_json.get('mensagemRetorno') or 'Erro ao consultar placa!'}), e.code
        except:
            return jsonify({'message': f'Erro na API Placas: Código {e.code}'}), e.code
    except Exception as e:
        return jsonify({'message': f'Erro ao buscar dados da placa: {str(e)}'}), 500

@app.route('/api/veiculos/<int:vid>/imagem/<col>', methods=['DELETE'])
def deletar_imagem_veiculo(vid, col):
    if col not in ('imagem', 'imagem2', 'imagem3'):
        return jsonify({'erro': 'Coluna inválida'}), 400
    row = query(f"SELECT {col} FROM veiculos WHERE id=%s", (vid,), fetch=True, one=True)
    if not row:
        return jsonify({'erro': 'Veículo não encontrado'}), 404
    fname = row[col]
    if fname:
        try:
            os.remove(os.path.join(app.config['UPLOAD_FOLDER'], fname))
        except Exception:
            pass
    query(f"UPDATE veiculos SET {col}=NULL WHERE id=%s", (vid,), commit=True)
    return jsonify({'ok': True})

@app.route('/api/veiculos/<int:vid>/toggle-ativo', methods=['PATCH'])
def alternar_veiculo(vid):
    query("UPDATE veiculos SET ativo = 1 - ativo WHERE id=%s", (vid,), commit=True)
    row = query("SELECT ativo FROM veiculos WHERE id=%s", (vid,), fetch=True, one=True)
    return jsonify({'ok': True, 'ativo': bool(row['ativo']) if row else None})

# ===================== API: AGENDAMENTOS =====================

@app.route('/api/agendamentos', methods=['GET'])
def listar_agendamentos():
    ano = request.args.get('ano')
    mes = request.args.get('mes')
    where = ""
    params = []
    if ano and mes:
        where = " WHERE YEAR(data_agendamento) = %s AND MONTH(data_agendamento) = %s"
        params = [int(ano), int(mes)]
    rows = query(f"""SELECT a.*, c.nome_completo, c.cpf, c.whatsapp,
                            v.placa, v.marca, v.modelo
                     FROM agendamentos a
                     JOIN clientes c ON a.cliente_id = c.id
                     JOIN veiculos v ON a.veiculo_id = v.id
                     {where}
                     ORDER BY a.data_agendamento, a.horario""", tuple(params), fetch=True)
    return jsonify(to_json(rows))

@app.route('/api/agendamentos/<int:aid>', methods=['GET'])
def obter_agendamento(aid):
    row = query("""SELECT a.*, c.nome_completo, c.cpf, c.whatsapp,
                          v.placa, v.marca, v.modelo
                   FROM agendamentos a
                   JOIN clientes c ON a.cliente_id = c.id
                   JOIN veiculos v ON a.veiculo_id = v.id
                   WHERE a.id = %s""", (aid,), fetch=True, one=True)
    return jsonify(to_json(row))

@app.route('/api/agendamentos', methods=['POST'])
def criar_agendamento():
    d = request.json
    aid = query("""INSERT INTO agendamentos (cliente_id, veiculo_id, data_agendamento, horario, observacoes, status)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (d['cliente_id'], d['veiculo_id'], d['data_agendamento'],
                 d['horario'], d.get('observacoes'), d.get('status', 'Agendado')), commit=True)
    return jsonify({'id': aid}), 201

@app.route('/api/agendamentos/<int:aid>', methods=['PUT'])
def atualizar_agendamento(aid):
    d = request.json
    query("""UPDATE agendamentos SET data_agendamento=%s, horario=%s, observacoes=%s, status=%s
             WHERE id=%s""",
          (d['data_agendamento'], d['horario'], d.get('observacoes'), d.get('status'), aid), commit=True)
    return jsonify({'ok': True})

@app.route('/api/agendamentos/<int:aid>/reagendar', methods=['POST'])
def reagendar(aid):
    d = request.json
    query("""UPDATE agendamentos SET data_agendamento=%s, horario=%s, status='Agendado' WHERE id=%s""",
          (d['data_agendamento'], d['horario'], aid), commit=True)
    return jsonify({'ok': True})

@app.route('/api/agendamentos/<int:aid>', methods=['DELETE'])
def deletar_agendamento(aid):
    query("DELETE FROM agendamentos WHERE id=%s", (aid,), commit=True)
    return jsonify({'ok': True})

# ===================== API: ORDENS DE SERVIÇO =====================

@app.route('/api/os', methods=['GET'])
def listar_os():
    status = request.args.get('status')
    search = request.args.get('q', '').strip()
    incluir_inativos = request.args.get('incluir_inativos') == 'true'
    where = [] if incluir_inativos else ["os.ativo = 1"]
    params = []
    if status and status != 'Todos':
        where.append("os.status = %s")
        params.append(status)
    if search:
        where.append("(c.nome_completo LIKE %s OR c.cpf LIKE %s OR v.placa LIKE %s)")
        params.extend([f'%{search}%', f'%{search}%', f'%{search}%'])
    where_clause = (" WHERE " + " AND ".join(where)) if where else ""
    rows = query(f"""SELECT os.*, c.nome_completo, c.cpf, v.placa, v.marca, v.modelo,
                     (SELECT COALESCE(SUM(valor_custo * quantidade), 0) FROM ordens_servico_pecas WHERE ordem_id = os.id) as gastos_pecas,
                     (SELECT COALESCE(SUM(valor_venda * quantidade), 0) FROM ordens_servico_pecas WHERE ordem_id = os.id) as cobrado_pecas
                     FROM ordens_servico os
                     JOIN clientes c ON os.cliente_id = c.id
                     JOIN veiculos v ON os.veiculo_id = v.id
                     {where_clause}
                     ORDER BY os.numero DESC""", tuple(params), fetch=True)
    return jsonify(to_json(rows))

@app.route('/api/os/<int:oid>', methods=['GET'])
def obter_os(oid):
    os_data = query("""SELECT os.*, c.nome_completo, c.cpf, c.whatsapp,
                              v.placa, v.marca, v.modelo, v.ano, v.km, v.chassi, v.motorizacao
                       FROM ordens_servico os
                       JOIN clientes c ON os.cliente_id = c.id
                       JOIN veiculos v ON os.veiculo_id = v.id
                       WHERE os.id = %s""", (oid,), fetch=True, one=True)
    pecas = query("SELECT * FROM ordens_servico_pecas WHERE ordem_id = %s", (oid,), fetch=True)
    return jsonify({'os': to_json(os_data), 'pecas': to_json(pecas)})

@app.route('/api/os', methods=['POST'])
def criar_os():
    d = request.json
    # próximo número
    last = query("SELECT COALESCE(MAX(numero), 1000) AS m FROM ordens_servico", fetch=True, one=True)
    numero = (last['m'] or 1000) + 1
    slug = gerar_slug(d['veiculo_id'], numero)
    oid = query("""INSERT INTO ordens_servico (numero, slug, cliente_id, veiculo_id, data_emissao, valor_mao_obra, status, observacoes)
                   VALUES (%s, %s, %s, %s, %s, %s, 'Pendente', %s)""",
                (numero, slug, d['cliente_id'], d['veiculo_id'],
                 d.get('data_emissao') or date.today().isoformat(),
                 d.get('valor_mao_obra', 0), d.get('observacoes')), commit=True)
    for p in d.get('pecas', []):
        query("""INSERT INTO ordens_servico_pecas (ordem_id, codigo, descricao, fornecedor_id, quantidade, valor_custo, lucro_percentual, desconto_percentual, valor_venda_sem_desconto, valor_desconto, valor_venda)
                 VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
              (oid, p.get('codigo'), p['descricao'], p.get('fornecedor_id') or None,
               p.get('quantidade', 1),
               p.get('valor_custo', 0), p.get('lucro_percentual', 0), p.get('desconto_percentual', 0), p.get('valor_venda_sem_desconto', 0), p.get('valor_desconto', 0), p.get('valor_venda', 0)), commit=True)
    return jsonify({'id': oid, 'numero': numero, 'slug': slug}), 201

@app.route('/api/os/<int:oid>/status', methods=['PUT'])
def atualizar_status_os(oid):
    d = request.json
    novo_status = d['status']
    if novo_status == 'Paga':
        query("UPDATE ordens_servico SET status=%s, data_pagamento=%s WHERE id=%s",
              (novo_status, d.get('data_pagamento') or date.today().isoformat(), oid), commit=True)
    else:
        query("UPDATE ordens_servico SET status=%s, data_pagamento=NULL WHERE id=%s", (novo_status, oid), commit=True)
    return jsonify({'ok': True})

@app.route('/api/os/<int:oid>', methods=['DELETE'])
def excluir_os(oid):
    query("DELETE FROM ordens_servico_pecas WHERE ordem_id=%s", (oid,), commit=True)
    query("DELETE FROM ordens_servico WHERE id=%s", (oid,), commit=True)
    return jsonify({'ok': True})

@app.route('/api/os/<int:oid>/toggle-ativo', methods=['PATCH'])
def alternar_os(oid):
    query("UPDATE ordens_servico SET ativo = 1 - ativo WHERE id=%s", (oid,), commit=True)
    row = query("SELECT ativo FROM ordens_servico WHERE id=%s", (oid,), fetch=True, one=True)
    return jsonify({'ok': True, 'ativo': bool(row['ativo']) if row else None})

# ===================== API: PROPOSTAS DE ORÇAMENTO =====================

@app.route('/api/propostas', methods=['GET'])
def listar_propostas():
    search = request.args.get('q', '').strip()
    status = request.args.get('status', '').strip()
    where = []
    params = []
    if search:
        where.append("(c.nome_completo LIKE %s OR v.placa LIKE %s)")
        params.extend([f'%{search}%', f'%{search}%'])
    if status in ('Pendente', 'Em andamento', 'Concluido'):
        where.append(f"op.status = '{status}'")
    where_clause = (" WHERE " + " AND ".join(where)) if where else ""
    rows = query(f"""SELECT op.*, c.nome_completo, v.placa, v.marca, v.modelo, os.status AS os_status,
                    (SELECT COALESCE(SUM(valor_custo * quantidade), 0) FROM orcamentos_propostas_pecas WHERE proposta_id = op.id) as gastos_pecas,
                    (SELECT COALESCE(SUM(valor_venda * quantidade), 0) FROM orcamentos_propostas_pecas WHERE proposta_id = op.id) as cobrado_pecas
                    FROM orcamentos_propostas op
                    JOIN clientes c ON op.cliente_id = c.id
                    JOIN veiculos v ON op.veiculo_id = v.id
                    LEFT JOIN ordens_servico os ON op.os_id = os.id
                    {where_clause}
                    ORDER BY op.numero DESC""", tuple(params), fetch=True)
    return jsonify(to_json(rows))

@app.route('/api/propostas', methods=['POST'])
def criar_proposta():
    d = request.json
    last = query("SELECT COALESCE(MAX(numero), 0) AS m FROM orcamentos_propostas", fetch=True, one=True)
    numero = (last['m'] or 0) + 1
    slug = gerar_slug(d['veiculo_id'], numero)
    mao_obra_texto = d.get('mao_obra_texto') or None
    pid = query("""INSERT INTO orcamentos_propostas (numero, slug, cliente_id, veiculo_id, valor_mao_obra, mao_obra_texto, status)
                   VALUES (%s, %s, %s, %s, %s, %s, 'Pendente')""",
                (numero, slug, d['cliente_id'], d['veiculo_id'], d.get('valor_mao_obra', 0), mao_obra_texto), commit=True)
    for p in d.get('pecas', []):
        query("""INSERT INTO orcamentos_propostas_pecas (proposta_id, descricao, fornecedor_id, quantidade, valor_custo, lucro_percentual, desconto_percentual, valor_venda_sem_desconto, valor_desconto, valor_venda)
                 VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
              (pid, p['descricao'], p.get('fornecedor_id') or None,
               p.get('quantidade', 1), p.get('valor_custo', 0), p.get('lucro_percentual', 0),
               p.get('desconto_percentual', 0), p.get('valor_venda_sem_desconto', 0),
               p.get('valor_desconto', 0), p.get('valor_venda', 0)), commit=True)
    return jsonify({'id': pid, 'numero': numero, 'slug': slug}), 201

@app.route('/api/propostas/<int:pid>', methods=['GET'])
def obter_proposta(pid):
    row = query("""SELECT op.*, c.nome_completo, c.cpf, v.placa, v.marca, v.modelo
                   FROM orcamentos_propostas op
                   JOIN clientes c ON op.cliente_id = c.id
                   JOIN veiculos v ON op.veiculo_id = v.id
                   WHERE op.id = %s""", (pid,), fetch=True, one=True)
    pecas = query("SELECT * FROM orcamentos_propostas_pecas WHERE proposta_id = %s", (pid,), fetch=True)
    return jsonify({'proposta': to_json(row), 'pecas': to_json(pecas)})

@app.route('/api/propostas/<int:pid>', methods=['PUT'])
def atualizar_proposta(pid):
    d = request.json
    mao_obra_texto = d.get('mao_obra_texto') or None
    query("""UPDATE orcamentos_propostas SET cliente_id=%s, veiculo_id=%s, valor_mao_obra=%s, mao_obra_texto=%s WHERE id=%s""",
          (d['cliente_id'], d['veiculo_id'], d.get('valor_mao_obra', 0), mao_obra_texto, pid), commit=True)
    query("DELETE FROM orcamentos_propostas_pecas WHERE proposta_id=%s", (pid,), commit=True)
    for p in d.get('pecas', []):
        query("""INSERT INTO orcamentos_propostas_pecas (proposta_id, descricao, fornecedor_id, quantidade, valor_custo, lucro_percentual, desconto_percentual, valor_venda_sem_desconto, valor_desconto, valor_venda)
                 VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
              (pid, p['descricao'], p.get('fornecedor_id') or None,
               p.get('quantidade', 1), p.get('valor_custo', 0), p.get('lucro_percentual', 0),
               p.get('desconto_percentual', 0), p.get('valor_venda_sem_desconto', 0),
               p.get('valor_desconto', 0), p.get('valor_venda', 0)), commit=True)
    return jsonify({'ok': True})

@app.route('/api/propostas/<int:pid>', methods=['DELETE'])
def excluir_proposta(pid):
    query("DELETE FROM orcamentos_propostas WHERE id=%s", (pid,), commit=True)
    return jsonify({'ok': True})

@app.route('/api/propostas/<int:pid>/aprovar', methods=['POST'])
def aprovar_proposta(pid):
    row = query("""SELECT op.*, c.nome_completo, v.placa, v.marca, v.modelo
                   FROM orcamentos_propostas op
                   JOIN clientes c ON op.cliente_id = c.id
                   JOIN veiculos v ON op.veiculo_id = v.id
                   WHERE op.id = %s""", (pid,), fetch=True, one=True)
    if not row:
        return jsonify({'erro': 'Proposta não encontrada'}), 404
    status_atual = row['status']
    if status_atual == 'Pendente':
        query("UPDATE orcamentos_propostas SET status='Em andamento' WHERE id=%s", (pid,), commit=True)
        return jsonify({'ok': True, 'status': 'Em andamento'})
    elif status_atual == 'Em andamento':
        if not row.get('valor_mao_obra') or float(row['valor_mao_obra']) == 0:
            return jsonify({'erro': 'Para concluir um orçamento, inclua o valor da mão de obra'}), 400
        valor_mao_obra_os = float(row.get('valor_mao_obra') or 0)
        pecas = query("SELECT * FROM orcamentos_propostas_pecas WHERE proposta_id = %s", (pid,), fetch=True)
        last = query("SELECT COALESCE(MAX(numero), 1000) AS m FROM ordens_servico", fetch=True, one=True)
        numero = (last['m'] or 1000) + 1
        slug = gerar_slug(row['veiculo_id'], numero)
        oid = query("""INSERT INTO ordens_servico (numero, slug, cliente_id, veiculo_id, data_emissao, valor_mao_obra, status)
                       VALUES (%s, %s, %s, %s, %s, %s, 'Pendente')""",
                    (numero, slug, row['cliente_id'], row['veiculo_id'],
                     date.today().isoformat(), valor_mao_obra_os), commit=True)
        for p in pecas:
            query("""INSERT INTO ordens_servico_pecas (ordem_id, descricao, fornecedor_id, quantidade, valor_custo, lucro_percentual, desconto_percentual, valor_venda_sem_desconto, valor_desconto, valor_venda)
                     VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                  (oid, p['descricao'], p.get('fornecedor_id'),
                   p['quantidade'], p['valor_custo'], p['lucro_percentual'],
                   p['desconto_percentual'], p['valor_venda_sem_desconto'],
                   p['valor_desconto'], p['valor_venda']), commit=True)
        query("UPDATE orcamentos_propostas SET status='Concluido', os_id=%s WHERE id=%s", (oid, pid), commit=True)
        return jsonify({'ok': True, 'os_id': oid, 'numero': numero, 'status': 'Concluido'})
    else:
        return jsonify({'erro': 'Orçamento já concluído'}), 400

@app.route('/api/propostas/<int:pid>/desaprovar', methods=['POST'])
def desaprovar_proposta(pid):
    row = query("SELECT status, os_id FROM orcamentos_propostas WHERE id = %s", (pid,), fetch=True, one=True)
    if not row:
        return jsonify({'erro': 'Orçamento não encontrado'}), 404
    status_atual = row['status']
    if status_atual == 'Concluido':
        os_id = row['os_id']
        if os_id:
            query("DELETE FROM ordens_servico WHERE id = %s", (os_id,), commit=True)
        query("UPDATE orcamentos_propostas SET status='Em andamento', os_id=NULL WHERE id = %s", (pid,), commit=True)
        return jsonify({'ok': True, 'status': 'Em andamento'})
    elif status_atual == 'Em andamento':
        query("UPDATE orcamentos_propostas SET status='Pendente' WHERE id = %s", (pid,), commit=True)
        return jsonify({'ok': True, 'status': 'Pendente'})
    else:
        return jsonify({'erro': 'Orçamento já está Pendente'}), 400

@app.route('/proposta/<int:pid>/imprimir')
@login_required
def imprimir_proposta(pid):
    proposta = query("""SELECT op.*, c.nome_completo, c.cpf, c.whatsapp,
                               v.placa, v.marca, v.modelo, v.ano, v.km, v.motorizacao
                        FROM orcamentos_propostas op
                        JOIN clientes c ON op.cliente_id = c.id
                        JOIN veiculos v ON op.veiculo_id = v.id
                        WHERE op.id = %s""", (pid,), fetch=True, one=True)
    if not proposta:
        abort(404)
    pecas = query("SELECT * FROM orcamentos_propostas_pecas WHERE proposta_id = %s", (pid,), fetch=True)
    config = query("SELECT * FROM configuracoes ORDER BY id LIMIT 1", fetch=True, one=True)
    formato = request.args.get('formato', 'a4')
    return render_template('proposta_print.html',
                           proposta=to_json(proposta),
                           pecas=to_json(pecas),
                           config=to_json(config),
                           formato=formato,
                           data_emissao=datetime.now().strftime('%d/%m/%Y'))

# ===================== ROTAS PÚBLICAS (SLUG) =====================

@app.route('/solicitacao-orcamento/<slug>')
def visualizar_solicitacao_orcamento(slug):
    row = query("SELECT * FROM orcamentos WHERE slug=%s", (slug,), fetch=True, one=True)
    if not row:
        abort(404)
    veiculo = None
    if row.get('veiculo_id'):
        veiculo = query("""SELECT v.*, c.nome_completo as cliente_nome
                           FROM veiculos v
                           LEFT JOIN clientes c ON v.cliente_id = c.id
                           WHERE v.id=%s""", (row['veiculo_id'],), fetch=True, one=True)
    config = query("SELECT * FROM configuracoes ORDER BY id LIMIT 1", fetch=True, one=True)
    pecas = row['pecas']
    if isinstance(pecas, str):
        import json as _json
        pecas = _json.loads(pecas)
    return render_template('orcamento_print.html',
                           veiculo=to_json(veiculo) if veiculo else None,
                           pecas=pecas,
                           config=to_json(config),
                           data_emissao=datetime.now().strftime('%d/%m/%Y'),
                           slug=slug)

@app.route('/orcamento/<slug>')
def visualizar_orcamento_proposta(slug):
    proposta = query("""SELECT op.*, c.nome_completo, c.cpf, c.whatsapp,
                               v.placa, v.marca, v.modelo, v.ano, v.km, v.motorizacao
                        FROM orcamentos_propostas op
                        JOIN clientes c ON op.cliente_id = c.id
                        JOIN veiculos v ON op.veiculo_id = v.id
                        WHERE op.slug = %s""", (slug,), fetch=True, one=True)
    if not proposta:
        abort(404)
    pecas = query("SELECT * FROM orcamentos_propostas_pecas WHERE proposta_id = %s", (proposta['id'],), fetch=True)
    config = query("SELECT * FROM configuracoes ORDER BY id LIMIT 1", fetch=True, one=True)
    formato = request.args.get('formato', 'a4')
    return render_template('proposta_print.html',
                           proposta=to_json(proposta),
                           pecas=to_json(pecas),
                           config=to_json(config),
                           formato=formato,
                           data_emissao=datetime.now().strftime('%d/%m/%Y'),
                           slug=slug)

@app.route('/comprovante-pagamento/<slug>')
def visualizar_comprovante(slug):
    os_data = query("""
        SELECT os.*, c.nome_completo, c.cpf, c.whatsapp,
               v.placa, v.marca, v.modelo, v.ano, v.km, v.chassi, v.motorizacao
        FROM ordens_servico os
        JOIN clientes c ON os.cliente_id = c.id
        JOIN veiculos v ON os.veiculo_id = v.id
        WHERE os.slug = %s
    """, (slug,), fetch=True, one=True)
    if not os_data:
        abort(404)
    pecas = query("SELECT * FROM ordens_servico_pecas WHERE ordem_id = %s", (os_data['id'],), fetch=True)
    config = query("SELECT * FROM configuracoes ORDER BY id LIMIT 1", fetch=True, one=True)
    formato = request.args.get('formato', 'a4')
    return render_template('os_print.html',
                           os=to_json(os_data),
                           pecas=to_json(pecas),
                           config=to_json(config),
                           formato=formato,
                           slug=slug)

# ===================== API: DESPESAS =====================

@app.route('/api/despesas', methods=['GET'])
def listar_despesas():
    ano = request.args.get('ano')
    mes = request.args.get('mes')
    incluir_inativos = request.args.get('incluir_inativos') == 'true'
    where = [] if incluir_inativos else ["ativo = 1"]
    params = []
    if ano:
        where.append("YEAR(data_despesa) = %s")
        params.append(int(ano))
        if mes and int(mes) != 0:
            where.append("MONTH(data_despesa) = %s")
            params.append(int(mes))
    where_clause = (" WHERE " + " AND ".join(where)) if where else ""
    rows = query(f"SELECT * FROM despesas{where_clause} ORDER BY data_despesa DESC, id DESC", tuple(params), fetch=True)
    return jsonify(to_json(rows))

@app.route('/api/despesas', methods=['POST'])
def criar_despesa():
    d = request.json
    tipo = d.get('tipo') if d.get('tipo') in ('entrada', 'saida') else 'saida'
    did = query("INSERT INTO despesas (descricao, valor, data_despesa, tipo) VALUES (%s, %s, %s, %s)",
                (d['descricao'], d['valor'], d.get('data_despesa') or date.today().isoformat(), tipo), commit=True)
    return jsonify({'id': did}), 201

@app.route('/api/despesas/<int:did>/toggle-ativo', methods=['PATCH'])
def alternar_despesa(did):
    query("UPDATE despesas SET ativo = 1 - ativo WHERE id=%s", (did,), commit=True)
    row = query("SELECT ativo FROM despesas WHERE id=%s", (did,), fetch=True, one=True)
    return jsonify({'ok': True, 'ativo': bool(row['ativo']) if row else None})

# ===================== API: DÍVIDAS =====================

@app.route('/api/dividas', methods=['GET'])
def listar_dividas():
    pessoa = request.args.get('pessoa')
    if pessoa:
        rows = query("SELECT * FROM dividas WHERE pessoa=%s ORDER BY data_divida DESC, id DESC", (pessoa,), fetch=True)
    else:
        rows = query("SELECT * FROM dividas ORDER BY pessoa, data_divida DESC, id DESC", fetch=True)
    return jsonify(to_json(rows))

@app.route('/api/dividas', methods=['POST'])
def criar_divida():
    d = request.json
    nome = d.get('nome', '').strip()
    pessoa = d.get('pessoa', '').strip()
    data_divida = d.get('data_divida', date.today().isoformat())
    valor = float(d.get('valor', 0))
    if not nome or not pessoa or valor <= 0:
        return jsonify({'erro': 'Preencha todos os campos'}), 400
    did = query("INSERT INTO dividas (nome, pessoa, data_divida, valor) VALUES (%s,%s,%s,%s)",
                (nome, pessoa, data_divida, valor), commit=True)
    return jsonify({'id': did}), 201

@app.route('/api/dividas/<int:did>/pagar', methods=['POST'])
def pagar_divida(did):
    d = request.json
    valor_pagamento = float(d.get('valor_pagamento', 0))
    if valor_pagamento <= 0:
        return jsonify({'erro': 'Valor inválido'}), 400
    row = query("SELECT * FROM dividas WHERE id=%s", (did,), fetch=True, one=True)
    if not row:
        return jsonify({'erro': 'Dívida não encontrada'}), 404
    novo_pago = float(row['valor_pago']) + valor_pagamento
    novo_status = 'Paga' if novo_pago >= float(row['valor']) else 'Pendente'
    query("UPDATE dividas SET valor_pago=%s, status=%s WHERE id=%s", (novo_pago, novo_status, did), commit=True)
    # Descontar do lucro: registrar como despesa
    query("INSERT INTO despesas (descricao, valor, data_despesa, tipo) VALUES (%s,%s,%s,'saida')",
          (f"Pagamento dívida: {row['nome']} ({row['pessoa']})", valor_pagamento, date.today().isoformat()), commit=True)
    return jsonify({'ok': True, 'valor_pago': novo_pago, 'status': novo_status})

@app.route('/api/dividas/<int:did>', methods=['PUT'])
def editar_divida(did):
    d = request.json
    nome = (d.get('nome') or '').strip()
    pessoa = d.get('pessoa', '').strip()
    data_divida = d.get('data_divida')
    valor = d.get('valor')
    if not nome or not pessoa or not data_divida or valor is None:
        return jsonify({'erro': 'Dados inválidos'}), 400
    query("UPDATE dividas SET nome=%s, pessoa=%s, data_divida=%s, valor=%s WHERE id=%s",
          (nome, pessoa, data_divida, valor, did), commit=True)
    return jsonify({'ok': True})

@app.route('/api/dividas/<int:did>', methods=['DELETE'])
def excluir_divida(did):
    query("DELETE FROM dividas WHERE id=%s", (did,), commit=True)
    return jsonify({'ok': True})

# ===================== API: ESTOQUE =====================

@app.route('/api/estoque/produtos', methods=['GET'])
def listar_estoque_produtos():
    rows = query("""SELECT p.*,
                           (SELECT MAX(m.data_movimentacao) FROM estoque_movimentacoes m WHERE m.produto_id = p.id) AS ultima_movimentacao
                    FROM estoque_produtos p
                    WHERE p.ativo = 1
                    ORDER BY p.descricao ASC""", fetch=True)
    return jsonify(to_json(rows))

@app.route('/api/estoque/entrada', methods=['POST'])
def criar_estoque_entrada():
    d = request.json
    descricao = (d.get('descricao') or '').strip()
    quantidade = int(d.get('quantidade') or 0)
    valor_compra = Decimal(str(d.get('valor_compra') or 0))
    lucro_percentual = Decimal(str(d.get('lucro_percentual') or 0))
    valor_venda = valor_compra + (valor_compra * lucro_percentual / Decimal('100'))
    data_movimentacao = date.today().isoformat()
    if not descricao or quantidade <= 0 or valor_compra < 0:
        return jsonify({'erro': 'Dados inválidos'}), 400
    produto = query("SELECT * FROM estoque_produtos WHERE descricao=%s AND ativo=1 ORDER BY id LIMIT 1", (descricao,), fetch=True, one=True)
    if produto:
        produto_id = produto['id']
        nova_quantidade = int(produto['quantidade']) + quantidade
        query("""UPDATE estoque_produtos
                 SET quantidade=%s, valor_compra=%s, lucro_percentual=%s, valor_venda=%s
                 WHERE id=%s""", (nova_quantidade, valor_compra, lucro_percentual, valor_venda, produto_id), commit=True)
    else:
        produto_id = query("""INSERT INTO estoque_produtos (descricao, quantidade, valor_compra, lucro_percentual, valor_venda)
                              VALUES (%s, %s, %s, %s, %s)""",
                           (descricao, quantidade, valor_compra, lucro_percentual, valor_venda), commit=True)
    query("""INSERT INTO estoque_movimentacoes (produto_id, tipo, quantidade, valor_unitario, valor_total, motivo, data_movimentacao)
             VALUES (%s, 'entrada', %s, %s, %s, %s, %s)""",
          (produto_id, quantidade, valor_compra, valor_compra * quantidade, 'Entrada de produto', data_movimentacao), commit=True)
    return jsonify({'id': produto_id}), 201

@app.route('/api/estoque/produtos/<int:produto_id>', methods=['PUT'])
def editar_estoque_produto(produto_id):
    d = request.json
    produto = query("SELECT * FROM estoque_produtos WHERE id=%s", (produto_id,), fetch=True, one=True)
    if not produto:
        return jsonify({'erro': 'Produto não encontrado'}), 404
    descricao = (d.get('descricao') or '').strip() or produto['descricao']
    valor_compra = Decimal(str(d.get('valor_compra') if d.get('valor_compra') is not None else produto['valor_compra']))
    lucro_percentual = Decimal(str(d.get('lucro_percentual') if d.get('lucro_percentual') is not None else produto['lucro_percentual']))
    valor_venda = valor_compra + (valor_compra * lucro_percentual / Decimal('100'))
    query("""UPDATE estoque_produtos
             SET descricao=%s, valor_compra=%s, lucro_percentual=%s, valor_venda=%s
             WHERE id=%s""", (descricao, valor_compra, lucro_percentual, valor_venda, produto_id), commit=True)
    return jsonify({'ok': True}), 200

@app.route('/api/estoque/produtos/<int:produto_id>/toggle', methods=['PATCH'])
def toggle_estoque_produto(produto_id):
    produto = query("SELECT * FROM estoque_produtos WHERE id=%s", (produto_id,), fetch=True, one=True)
    if not produto:
        return jsonify({'erro': 'Produto não encontrado'}), 404
    novo_ativo = 0 if produto['ativo'] else 1
    query("UPDATE estoque_produtos SET ativo=%s WHERE id=%s", (novo_ativo, produto_id), commit=True)
    return jsonify({'ok': True, 'ativo': novo_ativo}), 200

@app.route('/api/estoque/saida', methods=['POST'])
def criar_estoque_saida():
    d = request.json
    produto_id = int(d.get('produto_id') or 0)
    quantidade = int(d.get('quantidade') or 0)
    motivo = (d.get('motivo') or '').strip()
    data_movimentacao = date.today().isoformat()
    produto = query("SELECT * FROM estoque_produtos WHERE id=%s AND ativo=1", (produto_id,), fetch=True, one=True)
    if not produto or quantidade <= 0 or quantidade > int(produto['quantidade']) or not motivo:
        return jsonify({'erro': 'Dados inválidos ou saldo insuficiente'}), 400
    valor_unitario = Decimal(str(produto['valor_venda'] or 0))
    valor_total = valor_unitario * quantidade
    nova_quantidade = int(produto['quantidade']) - quantidade
    despesa_id = query("INSERT INTO despesas (descricao, valor, data_despesa, tipo) VALUES (%s, %s, %s, 'entrada')",
                       (f"Saída de estoque: {produto['descricao']} - {motivo}", valor_total, data_movimentacao), commit=True)
    query("UPDATE estoque_produtos SET quantidade=%s WHERE id=%s", (nova_quantidade, produto_id), commit=True)
    query("""INSERT INTO estoque_movimentacoes (produto_id, tipo, quantidade, valor_unitario, valor_total, motivo, data_movimentacao, despesa_id)
             VALUES (%s, 'saida', %s, %s, %s, %s, %s, %s)""",
          (produto_id, quantidade, valor_unitario, valor_total, motivo, data_movimentacao, despesa_id), commit=True)
    return jsonify({'ok': True, 'valor_total': float(valor_total), 'despesa_id': despesa_id}), 201

# ===================== API: FINANCEIRO =====================

@app.route('/api/financeiro', methods=['GET'])
def relatorio_financeiro():
    ano_raw = request.args.get('ano')
    mes_raw = request.args.get('mes')
    try:
        ano = int(ano_raw)
    except (TypeError, ValueError):
        ano = date.today().year
    try:
        mes = int(mes_raw)
    except (TypeError, ValueError):
        mes = date.today().month
    if mes < 0 or mes > 12:
        mes = date.today().month

    # Apenas OSs pagas no período
    # mes=0 significa "todo o período"
    if mes == 0:
        detalhes = query("""
            SELECT os.id, os.numero, os.data_pagamento,
                   CONCAT_WS(' ', v.marca, v.modelo) AS veiculo,
                   v.placa AS placa,
                   COALESCE(SUM(p.valor_custo * p.quantidade), 0) AS valor_pecas_custo,
                   COALESCE(SUM(p.valor_venda * p.quantidade), 0) AS valor_pecas_venda,
                   COALESCE(os.valor_mao_obra, 0) AS valor_mao_obra,
                   (COALESCE(SUM(p.valor_venda * p.quantidade), 0) + COALESCE(os.valor_mao_obra, 0)) AS total,
                   (COALESCE(SUM(p.valor_venda * p.quantidade), 0) + COALESCE(os.valor_mao_obra, 0)
                    - COALESCE(SUM(p.valor_custo * p.quantidade), 0)) AS lucro
            FROM ordens_servico os
            LEFT JOIN veiculos v ON v.id = os.veiculo_id
            LEFT JOIN ordens_servico_pecas p ON p.ordem_id = os.id
            WHERE os.status = 'Paga' AND os.ativo = 1
              AND os.data_pagamento IS NOT NULL
              AND YEAR(os.data_pagamento) = %s
            GROUP BY os.id, os.numero, os.data_pagamento, v.marca, v.modelo, v.placa, os.valor_mao_obra
            ORDER BY os.data_pagamento DESC, os.numero DESC
        """, (ano,), fetch=True)
    else:
        detalhes = query("""
            SELECT os.id, os.numero, os.data_pagamento,
                   CONCAT_WS(' ', v.marca, v.modelo) AS veiculo,
                   v.placa AS placa,
                   COALESCE(SUM(p.valor_custo * p.quantidade), 0) AS valor_pecas_custo,
                   COALESCE(SUM(p.valor_venda * p.quantidade), 0) AS valor_pecas_venda,
                   COALESCE(os.valor_mao_obra, 0) AS valor_mao_obra,
                   (COALESCE(SUM(p.valor_venda * p.quantidade), 0) + COALESCE(os.valor_mao_obra, 0)) AS total,
                   (COALESCE(SUM(p.valor_venda * p.quantidade), 0) + COALESCE(os.valor_mao_obra, 0)
                    - COALESCE(SUM(p.valor_custo * p.quantidade), 0)) AS lucro
            FROM ordens_servico os
            LEFT JOIN veiculos v ON v.id = os.veiculo_id
            LEFT JOIN ordens_servico_pecas p ON p.ordem_id = os.id
            WHERE os.status = 'Paga' AND os.ativo = 1
              AND os.data_pagamento IS NOT NULL
              AND YEAR(os.data_pagamento) = %s AND MONTH(os.data_pagamento) = %s
            GROUP BY os.id, os.numero, os.data_pagamento, v.marca, v.modelo, v.placa, os.valor_mao_obra
            ORDER BY os.data_pagamento DESC, os.numero DESC
        """, (ano, mes), fetch=True)

    if mes == 0:
        gasto_pendente = query("""
            SELECT COALESCE(SUM(p.valor_custo * p.quantidade), 0) AS total
            FROM ordens_servico os
            JOIN ordens_servico_pecas p ON p.ordem_id = os.id
            WHERE os.status = 'Pendente' AND os.ativo = 1
              AND YEAR(os.data_emissao) = %s
        """, (ano,), fetch=True, one=True)['total']
    else:
        gasto_pendente = query("""
            SELECT COALESCE(SUM(p.valor_custo * p.quantidade), 0) AS total
            FROM ordens_servico os
            JOIN ordens_servico_pecas p ON p.ordem_id = os.id
            WHERE os.status = 'Pendente' AND os.ativo = 1
              AND YEAR(os.data_emissao) = %s AND MONTH(os.data_emissao) = %s
        """, (ano, mes), fetch=True, one=True)['total']

    total_gasto = sum(d['valor_pecas_custo'] for d in detalhes) + float(gasto_pendente or 0)
    total_recebido = sum(d['total'] for d in detalhes)

    if mes == 0:
        despesas_total = query("""SELECT COALESCE(SUM(valor), 0) AS total FROM despesas
                                  WHERE ativo=1 AND tipo='saida' AND YEAR(data_despesa)=%s""",
                               (ano,), fetch=True, one=True)['total']
        entradas_caixa_total = query("""SELECT COALESCE(SUM(valor), 0) AS total FROM despesas
                                        WHERE ativo=1 AND tipo='entrada' AND YEAR(data_despesa)=%s""",
                                     (ano,), fetch=True, one=True)['total']
        veiculos_count = query("""SELECT COUNT(DISTINCT veiculo_id) AS total FROM ordens_servico
                                  WHERE ativo=1 AND status='Paga' AND data_pagamento IS NOT NULL
                                    AND YEAR(data_pagamento)=%s""",
                               (ano,), fetch=True, one=True)['total']
    else:
        despesas_total = query("""SELECT COALESCE(SUM(valor), 0) AS total FROM despesas
                                  WHERE ativo=1 AND tipo='saida' AND YEAR(data_despesa)=%s AND MONTH(data_despesa)=%s""",
                               (ano, mes), fetch=True, one=True)['total']
        entradas_caixa_total = query("""SELECT COALESCE(SUM(valor), 0) AS total FROM despesas
                                        WHERE ativo=1 AND tipo='entrada' AND YEAR(data_despesa)=%s AND MONTH(data_despesa)=%s""",
                                     (ano, mes), fetch=True, one=True)['total']
        veiculos_count = query("""SELECT COUNT(DISTINCT veiculo_id) AS total FROM ordens_servico
                                  WHERE ativo=1 AND status='Paga' AND data_pagamento IS NOT NULL
                                    AND YEAR(data_pagamento)=%s AND MONTH(data_pagamento)=%s""",
                               (ano, mes), fetch=True, one=True)['total']

    total_recebido = float(total_recebido) + float(entradas_caixa_total)
    lucro_liquido = float(total_recebido) - float(total_gasto) - float(despesas_total)

    return jsonify({
        'cards': {
            'veiculos': int(veiculos_count or 0),
            'valor_gasto': float(total_gasto),
            'valor_recebido': float(total_recebido),
            'despesas': float(despesas_total),
            'lucro': lucro_liquido,
        },
        'detalhes': to_json(detalhes),
    })

# ===================== API: CONFIGURAÇÕES =====================

@app.route('/api/configuracoes', methods=['GET'])
def obter_config():
    row = query("SELECT * FROM configuracoes ORDER BY id LIMIT 1", fetch=True, one=True)
    return jsonify(to_json(row))

@app.route('/api/configuracoes', methods=['PUT'])
def atualizar_config():
    logo_path = None
    if 'logo' in request.files:
        logo = request.files['logo']
        if logo and logo.filename:
            fname = f"logo_{int(time.time())}_{secure_filename(logo.filename)}"
            logo.save(os.path.join(app.config['UPLOAD_FOLDER'], fname))
            logo_path = fname
    d = request.form.to_dict() if request.content_type and 'multipart' in request.content_type else request.json

    existing = query("SELECT id FROM configuracoes ORDER BY id LIMIT 1", fetch=True, one=True)
    if existing:
        if logo_path:
            query("""UPDATE configuracoes SET nome_oficina=%s, cnpj=%s, endereco=%s, email=%s, whatsapp=%s, logo=%s WHERE id=%s""",
                  (d.get('nome_oficina'), d.get('cnpj'), d.get('endereco'),
                   d.get('email'), d.get('whatsapp'), logo_path, existing['id']), commit=True)
        else:
            query("""UPDATE configuracoes SET nome_oficina=%s, cnpj=%s, endereco=%s, email=%s, whatsapp=%s WHERE id=%s""",
                  (d.get('nome_oficina'), d.get('cnpj'), d.get('endereco'),
                   d.get('email'), d.get('whatsapp'), existing['id']), commit=True)
    else:
        query("""INSERT INTO configuracoes (nome_oficina, cnpj, endereco, email, whatsapp, logo)
                 VALUES (%s, %s, %s, %s, %s, %s)""",
              (d.get('nome_oficina'), d.get('cnpj'), d.get('endereco'),
               d.get('email'), d.get('whatsapp'), logo_path), commit=True)
    return jsonify({'ok': True})

# ===================== HEALTH =====================

@app.before_request
def _ensure_migrations():
    if not _migrations_done:
        run_migrations()

@app.route('/health')
def health():
    import traceback
    try:
        query("SELECT 1", fetch=True)
        return jsonify({'status': 'ok'})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'status': 'erro', 'erro': str(e), 'tipo': type(e).__name__}), 500


@app.context_processor
def inject_public_base_url():
    return {'PUBLIC_BASE_URL': app.config.get('PUBLIC_BASE_URL', '')}

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
