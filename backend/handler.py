import json
import boto3
import uuid
from decimal import Decimal

# Helper to handle Decimal types (DynamoDB returns Decimals for numbers)
class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

dynamodb = boto3.resource('dynamodb')
table_name = 'Pessoas' # Assuming the table name is Pessoas
table = dynamodb.Table(table_name)

def lambda_handler(event, context):
    print(f"Event: {json.dumps(event)}")
    
    action = event.get('action')
    data = event.get('data', {})
    
    try:
        if action == 'list':
            tipo = data.get('tipo', 'Todos')
            search = data.get('search', '').lower()
            
            response = table.scan()
            items = response.get('Items', [])
            
            # Filter by type
            if tipo != 'Todos':
                items = [item for item in items if item.get('tipo') == tipo]
            
            # Filter by search term
            if search:
                items = [item for item in items if 
                         search in item.get('nome', '').lower() or 
                         search in item.get('email', '').lower()]
            
            return {
                'statusCode': 200,
                'body': json.dumps(items, cls=DecimalEncoder)
            }
            
        elif action == 'create':
            item = {
                'id': str(uuid.uuid4()),
                'nome': data.get('nome'),
                'telefone': data.get('telefone'),
                'email': data.get('email'),
                'tipo': data.get('tipo'),
                'avatarUrl': data.get('avatarUrl'),
                'cep': data.get('cep'),
                'endereco': data.get('endereco'),
                'createdAt': data.get('createdAt')
            }
            table.put_item(Item=item)
            return {
                'statusCode': 201,
                'body': json.dumps(item, cls=DecimalEncoder)
            }
            
        elif action == 'update':
            person_id = data.get('id')
            if not person_id:
                return {'statusCode': 400, 'body': 'Missing ID'}
                
            # Update expression
            update_expr = "set nome=:n, telefone=:t, email=:e, tipo=:tp, avatarUrl=:a, cep=:c, endereco=:en"
            expr_values = {
                ':n': data.get('nome'),
                ':t': data.get('telefone'),
                ':e': data.get('email'),
                ':tp': data.get('tipo'),
                ':a': data.get('avatarUrl'),
                ':c': data.get('cep'),
                ':en': data.get('endereco')
            }
            
            table.update_item(
                Key={'id': person_id},
                UpdateExpression=update_expr,
                ExpressionAttributeValues=expr_values,
                ReturnValues="ALL_NEW"
            )
            return {
                'statusCode': 200,
                'body': json.dumps(data, cls=DecimalEncoder)
            }
            
        elif action == 'delete':
            person_id = data.get('id')
            if not person_id:
                return {'statusCode': 400, 'body': 'Missing ID'}
                
            table.delete_item(Key={'id': person_id})
            return {
                'statusCode': 200,
                'body': json.dumps({'message': 'Deleted successfully'})
            }
            
        else:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Invalid action'})
            }
            
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
