# Documentação Técnica — Emissão de NF-e de Devolução de Peças com Focus NFe

**Objetivo:** servir como especificação para desenvolvimento de uma aplicação web capaz de emitir NF-e de devolução de peças/produtos para autopeças usando a API Focus NFe.

**API alvo:** Focus NFe API v2  
**Documento fiscal:** NF-e modelo 55  
**Finalidade da emissão:** devolução (`finalidade_emissao = 4`)  
**Ambiente:** homologação durante desenvolvimento e produção somente após validação  
**Stack sugerida:** PHP + MySQL + JavaScript/HTML/CSS, mas a especificação é independente de linguagem.

> **IMPORTANTE:** esta documentação é uma especificação de integração baseada na documentação oficial da Focus NFe consultada em 09/08/2026. Ela não substitui a orientação fiscal/contábil. CFOP, CST/CSOSN, NCM, tributação, valores de ICMS/IPI e demais regras fiscais devem ser definidos de acordo com a operação real e, quando necessário, pelo contador.

---

# 1. Visão geral

A aplicação deverá permitir que o usuário:

1. Cadastre/configure a empresa emitente.
2. Configure o token da Focus NFe.
3. Configure o certificado digital da empresa na Focus NFe.
4. Informe ou importe a NF-e original recebida da autopeças.
5. Consulte os dados da NF-e original.
6. Selecione quais peças serão devolvidas e suas quantidades.
7. Monte automaticamente uma NF-e de devolução.
8. Referencie a NF-e original pela chave de acesso.
9. Envie a NF-e para a Focus NFe.
10. Acompanhe o processamento.
11. Mostre o resultado da autorização ou rejeição.
12. Permita baixar XML e DANFE quando disponíveis.
13. Armazene todo o histórico da operação.
14. Opcionalmente receba atualização por webhook.
15. Permita consultar/reprocessar notas rejeitadas.
16. Permita cancelar uma NF-e autorizada quando fiscalmente cabível.

A Focus NFe recebe os dados estruturados em JSON e realiza a assinatura digital e a comunicação com a SEFAZ. A integração usa REST e a API possui endpoints específicos para NF-e.

---

# 2. Ambientes

## Homologação

URL base:

```text
https://homologacao.focusnfe.com.br
```

Usar durante o desenvolvimento e testes.

As notas emitidas em homologação não possuem validade fiscal/tributária.

## Produção

URL base:

```text
https://api.focusnfe.com.br
```

Usar somente depois de validar completamente o fluxo.

Prefixo das rotas:

```text
/v2
```

Exemplo:

```text
https://api.focusnfe.com.br/v2/nfe
```

A aplicação deve possuir uma configuração:

```text
APP_ENV = homologacao | producao
```

e nunca deixar a URL de produção fixa em vários arquivos do projeto.

---

# 3. Autenticação

A Focus NFe utiliza HTTP Basic Authentication.

O token da empresa é utilizado como usuário e a senha fica vazia.

Exemplo:

```text
username = SEU_TOKEN
password = ""
```

Em cURL:

```bash
curl -u 'SEU_TOKEN_AQUI:' \
  https://homologacao.focusnfe.com.br/v2/empresas
```

O `:` depois do token é intencional porque representa a senha vazia.

## Regra de segurança

O token da Focus NFe e o certificado digital NÃO devem ser enviados ao navegador.

Nunca fazer:

```javascript
fetch("https://api.focusnfe.com.br/...", {
    headers: {
        Authorization: "Basic ..."
    }
});
```

O navegador deve conversar somente com o backend da aplicação:

```text
Navegador
   |
   v
Backend PHP
   |
   v
Focus NFe
   |
   v
SEFAZ
```

O backend deverá armazenar o token em variável de ambiente/configuração protegida.

---

# 4. Certificado digital

Para emissão de NF-e, a empresa emitente precisa estar configurada na Focus NFe e o certificado digital deve ser disponibilizado/configurado conforme a conta da empresa.

A API de Empresas aceita certificado em formato PFX/P12 codificado em Base64 e sua senha.

Campos relacionados:

```text
arquivo_certificado_base64
senha_certificado
```

A documentação da Focus NFe também prevê regime tributário:

```text
1 = Simples Nacional
2 = Simples Nacional - excesso de sublimite
3 = Regime Normal
4 = Simples Nacional - MEI
```

Para uma empresa MEI, o sistema deve armazenar o regime como:

```text
regime_tributario = 4
```

quando isso corresponder ao cadastro fiscal real da empresa.

## Segurança

Nunca salvar a senha do certificado em texto puro se não for estritamente necessário.

Preferir:

- variável de ambiente;
- secret manager;
- banco criptografado;
- acesso administrativo restrito.

---

# 5. Cadastro da empresa na Focus NFe

Endpoint:

```http
POST /v2/empresas
```

Produção:

```text
https://api.focusnfe.com.br/v2/empresas
```

A API de empresas é usada para cadastrar/configurar a empresa que fará as emissões.

Exemplo simplificado:

```json
{
  "nome": "NOME DA EMPRESA",
  "nome_fantasia": "NOME FANTASIA",
  "cnpj": "00000000000000",
  "inscricao_estadual": "000000000",
  "regime_tributario": 4,
  "logradouro": "Rua Exemplo",
  "numero": 100,
  "bairro": "Centro",
  "municipio": "Mafra",
  "cep": 89300000,
  "uf": "SC",
  "telefone": "47999999999",
  "email": "empresa@exemplo.com.br",
  "habilita_nfe": true
}
```

Para certificado, a API também possui:

```json
{
  "arquivo_certificado_base64": "BASE64_DO_PFX",
  "senha_certificado": "SENHA"
}
```

Não colocar valores reais de certificado neste documento ou no código-fonte.

---

# 6. Consultar empresas

Endpoint:

```http
GET /v2/empresas
```

Pode filtrar por CNPJ ou CPF e possui paginação.

Exemplo:

```http
GET /v2/empresas?cnpj=00000000000000
```

Consultar empresa por ID:

