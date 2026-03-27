import json
import boto3
import os
import uuid
import re
from datetime import datetime
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Key, Attr

# Configuração do DynamoDB
dynamodb = boto3.resource('dynamodb')
TABLE_NAME = os.environ.get('TABLE_NAME', 'YoloPeople')
table = dynamodb.Table(TABLE_NAME)

def normalize_phone(phone):
    if not phone:
        return ""
    return re.sub(r'\D', '', phone)[:11]

def lambda_handler(event, context):
    """
    Handler principal para operações CRUD de pessoas.
    Usa 'id' (UUID ou numérico) como chave primária.
    """
    http_method = event.get('httpMethod')
    path_params = event.get('pathParameters') or {}
    query_params = event.get('queryStringParameters') or {}
    
    try:
        if http_method == 'GET':
            if 'id' in path_params and path_params['id']:
                return get_person(path_params['id'])
            return list_people(query_params)
            
        elif http_method == 'POST':
            body = json.loads(event.get('body', '{}'))
            return create_person(body)
            
        elif http_method == 'PUT':
            person_id = path_params.get('id')
            body = json.loads(event.get('body', '{}'))
            return update_person(person_id, body)
            
        elif http_method == 'DELETE':
            person_id = path_params.get('id')
            return delete_person(person_id)
            
        return respond(405, {'message': 'Método não permitido'})
        
    except Exception as e:
        print(f"Erro: {str(e)}")
        return respond(500, {'message': str(e)})

def list_people(params):
    filter_type = params.get('tipo') if params else None
    search_term = params.get('search') if params else None
    
    if filter_type and filter_type != 'Todos':
        response = table.query(
            IndexName='TipoIndex',
            KeyConditionExpression=Key('tipo').eq(filter_type)
        )
        items = response.get('Items', [])
    else:
        response = table.scan()
        items = response.get('Items', [])
        
    if search_term:
        search_lower = search_term.lower()
        items = [item for item in items if search_lower in item.get('nome', '').lower() or search_lower in item.get('email', '').lower()]
        
    return respond(200, items)

def get_person(person_id):
    response = table.get_item(Key={'id': person_id})
    item = response.get('Item')
    if not item:
        return respond(404, {'message': 'Pessoa não encontrada'})
    return respond(200, item)

def create_person(data):
    if not data.get('email') or not data.get('nome'):
        return respond(400, {'message': 'Nome e E-mail são obrigatórios'})
    
    # Verifica se o e-mail já existe (único)
    existing = table.query(
        IndexName='EmailIndex',
        KeyConditionExpression=Key('email').eq(data['email'])
    )
    if existing.get('Items'):
        return respond(400, {'message': 'E-mail já cadastrado para outro usuário'})
        
    data['id'] = data.get('id', str(uuid.uuid4()))
    data['dataCadastro'] = datetime.now().strftime('%Y-%m-%d')
    if 'telefone' in data:
        data['telefone'] = normalize_phone(data['telefone'])
        
    table.put_item(Item=data)
    return respond(201, data)

def update_person(person_id, data):
    if not person_id:
        return respond(400, {'message': 'ID é necessário para atualização'})
    
    # Se o e-mail estiver sendo alterado, verifica se o novo e-mail já existe
    if 'email' in data:
        existing = table.query(
            IndexName='EmailIndex',
            KeyConditionExpression=Key('email').eq(data['email'])
        )
        for item in existing.get('Items', []):
            if item['id'] != person_id:
                return respond(400, {'message': 'Este e-mail já está em uso por outro usuário'})
                
    if 'telefone' in data:
        data['telefone'] = normalize_phone(data['telefone'])
        
    # Constrói expressão de update dinamicamente
    update_expr = "set "
    attr_values = {}
    attr_names = {}
    
    for key, value in data.items():
        if key not in ['id', 'dataCadastro']:
            update_expr += f"#{key} = :{key}, "
            attr_values[f":{key}"] = value
            attr_names[f"#{key}"] = key
    
    if not attr_values:
        return respond(200, {'message': 'Nada para atualizar'})
        
    update_expr = update_expr.rstrip(", ")
    
    try:
        response = table.update_item(
            Key={'id': person_id},
            UpdateExpression=update_expr,
            ExpressionAttributeValues=attr_values,
            ExpressionAttributeNames=attr_names,
            ReturnValues="ALL_NEW"
        )
        return respond(200, response.get('Attributes', {}))
    except ClientError as e:
        return respond(400, {'message': e.response['Error']['Message']})

def delete_person(person_id):
    table.delete_item(Key={'id': person_id})
    return respond(204, None)

def respond(status_code, body):
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        },
        'body': json.dumps(body) if body is not None else ""
    }