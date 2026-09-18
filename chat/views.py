import json
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.csrf import ensure_csrf_cookie
from .models import Conversation, Message
import os
from dotenv import load_dotenv
from openai import OpenAI
import requests

load_dotenv()

# Findle backend API (search / product details / deep research)
FINDLE_API_BASE = os.getenv('FINDLE_API_BASE', 'http://api.findle.uz:8001').rstrip('/')

SEARCH_TIMEOUT = 25
DETAILS_TIMEOUT = 25
DEEP_RESEARCH_TIMEOUT = 180

# How many results we turn into cards for the Search tab
MAX_CARDS = 24


def _findle_post(path, payload, timeout):
    """POST to the Findle API. Returns parsed JSON or None on any failure."""
    url = f"{FINDLE_API_BASE}{path}"
    try:
        res = requests.post(
            url,
            json=payload,
            headers={'accept': 'application/json', 'Content-Type': 'application/json'},
            timeout=timeout,
        )
    except Exception as e:
        print(f"[findle-api] request to {url} failed: {e}")
        return None

    if res.status_code != 200:
        print(f"[findle-api] {url} returned HTTP {res.status_code}: {res.text[:300]}")
        return None

    try:
        return res.json()
    except ValueError as e:
        print(f"[findle-api] {url} returned non-JSON body: {e}")
        return None


def _to_float(value):
    if value is None or value == '':
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _fetch_product_details(product_ids):
    """POST /products/details — returns {product_id: detail}. Missing ids are simply absent."""
    if not product_ids:
        return {}

    data = _findle_post('/products/details', {'product_ids': list(product_ids)}, DETAILS_TIMEOUT)
    if data is None:
        return {}

    # The endpoint answers with a list; tolerate a {"results": [...]} wrapper too.
    if isinstance(data, dict):
        data = data.get('results') or data.get('products') or []
    if not isinstance(data, list):
        return {}

    details = {}
    for item in data:
        if isinstance(item, dict) and item.get('product_id'):
            details[str(item['product_id'])] = item
    return details


def _build_title(res, detail):
    """Prefer the real listing title from /products/details, else describe the listing."""
    if detail and detail.get('title'):
        return detail['title']

    structured = res.get('structured') or {}
    parts = []
    if res.get('property_type'):
        parts.append(res['property_type'])
    if structured.get('rooms'):
        parts.append(f"{structured['rooms']}-xonali")
    if res.get('total_area'):
        parts.append(f"{res['total_area']} m²")
    if res.get('address'):
        parts.append(res['address'])
    elif res.get('landmark'):
        parts.append(res['landmark'])
    elif res.get('district'):
        parts.append(res['district'])

    return ' '.join(str(p) for p in parts) if parts else str(res.get('product_id', ''))


def _build_card(res, detail):
    """Map one /search result (+ its /products/details record) to the card schema the UI renders."""
    structured = res.get('structured') or {}
    detail = detail or {}

    district = res.get('district') or ''
    region = res.get('region') or ''
    location = ', '.join(p for p in (district, region) if p)

    product_id = str(res.get('product_id') or '')
    price = _to_float(res.get('price'))
    if price is None:
        price = _to_float(detail.get('price'))

    return {
        'product_id': product_id,
        'title': _build_title(res, detail),
        'image_url': detail.get('image_url') or None,
        'product_url': detail.get('product_url') or None,
        'site_name': detail.get('site_name') or res.get('site_name') or '',
        'who_by': location or detail.get('site_name') or res.get('site_name') or '',
        'price': price,
        'old_price': None,
        'currency': res.get('currency') or '',
        'accuracy': res.get('accuracy'),
        'rating': None,
        'district': district,
        'region': region,
        'address': res.get('address') or '',
        'landmark': res.get('landmark') or '',
        'property_type': res.get('property_type') or '',
        'transaction_type': res.get('transaction_type') or '',
        'total_area': res.get('total_area'),
        'rooms': structured.get('rooms'),
        'floor': structured.get('floor'),
        'total_floors': structured.get('total_floors'),
        'listed_at': res.get('listed_at') or '',
    }


def _build_cards(results, limit=MAX_CARDS):
    """Turn /search results into ordered cards, enriched in one batched /products/details call."""
    results = [r for r in (results or []) if isinstance(r, dict)][:limit]
    if not results:
        return []

    details = _fetch_product_details([str(r['product_id']) for r in results if r.get('product_id')])
    return [_build_card(r, details.get(str(r.get('product_id')))) for r in results]


def _build_sources(cards, total_count):
    sites = {c['site_name'] for c in cards if c.get('site_name')}
    districts = {c['district'] for c in cards if c.get('district')}
    return {
        'sites_count': len(sites),
        'stores_count': len(districts),
        'products_count': len(cards),
        'total_count': total_count if total_count is not None else len(cards),
    }


def _build_assist(assist):
    """The LLM/assist half of a search response — rendered in the "Ask AI" tab, never in Search."""
    assist = assist or {}
    return {
        'answer': assist.get('answer') or '',
        'highlights': assist.get('highlights') or [],
        'questions': assist.get('questions') or [],
        'language': assist.get('language') or '',
    }


@ensure_csrf_cookie
def home(request):
    """Landing page — Google-like centered search. No login required."""
    query = request.GET.get('q', '')
    tab = request.GET.get('tab', '')
    if query or (tab and tab != 'all'):
        return render(request, 'chat/search.html', {'initial_query': query})
    return render(request, 'chat/home.html')


@ensure_csrf_cookie
def search_page(request):
    """Search results page — renders the topbar + tabs layout. No login required."""
    query = request.GET.get('q', '')
    return render(request, 'chat/search.html', {
        'initial_query': query,
    })


