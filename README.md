# Yolo Coliving - Cadastro de Pessoas

Este projeto é uma solução full-stack para o sistema de cadastro de pessoas da Yolo Tech, utilizando uma arquitetura serverless na AWS.

## 🚀 Arquitetura

- **Frontend:** React com Tailwind CSS e Motion para animações.
- **Backend:** AWS Lambda (Python) integrado via API Gateway.
- **Banco de Dados:** Amazon DynamoDB (NoSQL).
- **Scripts de Infraestrutura:** Scripts em TypeScript e Python para criação da tabela.
- **Infraestrutura:** Gerenciada via Serverless Framework.

## 📂 Estrutura do Projeto

```text
├── backend/
│   ├── lambda_function.py  # Handler principal CRUD
│   ├── import_lambda.py    # Handler para importação de base externa
│   └── serverless.yml      # Configuração de infraestrutura (IaC)
├── src/
│   ├── App.tsx             # Interface principal em React
│   └── index.css           # Estilos globais (Tailwind)
├── server.ts               # Servidor Express (Proxy para preview local)
└── README.md               # Documentação
```

## 🛠️ Configuração do Banco de Dados (DynamoDB)

Antes de rodar o sistema, você precisa criar a tabela no DynamoDB. Fornecemos scripts em TypeScript e Python para isso.

### Usando Python (Recomendado)
1. Certifique-se de ter o `boto3` e `python-dotenv` instalados:
   ```bash
   pip install boto3 python-dotenv
   ```
2. Configure suas credenciais no arquivo `.env`.
3. Execute o script:
   ```bash
   npm run create-table-py
   ```

### Usando TypeScript
1. Configure suas credenciais no arquivo `.env`.
2. Execute o comando:
   ```bash
   npm run create-table
   ```

## 🛠️ Instruções de Deploy (AWS)

1. **Pré-requisitos:**
   - Node.js e NPM instalados.
   - Python 3.9+ instalado.
   - AWS CLI configurado com credenciais.
   - Serverless Framework instalado (`npm install -g serverless`).

2. **Deploy do Backend:**
   ```bash
   cd backend
   pip install requests -t .  # Instala dependências da Lambda localmente
   serverless deploy
   ```
   *Anote a URL do endpoint gerada pelo API Gateway.*

3. **Deploy do Frontend:**
   - Atualize a URL base da API no frontend.
   - Gere o build: `npm run build`.
   - Faça o upload da pasta `dist/` para um bucket S3 configurado para Static Website Hosting.
   - (Opcional) Configure o CloudFront para HTTPS e CDN.

## 💻 Como testar localmente

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Inicie o ambiente de desenvolvimento:
   ```bash
   npm run dev
   ```
3. O sistema estará disponível em `http://localhost:3000`.
   - O servidor `server.ts` simula o comportamento das Lambdas e do DynamoDB em memória para fins de demonstração.

## 🧠 Decisões Arquiteturais

1. **DynamoDB (Partition Key: `id`):** O `id` é um número de 12 dígitos gerado aleatoriamente para garantir unicidade e facilitar a integração com sistemas legados.
2. **GSI (Global Secondary Index):** 
   - `EmailIndex`: Criado no campo `email` para garantir que cada usuário tenha um e-mail único e permitir buscas rápidas.
   - `TipoIndex`: Criado no campo `tipo` para permitir filtragem eficiente.
3. **Python nas Lambdas:** Escolhido pela simplicidade e excelente suporte da biblioteca `boto3` para operações no DynamoDB.
4. **Tailwind CSS:** Utilizado para garantir um layout limpo, responsivo e alinhado com a identidade visual da Yolo (#fc0494).

## 📡 Exemplos de Payload

### Criar Pessoa (POST /people)
```json
{
  "nome": "André Meira",
  "telefone": "(81) 9 8888-7777",
  "email": "andre.meira@yolo.com",
  "tipo": "Host",
  "cep": "50030-230"
}
```

### Resposta (201 Created)
```json
{
  "nome": "André Meira",
  "telefone": "(81) 9 8888-7777",
  "email": "andre.meira@yolo.com",
  "tipo": "Host",
  "cep": "50030-230",
  "dataCadastro": "2026-03-27"
}
```
