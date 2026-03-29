"""
reader_lambda.py
----------------
Leitura síncrona do DynamoDB via GET requests.
Se a tabela estiver vazia, dispara a importação automaticamente
antes de retornar os dados — garantindo que o primeiro GET sempre
entregue dados ao frontend.
"""

import importlib
import json
import os
import sys

import boto3
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource("dynamodb")
TABLE_NAME = os.environ.get("DYNAMODB_TABLE_NAME")
table = dynamodb.Table(TABLE_NAME)


def lambda_handler(event, context):
    path_params = event.get("pathParameters") or {}
    query_params = event.get("queryStringParameters") or {}

    try:
        if path_params.get("id"):
            return _get_one(path_params["id"])
        return _list(query_params)
    except Exception as exc:
        print(f"[ERROR reader_lambda] {exc}")
        return _respond(500, {"message": str(exc)})


def _list(params: dict):
    filter_type = params.get("tipo") or params.get("type")
    search = (params.get("search") or "").lower().strip()

    if filter_type and filter_type not in ("", "Todos"):
        result = table.query(
            IndexName="TipoIndex",
            KeyConditionExpression=Key("tipo").eq(filter_type),
        )
    else:
        result = table.scan()

    items = result.get("Items", [])

    # Auto-import: se a tabela estiver vazia, importa da API Yolo
    # e refaz a leitura antes de responder ao frontend.
    if not items and not search and not filter_type:
        print("[reader_lambda] Tabela vazia — disparando importação automática")
        _trigger_import()

        # Relê após importar
        result = table.scan()
        items = result.get("Items", [])

    if search:
        items = [
            p for p in items
            if search in p.get("nome", "").lower()
            or search in p.get("email", "").lower()
        ]

    items.sort(key=lambda p: p.get("nome", "").lower())
    return _respond(200, items)


def _get_one(person_id: str):
    result = table.get_item(Key={"id": person_id})
    item = result.get("Item")
    if not item:
        return _respond(404, {"message": "Pessoa não encontrada"})
    return _respond(200, item)


def _trigger_import():
    """Chama import_lambda diretamente (síncrono) para popular a tabela."""
    current_dir = os.path.dirname(os.path.abspath(__file__))
    if current_dir not in sys.path:
        sys.path.insert(0, current_dir)

    try:
        import_lambda = importlib.import_module("import_lambda")
        result = import_lambda.lambda_handler({}, {})
        print(f"[reader_lambda] Importação automática: {result.get('body', '')[:200]}")
    except Exception as exc:
        print(f"[ERROR reader_lambda] Falha na importação automática: {exc}")


def _respond(status_code: int, body) -> dict:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,OPTIONS",
        },
        "body": json.dumps(body, default=str) if body is not None else "",
    }