def chat_api(request):
    """Search endpoint — proxies POST /search. Cards feed the Search tab, assist feeds "Ask AI"."""
    if request.method != 'POST':
        return JsonResponse({'error': 'Invalid request'}, status=400)

    try:
        data = json.loads(request.body)
    except ValueError:
        return JsonResponse({'error': 'Invalid JSON body'}, status=400)

    prompt = (data.get('prompt') or '').strip()
    if not prompt:
        return JsonResponse({'error': 'No prompt provided'}, status=400)

    api_data = _findle_post('/search', {'query': prompt, 'assist': 'auto'}, SEARCH_TIMEOUT)
    if api_data is None:
        return JsonResponse({'error': 'Search service is unavailable'}, status=502)

    cards = _build_cards(api_data.get('results'))

    return JsonResponse({
        'query': prompt,
        'products': cards,
        'assist': _build_assist(api_data.get('assist')),
        'sources': _build_sources(cards, api_data.get('total_count')),
        'category': api_data.get('category') or '',
        'extracted_data': api_data.get('extracted_data') or {},
    })


def deep_research_api(request):
    """Deep research — the report goes to the "Ask AI" tab, the listings to the Search tab."""
    if request.method != 'POST':
        return JsonResponse({'error': 'Invalid request'}, status=400)

    try:
        data = json.loads(request.body)
    except ValueError:
        return JsonResponse({'error': 'Invalid JSON body'}, status=400)

    prompt = (data.get('prompt') or '').strip()
    if not prompt:
        return JsonResponse({'error': 'No prompt provided'}, status=400)

    try:
        max_steps = int(data.get('max_steps') or 6)
    except (TypeError, ValueError):
        max_steps = 6
    max_steps = max(1, min(max_steps, 12))

    research = _findle_post(
        '/deep-research',
        {'query': prompt, 'max_steps': max_steps},
        DEEP_RESEARCH_TIMEOUT,
    )
    if research is None:
        return JsonResponse({'error': 'Deep research service is unavailable'}, status=502)

    # /deep-research answers with aggregates only, so pull the listings themselves from /search.
    search_data = _findle_post('/search', {'query': prompt, 'assist': 'off'}, SEARCH_TIMEOUT) or {}
    cards = _build_cards(search_data.get('results'))

    report = research.get('report') or {}
    steps = [
        {
            'question': s.get('question') or '',
            'query': s.get('query') or '',
            'total': s.get('total'),
        }
        for s in (research.get('steps') or [])
        if isinstance(s, dict)
    ]

    return JsonResponse({
        'query': prompt,
        'products': cards,
        'sources': _build_sources(cards, search_data.get('total_count')),
        'report': {
            'goal': research.get('goal') or '',
            'summary': report.get('summary') or '',
            'findings': report.get('findings') or [],
            'gaps': report.get('gaps') or [],
        },
        'steps': steps,
        'status': research.get('status') or '',
        'total_seen': research.get('total_seen'),
    })


def _openai_answer(prompt, context_product, tagged_products):
    """Fallback chat completion. Returns the answer, or None when OpenAI is unusable."""
    api_key = os.getenv('openai_api')
    if not api_key:
        return None

    system_prompt = (
        "You are a helpful assistant for Findle AI, a smart product and real-estate discovery platform. "
        "Help users with their queries about listings, prices and shopping. "
        "Use Uzbek language by default if user is in Uzbekistan or asks in Uzbek."
    )

    if context_product:
        system_prompt += "\n\nFoydalanuvchi hozirda quyidagi e'lon haqida so'rayapti (Asosiy subyekt):\n"
        system_prompt += f"Nomi: {context_product.get('title')}\n"
        system_prompt += f"Narxi: {context_product.get('price')} {context_product.get('currency') or ''}\n"
        system_prompt += f"Manba: {context_product.get('site_name') or context_product.get('shop_name')}\n"

    if tagged_products:
        system_prompt += "\n\nFoydalanuvchi quyidagi e'lonlarni ham havola (reference) sifatida keltirdi:\n"
        for i, p in enumerate(tagged_products, 1):
            system_prompt += f"{i}. {p.get('title')} ({p.get('price')} {p.get('currency') or ''})\n"

    try:
        client = OpenAI(api_key=api_key)
        completion = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
        )
        return completion.choices[0].message.content
    except Exception as e:
        print(f"[openai] chat completion failed: {e}")
        return None


def ai_chat_api(request):
    """Follow-up chat for the "Ask AI" tab.

    Answers come from the Findle assist API first (it already knows the listing data);
    OpenAI is only a fallback for questions the assist cannot handle.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Invalid request'}, status=400)

    try:
        data = json.loads(request.body)
    except ValueError:
        return JsonResponse({'error': 'Invalid JSON body'}, status=400)

    prompt = (data.get('prompt') or '').strip()
    if not prompt:
        return JsonResponse({'error': 'No prompt provided'}, status=400)

    context_product = data.get('context_product')
    tagged_products = data.get('tagged_products', [])

    # 1. Findle assist — grounded in the real listing data
    api_data = _findle_post('/search', {'query': prompt, 'assist': 'auto'}, SEARCH_TIMEOUT)
    if api_data:
        assist = _build_assist(api_data.get('assist'))
        if assist['answer']:
            return JsonResponse({
                'response': assist['answer'],
                'highlights': assist['highlights'],
                'questions': assist['questions'],
                'source': 'findle',
            })

    # 2. OpenAI fallback
    answer = _openai_answer(prompt, context_product, tagged_products)
    if answer:
        return JsonResponse({'response': answer, 'highlights': [], 'questions': [], 'source': 'openai'})

    return JsonResponse({'error': 'Assistant is unavailable right now.'}, status=502)

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
