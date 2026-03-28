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

YOLO_API = os.environ.get("AWS_API_URL")

# ---------------------------------------------------------------------------
# Handler
# ---------------------------------------------------------------------------

def lambda_handler(event, context):
    try:
        response = requests.get(YOLO_API, timeout=15)
        response.raise_for_status()

        raw = response.json()
        body_data = raw.get("body", "{}")
        if isinstance(body_data, str):
            body_data = json.loads(body_data)

        clientes = body_data.get("clientes", [])
        imported = 0
        skipped = 0

        for c in clientes:
            email = c.get("E-mail", "").strip()
            if not email:
                skipped += 1
                continue

            # Verifica duplicidade via GSI
            existing = table.query(
                IndexName="EmailIndex",
                KeyConditionExpression=Key("email").eq(email),
            )
            if existing.get("Items"):
                skipped += 1
                continue

            item = {
                "id": str(uuid.uuid4()),
                "email": email,
                "nome": c.get("Nome", "").strip(),
                "telefone": _normalize_phone(c.get("Telefone", "")),
                "tipo": c.get("Tipo", "Hóspede"),
                "dataCadastro": c.get(
                    "Data de Cadastro", datetime.now().strftime("%Y-%m-%d")
                ),
                "cep": "",
                "endereco": "",
                "foto": "",
            }
            table.put_item(Item=item)
            imported += 1

        print(f"[import_lambda] importados={imported} ignorados={skipped}")
        return {
            "statusCode": 200,
            "body": json.dumps({
                "message": f"Importação concluída: {imported} novos, {skipped} ignorados.",
                "imported": imported,
                "skipped": skipped,
            }),
        }

    except Exception as exc:
        print(f"[ERROR import_lambda] {exc}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(exc)}),
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalize_phone(phone: str) -> str:
    digits = "".join(filter(str.isdigit, phone))
    return digits[:11]
