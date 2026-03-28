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

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
dynamodb = boto3.resource("dynamodb")
TABLE_NAME = os.environ.get("TABLE_NAME", "YoloPeople")
table = dynamodb.Table(TABLE_NAME)

# Mapeamento detail-type → handler
_ROUTES = {}


def _route(detail_type: str):
    """Decorator para registrar handlers por detail-type."""
    def decorator(fn):
        _ROUTES[detail_type] = fn
        return fn
    return decorator


# ---------------------------------------------------------------------------
# Handler principal (entry point do Lambda)
# ---------------------------------------------------------------------------

def lambda_handler(event, context):
    detail_type = event.get("detail-type", "")
    detail = event.get("detail", {})

    # EventBridge serializa detail como string em alguns cenários
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
        # Re-raise para o EventBridge tentar novamente (retry policy)
        print(f"[ERROR crud_lambda] {detail_type}: {exc}")
        raise


# ---------------------------------------------------------------------------
# Handlers registrados
# ---------------------------------------------------------------------------

@_route("person.created")
def _create(data: dict):
    # Unicidade de e-mail via GSI
    existing = table.query(
        IndexName="EmailIndex",
        KeyConditionExpression=Key("email").eq(data["email"]),
    )
    conflict = [i for i in existing.get("Items", []) if i["id"] != data.get("id")]
    if conflict:
        print(f"[WARN] E-mail duplicado ignorado: {data['email']}")
        return _respond(409, {"message": "E-mail já cadastrado"})

    table.put_item(Item=data)
    print(f"[INFO] Criado: {data['id']}")
    return _respond(201, data)


@_route("person.updated")
def _update(data: dict):
    person_id = data.get("id")
    if not person_id:
        return _respond(400, {"message": "ID ausente no evento"})

    # Verifica unicidade do e-mail se estiver sendo alterado
    if "email" in data:
        existing = table.query(
            IndexName="EmailIndex",
            KeyConditionExpression=Key("email").eq(data["email"]),
        )
        conflict = [i for i in existing.get("Items", []) if i["id"] != person_id]
        if conflict:
            print(f"[WARN] E-mail em conflito: {data['email']}")
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
        updated = result.get("Attributes", {})
        print(f"[INFO] Atualizado: {person_id}")
        return _respond(200, updated)
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
    """Delega para o import_lambda que já contém a lógica de importação."""
    import import_lambda  # import tardio para manter lambdas desacopladas
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
