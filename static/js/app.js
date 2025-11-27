import { OpenAIProvider } from './providers/openai.js';
import { OpenRouterProvider } from './providers/openrouter.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { GeminiProvider } from './providers/gemini.js';

class ChatApp {
    constructor() {
        this.providers = {};
        this.currentProvider = null;
        this.currentModel = null;
        this.messages = [];
        this.isGenerating = false;
        
        // Configurações Padrão
        this.settings = {
            system_prompt: "Você é um assistente útil e direto.",
            temperature: 0.7,
            max_tokens: 2000
        };
        
        this.ui = {
            chatContainer: document.getElementById('chat-container'),
            providerSelect: document.getElementById('provider-select'),
            modelSelect: document.getElementById('model-select'),
            userInput: document.getElementById('user-input'),
            sendBtn: document.getElementById('send-btn'),
            clearBtn: document.getElementById('clear-btn'),
            settingsBtn: document.getElementById('settings-btn'),
            settingsModal: document.getElementById('settings-modal'),
            closeSettingsBtn: document.getElementById('close-settings'),
            saveSettingsBtn: document.getElementById('save-settings'),
            inputs: {
                systemPrompt: document.getElementById('system-prompt'),
                maxTokens: document.getElementById('max-tokens'),
                temperature: document.getElementById('temperature'),
                tempValue: document.getElementById('temp-value')
            }
        };

        this.init();
    }

    async init() {
        this.initializeProviders();
        await this.loadSettings(); // Carregar do servidor
        this.loadHistory();
        this.setupEventListeners();
        this.renderMessages();
        
        // Restaurar seleção anterior
        const savedProvider = localStorage.getItem('lastProvider');
        if (savedProvider && this.providers[savedProvider]) {
            this.ui.providerSelect.value = savedProvider;
            this.handleProviderChange(savedProvider);
        }
    }

    async loadSettings() {
        try {
            const res = await fetch('/api/settings');
            if (res.ok) {
                const serverSettings = await res.json();
                this.settings = { ...this.settings, ...serverSettings };
                this.updateSettingsUI();
            }
        } catch (e) {
            console.error("Erro ao carregar configurações:", e);
        }
    }

    updateSettingsUI() {
        this.ui.inputs.systemPrompt.value = this.settings.system_prompt;
        this.ui.inputs.maxTokens.value = this.settings.max_tokens;
        this.ui.inputs.temperature.value = this.settings.temperature;
        this.ui.inputs.tempValue.textContent = this.settings.temperature;
    }