```http
GET /v2/empresas/{id}
```

---

# 7. Conceito de `ref`

A Focus NFe exige uma referência única para identificar a emissão.

Exemplo:

```text
ref = DEV202608090001
```

Regras:

- deve ser única dentro do token;
- pode ser alfanumérica;
- não utilizar espaços;
- não utilizar acentos;
- não utilizar caracteres especiais;
- pode ser baseada no ID interno da nota.

Sugestão:

```text
DEV-{ID_INTERNO}
```

Porém, como a API recomenda caracteres alfanuméricos, usar:

```text
DEV202608090001
```

em vez de:

```text
DEV-2026/08/09-0001
```

## Regra importante

Se a NF-e ainda não foi autorizada e houve rejeição, a aplicação pode corrigir o payload e reenviar utilizando a mesma referência.

Depois que a NF-e for autorizada, a referência fica vinculada àquele documento e não deve ser reutilizada para outra emissão.

---

# 8. Fluxo completo da NF-e de devolução

Fluxo recomendado:

```text
[Usuário]
    |
    v
[Seleciona "Nova devolução"]
    |
    v
[Informa chave da NF-e original]
    |
    v
[Backend consulta/importa NF-e]
    |
    v
[Mostra fornecedor + produtos]
    |
    v
[Usuário seleciona produtos/quantidades]
    |
    v
[Backend valida dados fiscais]
    |
    v
[Monta NF-e de devolução]
    |
    v
[POST /v2/nfe?ref=...]
    |
    +------> 201 Autorizada
    |
    +------> 202 Processando
    |             |
    |             v
    |        [Webhook ou GET]
    |
    +------> 400/422 Erro
                  |
                  v
            [Mostrar rejeição]
```

---

# 9. NF-e de devolução

O endpoint principal é:

```http
POST /v2/nfe
```

URL de produção:

```text
https://api.focusnfe.com.br/v2/nfe
```

A referência é enviada como query parameter:

```http
POST /v2/nfe?ref=DEV202608090001
```

Para devolução:

```json
{
  "finalidade_emissao": 4
}
```

O campo significa:

```text
1 = Normal
2 = Complementar
3 = Nota de ajuste
4 = Devolução
```

---

# 10. Campos principais da NF-e

## Identificação da operação

### `natureza_operacao`

Descrição da operação.

Exemplo:

```text
DEVOLUÇÃO DE MERCADORIA
```

ou uma descrição definida pelo responsável fiscal.

Não escolher CFOP ou natureza automaticamente apenas pelo texto da operação.

---

### `data_emissao`

Data/hora da emissão em ISO 8601.

Exemplo:

```text
2026-08-09T10:30:00-03:00
```

---

### `data_entrada_saida`

Data/hora de entrada/saída da mercadoria.

Exemplo:

```text
2026-08-09T10:30:00-03:00
```

---

### `tipo_documento`

```text
0 = Entrada
1 = Saída
```

A aplicação NÃO deve assumir automaticamente o valor sem verificar a operação fiscal definida para a devolução.

---

### `local_destino`

```text
1 = Operação interna
2 = Operação interestadual
3 = Operação com exterior
```

Para uma devolução dentro do mesmo estado:

```json
"local_destino": 1
```

Para estados diferentes:

```json
"local_destino": 2
```

A aplicação deve calcular isso comparando UF do emitente e UF do destinatário.

---

### `finalidade_emissao`

Para devolução:

```json
"finalidade_emissao": 4
```

---

### `consumidor_final`

```text
0 = Normal
1 = Consumidor final
```

Esse valor deve refletir a operação real.

---

### `presenca_comprador`

Valores disponíveis:

```text
0 = Não se aplica
1 = Operação presencial
2 = Operação não presencial, pela Internet
3 = Operação não presencial, Teleatendimento
4 = NFC-e com entrega em domicílio
9 = Operação não presencial, outros
```

Para NF-e de devolução, o sistema deve usar o valor fiscalmente apropriado para a operação, não simplesmente copiar uma opção fixa.

---

# 11. Emitente

Campos principais:

```text
cnpj_emitente
cpf_emitente
nome_emitente
nome_fantasia_emitente
logradouro_emitente
numero_emitente
complemento_emitente
bairro_emitente
codigo_municipio_emitente
municipio_emitente
uf_emitente
cep_emitente
inscricao_estadual_emitente
regime_tributario_emitente
```

Quando os dados da empresa já estiverem cadastrados na Focus NFe, vários dados do emitente podem ser obtidos do cadastro e podem ser omitidos do payload.

Mesmo assim, a aplicação deve manter um cadastro local para exibição e validação.

---

# 12. Destinatário da devolução

Na devolução de peças para a autopeças, o destinatário normalmente será a empresa que originalmente vendeu as peças.

Campos:

```text
nome_destinatario
cnpj_destinatario
cpf_destinatario
inscricao_estadual_destinatario
indicador_inscricao_estadual_destinatario
logradouro_destinatario
numero_destinatario
complemento_destinatario
bairro_destinatario
codigo_municipio_destinatario
municipio_destinatario
uf_destinatario
cep_destinatario
pais_destinatario
telefone_destinatario
email_destinatario
```

Para uma autopeças pessoa jurídica, normalmente será utilizado `cnpj_destinatario`.

O sistema não deve inventar dados do destinatário. Deve obtê-los da NF-e original ou do cadastro confirmado pelo usuário.

---

# 13. Referenciar a NF-e original

Este é um dos pontos mais importantes da aplicação.

A devolução deve guardar a chave da NF-e original e referenciá-la no documento.

Estrutura:

```json
"notas_referenciadas": [
  {
    "chave_nfe": "35123456789012345678550010000000011000000010"
  }
]
```

A chave deve conter 44 dígitos.

## Regra da aplicação

Não permitir emissão de uma devolução sem uma referência à NF-e original quando essa referência for exigida pela operação fiscal.

O sistema deve armazenar:

```text
chave_nfe_original
numero_nfe_original
serie_nfe_original
data_nfe_original
cnpj_fornecedor_original
```

