"""
reader_lambda.py
----------------
Lida exclusivamente com GET requests — leitura síncrona do DynamoDB.
Não passa pelo EventBridge (reads não precisam de event sourcing).
"""

import json
import os

import boto3
from boto3.dynamodb.conditions import Key

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
dynamodb = boto3.resource("dynamodb")
TABLE_NAME = os.environ.get("TABLE_NAME", "YoloPeople")
table = dynamodb.Table(TABLE_NAME)


# ---------------------------------------------------------------------------
# Handler principal
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Operações de leitura
# ---------------------------------------------------------------------------

def _list(params: dict):
    filter_type = params.get("tipo") or params.get("type")
    search = (params.get("search") or "").lower().strip()

    if filter_type and filter_type not in ("", "Todos"):
        response = table.query(
            IndexName="TipoIndex",
            KeyConditionExpression=Key("tipo").eq(filter_type),
        )
    else:
        response = table.scan()

    items = response.get("Items", [])

    if search:
        items = [
            p for p in items
            if search in p.get("nome", "").lower()
            or search in p.get("email", "").lower()
        ]

    # Ordena por nome para consistência
    items.sort(key=lambda p: p.get("nome", "").lower())

    return _respond(200, items)


def _get_one(person_id: str):
    response = table.get_item(Key={"id": person_id})
    item = response.get("Item")
    if not item:
        return _respond(404, {"message": "Pessoa não encontrada"})
    return _respond(200, item)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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
