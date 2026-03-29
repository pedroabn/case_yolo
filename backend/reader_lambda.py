import json
import boto3
import os
import unicodedata

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["DYNAMODB_TABLE_NAME"])

headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Requested-With,X-Amz-Date,X-Amz-Security-Token,X-Api-Key",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
}

# ---------------------------------------------------------
# Normalização segura
# ---------------------------------------------------------
def normalize(value):
    if not value:
        return ""
    return (
        unicodedata
        .normalize("NFKD", str(value))
        .encode("ascii", "ignore")
        .decode("utf-8")
        .lower()
        .strip()
    )

# ---------------------------------------------------------
# Scan completo (com paginação)
# ---------------------------------------------------------
def scan_all():
    items = []
    response = table.scan()
    items.extend(response.get("Items", []))

    while "LastEvaluatedKey" in response:
        response = table.scan(
            ExclusiveStartKey=response["LastEvaluatedKey"]
        )
        items.extend(response.get("Items", []))

    return items

# ---------------------------------------------------------
# Lambda Handler
# ---------------------------------------------------------
def lambda_handler(event, context):
    # ✅ Handler para preflight CORS
    if event.get('httpMethod') == 'OPTIONS':
        return {
            "statusCode": 204,
            "headers": headers,
            "body": ""
        }
    
    path_params = event.get('pathParameters') or {}
    
    # GET by id
    if path_params.get("id"):
        response = table.get_item(
            Key={"id": path_params["id"]}
        )
        item = response.get("Item")
        if not item:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "Pessoa não encontrada"})
            }
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps(item)
        }

    # Filtros
    params = event.get("queryStringParameters") or {}
    tipo_param = normalize(params.get("tipo"))
    search_param = normalize(params.get("search"))

    items = scan_all()

    # Filtro tipo
    if tipo_param:
        items = [
            p for p in items
            if normalize(p.get("tipo")) == tipo_param
        ]

    # Busca texto
    if search_param:
        items = [
            p for p in items
            if (
                search_param in normalize(p.get("nome"))
                or search_param in normalize(p.get("email"))
            )
        ]

    return {
        "statusCode": 200,
        "headers": headers,
        "body": json.dumps(items)
    }