---

# 14. Consulta de NF-e recebida pela chave

A Focus NFe possui endpoint para consultar NF-e recebida:

```http
GET /v2/nfes_recebidas/{chave}
```

Exemplo:

```text
GET /v2/nfes_recebidas/35123456789012345678550010000000011000000010?completa=1
```

Esse endpoint é útil para o fluxo:

```text
Usuário informa chave
        |
        v
Backend consulta Focus NFe
        |
        v
Dados da NF-e original
        |
        v
Usuário escolhe itens
```

Pode ser informado o CNPJ da empresa recebedora para desambiguação:

```text
?cnpj=00000000000000
```

---

# 15. Importação de XML da NF-e original

Também existe:

```http
POST /v2/nfe/importacao
```

Esse endpoint permite importar uma NF-e a partir do XML.

Body:

```text
conteúdo do XML
```

Pode ser utilizado quando o usuário possui o XML da nota original.

Fluxo:

```text
Upload XML
    |
    v
Backend valida extensão/tamanho
    |
    v
Envia XML para Focus
    |
    v
Nota importada
    |
    v
Dados disponíveis para consulta/operações
```

A documentação informa que a importação valida a empresa emitente e que não é necessário certificado digital instalado apenas para aceitar a importação.

---

# 16. Itens da NF-e

O campo:

```json
"items": []
```

é obrigatório no endpoint de emissão.

Cada item deve possuir pelo menos os dados exigidos pela API e pela tributação da operação.

Campos fundamentais:

```text
numero_item
codigo_produto
descricao
codigo_ncm
quantidade_comercial
unidade_comercial
valor_unitario_comercial
valor_bruto
inclui_no_total
icms_origem
```

Além disso, dependendo da tributação:

```text
cfop
icms_situacao_tributaria
icms_base_calculo
icms_aliquota
icms_valor
icms_modalidade_determinacao_bc
icms_percentual_reducao_bc
icms_st_...
ipi_...
pis_...
cofins_...
```

A aplicação deve tratar os campos tributários como configuração fiscal, não como valores arbitrários definidos pelo programador.

---

# 17. Estrutura recomendada de item

Exemplo conceitual:

```json
{
  "numero_item": 1,
  "codigo_produto": "PASTILHA123",
  "descricao": "PASTILHA DE FREIO DIANTEIRA",
  "codigo_ncm": "87083090",
  "cfop": "5202",
  "unidade_comercial": "UN",
  "quantidade_comercial": 1,
  "valor_unitario_comercial": 150.00,
  "valor_bruto": 150.00,
  "inclui_no_total": 1,
  "icms_origem": 0
}
```

**ATENÇÃO:** `cfop`, NCM e tributação do exemplo acima são apenas ilustrativos. Não usar automaticamente em produção.

---

# 18. Quantidade devolvida

A aplicação deve permitir devolver:

- todos os itens;
- apenas alguns itens;
- quantidade parcial de um item.

Exemplo:

NF original:

```text
Item 1 — Pastilha — quantidade 4
Item 2 — Amortecedor — quantidade 2
Item 3 — Bucha — quantidade 6
```

Usuário devolve:

```text
Item 1 — quantidade 2
Item 3 — quantidade 3
```

A NF de devolução terá:

```text
Pastilha — 2
Bucha — 3
```

Nunca enviar quantidade maior que a quantidade originalmente recebida sem uma regra fiscal específica que justifique a operação.

---

# 19. Percentual devolvido

A API possui o campo:

```text
percentual_devolvido
```

correspondente à tag `pDevol`.

Também possui:

```text
valor_ipi_devolvido
```

correspondente à tag `vIPIDevol`.

Esses campos devem ser usados quando aplicáveis à operação tributária.

---

# 20. Valores

Campos principais:

```text
valor_frete
valor_seguro
valor_desconto
valor_outras_despesas
valor_total
valor_produtos
```

Exemplo:

```json
{
  "valor_frete": 0,
  "valor_seguro": 0,
  "valor_desconto": 0,
  "valor_outras_despesas": 0,
  "valor_produtos": 300.00,
  "valor_total": 300.00
}
```

A aplicação deve calcular os valores a partir dos itens e validar:

```text
soma dos itens = valor_produtos
```

e:

```text
valor_total = valor_produtos
             + frete
             + seguro
             + outras despesas
             - descontos
             + tributos/valores aplicáveis
```

Não confiar somente no valor digitado pelo usuário.

---

# 21. Modalidade de frete

Campo:

```text
modalidade_frete
```

Valores:

```text
0 = Por conta do emitente
1 = Por conta do destinatário
2 = Por conta de terceiros
9 = Sem frete
```

Para uma devolução sem transporte/frete:

```json
"modalidade_frete": 9
```

Caso exista transporte, o valor deve refletir a operação real.

---

# 22. Informações adicionais

A aplicação deve possuir campo para observações fiscais.

Exemplo conceitual:

```text
DEVOLUÇÃO REFERENTE À NF-E Nº 12345, SÉRIE 1, CHAVE DE ACESSO ...
```

O texto exato deve ser definido conforme a operação e orientação fiscal.

A aplicação pode montar automaticamente:

```text
DEVOLUÇÃO REFERENTE À NF-e {numero}/{serie} - CHAVE {chave}
```

e permitir edição antes da emissão.

---

# 23. Payload de exemplo completo

O exemplo abaixo é apenas uma estrutura de desenvolvimento.

