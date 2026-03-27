# Yolo Coliving — Cadastro de Pessoas

Sistema de gestão de pessoas para o ecossistema Yolo Coliving. O frontend é uma SPA React/Tailwind e o backend é 100% serverless, baseado em **funções AWS Lambda** (Python/boto3) com **Amazon DynamoDB** como banco de dados, exposto via **API Gateway**.

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                        │
│  src/App.tsx  →  axios  →  VITE_API_URL (API Gateway)          │
└────────────────────────────────┬────────────────────────────────┘
                                 │ HTTPS
                    ┌────────────▼────────────┐
                    │      API Gateway        │
                    │  (AWS, us-east-1)       │
                    └────────────┬────────────┘
                                 │ Invoke
              ┌──────────────────┼──────────────────┐
              │                                     │
   ┌──────────▼──────────┐             ┌────────────▼────────────┐
   │  lambda_function.py │             │   import_lambda.py      │
   │  CRUD de Pessoas    │             │   Importação Inicial    │
   └──────────┬──────────┘             └────────────┬────────────┘
              │                                     │
              └─────────────────┬───────────────────┘
                                │ boto3
                   ┌────────────▼────────────┐
                   │   Amazon DynamoDB       │
                   │   Tabela: YoloPeople    │
                   │   GSI: EmailIndex       │
                   │   GSI: TipoIndex        │
                   └─────────────────────────┘
```

---

## Estrutura do Repositório

```text
case_yolo/
├── backend/
│   ├── lambda_function.py   # Lambda principal: CRUD de pessoas (boto3)
│   ├── import_lambda.py     # Lambda de importação da API externa
│   └── serverless.yml       # Infraestrutura como código (Serverless Framework)
├── scripts/
│   └── create_table.py      # Script auxiliar para criar a tabela DynamoDB
├── src/
│   ├── App.tsx              # Frontend React — consome as Lambdas via API Gateway
│   ├── types.ts             # Tipos TypeScript compartilhados
│   ├── main.tsx             # Ponto de entrada React
│   └── index.css            # Estilos Tailwind
├── server.ts                # Servidor de desenvolvimento local (apenas frontend)
├── .env.example             # Variáveis de ambiente necessárias
└── package.json
```

---

## Endpoints da API (Lambda + API Gateway)

| Método   | Rota              | Descrição                                                      |
|----------|-------------------|----------------------------------------------------------------|
| `GET`    | `/people`         | Lista todas as pessoas (suporta `?tipo=` e `?search=`)         |
| `GET`    | `/people/{id}`    | Retorna uma pessoa pelo ID                                     |
| `POST`   | `/people`         | Cria uma nova pessoa                                           |
| `PUT`    | `/people/{id}`    | Atualiza os dados de uma pessoa                                |
| `DELETE` | `/people/{id}`    | Remove uma pessoa                                              |
| `POST`   | `/import`         | Importa dados da API externa para o DynamoDB                   |

---

## Deploy do Backend (AWS Lambda)

### Pré-requisitos

- Node.js e [Serverless Framework](https://www.serverless.com/) instalados:
  ```bash
  npm install -g serverless
  ```
- AWS CLI configurado com credenciais:
  ```bash
  aws configure
  ```

### Passos

```bash
# 1. Acesse a pasta do backend
cd backend/

# 2. Instale as dependências Python da Lambda localmente
pip install requests -t .

# 3. Faça o deploy (cria as Lambdas, API Gateway e tabela DynamoDB automaticamente)
serverless deploy

# 4. Anote a URL do API Gateway exibida no output, ex:
#    https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/dev
```

---

## Configuração do Frontend

Após o deploy, configure a variável de ambiente no frontend:

```bash
# Na raiz do projeto, crie o arquivo .env a partir do exemplo
cp .env.example .env

# Edite o .env e defina a URL do API Gateway:
VITE_API_URL=https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/dev
```

---

## Desenvolvimento Local

```bash
# Instale as dependências
npm install

# Inicie o servidor de desenvolvimento (apenas frontend)
npm run dev
```

> **Nota:** Em desenvolvimento local, o `server.ts` serve apenas o frontend via Vite com HMR. Todas as chamadas de dados são feitas diretamente para o API Gateway da AWS (definido em `VITE_API_URL`). Não há servidor Express intermediário para as rotas de dados.

---

## Criação Manual da Tabela DynamoDB

Se preferir criar a tabela manualmente sem o Serverless Framework:

```bash
# Instale as dependências Python
pip install boto3 python-dotenv

# Configure as credenciais no .env e execute
npm run create-table-py
```

---

## Schema do Item no DynamoDB

| Campo          | Tipo     | Obrigatório | Descrição                                      |
|----------------|----------|-------------|------------------------------------------------|
| `id`           | `String` | Sim (PK)    | UUID gerado automaticamente pela Lambda        |
| `nome`         | `String` | Sim         | Nome completo                                  |
| `email`        | `String` | Sim (GSI)   | E-mail único (índice EmailIndex)               |
| `telefone`     | `String` | Não         | Apenas dígitos, máx. 11 caracteres             |
| `tipo`         | `String` | Sim (GSI)   | Hóspede / Proprietário / Operador / Fornecedor |
| `dataCadastro` | `String` | Sim         | Data de criação (YYYY-MM-DD)                   |
| `avatarUrl`    | `String` | Não         | URL ou base64 da foto                          |
| `cep`          | `String` | Não         | CEP do endereço                                |
| `endereco`     | `String` | Não         | Endereço completo (preenchido via ViaCEP)      |

---

## Decisões Arquiteturais

**DynamoDB (Partition Key: `id`):** O `id` é um UUID v4 gerado pela Lambda no momento da criação, garantindo unicidade global sem colisões.

**Global Secondary Indexes (GSI):**
- `EmailIndex`: Garante unicidade de e-mail e permite buscas rápidas por e-mail sem scan completo.
- `TipoIndex`: Permite filtragem eficiente por tipo de pessoa (Hóspede, Proprietário, etc.).

**Python nas Lambdas:** Escolhido pela simplicidade e excelente suporte nativo do `boto3` para operações no DynamoDB, sem necessidade de dependências extras para as operações CRUD.

**Separação frontend/backend:** O frontend React consome a API diretamente via `VITE_API_URL`, sem servidor intermediário. O `server.ts` existe apenas para servir o frontend em desenvolvimento local.

---

## Exemplo de Payload

### Criar Pessoa (POST /people)
```json
{
  "nome": "André Meira",
  "telefone": "81988887777",
  "email": "andre.meira@yolo.com",
  "tipo": "Hóspede",
  "cep": "50030-230",
  "endereco": "Rua do Bom Jesus, Recife - PE"
}
```

### Resposta (201 Created)
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "nome": "André Meira",
  "telefone": "81988887777",
  "email": "andre.meira@yolo.com",
  "tipo": "Hóspede",
  "cep": "50030-230",
  "endereco": "Rua do Bom Jesus, Recife - PE",
  "dataCadastro": "2026-03-27"
}
```
