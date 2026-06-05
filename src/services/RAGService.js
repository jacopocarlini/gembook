import {pipeline} from '@xenova/transformers';

class RAGService {
    constructor() {
        this.extractor = null;
        this.isReady = false;
    }

    async init() {
        if (this.isReady) return;
        this.extractor = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small');
        this.isReady = true;
    }

    async getEmbedding(text) {
        if (!this.isReady) await this.init();
        const output = await this.extractor(text, {pooling: 'mean', normalize: true});
        return Array.from(output.data);
    }

    // 3. Calcola quanto due vettori sono simili (Cosine Similarity)
    cosineSimilarity(vecA, vecB) {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        if (normA === 0 || normB === 0) return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    // 4. Taglia un testo lungo in piccoli pezzi
    chunkText(text, chunkSize = 200, overlap = 50) {
        const words = text.split(/\s+/);
        const chunks = [];

        for (let i = 0; i < words.length; i += (chunkSize - overlap)) {
            chunks.push(
                words.slice(i, i + chunkSize).join(" ")
            );
        }

        return chunks;
    }

    async searchHierarchical(question, bookData, topChapters = 2, topChunksPerChapter = 2) {
        const questionVector = await this.getEmbedding(question);

        // 1. Cerca i capitoli più rilevanti usando i loro riassunti
        const chapterScores = bookData.chapterSummaries.map(chap => ({
            chapterIndex: chap.chapterIndex,
            summary: chap.summary,
            score: this.cosineSimilarity(questionVector, chap.vector)
        })).sort((a, b) => b.score - a.score).slice(0, topChapters);

        const relevantChapterIndexes = chapterScores.map(c => c.chapterIndex);

        // 2. Cerca i chunk SOLO all'interno di quei capitoli specifici
        const filteredChunks = bookData.indexedChunks.filter(chunk =>
            relevantChapterIndexes.includes(chunk.chapterIndex)
        );

        const chunkScores = filteredChunks.map(chunk => ({
            text: chunk.text,
            chapterIndex: chunk.chapterIndex,
            score: this.cosineSimilarity(questionVector, chunk.vector)
        })).sort((a, b) => b.score - a.score).slice(0, topChapters * topChunksPerChapter);

        return {
            relevantChapters: chapterScores,
            relevantChunks: chunkScores
        };
    }
}

export const ragService = new RAGService();