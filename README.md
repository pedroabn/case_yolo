# Yolo Coliving — Cadastro de Pessoas

Sistema de gestão de pessoas para o ecossistema Yolo Coliving. O frontend é uma SPA React/Tailwind e o backend é 100% serverless, baseado em **funções AWS Lambda** (Python/boto3) com **Amazon DynamoDB** como banco de dados, exposto via **API Gateway** e comunicação assíncrona via **EventBridge**.

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Frontend (React/Vite)                         │
│  src/App.tsx  →  axios  →  VITE_API_URL (API Gateway /dev/api/...)      │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ HTTPS
                      ┌────────────▼────────────┐
                      │      API Gateway         │
                      │  (AWS, us-east-2)        │
                      └────────────┬────────────┘
                                   │ Invoke
          ┌────────────────────────┼──────────────────────────┐
          │                        │                          │
┌─────────▼──────────┐  ┌──────────▼──────────┐  ┌──────────▼──────────┐
│  reader_lambda.py  │  │ publisher_lambda.py  │  │  health_lambda.py   │
│  GET /people       │  │ POST/PUT/DELETE       │  │  GET /health        │
│  GET /people/{id}  │  │ POST /import          │  └─────────────────────┘
│                    │  │                       │
│  Auto-importa se   │  │  Publica no           │
│  tabela vazia      │  │  EventBridge (202)    │
└────────┬───────────┘  └──────────┬────────────┘
         │                         │
         │              ┌──────────▼────────────┐
         │              │      EventBridge Bus   │
         │              │  (yolo-api-bus)        │
         │              └──────────┬────────────┘
         │                         │ Trigger (async)
         │              ┌──────────▼────────────┐
         │              │    crud_lambda.py      │
         │              │  person.created        │
         │              │  person.updated        │
         │              │  person.deleted        │
         │              │  people.imported       │
         └──────────────┴──────────┬────────────┘
                                   │ boto3
                      ┌────────────▼────────────┐
                      │     Amazon DynamoDB      │
                      │  Tabela: case_yolo        │
                      │  GSI: EmailIndex         │
                      │  GSI: TipoIndex          │
                      └──────────────────────────┘
```

### Fluxo de escrita (event-driven)

1. Frontend chama `POST /api/people` → `publisher_lambda` valida, gera UUID e dataCadastro, publica evento `person.created` no EventBridge e retorna **202**.
2. EventBridge aciona `crud_lambda` de forma assíncrona, que persiste no DynamoDB.
3. Frontend aguarda ~2 segundos e re-fetcha os dados para confirmar.

Em desenvolvimento local com `LOCAL_SYNC=true`, o `publisher_lambda` chama o `crud_lambda` diretamente (síncrono), retornando 200/201.

---

## Estrutura do Repositório

```text
case_yolo/
├── backend/
│   ├── __init__.py
│   ├── reader_lambda.py     # GET /people e /people/{id} — auto-importa se tabela vazia
│   ├── publisher_lambda.py  # POST/PUT/DELETE — publica eventos no EventBridge
│   ├── crud_lambda.py       # Acionado pelo EventBridge — escreve no DynamoDB
│   ├── import_lambda.py     # Importa clientes da API externa Yolo
│   ├── health_lambda.py     # GET /health — checa DynamoDB, EventBridge e API externa
│   ├── handler.py           # Handler legado (não usado no deploy atual)
│   ├── lambda_function.py   # Lambda legada (não usada no deploy atual)
│   └── requirements.txt     # boto3==1.42.70, python-dotenv>=1.0.0
├── src/
│   ├── App.tsx              # SPA React — CRUD completo, busca, filtro, importação
│   ├── types.ts             # Tipos TypeScript: Person, PersonType, PERSON_TYPES
│   ├── main.tsx             # Ponto de entrada React (StrictMode)
│   └── index.css            # Tailwind v4 com tema customizado (--color-primary)
├── serverless.yml           # IaC: 4 Lambdas + DynamoDB + EventBridge + API Gateway
├── docker-compose.yml       # Serviços: frontend (dev), backend (deploy), frontend-deploy (S3)
├── dockerfile.frontend      # Node 20 Alpine — build Vite + serve preview
├── dockerfile.backend       # Python 3.11 slim — Serverless Framework deploy
├── vite.config.ts           # Vite + React + Tailwind — sem proxy (direto ao API GW)
├── tsconfig.json
├── package.json
└── .gitignore
```

---

## Endpoints da API

| Método   | Rota                  | Lambda            | Descrição                                       |
|----------|-----------------------|-------------------|-------------------------------------------------|
| `GET`    | `/api/people`         | reader_lambda     | Lista pessoas (aceita `?tipo=` e `?search=`)    |
| `GET`    | `/api/people/{id}`    | reader_lambda     | Retorna uma pessoa pelo ID                      |
| `POST`   | `/api/people`         | publisher_lambda  | Cria pessoa → EventBridge → crud_lambda         |
| `PUT`    | `/api/people/{id}`    | publisher_lambda  | Atualiza pessoa → EventBridge → crud_lambda     |
| `DELETE` | `/api/people/{id}`    | publisher_lambda  | Remove pessoa → EventBridge → crud_lambda       |
| `POST`   | `/api/import`         | publisher_lambda  | Importa base externa → EventBridge → crud_lambda|
| `GET`    | `/api/health`         | health_lambda     | Checa DynamoDB, EventBridge e API externa       |

Respostas de escrita retornam **202** em produção. Em `LOCAL_SYNC=true`, retornam **200/201**.

---

## Variáveis de Ambiente

| Variável             | Onde                  | Valor padrão/exemplo                                          |
|----------------------|-----------------------|---------------------------------------------------------------|
| `DYNAMODB_TABLE_NAME`| Lambda (serverless)   | `case_yolo`                                                   |
| `EVENT_BUS_NAME`     | Lambda (serverless)   | `yolo-api-bus`                                                |
| `API_YOLO`           | Lambda (serverless)   | `https://3ji5haxzr9.execute-api.us-east-1.amazonaws.com/...` |
| `LOCAL_SYNC`         | Lambda (serverless)   | `false` (use `true` para dev local síncrono)                  |
| `VITE_API_URL`       | Frontend (.env)       | `https://xxx.execute-api.us-east-2.amazonaws.com/dev/api`     |

