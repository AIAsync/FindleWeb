import codecs
import json
import re
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse, StreamingHttpResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.csrf import ensure_csrf_cookie
from .models import Conversation, Message
import os
from dotenv import load_dotenv
from openai import OpenAI
import requests

load_dotenv()

# Findle backend API (search / chat / deep research)
FINDLE_API_BASE = os.getenv('FINDLE_API_BASE', 'http://api.findle.uz:8001').rstrip('/')

SEARCH_TIMEOUT = 25
CHAT_TIMEOUT = 60
DEEP_RESEARCH_TIMEOUT = 180
MEMORY_TIMEOUT = 10

# Cards per Search-tab page. The API caps per_page at 50.
SEARCH_PER_PAGE = 24

# /chat keeps no state — the client replays the transcript, capped by the API at 40 turns.
MAX_HISTORY = 40

# The API keeps the last 10 messages per session_id and drops a session after an
# hour idle, so this is conversation context, not an archive.
SESSION_ID_MAX = 64
_SESSION_ID_OK = re.compile(r'^[A-Za-z0-9_.:-]+$')


def _clean_session_id(value):
    """Session ids go into a URL path, so keep them to an opaque, printable token."""
    value = (value or '').strip()
    if not value or len(value) > SESSION_ID_MAX or not _SESSION_ID_OK.match(value):
        return ''
    return value


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


def _findle_delete(path, timeout):
    """DELETE against the Findle API. Returns (ok, status_code)."""
    url = f"{FINDLE_API_BASE}{path}"
    try:
        res = requests.delete(url, headers={'accept': 'application/json'}, timeout=timeout)
    except Exception as e:
        print(f"[findle-api] DELETE {url} failed: {e}")
        return False, 0
    if res.status_code not in (200, 204, 404):
        print(f"[findle-api] DELETE {url} returned HTTP {res.status_code}: {res.text[:200]}")
    return res.status_code in (200, 204), res.status_code


def _findle_stream(path, payload, timeout):
    """Open an SSE stream on the Findle API.

    Returns the live response, or None when the endpoint is missing or refuses —
    callers fall back to the blocking endpoint in that case.
    """
    url = f"{FINDLE_API_BASE}{path}"
    try:
        res = requests.post(
            url,
            json=payload,
            stream=True,
            headers={'accept': 'text/event-stream', 'Content-Type': 'application/json'},
            timeout=timeout,
        )
    except Exception as e:
        print(f"[findle-api] stream {url} failed: {e}")
        return None

    if res.status_code != 200:
        # 404 is the expected answer from an API build without the stream routes.
        print(f"[findle-api] stream {url} returned HTTP {res.status_code}")
        res.close()
        return None
    return res


def _iter_sse(response):
    """Yield (event, data) pairs from an SSE response, as each frame arrives.

    Frames are `event: <name>\\ndata: <json>\\n\\n`; a frame may carry several
    data lines, which the spec says to join with newlines.

    Reading this by hand rather than with requests' helpers, because both of the
    obvious ones defeat streaming: iter_lines() blocks until its 512-byte chunk
    is full, and iter_content(chunk_size=None) bottoms out in urllib3's
    read(amt=None), which reads to EOF. Either way every frame lands in one
    batch when the connection closes. read1() returns whatever one socket read
    produced, which is exactly a frame boundary in practice; iter_content(1) is
    the fallback for urllib3 builds without it. Decoding is incremental because
    a UTF-8 character can straddle two reads.
    """
    decoder = codecs.getincrementaldecoder('utf-8')(errors='replace')
    buffer = ''
    event, data_lines = '', []

    raw = getattr(response, 'raw', None)
    if raw is not None and hasattr(raw, 'read1'):
        def chunks():
            while True:
                block = raw.read1(8192)
                if not block:
                    return
                yield block
    else:
        def chunks():
            return response.iter_content(chunk_size=1)

    def flush_frame():
        if not data_lines:
            return None
        body = '\n'.join(data_lines)
        try:
            return event or 'message', json.loads(body)
        except ValueError:
            return event or 'message', {'raw': body}

    try:
        for chunk in chunks():
            if not chunk:
                continue
            buffer += decoder.decode(chunk)
            while '\n' in buffer:
                line, buffer = buffer.split('\n', 1)
                line = line.rstrip('\r')
                if line == '':
                    frame = flush_frame()
                    if frame:
                        yield frame
                    event, data_lines = '', []
                elif line.startswith(':'):
                    continue  # keep-alive comment
                elif line.startswith('event:'):
                    event = line[6:].strip()
                elif line.startswith('data:'):
                    data_lines.append(line[5:].lstrip())
        frame = flush_frame()  # a final frame with no trailing blank line
        if frame:
            yield frame
    finally:
        response.close()


