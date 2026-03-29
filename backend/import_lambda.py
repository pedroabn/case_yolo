"""
import_lambda.py
----------------
Importa clientes da API Yolo para o DynamoDB.
Chamado por: reader_lambda (auto-import) e crud_lambda (evento people.imported).
"""
import json
import os
import sys
import uuid
from datetime import datetime

import boto3
import urllib3
from boto3.dynamodb.conditions import Key

# Garante resolução de módulos quando chamado via importlib de outro lambda
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
if _THIS_DIR not in sys.path:
    sys.path.insert(0, _THIS_DIR)

http = urllib3.PoolManager()

dynamodb = boto3.resource("dynamodb")
TABLE_NAME = os.environ.get("DYNAMODB_TABLE_NAME")
table = dynamodb.Table(TABLE_NAME)

YOLO_API = os.environ.get("API_YOLO", "").strip()


def lambda_handler(event, context):
    print(f"[import_lambda] TABLE={TABLE_NAME!r} API={YOLO_API!r}")

    if not YOLO_API:
        msg = "API_YOLO não configurada."
        print(f"[ERROR import_lambda] {msg}")
        return _respond(500, {"error": msg})

    try:
        response = http.request("GET", YOLO_API, timeout=15.0)
        print(f"[import_lambda] HTTP {response.status}")

        if response.status >= 400:
            raise RuntimeError(f"Erro HTTP {response.status}")

        raw = json.loads(response.data.decode("utf-8"))
        print(f"[import_lambda] Raw (300 chars): {str(raw)[:300]}")

        clientes = _extract_clientes(raw)
        print(f"[import_lambda] {len(clientes)} clientes encontrados")

        if not clientes:
            return _respond(200, {
                "message": "Nenhum cliente encontrado.",
                "imported": 0,
                "skipped": 0,
                "raw_keys": list(raw.keys()) if isinstance(raw, dict) else str(type(raw)),
            })

        imported = 0
        skipped = 0

        for c in clientes:
            email = c.get("E-mail", "").strip()

            if not email:
                skipped += 1
                continue

            existing = table.query(
                IndexName="EmailIndex",
                KeyConditionExpression=Key("email").eq(email),
            )

            if existing.get("Items"):
                skipped += 1
                continue

            table.put_item(Item={
                "id": str(uuid.uuid4()),
                "email": email,
                "nome": c.get("Nome", "").strip(),
                "telefone": _normalize_phone(c.get("Telefone", "")),
                "tipo": _normalize_tipo(c.get("Tipo", "")),
                "dataCadastro": _normalize_date(c.get("Data de Cadastro", "")),
                "cep": "",
                "endereco": "",
                "avatarUrl": "",
            })

            print(f"[import_lambda] Importado: {email}")
            imported += 1

        msg = f"Importação concluída: {imported} novos, {skipped} ignorados."
        print(f"[import_lambda] {msg}")

        return _respond(200, {
            "message": msg,
            "imported": imported,
            "skipped": skipped,
        })

    except Exception as exc:
        msg = f"Erro na importação: {exc}"
        print(f"[ERROR import_lambda] {msg}")
        return _respond(502, {"error": msg})


def _extract_clientes(raw):
    if isinstance(raw, list):
        return raw

    if not isinstance(raw, dict):
        return []

    if "clientes" in raw:
        value = raw["clientes"]
        if isinstance(value, list):
            return value
        if isinstance(value, str):
            try:
                return json.loads(value)
            except Exception:
                pass

    body = raw.get("body")

    if body is None:
        return []

    if isinstance(body, str):
        try:
            body = json.loads(body)
        except Exception:
            return []

    if isinstance(body, dict):
        return body.get("clientes", [])

    if isinstance(body, list):
        return body

    return []


def _normalize_phone(phone):
    return "".join(filter(str.isdigit, str(phone)))[:11]


def _normalize_tipo(tipo):
    validos = {"Hóspede", "Proprietário", "Operador", "Fornecedor"}
    return tipo.strip() if tipo.strip() in validos else "Hóspede"


def _normalize_date(date_str):
    if not date_str:
        return datetime.now().strftime("%Y-%m-%d")
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(date_str.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return datetime.now().strftime("%Y-%m-%d")


def _respond(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body, default=str) if body is not None else "",
    }