// src/services/epubService.js
import ePub from 'epubjs';
import {ragService} from './RAGService';
import {db} from "./db.js";
import {webLLMService} from "./WebLLMService.js"; // Assicurati che il percorso sia corretto

const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 15));
let isIndexing = false;

/**
 * Elabora un file EPUB, estrae il testo per l'IA e restituisce un oggetto pronto per il database.
 * @param {File} file - Il file caricato
 * @param {Function} onProgress - Callback per aggiornare lo stato nella UI
 */
export const processEpubFile = async (file, onProgress) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                if (onProgress) onProgress("Apertura del file EPUB...");
                const bookData = e.target.result;
                const tempBook = ePub(bookData);
                const metadata = await tempBook.loaded.metadata;

                if (onProgress) onProgress("Estrazione copertina...");
                const tempCoverUrl = await tempBook.coverUrl();
                let persistentCover = null;

                if (tempCoverUrl) {
                    try {
                        const response = await fetch(tempCoverUrl);
                        const blob = await response.blob();
                        persistentCover = await new Promise((r) => {
                            const fr = new FileReader();
                            fr.onloadend = () => r(fr.result);
                            fr.readAsDataURL(blob);
                        });
                    } catch (e) {
                        console.error("error load cover", e);
                    }
                }

                if (onProgress) onProgress("Generazione impaginazione...");
                await tempBook.ready;
                await tempBook.locations.generate(300);
                const savedLocations = tempBook.locations.save();
                const navigation = await tempBook.loaded.navigation;
                let tocData = [];

                const processItem = (item, depth = 0) => {
                    let safePct = 0;
                    if (item.href) {
                        const baseHref = item.href.split('#')[0];
                        const spineItem = tempBook.spine.get(baseHref);
                        if (spineItem) {
                            const startCfi = `epubcfi(${spineItem.cfiBase}!/4/1:0)`;
                            safePct = tempBook.locations.percentageFromCfi(startCfi) || 0;
                        }
                    }
                    tocData.push({label: item.label?.trim() || null, percent: safePct, href: item.href, level: depth});
                    if (item.subitems && item.subitems.length > 0) {
                        item.subitems.forEach(sub => processItem(sub, depth + 1));
                    }
                };

                navigation.toc.forEach(item => processItem(item, 0));

                if (onProgress) onProgress("Salvataggio in libreria...");

                const result = {
                    title: metadata.title || null,
                    author: metadata.creator || null,
                    file: bookData,
                    cover: persistentCover,
                    locations: savedLocations,
                    toc: tocData,
                    progress: 0,
                    addedDate: Date.now(),
                    indexedChunks: [],
                    isIndexed: false // NUOVO FLAG: Indica se l'IA ha finito
                };

                tempBook.destroy();
                resolve(result);
            } catch (err) {
                reject(err);
            }
        };
        reader.readAsArrayBuffer(file);
    });
};

