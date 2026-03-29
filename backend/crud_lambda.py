"""
crud_lambda.py
Ativado exclusivamente pelo EventBridge.
Nunca chamado diretamente pelo API Gateway.
"""
import importlib
import json
import os
import sys
import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

dynamodb = boto3.resource("dynamodb")
TABLE_NAME = os.environ.get("DYNAMODB_TABLE_NAME")
table = dynamodb.Table(TABLE_NAME)

print(f"[crud_lambda] TABLE_NAME={TABLE_NAME!r}")

_ROUTES = {}

def _route(detail_type: str):
    def decorator(fn):
        _ROUTES[detail_type] = fn
        return fn
    return decorator

def lambda_handler(event, context):
    detail_type = event.get("detail-type", "")
    detail = event.get("detail", {})
    
    if isinstance(detail, str):
        detail = json.loads(detail)
    
    print(f"[crud_lambda] event={detail_type} detail={json.dumps(detail, default=str)[:200]}")

    handler_fn = _ROUTES.get(detail_type)
    if not handler_fn:
        print(f"[WARN crud_lambda] Evento não registrado: {detail_type}")
        return _respond(400, {"message": f"Evento desconhecido: {detail_type}"})

    try:
        return handler_fn(detail)
    except Exception as exc:
        print(f"[ERROR crud_lambda] {detail_type}: {exc}")
        raise

@_route("person.created")
def _create(data: dict):
    existing = table.query(
        IndexName="EmailIndex",
        KeyConditionExpression=Key("email").eq(data["email"]),
    )
    if [i for i in existing.get("Items", []) if i["id"] != data.get("id")]:
        return _respond(409, {"message": "E-mail já cadastrado"})
    table.put_item(Item=data)
    print(f"[INFO crud_lambda] Criado: {data['id']}")
    return _respond(201, data)

@_route("person.updated")
def _update(data: dict):
    person_id = data.get("id")
    if not person_id:
        return _respond(400, {"message": "ID ausente"})
    if "email" in data:
        existing = table.query(
            IndexName="EmailIndex",
            KeyConditionExpression=Key("email").eq(data["email"]),
        )
        if [i for i in existing.get("Items", []) if i["id"] != person_id]:
            return _respond(409, {"message": "E-mail em uso por outro usuário"})

    fields = {k: v for k, v in data.items() if k not in {"id", "dataCadastro"}}
    if not fields:
        return _respond(200, {"message": "Nenhum campo para atualizar"})

    update_expr = "SET " + ", ".join(f"#{k} = :{k}" for k in fields)

    try:
        result = table.update_item(
            Key={"id": person_id},
            UpdateExpression=update_expr,
            ExpressionAttributeNames={f"#{k}": k for k in fields},
            ExpressionAttributeValues={f":{k}": v for k, v in fields.items()},
            ReturnValues="ALL_NEW",
        )
        print(f"[INFO crud_lambda] Atualizado: {person_id}")
        return _respond(200, result.get("Attributes", {}))
    except ClientError as exc:
        raise RuntimeError(exc.response["Error"]["Message"]) from exc

@_route("person.deleted")
def _delete(data: dict):
    person_id = data.get("id")
    if not person_id:
        return _respond(400, {"message": "ID ausente"})
    table.delete_item(Key={"id": person_id})
    print(f"[INFO crud_lambda] Excluído: {person_id}")
    return _respond(204, None)

@_route("people.imported")
def _import(data: dict):
    current_dir = os.path.dirname(os.path.abspath(__file__))
    if current_dir not in sys.path:
        sys.path.insert(0, current_dir)
    import_lambda = importlib.import_module("import_lambda")
    result = import_lambda.lambda_handler(
        {
            "source": "yolo.people",
            "detail-type": "people.imported",
            "detail": data or {},
        },
        {},
    )
    return result

def _respond(status_code: int, body) -> dict:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body, default=str) if body is not None else ""
    }