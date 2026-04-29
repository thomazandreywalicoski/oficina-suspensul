-- Banco de dados Oficina Suspensul
SET NAMES utf8mb4;
SET character_set_client = utf8mb4;
SET character_set_connection = utf8mb4;
SET character_set_results = utf8mb4;
CREATE DATABASE IF NOT EXISTS oficina_suspensul CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE oficina_suspensul;

-- Tabela de Clientes
CREATE TABLE IF NOT EXISTS clientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome_completo VARCHAR(150) NOT NULL,
    cpf VARCHAR(20) NOT NULL UNIQUE,
    whatsapp VARCHAR(25),
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de Fornecedores
CREATE TABLE IF NOT EXISTS fornecedores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    cnpj VARCHAR(25) NOT NULL UNIQUE,
    whatsapp VARCHAR(25),
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de Veículos
CREATE TABLE IF NOT EXISTS veiculos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    placa VARCHAR(15) NOT NULL UNIQUE,
    marca VARCHAR(60),
    modelo VARCHAR(80),
    ano INT,
    km INT DEFAULT 0,
    chassi VARCHAR(50),
    motorizacao VARCHAR(50),
    imagem VARCHAR(255),
    cliente_id INT,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de Agendamentos
CREATE TABLE IF NOT EXISTS agendamentos (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de Ordens de Serviço
CREATE TABLE IF NOT EXISTS ordens_servico (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de Peças/Produtos da Ordem de Serviço
CREATE TABLE IF NOT EXISTS ordens_servico_pecas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ordem_id INT NOT NULL,
    codigo VARCHAR(50),
    descricao VARCHAR(200) NOT NULL,
    fornecedor_id INT NULL,
    quantidade INT NOT NULL DEFAULT 1,
    valor_custo DECIMAL(10,2) NOT NULL DEFAULT 0,
    lucro_percentual DECIMAL(6,2) NOT NULL DEFAULT 0,
    valor_venda DECIMAL(10,2) NOT NULL DEFAULT 0,
    FOREIGN KEY (ordem_id) REFERENCES ordens_servico(id) ON DELETE CASCADE,
    FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de Despesas
CREATE TABLE IF NOT EXISTS despesas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    descricao VARCHAR(200) NOT NULL,
    valor DECIMAL(10,2) NOT NULL,
    data_despesa DATE NOT NULL,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de Configurações da Oficina
CREATE TABLE IF NOT EXISTS configuracoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome_oficina VARCHAR(150) DEFAULT 'Oficina Suspensul',
    cnpj VARCHAR(25),
    endereco VARCHAR(255),
    email VARCHAR(150),
    whatsapp VARCHAR(25),
    logo VARCHAR(255),
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Inserir configuração padrão
INSERT INTO configuracoes (nome_oficina, cnpj, endereco, email, whatsapp)
VALUES ('Oficina Suspensul', '00.000.000/0001-00', 'Rua das Molas, 123 - Mafra/SC', 'contato@suspensul.com.br', '(47) 99999-0000');

-- Dados de exemplo
INSERT INTO clientes (nome_completo, cpf, whatsapp) VALUES
('João Silva Sauro', '123.456.789-00', '(47) 99999-8888'),
('Maria Oliveira', '987.654.321-11', '(47) 98888-7777');

INSERT INTO fornecedores (nome, cnpj, whatsapp) VALUES
('Distribuidora de Peças Sul', '12.345.678/0001-99', '(41) 3333-4444');

INSERT INTO veiculos (placa, marca, modelo, ano, km, motorizacao, cliente_id) VALUES
('ABC1D23', 'VW', 'Gol G6', 2015, 85000, '1.0 Total Flex', 1);
