import json
import mysql.connector

def init_devolucao_tables(conn):
    """Cria as tabelas necessárias para o módulo de devolução de produtos."""
    cur = conn.cursor()
    try:
        cur.execute("""
        CREATE TABLE IF NOT EXISTS devolucao_notas_originais (
            id INT AUTO_INCREMENT PRIMARY KEY,
            chave_acesso VARCHAR(44) NOT NULL UNIQUE,
            numero VARCHAR(20) NULL,
            serie VARCHAR(10) NULL,
            data_emissao DATETIME NULL,
            cnpj_emitente VARCHAR(20) NULL,
            nome_emitente VARCHAR(150) NULL,
            uf_emitente VARCHAR(2) NULL,
            valor_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            dados_json JSON NULL,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS devolucao_notas_fiscais (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ref VARCHAR(60) NOT NULL UNIQUE,
            status ENUM('RASCUNHO', 'VALIDANDO', 'ENVIANDO', 'PROCESSANDO', 'AUTORIZADA', 'REJEITADA', 'CANCELADA', 'ERRO') NOT NULL DEFAULT 'RASCUNHO',
            finalidade_emissao INT NOT NULL DEFAULT 4,
            natureza_operacao VARCHAR(150) NOT NULL DEFAULT 'DEVOLUCAO DE MERCADORIA',
            chave_nfe_original VARCHAR(44) NOT NULL,
            numero_nfe_original VARCHAR(20) NULL,
            serie_nfe_original VARCHAR(10) NULL,
            cnpj_fornecedor VARCHAR(20) NULL,
            nome_fornecedor VARCHAR(150) NULL,
            cnpj_emitente VARCHAR(20) NULL,
            nome_emitente VARCHAR(150) NULL,
            valor_produtos DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            valor_frete DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            valor_desconto DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            valor_outras_despesas DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            valor_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            modalidade_frete INT NOT NULL DEFAULT 9,
            cfop_padrao VARCHAR(10) NULL DEFAULT '5202',
            observacoes TEXT NULL,
            chave_acesso VARCHAR(44) NULL,
            numero INT NULL,
            serie INT NULL,
            protocolo VARCHAR(60) NULL,
            xml_url VARCHAR(255) NULL,
            danfe_url VARCHAR(255) NULL,
            mensagem_erro TEXT NULL,
            codigo_erro VARCHAR(50) NULL,
            payload_json JSON NULL,
            response_json JSON NULL,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            autorizado_em DATETIME NULL,
            cancelado_em DATETIME NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS devolucao_notas_itens (
            id INT AUTO_INCREMENT PRIMARY KEY,
            devolucao_id INT NOT NULL,
            numero_item INT NOT NULL,
            codigo_produto VARCHAR(60) NULL,
            descricao VARCHAR(255) NOT NULL,
            ncm VARCHAR(10) NOT NULL,
            cfop VARCHAR(10) NOT NULL DEFAULT '5202',
            unidade VARCHAR(10) NOT NULL DEFAULT 'UN',
            quantidade_original DECIMAL(10,4) NOT NULL DEFAULT 1.0000,
            quantidade_devolvida DECIMAL(10,4) NOT NULL DEFAULT 1.0000,
            valor_unitario DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
            valor_bruto DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            valor_desconto DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            valor_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            icms_origem INT NOT NULL DEFAULT 0,
            tributacao_json JSON NULL,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (devolucao_id) REFERENCES devolucao_notas_fiscais(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS devolucao_webhook_events (
            id INT AUTO_INCREMENT PRIMARY KEY,
            event_id VARCHAR(100) NULL UNIQUE,
            reference VARCHAR(60) NULL,
            payload_json JSON NULL,
            status VARCHAR(50) NULL,
            recebido_em DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        conn.commit()
    finally:
        cur.close()
