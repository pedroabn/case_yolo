import json

headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS"
}


def lambda_handler(event, context):

    if event.get("httpMethod") == "OPTIONS":

        return {
            "statusCode": 200,
            "headers": headers,
            "body": ""
        }

    return {
        "statusCode": 200,
        "headers": headers,
        "body": json.dumps(
            {
                "status": "ok"
            }
        ),
    }