export const indexChaptersUpTo = async (bookId, targetChapterIndex) => {
    if (isIndexing) return false;

    try {
        const bookData = await db.books.get(bookId);
        if (!bookData) return false;

        const indexedChapters = bookData.indexedChapters || [];

        let needsIndexing = false;
        for (let i = 0; i <= targetChapterIndex; i++) {
            if (!indexedChapters.includes(i)) needsIndexing = true;
        }

        if (!needsIndexing) return true;

        isIndexing = true;
        console.log(`Avvio indicizzazione progressiva in background fino al capitolo: ${targetChapterIndex}`);

        await yieldToMain();
        await ragService.init();

        const tempBook = ePub(bookData.file);
        await tempBook.ready;
        const spine = tempBook.spine;

        const maxChapter = Math.min(targetChapterIndex, spine.length - 1);

        let allBookChunks = [...(bookData.indexedChunks || [])];
        let chapterSummaries = [...(bookData.chapterSummaries || [])];
        let characterSet = new Set(bookData.characters || []);
        let globalSummary = bookData.globalSummary || ""; // Carichiamo il global summary

        for (let i = 0; i <= maxChapter; i++) {
            if (indexedChapters.includes(i)) continue;

            const item = spine.get(i);
            try {
                await yieldToMain();
                const doc = await item.load(tempBook.load.bind(tempBook));
                let text = "";

                let parsedDoc = doc;
                if (typeof doc === 'string') {
                    const parser = new DOMParser();
                    parsedDoc = parser.parseFromString(doc, "application/xhtml+xml");
                    await yieldToMain();
                }

                if (parsedDoc && typeof parsedDoc === 'object') {
                    const body = parsedDoc.querySelector("body") || parsedDoc.getElementsByTagName("body")[0];
                    if (body) {
                        text = body.textContent || "";
                        text = text.replace(/\s+/g, ' ').trim();
                    }
                }

                if (text.trim().length > 0) {

                    // --- FASE 1: Estrazione Personaggi + Riassunto Capitolo con LLM ---
                    console.log("Analisi LLM (Personaggi e Riassunto) per capitolo", i);
                    let currentChapterSummary = "";
                    try {
                        await webLLMService.initialize(() => {});
                        const analysisPrompt = `Analizza questo capitolo.
1) Scrivi un riassunto in massimo 3 frasi.
2) Elenca i nomi dei personaggi presenti, separati da virgola.
Rispondi ESATTAMENTE in questo formato:
RIASSUNTO: [riassunto]
PERSONAGGI: [nome1, nome2]

Testo: ${text.slice(0, 4000)}`;

                        const analysisReply = await webLLMService.engine.chat.completions.create({
                            messages: [
                                {role: "system", content: "Sei un assistente editoriale che rispetta rigorosamente i formati."},
                                {role: "user", content: analysisPrompt}
                            ],
                            temperature: 0.1
                        });

                        const replyText = analysisReply.choices[0].message.content;

                        // Estraiamo le due parti con le espressioni regolari
                        const summaryMatch = replyText.match(/RIASSUNTO:\s*(.*?)(?=\nPERSONAGGI:|$)/is);
                        const charsMatch = replyText.match(/PERSONAGGI:\s*(.*)/is);

                        currentChapterSummary = summaryMatch ? summaryMatch[1].trim() : "Riassunto non generato.";
                        const charsString = charsMatch ? charsMatch[1].trim() : "";

                        // Aggiungiamo i personaggi trovati alla nostra lista (se non ha scritto "nessuno")
                        if (charsString && !charsString.toLowerCase().includes("nessun")) {
                            charsString.split(',').forEach(c => characterSet.add(c.trim().replace(/['"]/g, '')));
                        }

                        // CREIAMO L'EMBEDDING DEL RIASSUNTO (Serve per la ricerca gerarchica!)
                        const chapterVector = await ragService.getEmbedding(currentChapterSummary);

                        chapterSummaries.push({
                            chapterIndex: i,
                            summary: currentChapterSummary,
                            vector: chapterVector
                        });

                    } catch (e) {
                        console.warn(`Impossibile analizzare il capitolo ${i}`, e);
                        currentChapterSummary = "Errore durante l'analisi.";
                    }
                    await yieldToMain();

                    // --- FASE 2: Aggiornamento Global Summary ---
                    console.log("Aggiornamento Global Summary...");
                    try {
                        const globalPrompt = `Riassunto globale attuale: "${globalSummary || 'Nessun evento precedente.'}".
Nuovi eventi del capitolo: "${currentChapterSummary}".
Aggiorna il riassunto globale integrandoli. Sii estremamente conciso e scrivi solo gli eventi chiave (max 150 parole).`;

                        const globalReply = await webLLMService.engine.chat.completions.create({
                            messages: [
                                {role: "system", content: "Sei un narratore che mantiene la trama di un libro aggiornata."},
                                {role: "user", content: globalPrompt}
                            ],
                            temperature: 0.2
                        });

                        globalSummary = globalReply.choices[0].message.content.trim();
                    } catch (e) {
                        console.warn(`Impossibile aggiornare il global summary al capitolo ${i}`, e);
                    }
                    await yieldToMain();

                    // --- FASE 3: Chunking Vettoriale Classico ---
                    console.log("Creazione embedding dei chunk per capitolo", i);
                    const chunks = ragService.chunkText(text, 150);
                    for (const chunk of chunks) {
                        const vector = await ragService.getEmbedding(chunk);
                        allBookChunks.push({chapterIndex: i, text: chunk, vector: vector});
                        await yieldToMain();
                    }
                }

                indexedChapters.push(i);

                await yieldToMain();

                // Salviamo tutto nel database passo dopo passo
                await db.books.update(bookId, {
                    indexedChunks: allBookChunks,
                    chapterSummaries: chapterSummaries,
                    characters: Array.from(characterSet),
                    globalSummary: globalSummary, // Salviamo la trama globale
                    indexedChapters: indexedChapters,
                    isIndexed: true
                });

                console.log(`Capitolo ${i} indicizzato con successo.`);

            } catch (err) {
                console.warn(`Impossibile leggere il capitolo ${i}`, err);
            }
        }

        tempBook.destroy();

    } catch (error) {
        console.error("Errore durante l'indicizzazione progressiva:", error);
    } finally {
        isIndexing = false;
    }
};

class EpubService {
    constructor() {
        this.book = null;
        this.rendition = null;
        this.bookData = null;
        this.currentSettings = null;
    }

    async init({bookData, elementId, settings, onReady, onRelocated, onSelected, onHighlightClick}) {
        if (this.rendition) {
            this.rendition.destroy();
            this.rendition = null;
        }
        if (this.book) {
            this.book.destroy();
            this.book = null;
        }

        const container = typeof elementId === 'string'
            ? document.getElementById(elementId)
            : elementId;


        this.bookData = bookData;
        this.currentSettings = settings;
        this.book = ePub(bookData.file);
        this.book.allowScript = true;
        this.loaded = false;


        let manager = 'default';
        let flow = 'paginated';

        const spreadMode = settings?.pageLayout === 'double' ? 'auto' : 'none';

        if (settings.readingMode === 1) {
            manager = 'continuous';
            flow = 'scrolled';
        } else if (settings.readingMode === 2) {
            manager = 'default';
            flow = 'scrolled-doc';
        }

        this.rendition = this.book.renderTo(container, {
            width: '100%',
            height: '100%',
            spread: spreadMode,
            manager: manager,
            flow: flow,
            allowScript: true,
            allowScriptedContent: true,
        });


        this.onHighlightClickCallback = onHighlightClick;

        if (bookData.locations) {
            this.book.locations.load(bookData.locations);
        }

        await this.rendition.display(bookData.currentCfi);


        this.applySettings(settings);

        this.rendition.themes.default({
            "body": {
                "transition": "transform 0.3s ease-in-out",
            }
        });


        this.rendition.on('relocated', (data) => {
            if (this.loaded) {
                this.handleRelocated(data, onRelocated);
            }
        });

        this.rendition.on('keyup', (event) => {
            const key = event.key || event.code;
            if (key === 'ArrowLeft') this.prev();
            if (key === 'ArrowRight') this.next();
        });

        // MODIFICA QUI: Gestione del click per ignorare i link
        this.rendition.on('click', (e) => {
            // 1. Controlla se abbiamo cliccato su un link (<a>)
            const target = e.target;
            const isLink = target.tagName.toLowerCase() === 'a' || target.closest('a');

            // Se è un link, interrompiamo qui. Lasciamo che se ne occupi 'linkClicked'
            if (isLink) return;

            const contents = this.rendition.manager.getContents()[0];
            if (!contents) return;
            const selection = contents.window.getSelection().toString();
            if (selection.length > 0) return;

            const width = this.rendition.manager.container.clientWidth;
            const x = e.clientX % width;
            if (x < width * 0.25) this.prev();
            else if (x > width * 0.75) this.next();
            if (onSelected) onSelected(null);
        });

        // NUOVO BLOCCO: Gestione sicura dei link interni (note)
        this.rendition.on('linkClicked', (href) => {
            // Ignora i link esterni (siti web)
            if (href.startsWith('http://') || href.startsWith('https://')) {
                window.open(href, '_blank');
                return;
            }

            // Usa epub.js per renderizzare il link. Questo evita i bug di impaginazione.
            this.rendition.display(href);
        });


        this.rendition.on("contextmenu", (e) => {
            e.preventDefault();
        });

        this.rendition.on('selected', (cfiRange, contents) => {
            const selection = contents.window.getSelection();
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            const text = selection.toString();

            if (text && text.trim().length > 0 && onSelected) {
                // Passiamo il testo e le coordinate al componente React
                onSelected({
                    text: text,
                    cfiRange: cfiRange,
                    rect: rect // Contiene top, left, width, height
                });
            }
        });

        if (bookData.currentCfi) {
            await this.rendition.display(bookData.currentCfi);
        }

        this.loaded = true;

        if (onReady) onReady();

    }

    handleRelocated(locationData, callback) {
        const currentCfi = locationData.start.cfi;
        const percentage = this.book.locations?.percentageFromCfi(currentCfi) || 0;

        // Inizializziamo i dati temporali e di posizione
        let timeStats = {
            chapterMinutes: 0,
            totalMinutes: 0,
            isFinished: false
        };

        // Dichiariamo queste variabili qui così possiamo passarle nel callback alla fine
        let currentLoc = null;
        let totalLocations = null;

        if (this.book.locations && this.book.locations.length() > 0) {
            currentLoc = this.book.locations.locationFromCfi(currentCfi);
            totalLocations = this.book.locations.length();

            const wpm = 250;
            const caratteriPerParola = 6; // Media standard per l'italiano

            // Calcolo minuti totali
            const remainingBookLocations = Math.max(0, totalLocations - currentLoc);
            timeStats.totalMinutes = Math.round((remainingBookLocations * (300 / caratteriPerParola)) / wpm);

            // Calcolo minuti capitolo
            const nextChapterIndex = locationData.start.index + 1;
            const nextChapter = this.book.spine.get(nextChapterIndex);
            let endOfChapterLoc = totalLocations;

            if (nextChapter && nextChapter.href) {
                const nextChapterBaseCfi = `epubcfi(${nextChapter.cfiBase}!/4/1:0)`;
                const nextLoc = this.book.locations.locationFromCfi(nextChapterBaseCfi);
                if (nextLoc && nextLoc > -1) endOfChapterLoc = nextLoc;
            }

            const remainingChapterLocations = Math.max(0, endOfChapterLoc - currentLoc);
            timeStats.chapterMinutes = Math.round((remainingChapterLocations * (300 / caratteriPerParola)) / wpm);

            if (timeStats.chapterMinutes === timeStats.totalMinutes) {
                timeStats.chapterMinutes = 0;
            }
            if (percentage >= 0.99) timeStats.isFinished = true;
        }

        // Identificazione titolo capitolo
        let chapterTitle = null;
        let activeIndex = -1;
        if (this.bookData?.toc) {
            const cleanHref = locationData.start.href.split('#')[0];
            activeIndex = this.bookData.toc.findIndex(item => item.href.includes(cleanHref));
            if (activeIndex !== -1) chapterTitle = this.bookData.toc[activeIndex].label;
        }

        if (callback) {
            callback({
                cfi: currentCfi,
                percentage: Number((percentage * 100).toFixed(1)),
                chapterTitle: chapterTitle,
                chapterIndex: activeIndex,
                timeStats: timeStats,
                location: currentLoc,
                totalLocations: totalLocations
            });
        }
    }

    applySettings(settings) {
        if (!this.rendition) return;
        this.currentSettings = settings;

        const themeConfigs = {
            white: {bg: '#ffffff', text: '#000000'},
            sepia: {bg: '#f4ecd8', text: '#5b4636'},
            dark: {bg: '#121212', text: '#e0e0e0'}
        };
        const active = themeConfigs[settings.theme] || themeConfigs.white;

        this.rendition.hooks.content.register((contents) => {
            const doc = contents.document;
            const head = doc.head;
            const oldStyle = doc.getElementById("epubjs-custom-styles");
            if (oldStyle) oldStyle.remove();

            const style = doc.createElement("style");
            style.id = "epubjs-custom-styles";

            const fontStack = (settings.fontFamily && settings.fontFamily !== 'Original')
                ? `font-family: '${settings.fontFamily}', sans-serif !important;` : '';

            // LOGICA ALLINEAMENTO: Solo se "justify", altrimenti lasciamo l'originale del libro
            const alignRule = settings.textAlign === 'justify'
                ? `text-align: justify !important; text-justify: inter-word;`
                : '';

            style.innerHTML = `
    /* 1. COMUNICA AL BROWSER IL TEMA GENERALE */
    html {
        color-scheme: ${settings.theme === 'dark' ? 'dark' : 'light'};
        scrollbar-width: thin;
        scrollbar-color: ${active.text} ${active.bg};
    }

    body {
        background-color: ${active.bg} !important;
        color: ${active.text} !important;
        font-size: ${settings.fontSize}% !important;
        ${fontStack}
        line-height: 1.6 !important;
        margin: 0 !important;
        
        /* ⚠️ MODIFICA: SELEZIONE SBLOCCATA PER LE SOTTOLINEATURE */
        -webkit-user-select: text !important;
        -moz-user-select: text !important;
        -ms-user-select: text !important;
        user-select: text !important;

        /* Rimuove il flash blu ai tap rapidi ma permette la selezione */
        -webkit-tap-highlight-color: transparent;
    }

    /* 2. STILIZZAZIONE SPECIFICA PER CHROME / SAFARI / EDGE */
    ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
        background-color: ${active.bg};
    }
    ::-webkit-scrollbar-track {
        background-color: ${active.bg};
    }
    ::-webkit-scrollbar-thumb {
        background-color: ${active.text};
        border-radius: 4px;
        border: 2px solid ${active.bg}; 
    }
    ::-webkit-scrollbar-corner {
        background-color: ${active.bg};
    }
    
    /* ⚠️ MODIFICA: RIMOSSO il blocco di -webkit-touch-callout. 
       Su iOS e Android è FONDAMENTALE che sia attivo altrimenti 
       non riesci a selezionare tenendo premuto il dito sullo schermo! */
    
    /* Applichiamo l'allineamento solo se scelto nei settings */
    ${alignRule ? `
    p, li, span, section, article {
        ${alignRule}
    }
    ` : ''}

    /* Protezione colori e font */
    p, li, span, section, article, div {
        color: ${active.text} !important;
        ${fontStack}
    }

    /* FIX IMMAGINI E COVER: Centratura sempre prioritaria */
    img { 
        max-width: 100% !important; 
        height: auto !important; 
        display: block !important;
        margin-left: auto !important;
        margin-right: auto !important;
    }

    /* Contenitori di immagini devono essere centrati ignorando il justify */
    p:has(img), div:has(img), figure, .cover, #cover {
        text-align: center !important;
        display: block !important;
        width: 100% !important;
        text-indent: 0 !important;
    }

    /* Rimuoviamo il rientro solo se stiamo giustificando tutto */
    ${settings.textAlign === 'justify' ? 'p { text-indent: 0; }' : ''}
`;

            head.appendChild(style);

            if (settings.fontFamily && settings.fontFamily !== 'Original') {
                const link = doc.createElement("link");
                link.rel = "stylesheet";
                link.href = `https://fonts.googleapis.com/css2?family=${settings.fontFamily.replace(/\s+/g, '+')}&display=swap`;
                head.appendChild(link);
            }
        });

        this.rendition.views().forEach(v => v.contents && this.rendition.hooks.content.trigger(v.contents));
    }

    next() {
        if (!this.rendition) return;
        this.rendition.next();
    }

    prev() {
        if (!this.rendition) return;
        return this.rendition.prev();
    }

    goToPercentage(val) {
        if (this.book.locations) {
            const cfi = this.book.locations.cfiFromPercentage(val / 100);
            this.rendition.display(cfi);
        }
    }

    goToChapterByIndex(index) {
        if (this.bookData?.toc?.[index]) this.rendition.display(this.bookData.toc[index].href);
    }

    goToChapterByCfi(cfi) {
        if (!cfi) return;

        let targetCfi = cfi;

        // 1. Pulisce eventuali Range CFI (se ci sono virgole) per ricavare il punto esatto di inizio
        if (cfi.includes(',')) {
            const match = cfi.match(/epubcfi\((.*)\)/);
            if (match && match[1]) {
                const parts = match[1].split(',');
                if (parts.length === 3) {
                    targetCfi = `epubcfi(${parts[0]}${parts[1]})`;
                }
            }
        }

        // 2. Navigazione con workaround per il bug di paginazione di epub.js
        if (this.rendition) {
            this.rendition.display(targetCfi).then(() => {
                // A questo punto il capitolo è nel DOM.
                // Forziamo un ricalcolo invisibile per centrare esattamente il nodo profondo.
                this.rendition.display(targetCfi);
            }).catch(err => {
                console.error("Errore durante la navigazione CFI:", err);
            });
        }
    }

    getChapterMarks() {
        return this.bookData?.toc?.filter(c => c.percent > 0).map(c => ({value: Number((c.percent * 100).toFixed(1))})) || [];
    }

    destroy() {
        if (this.book) {
            this.book.destroy();
            this.book = null;
            this.rendition = null;
        }
    }

    // Aggiunge un'evidenziazione visiva sul testo
    addHighlight(cfiRange, color = 'rgba(255, 235, 59, 0.5)', data = {}) {
        if (!this.rendition) return;

        this.rendition.annotations.highlight(cfiRange, data, () => {
            // Quando l'utente clicca su un'evidenziazione già creata
            if (this.onHighlightClickCallback) {
                this.onHighlightClickCallback(cfiRange);
            }
        }, '', {"fill": color});
    }

    // Rimuove l'evidenziazione
    removeHighlight(cfiRange) {
        if (!this.rendition) return;
        this.rendition.annotations.remove(cfiRange, "highlight");
    }

    // Rimuove la selezione blu nativa del testo dopo che abbiamo cliccato "Sottolinea"
    clearSelection() {
        if (!this.rendition) return;
        const contents = this.rendition.manager.getContents()[0];
        if (contents) {
            contents.window.getSelection().removeAllRanges();
        }
    }
}

export const epubService = new EpubService();