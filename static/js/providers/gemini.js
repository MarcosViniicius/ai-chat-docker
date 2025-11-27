import { AIProvider } from './base.js';

export class GeminiProvider extends AIProvider {
    constructor(apiKey) {
        super(apiKey);
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    }

    async getModels() {
        if (!this.apiKey) return [];
        return [
            { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
            { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
            { id: 'gemini-1.0-pro', name: 'Gemini 1.0 Pro' }
        ];
    }

    async chat(model, messages, onChunk) {
        try {
            // Mapear mensagens
            let contents = [];
            let systemInstruction = null;

            messages.forEach(m => {
                if (m.role === 'system') {
                    systemInstruction = { parts: [{ text: m.content }] };
                } else {
                    contents.push({
                        role: m.role === 'assistant' ? 'model' : 'user',
                        parts: [{ text: m.content }]
                    });
                }
            });

            const url = `${this.baseUrl}/models/${model}:streamGenerateContent?key=${this.apiKey}&alt=sse`;
            
            const body = { contents };
            if (systemInstruction && model.includes('1.5')) {
                body.systemInstruction = systemInstruction;
            } else if (systemInstruction) {
                // Fallback para modelos antigos: adicionar ao início
                if (contents.length > 0) {
                    contents[0].parts[0].text = systemInstruction.parts[0].text + "\n\n" + contents[0].parts[0].text;
                }
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
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
                    if (line.startsWith("data: ")) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                            if (text) onChunk(text);
                        } catch (e) {
                            // Ignorar
                        }
                    }
                }
            }
        } catch (error) {
            throw error;
        }
    }
}