```json
{
  "natureza_operacao": "DEVOLUCAO DE MERCADORIA",
  "data_emissao": "2026-08-09T10:30:00-03:00",
  "data_entrada_saida": "2026-08-09T10:30:00-03:00",
  "tipo_documento": 1,
  "local_destino": 1,
  "finalidade_emissao": 4,
  "consumidor_final": 0,
  "presenca_comprador": 0,

  "cnpj_emitente": "00000000000000",
  "nome_emitente": "EMPRESA EMITENTE",
  "nome_fantasia_emitente": "EMPRESA",
  "logradouro_emitente": "RUA EXEMPLO",
  "numero_emitente": "100",
  "bairro_emitente": "CENTRO",
  "municipio_emitente": "MAFRA",
  "uf_emitente": "SC",
  "cep_emitente": "89300000",
  "inscricao_estadual_emitente": "000000000",
  "regime_tributario_emitente": 4,

  "nome_destinatario": "AUTOPECAS EXEMPLO LTDA",
  "cnpj_destinatario": "11111111111111",
  "inscricao_estadual_destinatario": "111111111",
  "indicador_inscricao_estadual_destinatario": 1,
  "logradouro_destinatario": "RUA EXEMPLO",
  "numero_destinatario": "200",
  "bairro_destinatario": "CENTRO",
  "municipio_destinatario": "MAFRA",
  "uf_destinatario": "SC",
  "cep_destinatario": "89300000",
  "pais_destinatario": "Brasil",

  "notas_referenciadas": [
    {
      "chave_nfe": "35123456789012345678550010000000011000000010"
    }
  ],

  "valor_frete": 0,
  "valor_seguro": 0,
  "valor_desconto": 0,
  "valor_outras_despesas": 0,
  "valor_produtos": 150.00,
  "valor_total": 150.00,
  "modalidade_frete": 9,

  "items": [
    {
      "numero_item": 1,
      "codigo_produto": "PASTILHA123",
      "descricao": "PASTILHA DE FREIO",
      "codigo_ncm": "87083090",
      "cfop": "5202",
      "unidade_comercial": "UN",
      "quantidade_comercial": 1,
      "valor_unitario_comercial": 150.00,
      "valor_bruto": 150.00,
      "inclui_no_total": 1,
      "icms_origem": 0
    }
  ],

  "informacoes_adicionais_contribuinte": "DEVOLUCAO REFERENTE A NF-E ORIGINAL."
}
```

---

# 24. Endpoint de emissão

```http
POST /v2/nfe?ref={referencia}
```

Headers:

```http
Accept: application/json
Content-Type: application/json
Authorization: Basic BASE64(token:)
```

Exemplo cURL:

```bash
curl -X POST \
  -u 'SEU_TOKEN:' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  'https://homologacao.focusnfe.com.br/v2/nfe?ref=DEV202608090001' \
  -d @nota.json
```

---

# 25. Respostas da emissão

## HTTP 201

NF-e autorizada em emissão síncrona.

O sistema deve:

```text
status = AUTORIZADA
```

Salvar:

- referência;
- chave de acesso;
- número;
- série;
- protocolo;
- XML;
- URL/caminho do DANFE;
- resposta completa da API;
- data/hora da autorização.

---

## HTTP 202

NF-e em processamento.

O sistema deve:

```text
status = PROCESSANDO
```

Não considerar a nota autorizada.

A aplicação deverá posteriormente:

```http
GET /v2/nfe/{referencia}
```

ou receber a atualização via webhook.

---

## HTTP 400

Erro de requisição.

Mostrar mensagem amigável e registrar o JSON de resposta para diagnóstico.

---

## HTTP 401

Não autorizado.

Possíveis causas:

- token incorreto;
- token inválido;
- autenticação montada incorretamente.

---

## HTTP 415

Content-Type incompatível.

Usar:

```http
Content-Type: application/json
```

---

## HTTP 422

A API entendeu a requisição, mas os dados são inválidos ou não podem ser processados.

Esse é um status importante para rejeições/validações.

O sistema deve mostrar:

```text
Código
Mensagem
Campo relacionado, quando informado
```

e manter a resposta original no banco.

---

# 26. Consulta de status

Endpoint:

```http
GET /v2/nfe/{referencia}
```

Exemplo:

```http
GET /v2/nfe/DEV202608090001
```

Para dados completos:

```http
GET /v2/nfe/DEV202608090001?completa=1
```

A resposta pode representar estados como:

```text
Processando autorização
Autorizada
Autorizada completa
Cancelada
Erro autorização
```

---

# 27. Regra de status interno

Criar enum no banco:

```text
RASCUNHO
VALIDANDO
ENVIANDO
PROCESSANDO
AUTORIZADA
REJEITADA
CANCELADA
ERRO
```

Mapeamento sugerido:

```text
criação                  -> RASCUNHO
validação local          -> VALIDANDO
requisição enviada       -> ENVIANDO
HTTP 202                 -> PROCESSANDO
autorizada               -> AUTORIZADA
erro de autorização      -> REJEITADA
cancelamento confirmado  -> CANCELADA
erro de comunicação      -> ERRO
```

---

# 28. Webhook

A Focus NFe oferece gatilhos/webhooks para evitar consultas repetitivas.

Endpoint para criar webhook:

```http
POST /v2/hooks
```

Estrutura conceitual:

```json
{
  "cnpj": "00000000000000",
  "event": "EVENTO",
  "url": "https://seusistema.com.br/api/webhooks/focusnfe",
  "authorization": "SEGREDO",
  "authorization_header": "X-Webhook-Authorization"
}
```

A aplicação deve ter uma rota pública:

```text
POST /api/webhooks/focusnfe
```

## Regras do webhook

O endpoint deve:

1. validar autenticação do webhook;
2. receber o JSON;
3. salvar o evento;
4. identificar a referência da nota;
5. atualizar o status;
6. salvar a resposta completa;
7. responder rapidamente;
8. ser idempotente.

Não executar tarefas demoradas antes de responder ao webhook.

---

# 29. Idempotência do webhook

Nunca assumir que um webhook será recebido apenas uma vez.

Criar tabela:

```text
webhook_events
```

com:

```text
id
event_id
event_type
reference
payload_json
received_at
processed_at
status
```

Criar índice único em:

```text
event_id
```

quando houver identificador único no evento.

---

# 30. Download do DANFE

Depois de autorizada, a aplicação deve apresentar ao usuário uma opção:

```text
[Visualizar DANFE]
[Baixar XML]
```

Não gerar um PDF próprio fingindo ser o DANFE fiscal.

Usar o documento disponibilizado pela Focus NFe.