def _sse(event, payload):
    """Encode one frame for the browser."""
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _unwrap(body, key):
    """Take the payload out of its envelope.

    The stream wraps several frames one level deep — `assist` arrives as
    {"assist": {...}}, `done` as {"result": {...}}, a research `step` as
    {"index": n, "step": {...}} — while the docs describe the inner object.
    Accepts either form so a change on the API side does not break this.
    """
    if isinstance(body, dict):
        inner = body.get(key)
        if isinstance(inner, dict):
            return inner
        return body
    return {}


def _to_float(value):
    if value is None or value == '':
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _build_title(res):
    """Rows carry their own title; describe the listing from its fields when they don't."""
    if res.get('title'):
        return res['title']

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


def _build_card(res):
    """Map one result row (/search or a /chat search tool call) to the card schema the UI renders."""
    structured = res.get('structured') or {}

    district = res.get('district') or ''
    region = res.get('region') or ''
    location = ', '.join(p for p in (district, region) if p)

    return {
        'product_id': str(res.get('product_id') or ''),
        'title': _build_title(res),
        'image_url': res.get('image_url') or None,
        'product_url': res.get('product_url') or None,
        'site_name': res.get('site_name') or '',
        'who_by': location or res.get('site_name') or '',
        'price': _to_float(res.get('price')),
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


def _build_cards(results):
    """Turn result rows into ordered cards. Every card field already lives on the row."""
    return [_build_card(r) for r in (results or []) if isinstance(r, dict)]


def _build_page(page):
    """Normalize the API's page block — the Search tab's pager reads has_next/has_prev from it."""
    page = page or {}
    return {
        'page': page.get('page') or 1,
        'per_page': page.get('per_page') or SEARCH_PER_PAGE,
        'total': page.get('total') or 0,
        'pages': page.get('pages') or 0,
        'has_next': bool(page.get('has_next')),
        'has_prev': bool(page.get('has_prev')),
        'search_id': page.get('search_id') or '',
        'cached': bool(page.get('cached')),
    }


def _build_sources(cards, total_count, retrieval=None):
    """Counts for the result header. The API's retrieval report wins; cards are the fallback."""
    retrieval = retrieval or {}
    districts = {c['district'] for c in cards if c.get('district')}

    return {
        'sites_count': retrieval.get('sites_checked') or len({c['site_name'] for c in cards if c.get('site_name')}),
        'stores_count': len(districts),
        'products_count': len(cards),
        'total_count': total_count if total_count is not None else len(cards),
    }


def _chat_listings(chat, prompt):
    """The listings an answer stands on, so the Agent tab can cite them and Search can show them.

    `statistics` and `compare` answer with numbers and no rows, and the `search` tool returns a
    short unpaged slice — so whenever a tool touched the data, re-run its resolved query through
    /search to get a full, pageable list. Small talk runs no tool and gets no listings.
    """
    tool_calls = [c for c in (chat.get('tool_calls') or []) if isinstance(c, dict) and c.get('ok')]
    if not tool_calls:
        return [], None

    query = prompt
    for call in tool_calls:
        resolved = (call.get('arguments') or {}).get('query')
        if isinstance(resolved, str) and resolved.strip():
            query = resolved.strip()
            break

    companion = _findle_post(
        '/search',
        {'query': query[:2000], 'assist': 'off', 'route': 'search', 'per_page': SEARCH_PER_PAGE},
        SEARCH_TIMEOUT,
    ) or {}

    if companion.get('results'):
        return companion['results'], _build_page(companion.get('page'))
    return chat.get('results') or [], None


def _build_citations(raw_sources):
    """Normalize the `sources` list that backs the [1], [2] markers in an answer.

    The marker number is `ref`, not the position, because the API drops any
    marker it could not ground (it records that in meta.dropped) — so the list
    can legitimately run 1, 2, 4. Telegram listings have no public page and
    come back with `url: null`; those stay in the list and the UI reveals the
    card instead of opening a link.
    """
    citations = []
    for i, src in enumerate(raw_sources or []):
        if not isinstance(src, dict):
            continue
        try:
            ref = int(src.get('ref'))
        except (TypeError, ValueError):
            ref = i + 1
        citations.append({
            'ref': ref,
            'product_id': str(src.get('product_id') or ''),
            'title': src.get('title') or '',
            'url': src.get('url') or None,
            'price': _to_float(src.get('price')),
            'currency': src.get('currency') or '',
            'site_name': src.get('site_name') or '',
            'district': src.get('district') or '',
        })
    return citations


def _llm_questions(questions, source):
    """Follow-ups are only worth showing when the model wrote them — rule text is canned filler."""
    if source != 'llm':
        return []
    return [q.strip() for q in (questions or []) if isinstance(q, str) and q.strip()]


def _build_assist(assist):
    """The LLM/assist half of a search response — rendered in the Agent tab, never in Search."""
    assist = assist or {}
    return {
        'answer': assist.get('answer') or '',
        'highlights': assist.get('highlights') or [],
        'questions': _llm_questions(assist.get('questions'), assist.get('source')),
        'language': assist.get('language') or '',
        'citations': _build_citations(assist.get('sources')),
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
    """Search tab — proxies POST /search. Cards feed the Search tab, the assist text feeds Agent."""
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
        page = int(data.get('page') or 1)
    except (TypeError, ValueError):
        page = 1
    page = max(1, page)

    payload = {'query': prompt, 'assist': 'auto', 'page': page, 'per_page': SEARCH_PER_PAGE}
    # Pins the pager to one ranked list, so listings never shift between pages.
    search_id = (data.get('search_id') or '').strip()
    if search_id:
        payload['search_id'] = search_id

    session_id = _clean_session_id(data.get('session_id'))
    if session_id:
        payload['session_id'] = session_id

    api_data = _findle_post('/search', payload, SEARCH_TIMEOUT)
    if api_data is None:
        return JsonResponse({'error': 'Search service is unavailable'}, status=502)

    return JsonResponse(_search_response(api_data, prompt))


def _search_response(api_data, prompt):
    """Shape a /search payload for the UI. Shared by the blocking and streaming views."""
    # A question routes itself to the chat layer; the answer and its listings come back in `chat`.
    chat = api_data.get('chat') or {}
    results = api_data.get('results') or []
    page_info = _build_page(api_data.get('page'))

    if not results and chat:
        results, chat_page = _chat_listings(chat, prompt)
        if chat_page:
            page_info = chat_page

    cards = _build_cards(results)

    assist = _build_assist(api_data.get('assist'))
    if chat.get('reply'):
        assist = {
            'answer': chat['reply'],
            'highlights': chat.get('highlights') or [],
            'questions': _llm_questions(chat.get('suggestions'), chat.get('source')),
            'language': chat.get('language') or assist['language'],
            # The handed-off answer cites through the chat block's own source list.
            'citations': _build_citations(chat.get('sources')) or assist['citations'],
        }

    total = page_info['total'] or api_data.get('total_count')

    return {
        'query': prompt,
        'mode': api_data.get('mode') or 'search',
        'handoff': api_data.get('handoff') or None,
        'products': cards,
        'page': page_info,
        'assist': assist,
        'sources': _build_sources(cards, total, api_data.get('retrieval')),
        'category': api_data.get('category') or '',
        'extracted_data': api_data.get('extracted_data') or {},
    }


def deep_research_api(request):
    """Agent tab, Deep research toggle on — the report renders in Agent, the listings in Search."""
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

    return JsonResponse(_research_response(research, prompt))


def _research_listings(prompt):
    """/deep-research answers with aggregates only, so pull the listings from /search."""
    return _findle_post(
        '/search',
        {'query': prompt, 'assist': 'off', 'route': 'search', 'per_page': SEARCH_PER_PAGE},
        SEARCH_TIMEOUT,
    ) or {}


def _build_steps(raw_steps):
    return [
        {
            'question': s.get('question') or '',
            'query': s.get('query') or '',
            'total': s.get('total'),
            'round': s.get('round'),
        }
        for s in (raw_steps or [])
        if isinstance(s, dict)
    ]


def _research_response(research, prompt, search_data=None):
    """Shape a /deep-research payload for the UI. Shared by the blocking and streaming views."""
    if search_data is None:
        search_data = _research_listings(prompt)

    cards = _build_cards(search_data.get('results'))
    page_info = _build_page(search_data.get('page'))
    report = research.get('report') or {}

    return {
        'query': prompt,
        'products': cards,
        'page': page_info,
        'sources': _build_sources(cards, page_info['total'] or search_data.get('total_count'),
                                  search_data.get('retrieval')),
        # Every round's listings are merged into one list, so [3] means the same
        # listing wherever it appears in the report.
        'citations': _build_citations(research.get('sources')),
        'report': {
            'goal': research.get('goal') or '',
            'summary': report.get('summary') or '',
            'findings': report.get('findings') or [],
            'gaps': report.get('gaps') or [],
        },
        'steps': _build_steps(research.get('steps')),
        'status': research.get('status') or '',
        'rounds': research.get('rounds'),
        'total_seen': research.get('total_seen'),
    }


def chat_memory_api(request, session_id):
    """Agent tab memory: read what the server kept, or wipe it.

    The wipe is what the bin button in the chat input calls. A 404 from the API
    means the session had already expired or the build has no memory routes —
    either way the next turn starts clean, so report success.
    """
    session_id = _clean_session_id(session_id)
    if not session_id:
        return JsonResponse({'error': 'Invalid session id'}, status=400)

    if request.method == 'DELETE':
        ok, status = _findle_delete(f'/chat/memory/{session_id}', MEMORY_TIMEOUT)
        if not ok and status not in (404, 0):
            return JsonResponse({'error': 'Could not clear the conversation'}, status=502)
        return JsonResponse({'cleared': True, 'session_id': session_id,
                             'supported': status not in (404, 0)})

    if request.method == 'GET':
        url = f"{FINDLE_API_BASE}/chat/memory/{session_id}"
        try:
            res = requests.get(url, headers={'accept': 'application/json'}, timeout=MEMORY_TIMEOUT)
        except Exception as e:
            print(f"[findle-api] GET {url} failed: {e}")
            return JsonResponse({'messages': [], 'supported': False})
        if res.status_code != 200:
            return JsonResponse({'messages': [], 'supported': False})
        try:
            body = res.json()
        except ValueError:
            return JsonResponse({'messages': [], 'supported': False})
        messages = body.get('messages') if isinstance(body, dict) else body
        return JsonResponse({'messages': messages or [], 'supported': True})

    return JsonResponse({'error': 'Invalid request'}, status=405)


def _stream_response(generator):
    """Wrap a frame generator as an SSE response.

    X-Accel-Buffering matters behind nginx: without it nginx buffers the whole
    stream and the client sees nothing until the end, which defeats the point.
    """
    response = StreamingHttpResponse(generator, content_type='text/event-stream')
    response['Cache-Control'] = 'no-cache, no-transform'
    response['X-Accel-Buffering'] = 'no'
    return response


def search_stream_api(request):
    """Search tab, streamed: listings land in ~0.3s, the written answer follows.

    The browser always gets the same SSE contract. When the API build has no
    /search/stream, this synthesizes the same frames around one blocking call,
    so the front end never needs a second code path.
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

    try:
        page = max(1, int(data.get('page') or 1))
    except (TypeError, ValueError):
        page = 1

    payload = {'query': prompt, 'assist': 'auto', 'page': page, 'per_page': SEARCH_PER_PAGE}
    search_id = (data.get('search_id') or '').strip()
    if search_id:
        payload['search_id'] = search_id
    session_id = _clean_session_id(data.get('session_id'))
    if session_id:
        payload['session_id'] = session_id

    def frames():
        upstream = _findle_stream('/search/stream', payload, SEARCH_TIMEOUT)

        if upstream is None:
            # No streaming upstream — same frames, one blocking call.
            yield _sse('start', {'query': prompt, 'streamed': False})
            api_data = _findle_post('/search', payload, SEARCH_TIMEOUT)
            if api_data is None:
                yield _sse('error', {'message': 'Search service is unavailable'})
                return
            shaped = _search_response(api_data, prompt)
            yield _sse('results', {'products': shaped['products'], 'page': shaped['page'],
                                   'sources': shaped['sources']})
            if shaped['assist']['answer']:
                yield _sse('assist', shaped['assist'])
            yield _sse('done', shaped)
            return

        yield _sse('start', {'query': prompt, 'streamed': True})
        final = None
        try:
            for event, body in _iter_sse(upstream):
                if event == 'results':
                    rows = body.get('results') if isinstance(body, dict) else body
                    cards = _build_cards(rows)
                    page_block = _build_page((body or {}).get('page') if isinstance(body, dict) else None)
                    yield _sse('results', {
                        'products': cards,
                        'page': page_block,
                        'sources': _build_sources(cards, page_block['total'],
                                                  (body or {}).get('retrieval') if isinstance(body, dict) else None),
                    })
                elif event == 'stage':
                    yield _sse('stage', body if isinstance(body, dict) else {'name': str(body)})
                elif event == 'delta':
                    # Whole sentences, not raw tokens: the API only releases text
                    # that has been checked against the facts.
                    text = body.get('text') if isinstance(body, dict) else str(body)
                    if text:
                        yield _sse('delta', {'text': text})
                elif event == 'assist':
                    yield _sse('assist', _build_assist(_unwrap(body, 'assist')))
                elif event == 'done':
                    final = _search_response(_unwrap(body, 'result'), prompt)
                    yield _sse('done', final)
                elif event == 'error':
                    yield _sse('error', body if isinstance(body, dict) else {'message': str(body)})
        except Exception as e:
            print(f"[findle-api] search stream broke: {e}")
            yield _sse('error', {'message': 'The search stream ended early'})
            return

        if final is None:
            # Upstream closed without `done`; nothing usable was assembled.
            yield _sse('error', {'message': 'The search stream ended early'})

    return _stream_response(frames())


def deep_research_stream_api(request):
    """Agent tab, Deep research on: each round is shown the moment it lands."""
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

    payload = {'query': prompt, 'max_steps': max_steps}

    def frames():
        upstream = _findle_stream('/deep-research/stream', payload, DEEP_RESEARCH_TIMEOUT)

        if upstream is None:
            yield _sse('start', {'query': prompt, 'streamed': False})
            research = _findle_post('/deep-research', payload, DEEP_RESEARCH_TIMEOUT)
            if research is None:
                yield _sse('error', {'message': 'Deep research service is unavailable'})
                return
            shaped = _research_response(research, prompt)
            for step in shaped['steps']:
                yield _sse('step', step)
            yield _sse('done', shaped)
            return

        yield _sse('start', {'query': prompt, 'streamed': True})
        final = None
        try:
            for event, body in _iter_sse(upstream):
                if event == 'plan':
                    yield _sse('plan', {
                        'goal': (body or {}).get('goal') or '',
                        'steps': _build_steps((body or {}).get('steps')),
                    })
                elif event == 'step':
                    step = _build_steps([_unwrap(body, 'step')])
                    if step:
                        # `index` rides on the envelope, not the step itself.
                        step[0]['index'] = (body or {}).get('index')
                        yield _sse('step', step[0])
                elif event == 'round':
                    yield _sse('round', body if isinstance(body, dict) else {'round': body})
                elif event == 'report':
                    report = _unwrap(body, 'report')
                    yield _sse('report', {
                        'goal': (body or {}).get('goal') or '',
                        'summary': report.get('summary') or '',
                        'findings': report.get('findings') or [],
                        'gaps': report.get('gaps') or [],
                        'citations': _build_citations((body or {}).get('sources')),
                    })
                elif event == 'done':
                    final = _research_response(_unwrap(body, 'result'), prompt)
                    yield _sse('done', final)
                elif event == 'error':
                    yield _sse('error', body if isinstance(body, dict) else {'message': str(body)})
        except Exception as e:
            print(f"[findle-api] deep research stream broke: {e}")
            yield _sse('error', {'message': 'The research stream ended early'})
            return

        if final is None:
            yield _sse('error', {'message': 'The research stream ended early'})

    return _stream_response(frames())


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


def _build_history(history):
    """Sanitize the transcript the client replays — the chat API keeps no state of its own."""
    clean = []
    for msg in (history or []):
        if not isinstance(msg, dict):
            continue
        role = msg.get('role')
        content = (msg.get('content') or '').strip()
        if role in ('user', 'assistant') and content:
            clean.append({'role': role, 'content': content[:4000]})
    return clean[-MAX_HISTORY:]


def ai_chat_api(request):
    """Agent tab — proxies POST /chat. The model calls the tools; Python computes the numbers."""
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

    # 1. Findle chat — grounded in the real listing data
    payload = {'message': prompt[:2000], 'history': _build_history(data.get('history'))}
    # With a session the API remembers the last 10 messages itself. The replayed
    # history stays in the payload: it is the authoritative copy, and it keeps
    # the turn correct if the session has expired or the request lands on a
    # replica that never saw it.
    session_id = _clean_session_id(data.get('session_id'))
    if session_id:
        payload['session_id'] = session_id

    chat = _findle_post('/chat', payload, CHAT_TIMEOUT)
    if chat and chat.get('reply'):
        listings, page_info = _chat_listings(chat, prompt)
        cards = _build_cards(listings)
        return JsonResponse({
            'response': chat['reply'],
            'highlights': chat.get('highlights') or [],
            'questions': _llm_questions(chat.get('suggestions'), chat.get('source')),
            'products': cards,
            'page': page_info,
            'sources': _build_sources(cards, (page_info or {}).get('total') or len(cards)),
            'citations': _build_citations(chat.get('sources')),
            'intent': chat.get('intent') or '',
            'tools': [c.get('name') for c in (chat.get('tool_calls') or []) if isinstance(c, dict)],
            'source': chat.get('source') or 'findle',
            'session_id': session_id,
        })

    # 2. OpenAI fallback — keeps @mention questions answerable when the chat API is down
    answer = _openai_answer(prompt, context_product, tagged_products)
    if answer:
        return JsonResponse({'response': answer, 'highlights': [], 'questions': [],
                             'products': [], 'source': 'openai'})

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
