import json
import time
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from .models import Conversation, Message
import os
import psycopg2
from dotenv import load_dotenv
import decimal

load_dotenv()

# Database connection parameters from .env
DB_HOST = os.getenv('POSTGRES_HOST')
DB_PORT = os.getenv('POSTGRES_PORT', '5432')
DB_NAME = os.getenv('POSTGRES_DB')
DB_USER = os.getenv('POSTGRES_USER')
DB_PASSWORD = os.getenv('POSTGRES_PASSWORD')
DB_TABLE = os.getenv('POSTGRES_TABLE', 'products')

def get_db_connection():
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD
        )
        return conn
    except Exception as e:
        print(f"Error connecting to database: {e}")
        return None


def home(request):
    """Landing page — Google-like centered search. No login required."""
    query = request.GET.get('q', '')
    if query:
        return render(request, 'chat/search.html', {'initial_query': query})
    return render(request, 'chat/home.html')


def search_page(request):
    """Search results page — renders the topbar + tabs layout. No login required."""
    query = request.GET.get('q', '')
    return render(request, 'chat/search.html', {
        'initial_query': query,
    })


def chat_api(request):
    """Search endpoint — does NOT save to database. Works like Google search query. No login required."""
    if request.method == 'POST':
        data = json.loads(request.body)
        prompt = data.get('prompt')

        if not prompt:
             return JsonResponse({'error': 'No prompt provided'}, status=400)

        # Mock AI Reasoning
        reasoning_steps = [
            "This product can be an individual choice for you. Therefore, choose for yourself in terms of affordability and quality."
        ]
        
        # PostgreSQL Search Logic
        products_data = []
        conn = get_db_connection()
        
        if conn:
            try:
                cur = conn.cursor()
                # Determine columns to select - assuming table schema matches requirements or mapping is needed.
                # Based on user request: 
                # 1. image_url (column: image_url)
                # 2. title (column: title)
                # 3. old_price (column: old_price), price (column: price)
                # 4. rating (column: rating)
                # 5. who_by (column: who_by)
                # 6. product_url (column: product_url)
                
                # Search query using ILIKE for partial case-insensitive match on title or site_name
                search_query = f"%{prompt}%"
                
                query_sql = f"""
                    SELECT image_url, title, old_price, price, rating, who_by, product_url, site_name 
                    FROM {DB_TABLE} 
                    WHERE title ILIKE %s OR site_name ILIKE %s 
                    LIMIT 50
                """
                
                cur.execute(query_sql, (search_query, search_query))
                rows = cur.fetchall()
                
                for row in rows:
                    # Map row to dictionary
                    # Index 2: old_price, Index 3: price
                    old_price = row[2]
                    price = row[3]
                    site_name = row[7]
                    
                    # Convert Decimal to float/string if needed for JSON
                    if isinstance(old_price, decimal.Decimal):
                        old_price = float(old_price)
                    if isinstance(price, decimal.Decimal):
                        price = float(price)
                        
                    # Use site_name as who_by if who_by is empty
                    who_by = row[5] or site_name
                        
                    products_data.append({
                        'image_url': row[0],
                        'title': row[1],
                        'old_price': old_price,
                        'price': price,
                        'rating': row[4],
                        'who_by': who_by,
                        'site_name': site_name,
                        'product_url': row[6]
                    })
                    
                cur.close()
                conn.close()
            except Exception as e:
                print(f"Error executing query: {e}")
                if conn:
                    conn.close()
        
        recommended_products = products_data

        # Legacy mock support or empty result handling could go here if needed, 
        # but prompt implied strict Postgres usage.
        
        # If no products found via Postgres, maybe return empty or a message?
        if not recommended_products and not conn:
            # Fallback if DB connection failed entirely (optional, for safety)
             recommended_products = [] 


        ai_response_content = ""

        return JsonResponse({
            'response': ai_response_content,
            'reasoning_steps': reasoning_steps,
            'products': recommended_products,
        })
    return JsonResponse({'error': 'Invalid request'}, status=400)


@login_required
def save_chat(request):
    """Save endpoint — saves the current search result to the database only when user clicks save button."""
    if request.method == 'POST':
        data = json.loads(request.body)
        prompt = data.get('prompt')
        response_text = data.get('response', '')
        reasoning_steps = data.get('reasoning_steps', [])
        products = data.get('products', [])

        if not prompt:
            return JsonResponse({'error': 'No prompt provided'}, status=400)

        # Create new conversation
        title = prompt[:50] + '...' if len(prompt) > 50 else prompt
        conversation = Conversation.objects.create(user=request.user, title=title)

        # Save user message
        Message.objects.create(
            conversation=conversation,
            role='user',
            content=prompt
        )

        # Save AI message
        Message.objects.create(
            conversation=conversation,
            role='ai',
            content=response_text,
            reasoning_steps=reasoning_steps,
            recommended_products=products
        )

        return JsonResponse({
            'status': 'success',
            'conversation_id': conversation.id,
            'title': conversation.title
        })
    return JsonResponse({'error': 'Invalid request'}, status=400)

@login_required
def rename_chat(request, chat_id):
    if request.method == 'POST':
        conversation = get_object_or_404(Conversation, id=chat_id, user=request.user)
        data = json.loads(request.body)
        new_title = data.get('title')
        if new_title:
            conversation.title = new_title
            conversation.save()
            return JsonResponse({'status': 'success', 'title': conversation.title})
    return JsonResponse({'error': 'Invalid request'}, status=400)

@login_required
def delete_chat(request, chat_id):
    if request.method == 'DELETE':
        conversation = get_object_or_404(Conversation, id=chat_id, user=request.user)
        conversation.delete()
        return JsonResponse({'status': 'success'})
    return JsonResponse({'error': 'Invalid request'}, status=400)

@login_required
def delete_message(request, message_id):
    if request.method == 'DELETE':
        msg = get_object_or_404(Message, id=message_id, conversation__user=request.user)
        
        # If user message, also try to delete the next AI message
        if msg.role == 'user':
            next_msg = Message.objects.filter(
                conversation=msg.conversation, 
                id__gt=msg.id, 
                role='ai'
            ).order_by('id').first()
            if next_msg:
                next_msg.delete()
        
        msg.delete()
        return JsonResponse({'status': 'success'})
    return JsonResponse({'error': 'Invalid request'}, status=400)

@login_required
def get_conversation(request, conversation_id):
    conversation = get_object_or_404(Conversation, id=conversation_id, user=request.user)
    messages = conversation.messages.order_by('created_at')
    
    messages_data = [{
        'id': msg.id,
        'role': msg.role,
        'content': msg.content,
        'reasoning_steps': msg.reasoning_steps,
        'recommended_products': msg.recommended_products
    } for msg in messages]

    return JsonResponse({
        'id': conversation.id,
        'title': conversation.title,
        'messages': messages_data
    })
