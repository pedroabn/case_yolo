"""
import_lambda.py
----------------
Importa clientes da API externa para o DynamoDB.
Ativado via EventBridge (detail-type: people.imported) pelo crud_lambda.
"""

import json
import os
import uuid
from datetime import datetime

import boto3
import requests
from boto3.dynamodb.conditions import Key

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
dynamodb = boto3.resource("dynamodb")
TABLE_NAME = os.environ.get("DYNAMODB_TABLE_NAME")
table = dynamodb.Table(TABLE_NAME)

YOLO_API = os.environ.get("API_YOLO", "").strip()

# ---------------------------------------------------------------------------
# Handler
# ---------------------------------------------------------------------------

def lambda_handler(event, context):
    print(f"[import_lambda] Iniciando importação. YOLO_API={YOLO_API!r} TABLE={TABLE_NAME!r}")

    if not YOLO_API:
        msg = "API_YOLO não configurada. Defina a variável de ambiente."
        print(f"[ERROR import_lambda] {msg}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": msg}),
        }

    try:
        # Preparar headers para a requisição
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "case_yolo/1.0",
        }
        
        print(f"[import_lambda] Fazendo GET para API Yolo...")
        response = requests.get(
            YOLO_API, 
            timeout=40,
            verify=False,  # SSL bypass para certificados auto-assinados
            headers=headers
        )
        print(f"[import_lambda] HTTP {response.status_code} — content-type: {response.headers.get('content-type')}")
        response.raise_for_status()

        raw = response.json()
        print(f"[import_lambda] Resposta raw (primeiros 300 chars): {str(raw)[:300]}")

        # A API externa pode retornar de três formas:
        # 1. {"clientes": [...]}                  → direto
        # 2. {"body": "{\"clientes\": [...]}" }   → envelope Lambda (string)
        # 3. {"body": {"clientes": [...]}}         → envelope Lambda (objeto)
        clientes = _extract_clientes(raw)

        print(f"[import_lambda] {len(clientes)} clientes encontrados na resposta")

        if not clientes:
            return {
                "statusCode": 200,
                "body": json.dumps({
                    "message": "Nenhum cliente encontrado na resposta da API externa.",
                    "imported": 0,
                    "skipped": 0,
                    "raw_keys": list(raw.keys()) if isinstance(raw, dict) else str(type(raw)),
                }),
            }

        imported = 0
        skipped = 0

        for c in clientes:
            email = c.get("E-mail", "").strip()

            if not email:
                print(f"[import_lambda] Registro sem e-mail ignorado: {c}")
                skipped += 1
                continue

            # Verifica duplicidade via GSI
            existing = table.query(
                IndexName="EmailIndex",
                KeyConditionExpression=Key("email").eq(email),
            )
            if existing.get("Items"):
                print(f"[import_lambda] Duplicado ignorado: {email}")
                skipped += 1
                continue

            item = {
                "id": str(uuid.uuid4()),
                "email": email,
                "nome": c.get("Nome", "").strip(),
                "telefone": _normalize_phone(c.get("Telefone", "")),
                "tipo": _normalize_tipo(c.get("Tipo", "")),
                "dataCadastro": _normalize_date(c.get("Data de Cadastro", "")),
                "cep": "",
                "endereco": "",
                "avatarUrl": "",
            }
            table.put_item(Item=item)
            print(f"[import_lambda] Importado: {email}")
            imported += 1

        msg = f"Importação concluída: {imported} novos, {skipped} ignorados."
        print(f"[import_lambda] {msg}")
        return {
            "statusCode": 200,
            "body": json.dumps({
                "message": msg,
                "imported": imported,
                "skipped": skipped,
            }),
        }

    except requests.exceptions.RequestException as exc:
        msg = f"Erro HTTP ao chamar API externa: {exc}"
        print(f"[ERROR import_lambda] {msg}")
        return {"statusCode": 502, "body": json.dumps({"error": msg})}

    except Exception as exc:
        msg = f"Erro inesperado: {exc}"
        print(f"[ERROR import_lambda] {msg}")
        raise  # re-raise para EventBridge tentar novamente


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_clientes(raw) -> list:
    """
    Extrai a lista de clientes independente do formato da resposta.
    """
    # Caso 1: raiz já é uma lista
    if isinstance(raw, list):
        return raw

    if not isinstance(raw, dict):
        print(f"[WARN import_lambda] Resposta não é dict nem list: {type(raw)}")
        return []

    # Caso 2: {"clientes": [...]}
    if "clientes" in raw:
        value = raw["clientes"]
        if isinstance(value, list):
            return value
        # Às vezes vem como string JSON
        if isinstance(value, str):
            try:
                return json.loads(value)
            except Exception:
                pass

    # Caso 3: envelope Lambda com body string ou dict
    body = raw.get("body")
    if body is None:
        return []

    if isinstance(body, str):
        try:
            body = json.loads(body)
        except Exception:
            print(f"[WARN import_lambda] body não é JSON válido: {body[:100]}")
            return []

    if isinstance(body, dict):
        return body.get("clientes", [])

    if isinstance(body, list):
        return body

    return []


def _normalize_phone(phone: str) -> str:
    digits = "".join(filter(str.isdigit, str(phone)))
    return digits[:11]


def _normalize_tipo(tipo: str) -> str:
    tipos_validos = {"Hóspede", "Proprietário", "Operador", "Fornecedor"}
    return tipo.strip() if tipo.strip() in tipos_validos else "Hóspede"


def _normalize_date(date_str: str) -> str:
    if not date_str:
        return datetime.now().strftime("%Y-%m-%d")
    # Tenta normalizar formatos comuns: DD/MM/YYYY → YYYY-MM-DD
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(date_str.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return datetime.now().strftime("%Y-%m-%d")