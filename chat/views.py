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
from openai import OpenAI
import requests

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
        host = DB_HOST
        if host == 'localhost':
            host = '127.0.0.1'
        conn = psycopg2.connect(
            host=host,
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
    tab = request.GET.get('tab', '')
    if query or (tab and tab != 'all'):
        return render(request, 'chat/search.html', {'initial_query': query})
    return render(request, 'chat/home.html')


def search_page(request):
    """Search results page — renders the topbar + tabs layout. No login required."""
    query = request.GET.get('q', '')
    return render(request, 'chat/search.html', {
        'initial_query': query,
    })


def _map_api_result_to_product(res):
    """Map a Findle API result (real estate or product) to the frontend product schema."""
    structured = res.get('structured') or {}

    # Build a human-readable title from available fields
    parts = []
    prop_type = res.get('property_type') or ''
    trans_type = res.get('transaction_type') or ''
    rooms = structured.get('rooms')
    address = res.get('address') or ''
    district = res.get('district') or ''
    region = res.get('region') or ''
    total_area = res.get('total_area')

    if prop_type:
        parts.append(prop_type)
    if trans_type:
        parts.append(f"({trans_type})")
    if rooms:
        parts.append(f"{rooms}-xonali")
    if total_area:
        parts.append(f"{total_area} m²")
    if address:
        parts.append(address)
    elif district:
        parts.append(district)

    title = ' '.join(parts) if parts else res.get('product_id', 'Listing')

    # Location string for who_by / site_name
    location_parts = [p for p in [district, region] if p]
    location_str = ', '.join(location_parts) if location_parts else 'findle.uz'

    # Price
    price = res.get('price')
    currency = res.get('currency') or ''
    if price is not None:
        try:
            price = float(price)
        except (TypeError, ValueError):
            price = None

    # Accuracy score (integer 0-100 from API)
    accuracy = res.get('accuracy')

    # Build a product_url from product_id if available
    product_id = res.get('product_id', '')
    product_url = f"https://findle.uz/product/{product_id}" if product_id else '#'

    return {
        'image_url': None,
        'product_url': product_url,
        'title': title,
        'rating': None,
        'who_by': location_str,
        'site_name': 'findle.uz',
        'price': price,
        'old_price': None,
        'currency': currency,
        'accuracy': accuracy,
        'district': district,
        'region': region,
        'transaction_type': trans_type,
        'property_type': prop_type,
        'total_area': total_area,
        'rooms': rooms,
    }


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
        
        products_data = []
        
        # 1. Call Findle Search API
        try:
            api_url = 'https://api.findle.uz/search'
            payload = {
                'query': prompt,
                'limit': 10
            }
            res = requests.post(api_url, json=payload, headers={'accept': 'application/json', 'Content-Type': 'application/json'}, timeout=15)
            if res.status_code == 200:
                api_data = res.json()
                results = api_data.get('results', [])
            else:
                results = []
        except Exception as e:
            print(f"Error calling findle api: {e}")
            results = []
            
        # Try to enrich from DB first; fall back to raw API data
        accuracy_map = {r['product_id']: r.get('accuracy') for r in results if 'product_id' in r}
        product_ids = list(accuracy_map.keys())

        db_results = {}
        if product_ids:
            conn = get_db_connection()
            if conn:
                try:
                    cur = conn.cursor()
                    query_sql = """
                        SELECT product_id, image_url, product_url, title, rating, who_by, site_name, raw_data 
                        FROM raw_products 
                        WHERE product_id IN %s
                    """
                    cur.execute(query_sql, (tuple(product_ids),))
                    rows = cur.fetchall()
                    
                    for row in rows:
                        p_id = row[0]
                        image_url = row[1]
                        product_url = row[2]
                        title = row[3]
                        rating = row[4]
                        who_by = row[5]
                        site_name = row[6]
                        raw_data = row[7]

                        # Parse price, old_price and currency from raw_data
                        price = None
                        old_price = None
                        currency = None
                        if isinstance(raw_data, dict):
                            price_obj = raw_data.get('price')
                            if isinstance(price_obj, dict):
                                price = price_obj.get('value')
                                currency = price_obj.get('currency') or currency
                            elif isinstance(price_obj, (int, float, str)):
                                price = price_obj

                            old_price_obj = raw_data.get('old_price')
                            if isinstance(old_price_obj, dict):
                                old_price = old_price_obj.get('value')
                            elif isinstance(old_price_obj, (int, float, str)):
                                old_price = old_price_obj

                        # Convert Decimal/float if needed
                        if isinstance(price, decimal.Decimal):
                            price = float(price)
                        elif isinstance(price, str):
                            try:
                                price = float(price)
                            except ValueError:
                                pass
                        
                        if isinstance(old_price, decimal.Decimal):
                            old_price = float(old_price)
                        elif isinstance(old_price, str):
                            try:
                                old_price = float(old_price)
                            except ValueError:
                                pass

                        if isinstance(rating, decimal.Decimal):
                            rating = float(rating)

                        db_results[p_id] = {
                            'image_url': image_url,
                            'product_url': product_url,
                            'title': title,
                            'rating': rating,
                            'who_by': who_by or site_name,
                            'site_name': site_name,
                            'price': price,
                            'old_price': old_price,
                            'currency': currency,
                        }
                    cur.close()
                    conn.close()
                except Exception as e:
                    print(f"Error executing database query: {e}")
                    if conn:
                        conn.close()

        # Build final products list: prefer DB data, fall back to API data
        for r in results:
            p_id = r.get('product_id')
            if p_id in db_results:
                p_data = db_results[p_id].copy()
                p_data['accuracy'] = accuracy_map.get(p_id)
                products_data.append(p_data)
            else:
                # Use Findle API result directly (real estate or any other category)
                products_data.append(_map_api_result_to_product(r))

        recommended_products = products_data
        ai_response_content = ""

        # Calculate source counts
        unique_sites = set(p.get('site_name', '') for p in recommended_products if p.get('site_name'))
        unique_stores = set(p.get('who_by', '') for p in recommended_products if p.get('who_by'))

        return JsonResponse({
            'response': ai_response_content,
            'reasoning_steps': reasoning_steps,
            'products': recommended_products,
            'sources': {
                'sites_count': len(unique_sites),
                'stores_count': len(unique_stores),
                'products_count': len(recommended_products),
            }
        })
    return JsonResponse({'error': 'Invalid request'}, status=400)


def ai_chat_api(request):
    """Chat endpoint for "Ask AI" tab — uses OpenAI API."""
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            prompt = data.get('prompt')
            context_product = data.get('context_product')
            tagged_products = data.get('tagged_products', [])
            
            if not prompt:
                return JsonResponse({'error': 'No prompt provided'}, status=400)

            client = OpenAI(api_key=os.getenv('openai_api'))
            
            system_prompt = "You are a helpful assistant for Findle AI, a smart product discovery and comparison platform. Help users with their queries about products, shopping, and more. Use Uzbek language by default if user is in Uzbekistan or asks in Uzbek."
            
            if context_product:
                system_prompt += f"\n\nFoydalanuvchi hozirda quyidagi mahsulot haqida so'rayapti (Asosiy subyekt):\n"
                system_prompt += f"Nomi: {context_product.get('title')}\n"
                system_prompt += f"Narxi: {context_product.get('price')} so'm\n"
                system_prompt += f"Do'kon: {context_product.get('shop_name')}\n"
            
            if tagged_products:
                system_prompt += f"\n\nFoydalanuvchi quyidagi mahsulotlarni ham havola (reference) sifatida keltirdi:\n"
                for i, p in enumerate(tagged_products, 1):
                    system_prompt += f"{i}. {p.get('title')} ({p.get('price')} so'm, {p.get('shop_name')})\n"

            completion = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ]
            )

            ai_response = completion.choices[0].message.content

            return JsonResponse({
                'response': ai_response
            })
        except Exception as e:
            print(f"OpenAI error: {e}")
            return JsonResponse({'error': str(e)}, status=500)
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
