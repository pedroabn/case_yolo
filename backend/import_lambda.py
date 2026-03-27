import json
import boto3
import os
import requests
import uuid
from datetime import datetime

dynamodb = boto3.resource('dynamodb')
TABLE_NAME = os.environ.get('TABLE_NAME')
table = dynamodb.Table(TABLE_NAME)
EXTERNAL_API_URL = "https://3ji5haxzr9.execute-api.us-east-1.amazonaws.com/dev/caseYolo"

def lambda_handler(event, context):
    """
    Lambda para importar dados da API externa para o DynamoDB.
    Gera um ID único para cada usuário e garante e-mail único.
    """
    try:
        response = requests.get(EXTERNAL_API_URL)
        response.raise_for_status()
        
        raw_data = response.json()
        body_data = json.loads(raw_data.get('body', '{}'))
        clientes = body_data.get('clientes', [])
        
        imported_count = 0
        for c in clientes:
            email = c.get('E-mail')
            if not email:
                continue
                
            # Verifica se já existe pelo e-mail (único) usando o GSI EmailIndex
            existing = table.query(
                IndexName='EmailIndex',
                KeyConditionExpression=boto3.dynamodb.conditions.Key('email').eq(email)
            )
            
            if not existing.get('Items'):
                item = {
                    'id': str(uuid.uuid4()),
                    'email': email,
                    'nome': c.get('Nome'),
                    'telefone': c.get('Telefone'),
                    'tipo': c.get('Tipo'),
                    'dataCadastro': c.get('Data de Cadastro', datetime.now().strftime('%Y-%m-%d')),
                    'cep': '',
                    'foto': ''
                }
                table.put_item(Item=item)
                imported_count += 1
                
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': f'Importação concluída. {imported_count} novos registros.',
                'total_processado': len(clientes)
            })
        }
        
    except Exception as e:
        print(f"Erro na importação: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
