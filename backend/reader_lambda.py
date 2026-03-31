import importlib
import json
import os
import sys
import unicodedata
import boto3

dynamodb = boto3.resource("dynamodb")
TABLE_NAME = os.environ["DYNAMODB_TABLE_NAME"]
table = dynamodb.Table(TABLE_NAME)

headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Requested-With,X-Amz-Date,X-Amz-Security-Token,X-Api-Key",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
}


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


def scan_all():
    items = []
    response = table.scan()
    items.extend(response.get("Items", []))
    while "LastEvaluatedKey" in response:
        response = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
        items.extend(response.get("Items", []))
    return items


def _run_auto_import():
    try:
        _this_dir = os.path.dirname(os.path.abspath(__file__))
        if _this_dir not in sys.path:
            sys.path.insert(0, _this_dir)
        import_lambda = importlib.import_module("import_lambda")
        result = import_lambda.lambda_handler({}, {})
        print(f"[reader_lambda] auto-import result: {str(result)[:200]}")
    except Exception as exc:
        print(f"[ERROR reader_lambda] auto-import falhou: {exc}")


def lambda_handler(event, context):
    print(
        f"[reader_lambda] httpMethod={event.get('httpMethod')} "
        f"pathParams={event.get('pathParameters')} "
        f"queryParams={event.get('queryStringParameters')}"
    )

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 204, "headers": headers, "body": ""}

    path_params = event.get("pathParameters") or {}

    # GET /people/{id}
    if path_params.get("id"):
        response = table.get_item(Key={"id": path_params["id"]})
        item = response.get("Item")
        print(f"[reader_lambda] get_item id={path_params['id']} found={item is not None}")
        if not item:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "Pessoa não encontrada"})
            }
        return {"statusCode": 200, "headers": headers, "body": json.dumps(item)}

    # GET /people
    params = event.get("queryStringParameters") or {}
    tipo_param = normalize(params.get("tipo"))
    search_param = normalize(params.get("search"))

    items = scan_all()
    print(f"[reader_lambda] scan_all retornou {len(items)} itens")

    # Auto-import na primeira carga (tabela vazia, sem filtros ativos)
    if len(items) == 0 and not tipo_param and not search_param:
        print("[reader_lambda] tabela vazia — disparando auto-import síncrono")
        _run_auto_import()
        items = scan_all()
        print(f"[reader_lambda] após auto-import: {len(items)} itens")

    if tipo_param:
        items = [p for p in items if normalize(p.get("tipo")) == tipo_param]

    if search_param:
        items = [p for p in items if (
            search_param in normalize(p.get("nome"))
            or search_param in normalize(p.get("email"))
        )]

    print(f"[reader_lambda] retornando {len(items)} itens após filtros")
    return {
        "statusCode": 200,
        "headers": headers,
        "body": json.dumps(items)
    }