A consulta da NF-e retorna caminhos para XML e DANFE quando disponíveis.

---

# 31. Armazenamento local

Mesmo utilizando a Focus NFe, o sistema deve manter um histórico local.

Tabela:

```sql
notas_fiscais
```

Sugestão:

```text
id
empresa_id
tipo
finalidade
ref
status
numero
serie
chave_acesso
protocolo
natureza_operacao
chave_nfe_original
cnpj_destinatario
valor_produtos
valor_total
payload_json
response_json
xml_url
danfe_url
mensagem_erro
created_at
updated_at
authorized_at
cancelled_at
```

---

# 32. Tabela de itens

```sql
notas_fiscais_itens
```

Campos:

```text
id
nota_fiscal_id
numero_item
codigo_produto
descricao
ncm
cfop
unidade
quantidade_original
quantidade_devolvida
valor_unitario
valor_bruto
valor_desconto
valor_total
icms_origem
tributacao_json
created_at
```

A coluna `quantidade_original` é importante para validar devoluções parciais.

---

# 33. Tabela da NF-e original

Sugestão:

```sql
notas_originais
```

Campos:

```text
id
chave_acesso
numero
serie
data_emissao
cnpj_emitente
nome_emitente
uf_emitente
valor_total
xml_local
dados_json
created_at
updated_at
```

---

# 34. Cadastro de produtos

Sugestão:

```sql
produtos
```

Campos:

```text
id
codigo
codigo_barras
descricao
ncm
unidade
cfop_padrao
origem
tributacao_json
created_at
updated_at
```

Não colocar CFOP/tributação como uma regra universal se o mesmo produto puder ter tratamentos diferentes em operações diferentes.

---

# 35. Modelo de banco recomendado

```text
empresas
    |
    +---- notas_fiscais
              |
              +---- notas_fiscais_itens
              |
              +---- webhook_events

notas_originais
    |
    +---- notas_originais_itens

produtos
```

Relacionamento:

```text
empresa 1 ---- N notas_fiscais
nota    1 ---- N itens
nota    N ---- 1 nota_original
produto 1 ---- N itens
```

---

# 36. Tela "Nova devolução"

A tela deve possuir:

## Dados da nota original

```text
Chave de acesso da NF-e:
[________________________________________]

[Consultar NF-e]
```

Depois da consulta:

```text
Fornecedor:
CNPJ:
IE:
Número:
Série:
Data:
Valor:
```

## Produtos

Tabela:

```text
[ ] Código | Produto | NCM | Qtd original | Qtd devolvida | Valor
```

Exemplo:

```text
[x] 123 | Pastilha de freio | 87083090 | 4 | [2] | R$ 300,00
[ ] 456 | Amortecedor         | 87088000 | 2 | [0] | R$ 800,00
```

## Dados fiscais

```text
Natureza da operação
CFOP
Finalidade
Local destino
Modalidade frete
Observações
```

Os campos fiscais devem ser revisados antes da emissão.

## Resumo

```text
Produtos: R$ 300,00
Descontos: R$ 0,00
Frete: R$ 0,00
Outras despesas: R$ 0,00
TOTAL: R$ 300,00
```

Botão:

```text
[ Emitir NF-e de devolução ]
```

---

# 37. Tela de acompanhamento

Depois de enviar:

```text
NF-e de devolução

Referência: DEV202608090001
Status: PROCESSANDO

Número: -
Série: -
Chave: -

[Atualizar status]
```

Quando autorizada:

```text
Status: AUTORIZADA

Número: 123
Série: 1
Chave: 42xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Protocolo: xxxxxxxxxxxxx

[Visualizar DANFE]
[Baixar XML]
```

---

# 38. Tela de erro/rejeição

Exibir:

```text
Status: REJEITADA

Mensagem da SEFAZ:
[texto]

Código:
[xxx]

[Corrigir dados]
[Reenviar]
```

Não esconder a mensagem original.

Também mostrar ao usuário que uma rejeição não significa necessariamente que uma nova nota foi criada.

---

# 39. Reenvio

Quando a nota for rejeitada e ainda não autorizada:

```text
corrigir dados
     |
     v
mesma ref
     |
     v
POST /v2/nfe?ref=...
```

Não criar uma nova `ref` a cada tentativa de correção da mesma emissão, desde que a referência ainda esteja reutilizável conforme as regras da API.

---

# 40. Cancelamento

Endpoint:

```http
DELETE /v2/nfe/{referencia}
```

Body:

```json
{
  "justificativa": "Cancelamento por erro de emissão."
}
```

A justificativa deve possuir entre 15 e 255 caracteres.

A Focus NFe informa que a NF-e pode ser cancelada em até 24 horas após a emissão, embora alguns estados possam permitir prazo maior.

A aplicação deve tratar o prazo como regra fiscal e não permitir que o usuário pense que qualquer nota poderá ser cancelada a qualquer momento.

---

# 41. Carta de correção

Endpoint:

```http
POST /v2/nfe/{referencia}/carta_correcao
```

Body:

```json
{
  "correcao": "Texto da correção",
  "data_evento": "2026-08-09T10:30:00-03:00"
}
```

A CC-e não deve ser usada para corrigir:

- variáveis que determinam o valor do imposto;
- dados cadastrais que alterem remetente/destinatário;
- data de emissão;
- data de saída.

Não incluir esse recurso no fluxo normal da devolução; ele deve ser um módulo separado.

---

# 42. Validações obrigatórias antes da emissão

O backend deve validar:

## Empresa

```text
CNPJ válido
empresa habilitada
token configurado
certificado configurado
certificado válido
```

## Destinatário

```text
CNPJ válido
UF válida
município válido
IE/indicador de IE coerente
```

## NF-e original

```text
chave com 44 dígitos
NF-e encontrada
emitente original identificado
itens disponíveis
```

## Itens

```text
quantidade > 0
quantidade devolvida <= quantidade permitida
NCM informado
unidade informada
valor >= 0
CFOP definido conforme operação
tributação definida
```

## Totais

```text
soma dos itens correta
valor_produtos correto
valor_total correto
```

