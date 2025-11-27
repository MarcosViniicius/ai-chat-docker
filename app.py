import os
import requests
from flask import Flask, render_template, request, jsonify, Response, stream_with_context

app = Flask(__name__)

# Configurações via Variáveis de Ambiente
API_KEYS = {
    'openai': os.environ.get('OPENAI_API_KEY'),
    'anthropic': os.environ.get('ANTHROPIC_API_KEY'),
    'gemini': os.environ.get('GEMINI_API_KEY'),
    'openrouter': os.environ.get('OPENROUTER_API_KEY')
}

URLS = {
    'openai': 'https://api.openai.com/v1',
    'anthropic': 'https://api.anthropic.com/v1',
    'gemini': 'https://generativelanguage.googleapis.com/v1beta',
    'openrouter': 'https://openrouter.ai/api/v1'
}

@app.route('/')
def index():
    config = {
        'openai': os.environ.get('OPENAI_API_KEY', ''),
        'anthropic': os.environ.get('ANTHROPIC_API_KEY', ''),
        'gemini': os.environ.get('GEMINI_API_KEY', ''),
        'openrouter': os.environ.get('OPENROUTER_API_KEY', '')
    }
    return render_template('index.html', config=config)

@app.route('/api/models/<provider>')
def get_models(provider):
    key = API_KEYS.get(provider)
    if not key:
        return jsonify({'error': 'API Key not configured'}), 400

    try:
        if provider == 'openrouter':
            resp = requests.get(f"{URLS['openrouter']}/models")
            data = resp.json()['data']
            # Filtrar apenas modelos gratuitos ou baratos se desejar, aqui retorna todos
            # Para filtrar free: [m for m in data if 'free' in m['id'] or m['pricing']['prompt'] == '0']
            free_models = [m for m in data if 'free' in m['id'] or 'free' in m['name'].lower()]
            # Se não achar "free" explícito, retorna top models. Vamos retornar os free encontrados.
            return jsonify(free_models if free_models else data[:20])
            
        elif provider == 'openai':
            headers = {'Authorization': f'Bearer {key}'}
            resp = requests.get(f"{URLS['openai']}/models", headers=headers)
            return jsonify(resp.json()['data'])
            
        # Implementações simplificadas para outros provedores
        return jsonify([])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    provider = data.get('provider')
    model = data.get('model')
    messages = data.get('messages')
    
    key = API_KEYS.get(provider)
    if not key:
        return jsonify({'error': 'Provider key missing'}), 400

    def generate():
        headers = {}
        payload = {}
        url = ""

        if provider == 'openrouter':
            url = f"{URLS['openrouter']}/chat/completions"
            headers = {
                'Authorization': f'Bearer {key}',
                'HTTP-Referer': 'http://localhost:5000', 
                'X-Title': 'Local AI Chat'
            }
            payload = {'model': model, 'messages': messages, 'stream': True}
        
        elif provider == 'openai':
            url = f"{URLS['openai']}/chat/completions"
            headers = {'Authorization': f'Bearer {key}'}
            payload = {'model': model, 'messages': messages, 'stream': True}

        # Request para a API externa
        with requests.post(url, json=payload, headers=headers, stream=True) as r:
            for chunk in r.iter_lines():
                if chunk:
                    decoded_chunk = chunk.decode('utf-8').replace('data: ', '')
                    if decoded_chunk != '[DONE]':
                        yield decoded_chunk + "\n"

    return Response(stream_with_context(generate()), mimetype='application/json')

import json
import time
from datetime import datetime

# Diretórios de Persistência
LOGS_DIR = 'logs'
CONFIG_DIR = 'config'
SETTINGS_FILE = os.path.join(CONFIG_DIR, 'settings.json')

def ensure_directories():
    os.makedirs(LOGS_DIR, exist_ok=True)
    os.makedirs(CONFIG_DIR, exist_ok=True)
    if not os.path.exists(SETTINGS_FILE):
        default_settings = {
            "system_prompt": "Você é um assistente útil e direto.",
            "temperature": 0.7,
            "max_tokens": 2000,
            "theme": "dark"
        }
        with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(default_settings, f, indent=2)

ensure_directories()

@app.route('/api/settings', methods=['GET', 'POST'])
def handle_settings():
    if request.method == 'POST':
        try:
            new_settings = request.json
            # Validar ou mesclar com existentes se necessário
            with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
                json.dump(new_settings, f, indent=2)
            return jsonify({'status': 'success', 'settings': new_settings})
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    else:
        try:
            with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                return jsonify(json.load(f))
        except Exception as e:
            return jsonify({'error': str(e)}), 500

@app.route('/api/log', methods=['POST'])
def log_interaction():
    try:
        entry = request.json
        entry['timestamp'] = datetime.now().isoformat()
        
        # Log diário para manter arquivos pequenos
        date_str = datetime.now().strftime('%Y-%m-%d')
        log_file = os.path.join(LOGS_DIR, f'history_{date_str}.jsonl')
        
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')
            
        return jsonify({'status': 'logged'})
    except Exception as e:
        print(f"Log error: {e}")
        return jsonify({'status': 'error'}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
