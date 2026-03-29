"""
crud_lambda.py
--------------
Ativado pelo EventBridge. Nunca é chamado diretamente pelo API Gateway.

Evento esperado (formato EventBridge):
{
    "source": "yolo.people",
    "detail-type": "person.created" | "person.updated" | "person.deleted" | "people.imported",
    "detail": { ... payload ... }
}
"""

import json
import os
import sys
import importlib
from typing import Dict, Any, Optional

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
dynamodb = boto3.resource("dynamodb")
TABLE_NAME = os.environ.get("DYNAMODB_TABLE_NAME")
table = dynamodb.Table(TABLE_NAME)

_ROUTES = {}


def _route(detail_type: str):
    def decorator(fn):
        _ROUTES[detail_type] = fn
        return fn
    return decorator


# ---------------------------------------------------------------------------
# Handler principal
# ---------------------------------------------------------------------------

def lambda_handler(event, context):
    detail_type = event.get("detail-type", "")
    detail = event.get("detail", {})

    if isinstance(detail, str):
        detail = json.loads(detail)

    print(f"[crud_lambda] event={detail_type} detail={json.dumps(detail, default=str)[:200]}")

    handler_fn = _ROUTES.get(detail_type)
    if not handler_fn:
        print(f"[WARN] Tipo de evento não registrado: {detail_type}")
        return _respond(400, {"message": f"Evento desconhecido: {detail_type}"})

    try:
        return handler_fn(detail)
    except Exception as exc:
        print(f"[ERROR crud_lambda] {detail_type}: {exc}")
        raise


# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------

@_route("person.created")
def _create(data: dict):
    existing = table.query(
        IndexName="EmailIndex",
        KeyConditionExpression=Key("email").eq(data["email"]),
    )
    conflict = [i for i in existing.get("Items", []) if i["id"] != data.get("id")]
    if conflict:
        print(f"[WARN] E-mail duplicado: {data['email']}")
        return _respond(409, {"message": "E-mail já cadastrado"})

    table.put_item(Item=data)
    print(f"[INFO] Criado: {data['id']}")
    return _respond(201, data)


@_route("person.updated")
def _update(data: dict):
    person_id = data.get("id")
    if not person_id:
        return _respond(400, {"message": "ID ausente no evento"})

    if "email" in data:
        existing = table.query(
            IndexName="EmailIndex",
            KeyConditionExpression=Key("email").eq(data["email"]),
        )
        conflict = [i for i in existing.get("Items", []) if i["id"] != person_id]
        if conflict:
            return _respond(409, {"message": "E-mail em uso por outro usuário"})

    immutable = {"id", "dataCadastro"}
    fields = {k: v for k, v in data.items() if k not in immutable}

    if not fields:
        return _respond(200, {"message": "Nenhum campo para atualizar"})

    update_expr = "SET " + ", ".join(f"#{k} = :{k}" for k in fields)
    attr_names = {f"#{k}": k for k in fields}
    attr_values = {f":{k}": v for k, v in fields.items()}

    try:
        result = table.update_item(
            Key={"id": person_id},
            UpdateExpression=update_expr,
            ExpressionAttributeNames=attr_names,
            ExpressionAttributeValues=attr_values,
            ReturnValues="ALL_NEW",
        )
        print(f"[INFO] Atualizado: {person_id}")
        return _respond(200, result.get("Attributes", {}))
    except ClientError as exc:
        raise RuntimeError(exc.response["Error"]["Message"]) from exc


@_route("person.deleted")
def _delete(data: dict):
    person_id = data.get("id")
    if not person_id:
        return _respond(400, {"message": "ID ausente no evento"})

    table.delete_item(Key={"id": person_id})
    print(f"[INFO] Excluído: {person_id}")
    return _respond(204, None)


@_route("people.imported")
def _import(data: dict):
    """
    Delega para o import_lambda.
    Usa importlib.import_module() para maior compatibilidade com AWS Lambda.
    """
    print(f"[INFO crud_lambda] Delegando para import_lambda")
    print(f"[DEBUG crud_lambda] TABLE_NAME={os.environ.get('DYNAMODB_TABLE_NAME')}")
    print(f"[DEBUG crud_lambda] API_YOLO={os.environ.get('API_YOLO', 'NÃO DEFINIDO')}")
    print(f"[DEBUG crud_lambda] EVENT_BUS_NAME={os.environ.get('EVENT_BUS_NAME', 'NÃO DEFINIDO')}")

    try:
        # Usar importlib para maior compatibilidade com AWS Lambda runtime
        # Evita problemas de path e sys.path em ambiente Lambda
        import_lambda_module = importlib.import_module('import_lambda')
        return import_lambda_module.lambda_handler({}, {})
    except ModuleNotFoundError as e:
        error_msg = f"Não conseguiu importar import_lambda: {e}"
        print(f"[ERROR crud_lambda] {error_msg}")
        return _respond(500, {"message": error_msg})
    except Exception as exc:
        error_msg = f"Erro ao executar import_lambda: {exc}"
        print(f"[ERROR crud_lambda] {error_msg}")
        return _respond(500, {"message": error_msg})
        # Tentar com path absoluto
        current_dir = os.path.dirname(os.path.abspath(__file__))
        if current_dir not in sys.path:
            sys.path.insert(0, current_dir)
        print(f"[DEBUG] sys.path atualizado: {sys.path[:3]}")
        import_lambda = importlib.import_module('import_lambda')
        return import_lambda.lambda_handler({}, {})


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _respond(status_code: int, body) -> dict:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body, default=str) if body is not None else "",
    }