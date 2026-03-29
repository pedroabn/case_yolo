# backend/health_lambda.py
import boto3
import os
import requests
import json

def lambda_handler(event, context):
    checks = {}
    
    # ✅ Check DynamoDB
    try:
        dynamodb = boto3.resource("dynamodb")
        table = dynamodb.Table(os.environ.get("DYNAMODB_TABLE_NAME"))
        table.describe()
        checks["dynamodb"] = "OK"
    except Exception as e:
        checks["dynamodb"] = f"FAIL: {str(e)}"
    
    # ✅ Check API Externa
    try:
        response = requests.get(os.environ.get("API_YOLO"), timeout=5)
        checks["external_api"] = f"OK ({response.status_code})"
    except Exception as e:
        checks["external_api"] = f"FAIL: {str(e)}"
    
    # ✅ Check EventBridge
    try:
        events = boto3.client("events")
        events.describe_event_bus(Name=os.environ.get("EVENT_BUS_NAME"))
        checks["eventbridge"] = "OK"
    except Exception as e:
        checks["eventbridge"] = f"FAIL: {str(e)}"
    
    return {
        "statusCode": 200,
        "body": json.dumps(checks),
    }