## Devolução

```text
finalidade_emissao = 4
NF-e original referenciada
```

---

# 43. Validação da chave de acesso

A chave de NF-e possui 44 dígitos.

Criar validação:

```php
function validarChaveNfe(string $chave): bool
{
    return preg_match('/^\d{44}$/', $chave) === 1;
}
```

Opcionalmente implementar também a validação do dígito verificador da chave.

---

# 44. Validação de CNPJ

Nunca confiar somente na máscara.

Criar função:

```php
function validarCnpj(string $cnpj): bool
{
    $cnpj = preg_replace('/\D/', '', $cnpj);

    if (strlen($cnpj) !== 14) {
        return false;
    }

    // Implementar cálculo oficial dos dígitos verificadores.
}
```

---

# 45. Cliente HTTP PHP

Preferir Guzzle ou cURL.

Exemplo com cURL:

```php
function focusRequest(
    string $method,
    string $url,
    string $token,
    ?array $body = null
): array {
    $ch = curl_init($url);

    $headers = [
        'Accept: application/json',
        'Content-Type: application/json'
    ];

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_USERPWD => $token . ':',
        CURLOPT_TIMEOUT => 60,
        CURLOPT_CONNECTTIMEOUT => 15,
    ]);

    if ($body !== null) {
        curl_setopt(
            $ch,
            CURLOPT_POSTFIELDS,
            json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
        );
    }

    $responseBody = curl_exec($ch);
    $statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);

    curl_close($ch);

    return [
        'http_status' => $statusCode,
        'body' => $responseBody,
        'curl_error' => $curlError
    ];
}
```

---

# 46. Configuração da API

Exemplo:

```php
return [
    'environment' => getenv('FOCUS_ENV') ?: 'homologacao',

    'base_urls' => [
        'homologacao' => 'https://homologacao.focusnfe.com.br',
        'producao' => 'https://api.focusnfe.com.br',
    ],

    'token' => getenv('FOCUS_TOKEN'),
];
```

Nunca colocar:

```php
'token' => 'TOKEN_REAL_AQUI'
```

no Git.

---

# 47. Serviço de emissão

Criar uma classe:

```text
FocusNfeClient
```

Métodos:

```text
emitirNfe()
consultarNfe()
cancelarNfe()
cartaCorrecao()
consultarNfeRecebida()
importarNfe()
criarWebhook()
```

Separar da regra fiscal.

Arquitetura:

```text
Controller
    |
    v
Service fiscal
    |
    +---- FocusNfeClient
    |
    +---- ValidadorNfe
    |
    +---- RepositorioNfe
```

---

# 48. Nunca colocar regra fiscal dentro do controller

Evitar:

```php
if ($_POST['cfop'] == '5202') {
   ...
}
```

no controller.

Preferir:

```text
DevolucaoService
    |
    +-- valida operação
    +-- calcula itens
    +-- monta payload
    +-- chama Focus
```

---

# 49. DTO sugerido

Criar:

```text
DevolucaoNfeDTO
```

Com:

```text
empresa
notaOriginal
destinatario
itens
naturezaOperacao
cfop
modalidadeFrete
observacoes
```

E:

```text
NfePayloadBuilder
```

para transformar o DTO em JSON da Focus NFe.

---

# 50. Exemplo de fluxo backend

```php
public function emitirDevolucao(int $devolucaoId): array
{
    $devolucao = $this->repository->find($devolucaoId);

    $this->validator->validate($devolucao);

    $payload = $this->payloadBuilder->build($devolucao);

    $ref = $devolucao->focusRef;

    $response = $this->focus->emitirNfe($ref, $payload);

    $this->repository->saveApiResponse(
        $devolucaoId,
        $response
    );

    if ($response['http_status'] === 201) {
        $this->repository->markAuthorized(
            $devolucaoId,
            $response
        );
    } elseif ($response['http_status'] === 202) {
        $this->repository->markProcessing($devolucaoId);
    } else {
        $this->repository->markRejected(
            $devolucaoId,
            $response
        );
    }

    return $response;
}
```

---

# 51. Logs

Criar log fiscal/auditoria:

```text
focus_api_logs
```

Campos:

```text
id
nota_fiscal_id
method
endpoint
http_status
request_body
response_body
created_at
```

## Segurança dos logs

Não registrar:

- token;
- senha do certificado;
- certificado PFX/P12;
- credenciais;
- dados secretos desnecessários.

Se o payload tiver informações pessoais, manter acesso restrito.

---

# 52. Proteção contra emissão duplicada

Este é um dos pontos mais importantes.

Antes de emitir:

```sql
SELECT *
FROM notas_fiscais
WHERE id = ?
FOR UPDATE;
```

Verificar:

```text
status != AUTORIZADA
```

Gerar uma `ref` única e persisti-la antes de chamar a API.

Criar índice único:

```sql
UNIQUE(ref)
```

Também bloquear dois cliques simultâneos no frontend.

Botão:

```text
Emitindo...
```

deve ficar desabilitado após o primeiro envio.

---

# 53. Regra de segurança contra dupla emissão

Nunca fazer:

```text
usuário clica
POST
usuário clica novamente
POST
```

sem controle.

Fluxo:

```text
RASCUNHO
   |
   v
CRIAR ref
   |
   v
LOCK
   |
   v
ENVIAR
   |
   v
PROCESSANDO
```

Se a requisição HTTP sofrer timeout depois de chegar na Focus NFe, NÃO assumir automaticamente que a emissão falhou.

Primeiro:

```text
GET /v2/nfe/{ref}
```

para verificar o estado.

---

# 54. Timeout

Cenário:

```text
Aplicação -> Focus
           |
           X timeout
```

Não criar outra NF-e imediatamente.

Fazer:

```text
consulta por ref
```

Se:

```text
AUTORIZADA
```

salvar autorização.

Se:

```text
PROCESSANDO
```

aguardar.

Se:

```text
ERRO
```

analisar erro.

---

# 55. Interface recomendada

Menu:

```text
Fiscal
 ├── NF-e de devolução
 │    ├── Nova devolução
 │    ├── Em processamento
 │    ├── Autorizadas
 │    ├── Rejeitadas
 │    └── Canceladas
 │
 ├── NF-e recebidas
 ├── Configuração fiscal
 └── Logs de integração
```

---

# 56. Dashboard fiscal

Mostrar:

```text
NF-e emitidas hoje
NF-e processando
NF-e autorizadas
NF-e rejeitadas
NF-e canceladas
```

Exemplo:

```text
Hoje

Autorizadas       5
Processando       1
Rejeitadas        2
Canceladas        0
```

---

# 57. Busca de NF-e original

A busca deve aceitar:

```text
chave de acesso
número
CNPJ fornecedor
data
```

Mas a chave de acesso deve ser a principal forma de identificação para uma devolução.

---

# 58. Importação de XML pelo usuário

Tela:

```text
[Selecionar XML da NF-e]
```

Após upload:

```text
Arquivo válido
Chave: ...
Emitente: ...
Número: ...
Série: ...
Valor: ...
Itens: ...
```

Depois:

```text
[Usar esta NF-e para devolução]
```

---

# 59. Regras de UX

Antes de emitir:

```text
CONFIRMAÇÃO DE EMISSÃO

Você está prestes a emitir uma NF-e de devolução.

Fornecedor:
AUTOPEÇAS EXEMPLO

NF-e original:
12345 / Série 1

Valor da devolução:
R$ 300,00

Itens:
2

[Cancelar]
[Emitir NF-e]
```

Depois do clique:

```text
Emitindo NF-e...
Não feche esta página.
```

---

# 60. Não permitir edição livre de campos críticos após validação

Campos que exigem atenção:

```text
CNPJ emitente
CNPJ destinatário
chave NF-e original
NCM
CFOP
CST/CSOSN
quantidade
valor
finalidade
```

Se forem alterados, executar novamente a validação.

---

# 61. CFOP

A aplicação deve permitir configurar CFOP.

Não codificar um único CFOP para todas as devoluções.

O CFOP depende, entre outras coisas, de:

```text
origem/destino
tipo de operação
mercadoria
situação fiscal
operação dentro/fora do estado
```

Para desenvolvimento, criar tabela:

```sql
cfops
```

com:

```text
codigo
descricao
ativo
```

E permitir ao responsável fiscal selecionar/configurar o CFOP correto.

---

# 62. Tributação

Criar uma estrutura flexível:

```text
tributacao_json
```

porque uma NF-e pode envolver grupos tributários diferentes.

Exemplo:

```json
{
  "icms": {},
  "ipi": {},
  "pis": {},
  "cofins": {}
}
```

Não assumir que toda devolução terá a mesma estrutura tributária.

---

# 63. MEI

Se o emitente for MEI, a aplicação deve carregar o regime tributário correspondente ao cadastro da Focus NFe.

A documentação da API de Empresas possui:

```text
4 = Simples Nacional - MEI
```

Além disso, a documentação dos campos da NF-e informa que o campo de origem da mercadoria não é obrigatório para emitentes pertencentes ao MEI.

Mesmo assim, os demais campos fiscais devem ser preenchidos conforme a operação e as regras aplicáveis.

---

# 64. Arquitetura final recomendada

```text
Frontend
    |
    v
API interna do sistema
    |
    +----------------------+
    |                      |
    v                      v
MySQL                  FocusNfeClient
                           |
                           v
                      Focus NFe API
                           |
                           v
                         SEFAZ
```

Módulos:

```text
/auth
/empresas
/produtos
/notas-recebidas
/devolucoes
/fiscal
/webhooks
/logs
```

---

# 65. Endpoints internos da aplicação

Sugestão:

```http
GET  /api/fiscal/config
POST /api/fiscal/config

POST /api/nfe-recebidas/consultar
POST /api/nfe-recebidas/importar

POST /api/devolucoes
GET  /api/devolucoes/{id}
PUT  /api/devolucoes/{id}

POST /api/devolucoes/{id}/validar
POST /api/devolucoes/{id}/emitir
GET  /api/devolucoes/{id}/status

POST /api/nfe/{id}/cancelar
POST /api/nfe/{id}/carta-correcao

POST /api/webhooks/focusnfe
```

---

# 66. Fluxo recomendado para o editor de código implementar

## Etapa 1 — Configuração

Implementar:

```text
FOCUS_ENV
FOCUS_TOKEN
```

e cadastro da empresa.

## Etapa 2 — Cliente HTTP

Implementar:

```text
FocusNfeClient
```

com:

```text
request()
emitirNfe()
consultarNfe()
consultarNfeRecebida()
importarNfe()
cancelarNfe()
cartaCorrecao()
```

## Etapa 3 — NF-e original

Implementar:

```text
consultar por chave
```

e:

```text
importar XML
```

## Etapa 4 — Devolução

Implementar:

```text
criar rascunho
selecionar itens
calcular valores
validar
montar payload
```

## Etapa 5 — Emissão

Implementar:

```text
POST /v2/nfe
```

## Etapa 6 — Status

Implementar:

```text
GET /v2/nfe/{ref}
```

## Etapa 7 — Webhook

Implementar:

```text
POST /api/webhooks/focusnfe
```

## Etapa 8 — Documentos

Implementar:

```text
XML
DANFE
```

## Etapa 9 — Cancelamento

Implementar:

```text
DELETE /v2/nfe/{ref}
```

---

# 67. Checklist antes de produção

## Focus NFe

- [ ] Conta criada
- [ ] Empresa cadastrada
- [ ] CNPJ correto
- [ ] Regime tributário correto
- [ ] NF-e habilitada
- [ ] Certificado configurado
- [ ] Certificado válido
- [ ] Token de produção configurado

## Sistema

