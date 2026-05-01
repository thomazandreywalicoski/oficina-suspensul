<<<<<<< HEAD
# oficina-suspensul
Sistema de gerenciamento da Oficina Suspensul
=======
# Oficina Suspensul - Sistema de Gerenciamento

Sistema completo de gerenciamento para oficina mecânica, com agendamentos, clientes, fornecedores, veículos, ordens de serviço, despesas e financeiro.

## Stack

- **Backend**: Python + Flask
- **Banco de dados**: MySQL 8.0
- **Admin do banco**: phpMyAdmin
- **Frontend**: HTML, CSS, JavaScript puro com [Lucide Icons](https://lucide.dev/) e fonte [Outfit](https://fonts.google.com/specimen/Outfit)
- **Containerização**: Docker + docker-compose

## Paleta

- Amarelo: `#ffe54c`
- Preto: `#000000`
- Border-radius padrão: `8px`
- Sem bordas, sem degradês, sem branco de fundo.

## Como subir o sistema

Pré-requisito: ter Docker Desktop instalado e em execução.

Na raiz do projeto, execute:

```powershell
docker compose up -d --build
```

Aguarde 15-30 segundos na primeira execução para o MySQL terminar a inicialização e o seed do banco de dados.

## Endereços

- Aplicação web: <http://localhost:3800>
- phpMyAdmin: <http://localhost:3801>
- MySQL externo: `127.0.0.1:3802`

## Credenciais MySQL

- Usuário aplicação: `suspensul` / senha `suspensul123`
- Usuário root: `root` / senha `suspensul123`
- Banco: `oficina_suspensul`

## Estrutura

```
.
├── app.py                    # API Flask
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
├── database/
│   └── init.sql              # Schema + seed (tabelas em pt-br)
├── templates/
│   ├── index.html            # SPA principal
│   └── os_print.html         # Template impressão (A4/Cupom)
├── static/
│   ├── js/app.js             # Integração com a API REST
│   └── uploads/              # Imagens de veículos / logo
└── README.md
```

## Tabelas do banco

Todas em pt-br:

- `clientes` (id, nome_completo, cpf, whatsapp, ...)
- `fornecedores` (id, nome, cnpj, whatsapp, ...)
- `veiculos` (id, placa, marca, modelo, ano, km, chassi, motorizacao, imagem, cliente_id)
- `agendamentos` (id, cliente_id, veiculo_id, data_agendamento, horario, observacoes, status)
- `ordens_servico` (id, numero, cliente_id, veiculo_id, data_emissao, valor_mao_obra, status)
- `ordens_servico_pecas` (id, ordem_id, codigo, descricao, quantidade, valor_custo, lucro_percentual, valor_venda)
- `despesas` (id, descricao, valor, data_despesa)
- `configuracoes` (id, nome_oficina, cnpj, endereco, email, whatsapp, logo)

## Funcionalidades

### Agendamentos
- Calendário com filtro por mês/ano.
- Botão **Novo Agendamento**: busca de cliente (nome/CPF), busca de veículo (placa), seletor de data e horário, observações.
- Tag visual no dia agendado; clique abre o **modal de detalhes** com possibilidade de editar (após confirmar **Editar**), trocar status (Agendado / Cliente não trouxe / Cancelado / Concluído) e **Reagendar** (volta status para Agendado).

### Clientes / Fornecedores
- Listagem com busca por nome/CPF (ou CNPJ).
- Cadastro, edição e exclusão.

### Veículos
- Listagem com imagem, placa, marca/modelo, ano, KM, motorização.
- Upload de imagem.
- Cadastro, edição, exclusão.

### Ordens de Serviço
- Listagem com filtro por status e busca livre.
- Botões por OS: **Imprimir A4**, **Imprimir Cupom**, **Enviar Whatsapp**, **Alternar status (Pendente/Paga)**, **Excluir**.
- **Nova OS**: busca cliente, busca veículo, múltiplas peças (código, descrição, qtd, custo, lucro %, valor de venda calculado automaticamente) + valor de mão de obra. Numeração sequencial automática.
- Impressão A4/Cupom abre página dedicada com auto-`window.print()`.

### Despesas
- Filtro por mês/ano.
- Cadastro com data automática.

### Financeiro
- Filtro por mês/ano.
- Cards: Nº Veículos, Valor Gasto (peças/custo), Valor Recebido, Despesas, Lucro Líquido.
- Apenas ordens com status **Paga** entram nos cálculos.
- Lucro = (Vendas Peças + Mão de Obra) - Custo Peças - Despesas.

### Configurações
- Logo, nome, CNPJ, endereço, e-mail, Whatsapp da oficina (saem na nota fiscal/OS).

## Comandos úteis

```powershell
# Subir
docker compose up -d --build

# Logs em tempo real
docker compose logs -f app

# Reiniciar app sem rebuild
docker compose restart app

# Parar
docker compose down

# Reset total (apaga dados!)
docker compose down -v
```

## Desenvolvimento local (sem Docker)

Se quiser rodar o Flask fora do container apontando para o MySQL do compose:

```powershell
$env:DB_HOST="127.0.0.1"; $env:DB_PORT="3802"
pip install -r requirements.txt
python app.py
```

A aplicação ficará em <http://localhost:5000>.
>>>>>>> 216908d (Initial commit)
