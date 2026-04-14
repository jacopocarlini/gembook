import ePub from 'epubjs';

/**
 * Elabora un file EPUB e restituisce un oggetto pronto per il database
 */
export const processEpubFile = async (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const bookData = e.target.result;
                const tempBook = ePub(bookData);
                const metadata = await tempBook.loaded.metadata;
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
                    }
                }

                await tempBook.ready;
                await tempBook.locations.generate(300);
                const savedLocations = tempBook.locations.save();
                const navigation = await tempBook.loaded.navigation;
                let tocData = [];

                const processItem = (item, depth = 0) => {
                    let safePct = 0;

                    if (item.href) {
                        // 1. Otteniamo il riferimento al capitolo nella "spine"
                        const baseHref = item.href.split('#')[0];
                        const spineItem = tempBook.spine.get(baseHref);

                        if (spineItem) {
                            // 2. Creiamo una "CFI" (l'indirizzo interno di Epub.js)
                            // che punta esattamente all'inizio di quel file
                            const startCfi = `epubcfi(${spineItem.cfiBase}!/4/1:0)`;

                            // 3. Chiediamo la percentuale REALE basata sulle locations generate
                            // Se non riesce, restituiamo 0 come fallback sicuro
                            safePct = tempBook.locations.percentageFromCfi(startCfi) || 0;
                        }
                    }

                    tocData.push({
                        label: item.label?.trim() || null,
                        percent: safePct, // <--- Ora è preciso al millimetro!
                        href: item.href,
                        level: depth
                    });

                    if (item.subitems && item.subitems.length > 0) {
                        item.subitems.forEach(sub => processItem(sub, depth + 1));
                    }
                };

                // Avviamo il processo per i capitoli principali (livello 0)
                navigation.toc.forEach(item => processItem(item, 0));

                const result = {
                    title: metadata.title || null,
                    author: metadata.creator || null,
                    file: bookData,
                    cover: persistentCover,
                    locations: savedLocations,
                    toc: tocData,
                    progress: 0,
                    addedDate: Date.now()
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

class EpubService {
    constructor() {
        this.book = null;
        this.rendition = null;
        this.bookData = null;
        this.currentSettings = null;
    }

    async init({bookData, elementId, settings, onReady, onRelocated, onSelected}) {        // 1. Distruzione totale
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

        // 3. Configurazione Modalità
        let manager = 'default';
        let flow = 'paginated';

        if (settings.readingMode === 1) {
            manager = 'continuous';
            flow = 'scrolled';
        } else if (settings.readingMode === 2) {
            manager = 'default';
            flow = 'scrolled-doc';
        }

        const spreadMode = settings?.pageLayout === 'double' ? 'auto' : 'none';

        // 4. Rendering
        this.rendition = this.book.renderTo(container, {
            width: '100%',
            height: '100%',
            spread: spreadMode,
            manager: manager,
            flow: flow,
            allowScript: true,
            method: "write",
            allowScriptedContent: true
        });
        await this.rendition.display(bookData.currentCfi || undefined);

        this.rendition.themes.default({
            "body": {
                "transition": "transform 0.3s ease-in-out" // Aggiunge fluidità
            }
        });

        this.applySettings(settings);

        if (bookData.locations) {
            this.book.locations.load(bookData.locations);
        }


        this.rendition.hooks.render.register((view) => {

            // if (view.iframe) {
            //     // Forza un ricalcolo del layout dopo che l'iframe è stato renderizzato
            //     setTimeout(() => {
            //         if (this.rendition.manager) {
            //             this.rendition.manager.resize();
            //         }
            //     }, 100);
            // }
        });

        this.rendition.hooks.content.register((contents) => {
            // const el = contents.document.documentElement;
            //
            // // Fix per iOS: rende l'elemento cliccabile per Safari
            // el.style.cursor = "pointer";
            //
            // el.addEventListener('click', (e) => {
            //
            //     const selection = contents.window.getSelection().toString();
            //     if (selection.length > 0) return;
            //
            //     // Recuperiamo la larghezza del viewport della rendition
            //     const width = this.rendition.manager.container.clientWidth;
            //
            //     // Usiamo pageX o clientX dal touch/click
            //     const x = e.clientX;
            //
            //     if (x < width * 0.25) {
            //         this.prev();
            //     } else if (x > width * 0.75) {
            //         this.next();
            //     }
            //
            //     if (onSelected) onSelected(null);
            // });
        });


        this.rendition.on("added", (view) => {
            // if (view.iframe) {
            //     // Rimuoviamo la sandbox non appena l'iframe viene aggiunto al DOM
            //     view.iframe.removeAttribute("sandbox");
            //     // Opzionale: forziamo l'attributo allow-scripts se il sistema lo reinserisce
            //     view.iframe.setAttribute("allow", "scripts; same-origin");
            // }
        });

        this.rendition.on('relocated', (data) => {

            this.handleRelocated(data, onRelocated)
        });

        this.rendition.on('click', (e) => {
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

        this.rendition.on("rendered", (section) => {

            // setTimeout(() => {
            //     if (this.rendition && this.rendition.manager) {
            //         this.rendition.manager.resize();
            //     }
            // }, 100);
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

        if (onReady) onReady();

    }

    handleRelocated(locationData, callback) {

        const currentCfi = locationData.start.cfi;
        const percentage = this.book.locations?.percentageFromCfi(currentCfi) || 0;

        // Inizializziamo i dati temporali come nulli
        let timeStats = {
            chapterMinutes: 0,
            totalMinutes: 0,
            isFinished: false
        };

        if (this.book.locations && this.book.locations.length() > 0) {
            const currentLoc = this.book.locations.locationFromCfi(currentCfi);
            const totalLocations = this.book.locations.length();

            const wpm = 250;
            const caratteriPerParola = 6; // Media standard per l'italiano

            // Calcolo minuti totali
            const remainingBookLocations = Math.max(0, totalLocations - currentLoc);
            timeStats.totalMinutes = Math.round((remainingBookLocations * (300/caratteriPerParola)) / wpm );

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
            console.log('endOfChapterLoc', endOfChapterLoc, remainingChapterLocations);
            timeStats.chapterMinutes = Math.round((remainingChapterLocations * (300/caratteriPerParola)) / wpm );

            if (timeStats.chapterMinutes === timeStats.totalMinutes){
                timeStats.chapterMinutes = 0;
            }
            console.log('timeStats', timeStats);
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
                chapterTitle: chapterTitle, // Ritorna null se non trovato
                chapterIndex: activeIndex,
                timeStats: timeStats // <-- Passiamo l'oggetto con i numeri puri
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
                body {
                    background-color: ${active.bg} !important;
                    color: ${active.text} !important;
                    font-size: ${settings.fontSize}% !important;
                    ${fontStack}
                    line-height: 1.6 !important;
                    margin: 0 !important;
                    
                    /* BLOCCA SELEZIONE E COPIA DI SISTEMA */
                    -webkit-user-select: none !important;
                    -moz-user-select: none !important;
                    -ms-user-select: none !important;
                    user-select: none !important;
            
                    /* Rimuove il flash blu al tocco */
                    -webkit-tap-highlight-color: transparent;
                }
                
                /* Impedisce anche il menù contestuale classico (tasto destro / pressione lunga) */
                * {
                    -webkit-touch-callout: none !important;
                }
                
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
}

export const epubService = new EpubService();