- [ ] Token fora do frontend
- [ ] HTTPS ativo
- [ ] Banco com backup
- [ ] Logs funcionando
- [ ] Controle contra duplicidade
- [ ] Webhook protegido
- [ ] XML armazenado
- [ ] Resposta da API armazenada
- [ ] Status atualizado
- [ ] Tratamento de timeout
- [ ] Tratamento de 400/401/415/422
- [ ] Tela de rejeição
- [ ] Tela de autorização
- [ ] Download do DANFE
- [ ] Download do XML

## Fiscal

- [ ] CFOP validado
- [ ] NCM validado
- [ ] Tributação validada
- [ ] Natureza da operação validada
- [ ] Dados do fornecedor conferidos
- [ ] Chave da NF-e original conferida
- [ ] Quantidades conferidas
- [ ] Valores conferidos

---

# 68. Testes obrigatórios em homologação

Criar testes para:

### Teste 1
NF-e de devolução com um produto.

### Teste 2
NF-e com vários produtos.

### Teste 3
Devolução parcial.

### Teste 4
Devolução total.

### Teste 5
NF-e original inválida.

### Teste 6
Chave com quantidade errada de dígitos.

### Teste 7
CNPJ inválido.

### Teste 8
Produto sem NCM.

### Teste 9
Erro fiscal retornado pela API.

### Teste 10
Timeout da API.

### Teste 11
Clique duplo no botão emitir.

### Teste 12
Webhook duplicado.

### Teste 13
Consulta de nota em processamento.

### Teste 14
Nota autorizada.

### Teste 15
Cancelamento de nota autorizada.

---

# 69. Critérios de aceite

A aplicação estará pronta quando:

1. O usuário conseguir localizar uma NF-e original.
2. O sistema conseguir carregar seus dados.
3. O usuário conseguir selecionar os produtos devolvidos.
4. O sistema calcular corretamente os totais.
5. A chave original for referenciada.
6. A finalidade for configurada como devolução.
7. O backend enviar JSON válido para a Focus NFe.
8. O sistema tratar 201 e 202 corretamente.
9. O sistema consultar notas em processamento.
10. O sistema receber webhook.
11. O sistema mostrar rejeições.
12. O sistema permitir correção e reenvio quando permitido.
13. O sistema impedir emissão duplicada.
14. O sistema armazenar XML/resposta/status.
15. O usuário conseguir visualizar/baixar o DANFE.
16. O sistema funcionar em homologação antes de produção.

---

# 70. Fontes oficiais

Documentação geral:

```text
https://doc.focusnfe.com.br/reference/introducao
```

Ambiente:

```text
https://doc.focusnfe.com.br/reference/ambiente
```

Autenticação:

```text
https://doc.focusnfe.com.br/reference/autenticacao
```

Referência (`ref`):

```text
https://doc.focusnfe.com.br/reference/referencia
```

NF-e:

```text
https://doc.focusnfe.com.br/reference/nfe
```

Emitir NF-e:

```text
https://doc.focusnfe.com.br/reference/emitir_nfe
```

Consultar NF-e:

```text
https://doc.focusnfe.com.br/reference/consultar_nfe
```

NF-e recebidas:

```text
https://doc.focusnfe.com.br/reference/nfe-recebidas
```

Consultar NF-e recebida:

```text
https://doc.focusnfe.com.br/reference/consultar_nfe_recebida_individual
```

Importar NF-e:

```text
https://doc.focusnfe.com.br/reference/importar_nfe
```

Empresas:

```text
https://doc.focusnfe.com.br/reference/empresas
```

Criar empresa:

```text
https://doc.focusnfe.com.br/reference/criar_empresa
```

Webhooks:

```text
https://doc.focusnfe.com.br/reference/criar_webhook
```

Cancelar NF-e:

```text
https://doc.focusnfe.com.br/reference/cancelar_nfe
```

Carta de correção:

```text
https://doc.focusnfe.com.br/reference/emitir_carta_correcao
```

Campos completos da NF-e:

```text
https://campos.focusnfe.com.br/nfe/NotaFiscalXML.html
```

Campos dos itens:

```text
https://campos.focusnfe.com.br/nfe/ItemNotaFiscalXML.html
```

---

# 71. Observação fiscal importante

A API Focus NFe é a camada técnica de integração. Ela não deve ser tratada pelo sistema como responsável por decidir a operação fiscal da empresa.

O sistema deve:

```text
receber a regra fiscal
        |
        v
validar os dados
        |
        v
transformar em JSON
        |
        v
enviar para Focus NFe
        |
        v
SEFAZ
```

O programador não deve inventar:

```text
CFOP
CST
CSOSN
NCM
alíquotas
bases de cálculo
valores de ICMS
valores de IPI
```

Esses dados devem ser definidos para a operação real.

---

# 72. Resumo técnico para o editor

Implementar uma aplicação web com:

```text
BACKEND
PHP
MySQL
REST

INTEGRAÇÃO
Focus NFe API v2

AUTENTICAÇÃO
HTTP Basic
token como username
senha vazia

HOMOLOGAÇÃO
https://homologacao.focusnfe.com.br

PRODUÇÃO
https://api.focusnfe.com.br

EMISSÃO
POST /v2/nfe?ref={ref}

CONSULTA
GET /v2/nfe/{ref}

NF-e RECEBIDA
GET /v2/nfes_recebidas/{chave}

IMPORTAÇÃO XML
POST /v2/nfe/importacao

CANCELAMENTO
DELETE /v2/nfe/{ref}

CARTA DE CORREÇÃO
POST /v2/nfe/{ref}/carta_correcao

WEBHOOK
POST /v2/hooks

DEVOLUÇÃO
finalidade_emissao = 4

REFERÊNCIA
ref única por emissão

STATUS PRINCIPAIS
PROCESSANDO
AUTORIZADA
REJEITADA
CANCELADA
```

## Regra principal de desenvolvimento

A aplicação deve separar:

```text
1. Dados da empresa
2. Dados da NF-e original
3. Regra fiscal da devolução
4. Montagem do payload
5. Integração com Focus NFe
6. Processamento do retorno
7. Armazenamento
8. Interface do usuário
```

Isso permitirá alterar a integração com a Focus NFe no futuro sem reescrever toda a aplicação.
