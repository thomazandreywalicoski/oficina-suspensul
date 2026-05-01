import os
import time
import uuid
from datetime import datetime, date, timedelta
from decimal import Decimal
from flask import Flask, render_template, request, jsonify, send_from_directory, abort
from werkzeug.utils import secure_filename
import mysql.connector
from mysql.connector import pooling

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'static', 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

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
        cur.execute("""CREATE TABLE IF NOT EXISTS orcamentos (
                         id INT AUTO_INCREMENT PRIMARY KEY,
                         slug VARCHAR(255) NOT NULL,
                         veiculo_id INT NULL,
                         pecas JSON NOT NULL,
                         criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                         UNIQUE KEY uniq_slug (slug)
                       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
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

# ===================== ROTAS DE PÁGINAS =====================

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/os/<int:os_id>/imprimir')
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

@app.route('/orcamento/<slug>')
def visualizar_orcamento(slug):
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
                           data_emissao=datetime.now().strftime('%d/%m/%Y'))

# ===================== API: CLIENTES =====================

@app.route('/api/clientes', methods=['GET'])
def listar_clientes():
    search = request.args.get('q', '').strip()
    incluir_inativos = request.args.get('incluir_inativos') == 'true'
    where = [] if incluir_inativos else ["ativo = 1"]
    params = []
    if search:
        where.append("(nome_completo LIKE %s OR cpf LIKE %s)")
        params.extend([f'%{search}%', f'%{search}%'])
    sql = "SELECT * FROM clientes"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY nome_completo"
    rows = query(sql, tuple(params), fetch=True)
    return jsonify(to_json(rows))

@app.route('/api/clientes', methods=['POST'])
def criar_cliente():
    d = request.json
    cid = query("INSERT INTO clientes (nome_completo, cpf, whatsapp) VALUES (%s, %s, %s)",
                (d['nome_completo'], d['cpf'], d.get('whatsapp')), commit=True)
    return jsonify({'id': cid}), 201

@app.route('/api/clientes/<int:cid>', methods=['PUT'])
def atualizar_cliente(cid):
    d = request.json
    query("UPDATE clientes SET nome_completo=%s, cpf=%s, whatsapp=%s WHERE id=%s",
          (d['nome_completo'], d['cpf'], d.get('whatsapp'), cid), commit=True)
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
    base = f"{veiculo.get('marca') or ''}-{veiculo.get('modelo') or ''}-{veiculo.get('ano') or ''}".strip('-') or 'veiculo'
    base = unicodedata.normalize('NFKD', base).encode('ascii', 'ignore').decode('ascii').lower()
    base = re.sub(r'[^a-z0-9]+', '-', base).strip('-') or 'veiculo'
    row = query("SELECT COALESCE(MAX(id),0) AS m FROM orcamentos", fetch=True, one=True)
    proximo = int(row['m']) + 1
    slug = f"{base}-{proximo:06d}"
    query("INSERT INTO orcamentos (slug, veiculo_id, pecas) VALUES (%s, %s, %s)",
          (slug, veiculo_id, _json.dumps(pecas)), commit=True)
    return jsonify({'url': f'/orcamento/{slug}', 'slug': slug})

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
        where.append("v.placa LIKE %s")
        params.append(f'%{search}%')
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

    vid = query("""INSERT INTO veiculos (placa, marca, modelo, ano, km, motorizacao, imagem, imagem2, imagem3, cliente_id)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (d.get('placa'), d.get('marca'), d.get('modelo'),
                 int(d.get('ano') or 0) or None, int(d.get('km') or 0),
                 d.get('motorizacao'),
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
    query("""UPDATE veiculos SET placa=%s, marca=%s, modelo=%s, ano=%s, km=%s,
             motorizacao=%s, cliente_id=%s WHERE id=%s""",
          (d.get('placa'), d.get('marca'), d.get('modelo'),
           int(d.get('ano') or 0) or None, int(d.get('km') or 0),
           d.get('motorizacao'),
           int(d['cliente_id']) if d.get('cliente_id') else None, vid), commit=True)

    # Atualiza apenas as imagens enviadas
    for col, fname in imgs.items():
        if fname:
            query(f"UPDATE veiculos SET {col}=%s WHERE id=%s", (fname, vid), commit=True)
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
    rows = query(f"""SELECT os.*, c.nome_completo, c.cpf, v.placa, v.marca, v.modelo
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
    oid = query("""INSERT INTO ordens_servico (numero, cliente_id, veiculo_id, data_emissao, valor_mao_obra, status, observacoes)
                   VALUES (%s, %s, %s, %s, %s, 'Pendente', %s)""",
                (numero, d['cliente_id'], d['veiculo_id'],
                 d.get('data_emissao') or date.today().isoformat(),
                 d.get('valor_mao_obra', 0), d.get('observacoes')), commit=True)
    for p in d.get('pecas', []):
        query("""INSERT INTO ordens_servico_pecas (ordem_id, codigo, descricao, fornecedor_id, quantidade, valor_custo, lucro_percentual, desconto_percentual, valor_venda)
                 VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
              (oid, p.get('codigo'), p['descricao'], p.get('fornecedor_id') or None,
               p.get('quantidade', 1),
               p.get('valor_custo', 0), p.get('lucro_percentual', 0), p.get('desconto_percentual', 0), p.get('valor_venda', 0)), commit=True)
    return jsonify({'id': oid, 'numero': numero}), 201

@app.route('/api/os/<int:oid>/status', methods=['PUT'])
def atualizar_status_os(oid):
    d = request.json
    query("UPDATE ordens_servico SET status=%s WHERE id=%s", (d['status'], oid), commit=True)
    return jsonify({'ok': True})

@app.route('/api/os/<int:oid>/toggle-ativo', methods=['PATCH'])
def alternar_os(oid):
    query("UPDATE ordens_servico SET ativo = 1 - ativo WHERE id=%s", (oid,), commit=True)
    row = query("SELECT ativo FROM ordens_servico WHERE id=%s", (oid,), fetch=True, one=True)
    return jsonify({'ok': True, 'ativo': bool(row['ativo']) if row else None})

# ===================== API: DESPESAS =====================

@app.route('/api/despesas', methods=['GET'])
def listar_despesas():
    ano = request.args.get('ano')
    mes = request.args.get('mes')
    incluir_inativos = request.args.get('incluir_inativos') == 'true'
    where = [] if incluir_inativos else ["ativo = 1"]
    params = []
    if ano and mes:
        where.append("YEAR(data_despesa) = %s")
        where.append("MONTH(data_despesa) = %s")
        params.extend([int(ano), int(mes)])
    where_clause = (" WHERE " + " AND ".join(where)) if where else ""
    rows = query(f"SELECT * FROM despesas{where_clause} ORDER BY data_despesa DESC", tuple(params), fetch=True)
    return jsonify(to_json(rows))

@app.route('/api/despesas', methods=['POST'])
def criar_despesa():
    d = request.json
    did = query("INSERT INTO despesas (descricao, valor, data_despesa) VALUES (%s, %s, %s)",
                (d['descricao'], d['valor'], d.get('data_despesa') or date.today().isoformat()), commit=True)
    return jsonify({'id': did}), 201

@app.route('/api/despesas/<int:did>/toggle-ativo', methods=['PATCH'])
def alternar_despesa(did):
    query("UPDATE despesas SET ativo = 1 - ativo WHERE id=%s", (did,), commit=True)
    row = query("SELECT ativo FROM despesas WHERE id=%s", (did,), fetch=True, one=True)
    return jsonify({'ok': True, 'ativo': bool(row['ativo']) if row else None})

# ===================== API: FINANCEIRO =====================

@app.route('/api/financeiro', methods=['GET'])
def relatorio_financeiro():
    ano = int(request.args.get('ano', date.today().year))
    mes = int(request.args.get('mes', date.today().month))

    # Apenas OSs pagas no período
    detalhes = query("""
        SELECT os.id, os.numero,
               COALESCE(SUM(p.valor_custo * p.quantidade), 0) AS valor_pecas_custo,
               COALESCE(SUM(p.valor_venda * p.quantidade), 0) AS valor_pecas_venda,
               COALESCE(os.valor_mao_obra, 0) AS valor_mao_obra,
               (COALESCE(SUM(p.valor_venda * p.quantidade), 0) + COALESCE(os.valor_mao_obra, 0)) AS total,
               (COALESCE(SUM(p.valor_venda * p.quantidade), 0) + COALESCE(os.valor_mao_obra, 0)
                - COALESCE(SUM(p.valor_custo * p.quantidade), 0)) AS lucro
        FROM ordens_servico os
        LEFT JOIN ordens_servico_pecas p ON p.ordem_id = os.id
        WHERE os.status = 'Paga' AND os.ativo = 1
          AND YEAR(os.data_emissao) = %s AND MONTH(os.data_emissao) = %s
        GROUP BY os.id, os.numero, os.valor_mao_obra
        ORDER BY os.numero DESC
    """, (ano, mes), fetch=True)

    total_gasto = sum(d['valor_pecas_custo'] for d in detalhes)
    total_recebido = sum(d['total'] for d in detalhes)

    despesas_total = query("""SELECT COALESCE(SUM(valor), 0) AS total FROM despesas
                              WHERE ativo=1 AND YEAR(data_despesa)=%s AND MONTH(data_despesa)=%s""",
                           (ano, mes), fetch=True, one=True)['total']

    veiculos_count = query("""SELECT COUNT(DISTINCT veiculo_id) AS total FROM ordens_servico
                              WHERE ativo=1 AND status='Paga' AND YEAR(data_emissao)=%s AND MONTH(data_emissao)=%s""",
                           (ano, mes), fetch=True, one=True)['total']

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
    if 'logo' in request.files:
        logo = request.files['logo']
        d = request.form.to_dict()
        logo_path = None
        if logo and logo.filename:
            fname = f"logo_{int(time.time())}_{secure_filename(logo.filename)}"
            logo.save(os.path.join(app.config['UPLOAD_FOLDER'], fname))
            logo_path = fname
    else:
        d = request.json
        logo_path = d.get('logo')

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


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
