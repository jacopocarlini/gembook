// src/services/WebLLMService.js
import { CreateMLCEngine, hasModelInCache } from "@mlc-ai/web-llm";

class WebLLMService {
    constructor() {
        this.engine = null;
        this.isReady = false;
        this.isInitializing = false;
        this.initPromise = null;
        this.progressCallbacks = [];

        // Passiamo a Qwen 2.5 (assicurati che il nome esatto sia supportato dalla versione di web-llm che usi)
        this.selectedModel = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

        // Memoria persistente del riassunto
        this.historicalSummary = "";
    }

    /**
     * Controlla silenziosamente se il file da 2GB esiste già sul disco del dispositivo.
     */
    async checkCache() {
        let b = await hasModelInCache(this.selectedModel);
        return b;
    }

    async initialize(progressCallback) {

        // Se è già pronto, restituisce subito il 100%
        if (this.isReady) {
            if (progressCallback) progressCallback({ progress: 1, text: "Pronto" });
            return;
        }

        // Aggiungiamo la UI alla lista di chi vuole aggiornamenti
        if (progressCallback) {
            this.progressCallbacks.push(progressCallback);
        }

        // Se sta GIA' caricando in background, non lo facciamo ricaricare da zero,
        // ci agganciamo semplicemente al caricamento in corso.
        if (this.isInitializing) {
            return this.initPromise;
        }

        this.isInitializing = true;

        this.initPromise = (async () => {
            try {

                this.engine = await CreateMLCEngine(this.selectedModel, {
                    initProgressCallback: (progress) => {
                        // Spedisce l'aggiornamento della percentuale a React
                        this.progressCallbacks.forEach(cb => cb(progress));
                    },
                });
                this.isReady = true;
            } catch (error) {
                console.error("Errore inizializzazione WebLLM:", error);
                throw error;
            } finally {
                this.isInitializing = false;
                this.progressCallbacks = []; // Svuota la lista a fine caricamento
            }
        })();

        return this.initPromise;
    }

    async optimizeChatHistory(chatHistory) {
        if (chatHistory.length <= 5) return chatHistory;

        // Prendi i messaggi vecchi (tutti tranne gli ultimi 5)
        const messagesToSummarize = chatHistory.slice(0, chatHistory.length - 5);
        const recentMessages = chatHistory.slice(-5);

        const summaryPrompt = `Ecco il riassunto precedente della conversazione: "${this.historicalSummary}". 
        Aggiorna il riassunto includendo questi nuovi scambi: ${JSON.stringify(messagesToSummarize)}. 
        Sii estremamente conciso.`;

        const reply = await this.engine.chat.completions.create({
            messages: [
                { role: "system", content: "Sei un assistente AI che riassume conversazioni in background. Devi essere estremamente conciso e fattuale." },
                { role: "user", content: summaryPrompt } // L'ultimo messaggio ora è dell'utente!
            ],
            temperature: 0.1,
        });

        this.historicalSummary = reply.choices[0].message.content;
        return recentMessages;
    }

    async *streamMessage(promptData, chatHistory, onChunk) {
        if (!this.isReady || !this.engine) throw new Error("L'IA non è pronta.");

        // Ottimizziamo la history prima di inviarla
        const optimizedHistory = await this.optimizeChatHistory(chatHistory);

        const systemPrompt = `Sei un assistente alla lettura. Usa questo contesto per rispondere. Lingua: rispondi nella stessa lingua della domanda dell'utente.
        
        STORICO CONVERSAZIONE: ${this.historicalSummary}
        RIASSUNTO GLOBALE LIBRO: ${promptData.globalSummary}
        RIASSUNTI CAPITOLI RILEVANTI: ${JSON.stringify(promptData.chapterSummaries)}
        ESTRATTI RILEVANTI: ${JSON.stringify(promptData.chunks)}`;

        const messages = [
            { role: "system", content: systemPrompt },
            ...optimizedHistory,
            { role: "user", content: promptData.question }
        ];

        const chunks = await this.engine.chat.completions.create({
            messages,
            temperature: 0.3,
            stream: true, // Abilita lo streaming
        });

        let fullResponse = "";
        for await (const chunk of chunks) {
            const text = chunk.choices[0]?.delta?.content || "";
            fullResponse += text;
            if (onChunk) onChunk(fullResponse); // Invia il pezzo alla UI
            yield text;
        }

        return fullResponse;
    }
}

export const webLLMService = new WebLLMService();