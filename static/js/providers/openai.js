import { AIProvider } from './base.js';

export class OpenAIProvider extends AIProvider {
    constructor(apiKey) {
        super(apiKey);
        this.baseUrl = 'https://api.openai.com/v1';
    }

    async getModels() {
        if (!this.apiKey) return [];
        try {
            const response = await this.fetchWithTimeout(`${this.baseUrl}/models`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });
            
            if (!response.ok) throw new Error('Falha ao buscar modelos');
            
            const data = await response.json();
            return data.data
                .filter(m => m.id.includes('gpt'))
                .map(m => ({ id: m.id, name: m.id }))
                .sort((a, b) => a.id.localeCompare(b.id));
        } catch (error) {
            console.error('OpenAI Error:', error);
            return [];
        }
    }

    async chat(model, messages, onChunk) {
        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
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
                    if (line.startsWith("data: ") && line !== "data: [DONE]") {
                        try {
                            const data = JSON.parse(line.slice(6));
                            const content = data.choices[0]?.delta?.content || "";
                            if (content) onChunk(content);
                        } catch (e) {
                            console.error("Erro ao parsear chunk:", e);
                        }
                    }
                }
            }
        } catch (error) {
            throw error;
        }
    }
}
