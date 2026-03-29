"""
publisher_lambda.py
--------------------
Recebe eventos do API Gateway (POST / PUT / DELETE) e publica no EventBridge.

Em produção: PutEvents → EventBridge Bus → crud_lambda (async)
Em dev local (LOCAL_SYNC=true): chama crud_lambda diretamente para simular o fluxo.
"""

import json
import os
import sys
import importlib
import uuid
from datetime import datetime

import boto3

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
EVENT_BUS_NAME = os.environ.get("EVENT_BUS_NAME", "yolo-people-bus")
EVENT_SOURCE = "yolo.people"
LOCAL_SYNC = os.environ.get("LOCAL_SYNC", "false").lower() == "true"

# Só instancia o client EventBridge em produção
_events_client = None


def _get_events_client():
    global _events_client
    if _events_client is None:
        _events_client = boto3.client("events")
    return _events_client


# ---------------------------------------------------------------------------
# Handler principal
# ---------------------------------------------------------------------------

def lambda_handler(event, context):
    http_method = event.get("httpMethod", "")
    path_params = event.get("pathParameters") or {}
    path = event.get("path", "")

    try:
        if http_method == "POST":
            if "/import" in path:
                return _dispatch("people.imported", {})
            body = json.loads(event.get("body") or "{}")
            return _handle_create(body)

        elif http_method == "PUT":
            body = json.loads(event.get("body") or "{}")
            return _handle_update(path_params.get("id"), body)

        elif http_method == "DELETE":
            return _handle_delete(path_params.get("id"))

        return _respond(405, {"message": "Método não permitido"})

    except json.JSONDecodeError:
        return _respond(400, {"message": "Body inválido — JSON malformado"})
    except Exception as exc:
        print(f"[ERROR publisher] {exc}")
        return _respond(500, {"message": str(exc)})


# ---------------------------------------------------------------------------
# Handlers por operação
# ---------------------------------------------------------------------------

def _handle_create(data: dict):
    if not data.get("email") or not data.get("nome"):
        return _respond(400, {"message": "Nome e e-mail são obrigatórios"})

    # ID e data gerados aqui para retornar ao frontend de imediato
    data["id"] = str(uuid.uuid4())
    data["dataCadastro"] = datetime.now().strftime("%Y-%m-%d")
    data["telefone"] = _normalize_phone(data.get("telefone", ""))

    result = _dispatch("person.created", data)

    # Em LOCAL_SYNC retorna o resultado real do crud_lambda
    if LOCAL_SYNC and result:
        return result

    return _respond(202, {
        "message": "Cadastro em processamento",
        "id": data["id"],
        "data": data,
    })


def _handle_update(person_id: str, data: dict):
    if not person_id:
        return _respond(400, {"message": "ID obrigatório para atualização"})

    if "telefone" in data:
        data["telefone"] = _normalize_phone(data["telefone"])

    data["id"] = person_id
    result = _dispatch("person.updated", data)

    if LOCAL_SYNC and result:
        return result

    return _respond(202, {"message": "Atualização em processamento", "id": person_id})


def _handle_delete(person_id: str):
    if not person_id:
        return _respond(400, {"message": "ID obrigatório para exclusão"})

    result = _dispatch("person.deleted", {"id": person_id})

    if LOCAL_SYNC and result:
        return result

    return _respond(202, {"message": "Exclusão em processamento", "id": person_id})


# ---------------------------------------------------------------------------
# Dispatcher: EventBridge real ou simulação local
# ---------------------------------------------------------------------------

def _dispatch(detail_type: str, detail: dict):
    """
    Produção  → PutEvents no EventBridge (async, retorna None)
    Dev local → chama crud_lambda diretamente (síncrono, retorna a resposta)
    """
    if LOCAL_SYNC:
        try:
            crud_lambda = importlib.import_module('crud_lambda')
        except ModuleNotFoundError:
            task_dir = os.path.dirname(os.path.abspath(__file__))
            if task_dir not in sys.path:
                sys.path.insert(0, task_dir)
            print(f"[DEBUG publisher] sys.path atualizado para LOCAL_SYNC: {sys.path[:3]}")
            crud_lambda = importlib.import_module('crud_lambda')
        
        bridge_event = {
            "source": EVENT_SOURCE,
            "detail-type": detail_type,
            "detail": detail,
        }
        return crud_lambda.lambda_handler(bridge_event, {})

    # Produção
    _get_events_client().put_events(
        Entries=[
            {
                "Source": EVENT_SOURCE,
                "DetailType": detail_type,
                "Detail": json.dumps(detail, default=str),
                "EventBusName": EVENT_BUS_NAME,
            }
        ]
    )
    return None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalize_phone(phone: str) -> str:
    digits = "".join(filter(str.isdigit, phone))
    return digits[:11]


def _respond(status_code: int, body) -> dict:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        },
        "body": json.dumps(body, default=str) if body is not None else "",
    }