---

## Deploy do Backend (AWS Lambda)

### Pré-requisitos

```bash
# Serverless Framework v4
npm install -g serverless

# AWS CLI configurado
aws configure
```

### Passos

```bash
# Via Docker (recomendado — isola dependências)
docker compose --profile deploy up backend

# Ou diretamente
cd /  # raiz do projeto
serverless deploy
```

O deploy cria automaticamente:
- 4 funções Lambda (reader, publisher, crud, health)
- API Gateway com as rotas `/api/...`
- Tabela DynamoDB `case_yolo` com GSIs `EmailIndex` e `TipoIndex`
- EventBridge bus `yolo-api-bus`
- Roles IAM com permissões mínimas

---

## Configuração do Frontend

```bash
cp .env.example .env
# Edite VITE_API_URL com a URL do API Gateway exibida no output do deploy:
# VITE_API_URL=https://xxxxxxxxxx.execute-api.us-east-2.amazonaws.com/dev/api
```

---

## Desenvolvimento Local

```bash
npm install
npm run dev        # inicia Vite em 0.0.0.0:5173
```

O frontend aponta diretamente para o API Gateway (sem proxy local). Defina `VITE_API_URL` no `.env` antes de iniciar.

Para simular o fluxo event-driven localmente de forma síncrona, sete `LOCAL_SYNC=true` nas variáveis de ambiente do backend — o `publisher_lambda` chamará o `crud_lambda` diretamente em vez de usar o EventBridge.

---

## Docker

```bash
# Apenas frontend (dev/preview)
docker compose up frontend

# Deploy do backend (Lambda via Serverless Framework)
docker compose --profile deploy up backend

# Deploy do frontend para S3
docker compose --profile deploy up frontend-deploy
```

---

## Schema do Item no DynamoDB

| Campo          | Tipo     | Obrigatório | Descrição                                              |
|----------------|----------|-------------|--------------------------------------------------------|
| `id`           | `String` | Sim (PK)    | UUID v4 gerado pelo `publisher_lambda` antes do evento |
| `nome`         | `String` | Sim         | Nome completo                                          |
| `email`        | `String` | Sim (GSI)   | Único — indexado via `EmailIndex`                      |
| `telefone`     | `String` | Sim         | Apenas dígitos, máx. 11 caracteres                     |
| `tipo`         | `String` | Sim (GSI)   | Hóspede / Proprietário / Operador / Fornecedor         |
| `dataCadastro` | `String` | Sim         | Gerado pelo `publisher_lambda` no momento da criação   |
| `avatarUrl`    | `String` | Não         | URL ou base64 da foto                                  |
| `cep`          | `String` | Não         | CEP do endereço                                        |
| `endereco`     | `String` | Não         | Preenchido automaticamente via ViaCEP no frontend      |

---

## Decisões Arquiteturais

**Separação de responsabilidades entre Lambdas:**
- `reader_lambda` — somente leitura síncrona. Auto-importa a base externa na primeira carga se a tabela estiver vazia.
- `publisher_lambda` — recebe requests do API Gateway, valida, gera ID/data e publica evento no EventBridge. Nunca escreve no DynamoDB diretamente.
- `crud_lambda` — acionado exclusivamente pelo EventBridge. Único ponto de escrita no DynamoDB.
- `health_lambda` — diagnóstico dos serviços dependentes (DynamoDB, EventBridge, API externa).

**UUID gerado no publisher, não no crud:** permite retornar o ID ao frontend imediatamente no 202, sem aguardar a escrita assíncrona.

**Resposta 202 + re-fetch com delay (2s):** padrão adequado para event-driven sem WebSocket ou polling complexo.

**urllib3 no lugar de requests:** elimina dependência externa nas Lambdas — `urllib3` já está disponível no runtime Python da AWS.

**DynamoDB PAY_PER_REQUEST + GSIs:** sem provisionamento de capacidade; índices `EmailIndex` e `TipoIndex` evitam scan completo nas queries por e-mail e tipo.

**`DeletionPolicy: Retain`** na tabela e no EventBridge bus: proteção contra destruição acidental de dados em `serverless remove`.