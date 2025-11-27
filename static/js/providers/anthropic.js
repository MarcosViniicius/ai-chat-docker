import { AIProvider } from './base.js';

export class AnthropicProvider extends AIProvider {
    constructor(apiKey) {
        super(apiKey);
        this.baseUrl = 'https://api.anthropic.com/v1';
    }

    async getModels() {
        // Anthropic não tem endpoint público simples de listar modelos via API Key client-side sem proxy em alguns casos,
        // mas vamos tentar ou retornar uma lista estática se falhar.
        // Na verdade, a API de models é recente. Vamos retornar estáticos populares para garantir.
        return [
            { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
            { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
            { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
            { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet' }
        ];
    }

    async chat(model, messages, onChunk) {
        try {
            // Converter mensagens para formato Anthropic (system message separada)
            const systemMessage = messages.find(m => m.role === 'system')?.content || '';
            const userMessages = messages.filter(m => m.role !== 'system');

            const response = await fetch(`${this.baseUrl}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify({
                    model: model,
                    messages: userMessages,
                    system: systemMessage,
                    max_tokens: 4096,
                    stream: true
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error?.message || 'Erro na requisição');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value);
                const lines = chunk.split("\n");
                
                for (const line of lines) {
                    if (line.startsWith("event: content_block_delta") || line.startsWith("data: ")) {
                         // Anthropic envia eventos SSE. Precisamos parsear o data.
                         // O formato é:
                         // event: content_block_delta
                         // data: {"type": "content_block_delta", ... "delta": {"type": "text_delta", "text": "..."}}
                         
                         // Às vezes vem na mesma linha ou linhas separadas.
                         // Vamos simplificar procurando o JSON no 'data: '
                    }
                }
                
                // Parsing simplificado para Anthropic SSE que é mais complexo
                const events = chunk.split('\n\n');
                for (const event of events) {
                    if (event.includes('data: ')) {
                        const dataLine = event.split('\n').find(l => l.startsWith('data: '));
                        if (dataLine) {
                            try {
                                const data = JSON.parse(dataLine.slice(6));
                                if (data.type === 'content_block_delta' && data.delta?.text) {
                                    onChunk(data.delta.text);
                                }
                            } catch (e) {
                                // Ignorar erros de parse parciais
                            }
                        }
                    }
                }
            }
        } catch (error) {
            throw error;
        }
    }
}