    async saveSettings() {
        const newSettings = {
            system_prompt: this.ui.inputs.systemPrompt.value,
            max_tokens: parseInt(this.ui.inputs.maxTokens.value),
            temperature: parseFloat(this.ui.inputs.temperature.value)
        };

        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newSettings)
            });
            
            if (res.ok) {
                this.settings = { ...this.settings, ...newSettings };
                this.toggleModal(false);
                alert('Configurações salvas!');
            } else {
                alert('Erro ao salvar configurações.');
            }
        } catch (e) {
            console.error("Erro ao salvar:", e);
            alert('Erro de conexão.');
        }
    }

    toggleModal(show) {
        if (show) this.ui.settingsModal.classList.add('show');
        else this.ui.settingsModal.classList.remove('show');
    }

    initializeProviders() {
        const config = window.ENV || {};
        
        if (config.openai) this.providers.openai = new OpenAIProvider(config.openai);
        if (config.openrouter) this.providers.openrouter = new OpenRouterProvider(config.openrouter);
        if (config.anthropic) this.providers.anthropic = new AnthropicProvider(config.anthropic);
        if (config.gemini) this.providers.gemini = new GeminiProvider(config.gemini);
        
        // Desabilitar opções sem chave
        Array.from(this.ui.providerSelect.options).forEach(opt => {
            if (opt.value && !this.providers[opt.value]) {
                opt.disabled = true;
                opt.textContent += ' (Não configurado)';
            }
        });
    }

    setupEventListeners() {
        this.ui.providerSelect.addEventListener('change', (e) => this.handleProviderChange(e.target.value));
        this.ui.modelSelect.addEventListener('change', (e) => {
            this.currentModel = e.target.value;
            localStorage.setItem('lastModel', this.currentModel);
        });
        
        this.ui.sendBtn.addEventListener('click', () => this.sendMessage());
        this.ui.userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        this.ui.userInput.addEventListener('input', () => {
            this.ui.userInput.style.height = 'auto';
            this.ui.userInput.style.height = Math.min(this.ui.userInput.scrollHeight, 200) + 'px';
            this.updateSendButton();
        });

        this.ui.clearBtn.addEventListener('click', () => {
            if (confirm('Limpar histórico?')) {
                this.messages = [];
                this.saveHistory();
                this.renderMessages();
            }
        });

        // Settings Events
        this.ui.settingsBtn.addEventListener('click', () => this.toggleModal(true));
        this.ui.closeSettingsBtn.addEventListener('click', () => this.toggleModal(false));
        this.ui.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
        this.ui.inputs.temperature.addEventListener('input', (e) => {
            this.ui.inputs.tempValue.textContent = e.target.value;
        });
        
        // Fechar modal ao clicar fora
        window.addEventListener('click', (e) => {
            if (e.target === this.ui.settingsModal) this.toggleModal(false);
        });
    }

    async handleProviderChange(providerId) {
        this.currentProvider = this.providers[providerId];
        localStorage.setItem('lastProvider', providerId);
        
        this.ui.modelSelect.innerHTML = '<option>Carregando...</option>';
        this.ui.modelSelect.disabled = true;
        
        try {
            const models = await this.currentProvider.getModels();
            this.ui.modelSelect.innerHTML = '';
            
            if (models.length === 0) {
                this.ui.modelSelect.innerHTML = '<option>Nenhum modelo encontrado</option>';
                return;
            }

            models.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.name;
                this.ui.modelSelect.appendChild(opt);
            });
            
            this.ui.modelSelect.disabled = false;
            
            // Tentar restaurar modelo
            const lastModel = localStorage.getItem('lastModel');
            if (lastModel && models.find(m => m.id === lastModel)) {
                this.ui.modelSelect.value = lastModel;
            } else {
                this.ui.modelSelect.value = models[0].id;
            }
            this.currentModel = this.ui.modelSelect.value;
            
        } catch (error) {
            this.ui.modelSelect.innerHTML = '<option>Erro ao carregar</option>';
            console.error(error);
        }
    }

    updateSendButton() {
        this.ui.sendBtn.disabled = !this.ui.userInput.value.trim() || this.isGenerating || !this.currentModel;
    }

    async sendMessage() {
        const text = this.ui.userInput.value.trim();
        if (!text || this.isGenerating || !this.currentModel) return;

        // Adicionar mensagem do usuário
        this.messages.push({ role: 'user', content: text });
        this.renderMessages();
        this.ui.userInput.value = '';
        this.ui.userInput.style.height = 'auto';
        this.isGenerating = true;
        this.updateSendButton();

        // Preparar mensagem da IA
        const aiMsgIndex = this.messages.push({ role: 'assistant', content: '' }) - 1;
        this.renderMessages(); 

        // Injetar System Prompt se configurado
        let messagesToSend = [...this.messages.slice(0, -1)];
        if (this.settings.system_prompt) {
            messagesToSend.unshift({ role: 'system', content: this.settings.system_prompt });
        }

        try {
            let fullContent = '';
            await this.currentProvider.chat(
                this.currentModel,
                messagesToSend,
                (chunk) => {
                    fullContent += chunk;
                    this.messages[aiMsgIndex].content = fullContent;
                    this.updateLastMessage(fullContent);
                }
            );
            this.saveHistory();
            
            // Logar interação no servidor
            this.logInteraction(text, fullContent);
            
        } catch (error) {
            this.messages[aiMsgIndex].content = `**Erro:** ${error.message}`;
            this.renderMessages();
        } finally {
            this.isGenerating = false;
            this.updateSendButton();
        }
    }

    async logInteraction(userMsg, aiMsg) {
        try {
            await fetch('/api/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: this.ui.providerSelect.value,
                    model: this.currentModel,
                    user_message: userMsg,
                    ai_response: aiMsg,
                    settings: this.settings
                })
            });
        } catch (e) {
            console.error("Falha ao logar:", e);
        }
    }

    updateLastMessage(content) {
        const bubbles = this.ui.chatContainer.querySelectorAll('.message.ai .content');
        const lastBubble = bubbles[bubbles.length - 1];
        if (lastBubble) {
            lastBubble.innerHTML = DOMPurify.sanitize(marked.parse(content));
            this.scrollToBottom();
        }
    }

    renderMessages() {
        this.ui.chatContainer.innerHTML = '';
        
        if (this.messages.length === 0) {
            this.ui.chatContainer.innerHTML = `
                <div class="message ai">
                    <div class="avatar">🤖</div>
                    <div class="content">Olá! Configure um provedor e comece a conversar.</div>
                </div>`;
            return;
        }

        this.messages.forEach(msg => {
            const div = document.createElement('div');
            div.className = `message ${msg.role === 'user' ? 'user' : 'ai'}`;
            
            const avatar = document.createElement('div');
            avatar.className = 'avatar';
            avatar.textContent = msg.role === 'user' ? '👤' : '🤖';
            
            const content = document.createElement('div');
            content.className = 'content';
            
            if (msg.content) {
                content.innerHTML = DOMPurify.sanitize(marked.parse(msg.content));
            } else if (msg.role === 'assistant' && this.isGenerating) {
                content.innerHTML = '<div class="typing-indicator"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';
            }
            
            div.appendChild(avatar);
            div.appendChild(content);
            this.ui.chatContainer.appendChild(div);
        });
        
        this.scrollToBottom();
    }

    scrollToBottom() {
        this.ui.chatContainer.scrollTop = this.ui.chatContainer.scrollHeight;
    }

    saveHistory() {
        localStorage.setItem('chatHistory', JSON.stringify(this.messages));
    }

    loadHistory() {
        const saved = localStorage.getItem('chatHistory');
        if (saved) {
            try {
                this.messages = JSON.parse(saved);
            } catch (e) {
                console.error('Erro ao carregar histórico', e);
            }
        }
    }
}

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
    new ChatApp();
});
