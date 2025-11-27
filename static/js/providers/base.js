export class AIProvider {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = '';
    }

    async getModels() {
        throw new Error('Not implemented');
    }

    async chat(model, messages, onChunk) {
        throw new Error('Not implemented');
    }

    async fetchWithTimeout(resource, options = {}) {
        const { timeout = 15000 } = options;
        
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        
        const response = await fetch(resource, {
            ...options,
            signal: controller.signal  
        });
        
        clearTimeout(id);
        return response;
    }
}
