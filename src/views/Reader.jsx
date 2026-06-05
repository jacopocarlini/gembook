import React, {useEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {db} from '../services/db';
import {epubService, indexChaptersUpTo} from '../services/EpubService';
import {
    AppBar,
    Box,
    Button,
    CircularProgress,
    Drawer,
    GlobalStyles,
    IconButton,
    LinearProgress,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    Slider,
    Tab,
    Tabs,
    Toolbar,
    Typography
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SettingsIcon from '@mui/icons-material/Settings';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import CloseIcon from '@mui/icons-material/Close';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

import {SettingsDrawer} from './Settings';
import ePub from 'epubjs';
import {webLLMService} from '../services/WebLLMService';
import {ragService} from "../services/RAGService.js";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {MermaidViewer} from './MermaidViewer';


export default function Reader({bookId, onClose, settings, setSettings, themeStyles}) {
    const {t} = useTranslation();
    const viewerRef = useRef(null);

    // Stati UI e Info Libro
    const [bookTitle, setBookTitle] = useState(t('loading'));
    const [time, setTime] = useState(new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }));

    // Stati Navigazione e Progresso
    const [bookProgress, setBookProgress] = useState(0);
    const [chapterStats, setChapterStats] = useState({
        title: '',
        timeStats: {chapterMinutes: 0, totalMinutes: 0, isFinished: false}
    });
    const [toc, setToc] = useState([]);
    const [chaptersMarks, setChaptersMarks] = useState([]);
    const [currentChapterIndex, setCurrentChapterIndex] = useState(-1);

    // Stati Segnalibri
    const [currentLocation, setCurrentLocation] = useState(null);
    const [bookmarks, setBookmarks] = useState([]);
    const [isBookmarked, setIsBookmarked] = useState(false);

    // Menu e Drawer
    const [isTocOpen, setIsTocOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [drawerTab, setDrawerTab] = useState(0);

    // Stato Unificato per Selezioni e Sottolineature
    // Aggiunto "position" per gestire dove mostrare il popup
    const [activePopup, setActivePopup] = useState(null);
    const [highlights, setHighlights] = useState([]);

    const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState([
        {
            role: 'assistant',
            content: t('chat_greeting', 'Ciao! Sono la tua IA locale. Cosa vuoi sapere su questo testo?')
        }
    ]);
    const [chatInput, setChatInput] = useState("");
    const [isTyping, setIsTyping] = useState(false);

    // Nuovi stati per l'IA Locale
    const [isAiReady, setIsAiReady] = useState(webLLMService.isReady);
    const [aiLoadingStatus, setAiLoadingStatus] = useState("Controllo file di sistema...");
    const [aiProgress, setAiProgress] = useState(0);
    const [isFirstDownload, setIsFirstDownload] = useState(false); // Ci dice se deve scaricare da internet

    const [isBookIndexed, setIsBookIndexed] = useState(false); // NUOVO STATO

    // Aggiornamento Orologio
    useEffect(() => {
        const timer = setInterval(() => setTime(new Date().toLocaleTimeString([], {
            hour: '2-digit', minute: '2-digit', hour12: false
        })), 10000);
        return () => clearInterval(timer);
    }, []);

    // Inizializzazione Libro
    useEffect(() => {
        let isMounted = true;

        const loadBook = async () => {
            const bookData = await db.books.get(bookId);
            if (!bookData || !isMounted) return;

            setBookTitle(bookData.title || t('unknown_title'));
            setToc(bookData.toc || []);
            setBookmarks(bookData.bookmarks || []);
            setIsBookIndexed(!!bookData.isIndexed);

            const savedHighlights = bookData.highlights || [];
            setHighlights(savedHighlights);

            await epubService.init({
                bookData,
                elementId: viewerRef.current,
                settings: settings,
                onSelected: (info) => {
                    if (!isMounted) return;

                    // CONTROLLO 1: Evita di aprire il popup se la selezione è vuota
                    if (!info || !info.text || info.text.trim() === '') {
                        epubService.clearSelection();
                        return;
                    }

                    // Calcolo dinamico della posizione
                    const position = getPopupPosition(info.cfiRange);
                    setActivePopup({type: 'selection', data: info, position});
                },
                onHighlightClick: (clickedCfiRange) => {
                    if (!isMounted) return;

                    const position = getPopupPosition(clickedCfiRange);
                    setActivePopup({type: 'highlight', data: {cfiRange: clickedCfiRange}, position});
                },
                onReady: () => {
                    if (!isMounted) return;
                    setChaptersMarks(epubService.getChapterMarks());

                    savedHighlights.forEach(h => {
                        epubService.addHighlight(h.cfiRange, h.color);
                    });
                },
                onRelocated: async (data) => {
                    if (!isMounted) return;
                    setChapterStats({title: data.chapterTitle, timeStats: data.timeStats});
                    setCurrentChapterIndex(data.chapterIndex);
                    setBookProgress(data.percentage);

                    setCurrentLocation(data);

                    await db.books.update(bookId, {currentCfi: data.cfi, progress: data.percentage});

                    // NUOVO: Trigger per il Lazy Loading dell'IA.
                    // Chiediamo di indicizzare fino al capitolo SUCCESSIVO (data.chapterIndex + 1)
                    // Così, mentre l'utente legge il cap 2, in background si prepara il cap 3.
                    if (data.chapterIndex !== -1) {
                        // Lo lanciamo senza "await" perché deve scorrere in modo invisibile
                        indexChaptersUpTo(bookId, data.chapterIndex + 1);
                    }
                }
            });
        };

        loadBook();
        return () => {
            isMounted = false;
            epubService.destroy();
        };
    }, [bookId, t, settings]);

    // Controlla se la pagina corrente ha dei segnalibri visibili
    useEffect(() => {
        if (!currentLocation || bookmarks.length === 0 || !epubService.rendition) {
            setIsBookmarked(false);
            return;
        }

        const visibleLocation = epubService.rendition.location;

        if (!visibleLocation || !visibleLocation.start || !visibleLocation.end) {
            setIsBookmarked(bookmarks.some(b => b.cfi === currentLocation.cfi));
            return;
        }

        const cfiHelper = new ePub.CFI();

        const isHere = bookmarks.some(b => {
            try {
                const isAfterStart = cfiHelper.compare(b.cfi, visibleLocation.start.cfi) >= 0;
                const isBeforeEnd = cfiHelper.compare(b.cfi, visibleLocation.end.cfi) <= 0;
                return isAfterStart && isBeforeEnd;
            } catch (e) {
                return b.cfi === currentLocation.cfi;
            }
        });

        setIsBookmarked(isHere);
    }, [currentLocation, bookmarks]);

    // Navigazione tastiera
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'ArrowLeft') epubService.prev();
            if (event.key === 'ArrowRight') epubService.next();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        if (isAiDrawerOpen && !isAiReady) {
            let isMounted = true;

            const initLocalAI = async () => {
                try {
                    // Controlla il disco fisso del browser PRIMA di far partire il motore
                    const cached = await webLLMService.checkCache();
                    if (isMounted && !cached) {
                        setIsFirstDownload(true);
                    }

                    await webLLMService.initialize((progressInfo) => {
                        if (!isMounted) return;
                        setAiLoadingStatus(progressInfo.text);
                        setAiProgress(progressInfo.progress * 100);
                    });

                    if (isMounted) setIsAiReady(true);
                } catch (err) {
                    if (isMounted) setAiLoadingStatus("Errore durante l'avvio del modello.");
                }
            };

            initLocalAI();

            return () => {
                isMounted = false;
            };
        }
    }, [isAiDrawerOpen, isAiReady]);


    // Helper per calcolare la posizione del popup rispetto al testo selezionato
    // Helper per calcolare la posizione del popup evitando che esca dallo schermo
    const getPopupPosition = (cfiRange) => {
        try {
            if (!epubService.rendition) return null;

            const range = epubService.rendition.getRange(cfiRange);
            const rect = range.getBoundingClientRect();

            // Sommiamo le coordinate dell'iframe per avere la posizione assoluta nella pagina
            const iframe = viewerRef.current.querySelector('iframe');
            const iframeRect = iframe ? iframe.getBoundingClientRect() : {top: 0, left: 0};

            const absoluteTop = rect.top + iframeRect.top;
            const absoluteBottom = rect.bottom + iframeRect.top;

            const popupEstimatedHeight = 240; // Altezza massima stimata del popup con un po' di margine
            const viewportHeight = window.innerHeight; // Altezza totale visibile dello schermo

            // Calcoliamo lo spazio effettivo a disposizione
            const spaceAbove = absoluteTop;
            const spaceBelow = viewportHeight - absoluteBottom;

            if (spaceAbove > popupEstimatedHeight) {
                // Opzione 1: C'è spazio sufficiente sopra la selezione
                return {
                    top: absoluteTop - 15,
                    left: '50%',
                    transform: 'translate(-50%, -100%)'
                };
            } else if (spaceBelow > popupEstimatedHeight) {
                // Opzione 2: Non c'è spazio sopra, ma ce n'è a sufficienza sotto
                return {
                    top: absoluteBottom + 15,
                    left: '50%',
                    transform: 'translate(-50%, 0)'
                };
            } else {
                // Fallback di sicurezza: lo schermo è troppo piccolo (es. telefono in orizzontale)
                // o la selezione è enorme. Lo centriamo a metà schermo in sovraimpressione.
                return {
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)'
                };
            }
        } catch (error) {
            console.warn("Impossibile calcolare la posizione esatta, uso il fallback.", error);
            // Fallback in caso di errori imprevisti di ePub.js
            return {
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)'
            };
        }
    };

    const handleClose = async () => {
        if (currentLocation) {
            try {
                await db.books.update(bookId, {
                    currentCfi: currentLocation.cfi,
                    progress: currentLocation.percentage
                });
            } catch (error) {
                console.error("Errore durante il salvataggio finale:", error);
            }
        }
        onClose();
    };

    const handleToggleBookmark = async () => {
        if (!currentLocation || !epubService.rendition) return;

        const wasBookmarked = isBookmarked;
        setIsBookmarked(!wasBookmarked);

        try {
            const bookData = await db.books.get(bookId);
            const existingBookmarks = bookData.bookmarks || [];
            let newBookmarks;

            if (wasBookmarked) {
                const visibleLocation = epubService.rendition.location;
                const cfiHelper = new ePub.CFI();

                newBookmarks = existingBookmarks.filter(b => {
                    if (visibleLocation && visibleLocation.start && visibleLocation.end) {
                        try {
                            const isAfterStart = cfiHelper.compare(b.cfi, visibleLocation.start.cfi) >= 0;
                            const isBeforeEnd = cfiHelper.compare(b.cfi, visibleLocation.end.cfi) <= 0;
                            const isVisible = isAfterStart && isBeforeEnd;
                            return !isVisible;
                        } catch (e) {
                            return b.cfi !== currentLocation.cfi;
                        }
                    }
                    return b.cfi !== currentLocation.cfi;
                });
            } else {
                const newBookmark = {
                    cfi: currentLocation.cfi,
                    chapterTitle: currentLocation.chapterTitle || bookTitle,
                    percentage: currentLocation.percentage,
                    location: currentLocation.location || null,
                    totalLocations: currentLocation.totalLocations || null,
                    createdAt: new Date().toISOString()
                };
                newBookmarks = [...existingBookmarks, newBookmark];
            }

            await db.books.update(bookId, {bookmarks: newBookmarks});
            setBookmarks(newBookmarks);

        } catch (error) {
            console.error("Errore durante il salvataggio del bookmark:", error);
            setIsBookmarked(wasBookmarked);
        }
    };

    const handleDeleteBookmark = async (cfiToRemove) => {
        try {
            const bookData = await db.books.get(bookId);
            const existingBookmarks = bookData.bookmarks || [];
            const newBookmarks = existingBookmarks.filter(b => b.cfi !== cfiToRemove);

            await db.books.update(bookId, {bookmarks: newBookmarks});
            setBookmarks(newBookmarks);
        } catch (error) {
            console.error("Errore durante l'eliminazione del bookmark:", error);
        }
    };

    const handleGoToBookmark = (cfi) => {
        epubService.goToChapterByCfi(cfi);
        setIsTocOpen(false);
    };

    const formatMinutes = (mins) => {
        if (mins <= 0) return `< 1${t('minutes_short', {count: ''})}`;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        if (h > 0) {
            return m > 0 ? `${t('hours_short', {count: h})} ${t('minutes_short', {count: m})}` : t('hours_short', {count: h});
        }
        return t('minutes_short', {count: m});
    };

    const renderTimeLeft = () => {
        const {timeStats} = chapterStats;
        if (!timeStats || timeStats.isFinished) return t('finished');
        return `${formatMinutes(timeStats.chapterMinutes)} ${t('cap_label')} ${t('time_separator')} ${formatMinutes(timeStats.totalMinutes)} ${t('tot_label')}`;
    };

    const handleAddHighlight = async (color = 'rgba(255, 235, 59, 0.5)') => {
        if (!activePopup || activePopup.type !== 'selection' || !activePopup.data) return;
        const selectionInfo = activePopup.data;

        const newHighlight = {
            cfiRange: selectionInfo.cfiRange,
            text: selectionInfo.text,
            color: color,
            chapterTitle: chapterStats.title || bookTitle,
            createdAt: new Date().toISOString()
        };

        epubService.addHighlight(newHighlight.cfiRange, newHighlight.color);
        epubService.clearSelection();
        setActivePopup(null);

        try {
            const bookData = await db.books.get(bookId);
            const currentHighlights = bookData.highlights || [];
            const updatedHighlights = [...currentHighlights, newHighlight];

            await db.books.update(bookId, {highlights: updatedHighlights});
            setHighlights(updatedHighlights);
        } catch (error) {
            console.error("Errore salvataggio sottolineatura:", error);
        }
    };

    const confirmDeleteHighlight = async (cfiRange) => {
        if (!cfiRange) return;

        epubService.removeHighlight(cfiRange);

        try {
            const bookData = await db.books.get(bookId);
            const updatedHighlights = (bookData.highlights || []).filter(h => h.cfiRange !== cfiRange);
            await db.books.update(bookId, {highlights: updatedHighlights});
            setHighlights(updatedHighlights);
        } catch (error) {
            console.error("Errore rimozione sottolineatura:", error);
        }

        setActivePopup(null);
    };

    // Ottiene il testo per il popup unificato se è una sottolineatura esistente
    const getPopupTextContent = () => {
        if (!activePopup || !activePopup.data) return "";

        if (activePopup.type === 'selection') {
            return activePopup.data.text || "";
        }

        const existingHighlight = highlights.find(h => h.cfiRange === activePopup.data.cfiRange);
        return existingHighlight ? existingHighlight.text : "";
    };

    const handleSendMessage = async () => {
        if (!chatInput.trim() || isTyping || !isAiReady) return;

        const userQuery = chatInput.trim();
        const newUserMsg = {role: 'user', content: userQuery};

        // 1. Aggiungiamo subito il messaggio dell'utente e un "segnaposto" vuoto per l'IA
        setChatMessages(prev => [...prev, newUserMsg, {role: 'assistant', content: ''}]);
        setChatInput("");
        setIsTyping(true);

        try {
            const bookData = await db.books.get(bookId);

            if (!bookData.isIndexed) {
                throw new Error("Questo libro non è stato ancora completamente indicizzato.");
            }

            await ragService.init();

            // 2. CREAZIONE CONTESTO "SICURO" (Anti-Spoiler)
            // Filtriamo capitoli e chunk in base al progresso attuale della lettura
            const safeBookData = {
                chapterSummaries: (bookData.chapterSummaries || []).filter(c => c.chapterIndex <= currentChapterIndex),
                indexedChunks: (bookData.indexedChunks || []).filter(c => c.chapterIndex <= currentChapterIndex)
            };

            let promptIniezione = userQuery;
            const selectedText = getPopupTextContent(); // Usa la tua funzione esistente
            if (selectedText) {
                promptIniezione = `Contesto specifico selezionato dall'utente: "${selectedText}".\nDomanda: ${userQuery}`;
            }

            // 3. RICERCA GERARCHICA (Capitoli -> Chunks)
            const {
                relevantChapters,
                relevantChunks
            } = await ragService.searchHierarchical(userQuery, safeBookData, 2, 2);

            // 4. COSTRUZIONE DEL PAYLOAD INFORMATIVO
            const globalSummaryContext = bookData.globalSummary || "Nessun riassunto globale disponibile.";
            const chapterSummariesContext = relevantChapters.map(c => `Cap. ${c.chapterIndex}: ${c.summary}`).join("\n");
            const chunksContext = relevantChunks.map(c => c.text).join("\n\n");
            const charactersList = (bookData.characters || []).join(", ");

            const systemPrompt = `Sei un assistente alla lettura integrato in un e-reader. 
Il tuo compito è aiutare l'utente a comprendere il libro basandoti *esclusivamente* sul contesto fornito.

PERSONAGGI NOTI FINORA: ${charactersList || "Nessuno identificato"}
TRAMA GLOBALE: ${globalSummaryContext}

REGOLE TASSATIVE:
1. Rispondi usando SOLO le informazioni incluse nel contesto. Non inventare dettagli.
2. Se l'utente chiede diagrammi o mappe, usa la sintassi Markdown Mermaid.

CONTESTO DI DETTAGLIO TROVATO:
RIASSUNTI RILEVANTI:
${chapterSummariesContext || "Nessuno."}

ESTRATTI RILEVANTI:
${chunksContext || "Nessun estratto pertinente."}`;

            // Ottimizziamo la history usando la logica che abbiamo definito nel servizio
            const optimizedHistory = await webLLMService.optimizeChatHistory(chatMessages);

            const messages = [
                {role: "system", content: systemPrompt},
                ...optimizedHistory,
                {role: "user", content: promptIniezione}
            ];

            // 5. STREAMING DELLA RISPOSTA
            // Invece di .create() base, usiamo l'iteratore asincrono di WebLLM
            const chunks = await webLLMService.engine.chat.completions.create({
                messages,
                temperature: 0.2,
                stream: true // Fondamentale!
            });

            let fullResponse = "";

            // Man mano che arrivano i pezzi (chunk), aggiorniamo l'ultimo messaggio nella UI
            for await (const chunk of chunks) {
                const textDelta = chunk.choices[0]?.delta?.content || "";
                fullResponse += textDelta;

                setChatMessages(prev => {
                    const updatedMessages = [...prev];
                    // Aggiorniamo il contenuto dell'ultimo messaggio (il segnaposto dell'assistant)
                    updatedMessages[updatedMessages.length - 1].content = fullResponse;
                    return updatedMessages;
                });
            }

        } catch (error) {
            console.error("Errore durante il flusso RAG locale:", error);
            setChatMessages(prev => {
                const updatedMessages = [...prev];
                updatedMessages[updatedMessages.length - 1].content = `Errore: ${error.message}`;
                return updatedMessages;
            });
        } finally {
            setIsTyping(false);
        }
    };


    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            bgcolor: themeStyles.bg,
            color: themeStyles.text,
            overflow: 'hidden'
        }}>

            <GlobalStyles styles={{
                '*': {scrollbarWidth: 'thin', scrollbarColor: `${themeStyles.text} ${themeStyles.bg}`},
                '*::-webkit-scrollbar': {width: '10px', height: '10px'},
                '*::-webkit-scrollbar-track': {background: themeStyles.bg},
                '*::-webkit-scrollbar-thumb': {
                    backgroundColor: themeStyles.text,
                    borderRadius: '10px',
                    border: `3px solid ${themeStyles.bg}`,
                    opacity: 0.5
                }
            }}/>

            {/* HEADER */}
            <AppBar position="static" elevation={0} sx={{
                bgcolor: themeStyles.card,
                color: themeStyles.text,
                borderBottom: `1px solid ${themeStyles.border}`,
                backgroundImage: 'none'
            }}>
                <Toolbar sx={{gap: 0.5}}>
                    <IconButton edge="start" color="inherit" onClick={handleClose}><ArrowBackIcon/></IconButton>
                    <IconButton color="inherit"
                                onClick={() => setIsTocOpen(true)}><FormatListBulletedIcon/></IconButton>

                    <Box sx={{flexGrow: 1, textAlign: 'center', px: 1, minWidth: 0}}>
                        <Typography variant="body1" noWrap
                                    sx={{fontWeight: 700, fontSize: '0.95rem'}}>{bookTitle}</Typography>
                        <Typography variant="caption" noWrap
                                    sx={{display: 'block', opacity: 0.7}}>{chapterStats.title}</Typography>
                    </Box>

                    <Typography variant="body2"
                                sx={{fontWeight: 600, display: {xs: 'none', sm: 'block'}, mx: 1}}>{time}</Typography>
                    <IconButton
                        onClick={() => {
                            setIsAiDrawerOpen(true);
                            setActivePopup(null);
                        }}
                        sx={{
                            color: themeStyles.primary,
                            border: `1px solid ${themeStyles.primary}`,
                            borderRadius: '10px',
                            bgcolor: 'rgba(0,0,0,0.02)',
                            '&:hover': {bgcolor: 'rgba(0,0,0,0.08)'}
                        }}
                    >
                        <AutoAwesomeIcon fontSize="small"/>
                    </IconButton>
                    <IconButton color="inherit" onClick={handleToggleBookmark}
                                sx={{color: isBookmarked ? themeStyles.primary : 'inherit'}}>
                        {isBookmarked ? <BookmarkIcon/> : <BookmarkBorderIcon/>}
                    </IconButton>
                    <IconButton color="inherit" onClick={() => setSettingsOpen(true)}><SettingsIcon/></IconButton>
                </Toolbar>
            </AppBar>

            {/* AREA LETTURA */}
            <Box sx={{flexGrow: 1, position: 'relative', overflow: 'hidden', px: {xs: 1, sm: 2}}}>
                <Box ref={viewerRef} sx={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: {xs: 8, sm: 1},
                    right: {xs: 8, sm: 1},
                    '& .epub-view': {width: settings.readingMode === 2 ? '99% !important' : '100%'}
                }}/>
            </Box>

            {/* POPUP UNIFICATO (Selezioni & Sottolineature Esistenti) */}
            {activePopup && (
                <>
                    {/* OVERLAY INVISIBILE */}
                    <Box
                        onClick={() => {
                            if (activePopup.type === 'selection') epubService.clearSelection();
                            setActivePopup(null);
                        }}
                        sx={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            zIndex: 9998, bgcolor: 'transparent'
                        }}
                    />

                    {/* BOX POPUP VERO E PROPRIO */}
                    <Box
                        elevation={10}
                        sx={{
                            position: 'fixed',
                            top: activePopup.position?.top || '50%',
                            left: activePopup.position?.left || '50%',
                            transform: activePopup.position?.transform || 'translate(-50%, -50%)',
                            zIndex: 9999, p: 2, width: {xs: '85vw', sm: 400},
                            bgcolor: themeStyles.card, color: themeStyles.text,
                            borderRadius: '16px', boxShadow: '0px 8px 32px rgba(0,0,0,0.4)',
                            display: 'flex', flexDirection: 'column', gap: 2,
                            transition: 'top 0.2s ease-out'
                        }}
                    >
                        {/* Intestazione */}
                        <Box sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                            <Typography variant="subtitle2"
                                        sx={{fontWeight: 800, color: themeStyles.primary, textTransform: 'uppercase'}}>
                                {activePopup.type === 'selection' ? t('text_selection') : t('note')}
                            </Typography>
                            <IconButton size="small" onClick={() => {
                                if (activePopup.type === 'selection') epubService.clearSelection();
                                setActivePopup(null);
                            }} sx={{color: themeStyles.text}}>
                                <CloseIcon/>
                            </IconButton>
                        </Box>

                        {/* Box Testo */}
                        <Box sx={{
                            maxHeight: '120px', overflowY: 'auto',
                            bgcolor: 'rgba(0,0,0,0.05)', p: 1.5,
                            borderRadius: '8px', borderLeft: `4px solid ${themeStyles.primary}`
                        }}>
                            <Typography variant="body2" sx={{fontStyle: 'italic', color: themeStyles.text}}>
                                "{getPopupTextContent()}"
                            </Typography>
                        </Box>

                        {/* Footer Azioni: Colori, Elimina, IA e Copia */}
                        <Box sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', pt: 0.5}}>

                            {activePopup.type === 'selection' ? (
                                /* Azioni per NUOVA selezione (Colori) */
                                <Box sx={{display: 'flex', gap: 1.5}}>
                                    {[
                                        {id: 'yellow', bg: '#FBC02D', rgba: 'rgba(255, 235, 59, 0.8)'},
                                        {id: 'green', bg: '#4CAF50', rgba: 'rgba(76, 175, 80, 0.8)'},
                                        {id: 'purple', bg: '#9C27B0', rgba: 'rgba(156, 39, 176, 0.8)'}
                                    ].map((color) => (
                                        <Box
                                            key={color.id} onClick={() => handleAddHighlight(color.rgba)}
                                            sx={{
                                                width: 34,
                                                height: 34,
                                                borderRadius: '50%',
                                                bgcolor: color.bg,
                                                boxShadow: '0 4px 8px rgba(0,0,0,0.15)',
                                                cursor: 'pointer',
                                                transition: '0.2s',
                                                border: `2px solid transparent`,
                                                '&:hover': {transform: 'scale(1.15)', borderColor: themeStyles.text}
                                            }}
                                        />
                                    ))}
                                </Box>
                            ) : (
                                /* Azioni per HIGHLIGHT ESISTENTE (Elimina) */
                                <Button
                                    onClick={() => confirmDeleteHighlight(activePopup.data.cfiRange)}
                                    variant="contained" color="error" disableElevation startIcon={<DeleteOutlineIcon/>}
                                    sx={{textTransform: 'none', fontWeight: 600, borderRadius: '8px', py: 0.5}}
                                >
                                    {t('delete')}
                                </Button>
                            )}

                            {/* Gruppo Bottoni (IA + Copia) */}
                            <Box sx={{display: 'flex', gap: 1}}>
                                <IconButton
                                    onClick={() => {
                                        navigator.clipboard.writeText(getPopupTextContent());
                                        if (activePopup.type === 'selection') epubService.clearSelection();
                                        setActivePopup(null);
                                    }}
                                    sx={{
                                        color: themeStyles.text, border: `1px solid ${themeStyles.border}`,
                                        borderRadius: '10px', '&:hover': {bgcolor: 'rgba(0,0,0,0.05)'}
                                    }}
                                >
                                    <ContentCopyIcon fontSize="small"/>
                                </IconButton>
                            </Box>
                        </Box>
                    </Box>
                </>
            )}

            {/* BOTTOM SHEET DRAWER PER LA CHAT IA */}
            <Drawer
                anchor="bottom"
                open={isAiDrawerOpen}
                onClose={() => setIsAiDrawerOpen(false)}
                PaperProps={{
                    sx: {
                        borderTopLeftRadius: '20px',
                        borderTopRightRadius: '20px',
                        bgcolor: themeStyles.card,
                        color: themeStyles.text,
                        height: '60vh',
                        display: 'flex',
                        flexDirection: 'column',
                        p: 2
                    }
                }}
            >
                {/* Header Bottom Sheet */}
                <Box sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2}}>
                    <Typography variant="h6" sx={{fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1}}>
                        <AutoAwesomeIcon sx={{color: themeStyles.primary}}/> AI Locale
                    </Typography>
                    <IconButton onClick={() => setIsAiDrawerOpen(false)} sx={{color: themeStyles.text}}>
                        <CloseIcon/>
                    </IconButton>
                </Box>

                {/* 1. SE IL LIBRO NON È ANCORA INDICIZZATO */}
                {!isBookIndexed ? (
                    <Box sx={{
                        flexGrow: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        p: 4,
                        textAlign: 'center',
                        gap: 3
                    }}>
                        <CircularProgress sx={{color: themeStyles.primary}}/>
                        <Typography variant="body1" sx={{fontWeight: 600}}>
                            Sto elaborando il libro per l'Intelligenza Artificiale...
                        </Typography>
                        <Typography variant="caption" sx={{opacity: 0.7}}>
                            Il libro è disponibile per la lettura, ma la funzionalità di chat sarà attiva appena
                            l'analisi semantica di tutti i capitoli sarà completata. Riprova tra poco.
                        </Typography>
                    </Box>

                ) : !isAiReady ? (
                    /* SCHERMATA DI CARICAMENTO INTELLIGENTE */
                    <Box sx={{
                        flexGrow: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        p: 4,
                        textAlign: 'center',
                        gap: 3
                    }}>
                        <Typography variant="body1" sx={{fontWeight: 600}}>
                            {isFirstDownload ? "Download Modello IA in corso..." : "Avvio Motore IA..."}
                        </Typography>

                        <Box sx={{width: '100%', maxWidth: 400}}>
                            <LinearProgress variant="determinate" value={aiProgress} sx={{
                                height: 10,
                                borderRadius: 5,
                                mb: 1,
                                bgcolor: 'rgba(0,0,0,0.1)',
                                '& .MuiLinearProgress-bar': {bgcolor: themeStyles.primary}
                            }}/>
                            <Typography variant="caption" sx={{opacity: 0.7}}>
                                {aiLoadingStatus}
                            </Typography>
                        </Box>

                        {/* Messaggi di spiegazione diversi in base allo stato */}
                        {isFirstDownload ? (
                            <Typography variant="caption" sx={{opacity: 0.5, mt: 2}}>
                                Al primo utilizzo è necessario scaricare il file di base dell'IA (~2GB). Non chiudere la
                                finestra. Verrà salvato sul tuo dispositivo per l'uso offline illimitato.
                            </Typography>
                        ) : (
                            <Typography variant="caption" sx={{opacity: 0.5, mt: 2}}>
                                Sto spostando i file dell'IA dal disco fisso alla scheda video. Questa operazione
                                richiede 3-5 secondi.
                            </Typography>
                        )}
                    </Box>
                ) : (
                    /* INTERFACCIA CHAT (Visibile quando il modello è pronto) */
                    <>
                        {/* Area Messaggi Chat */}
                        <Box sx={{
                            flexGrow: 1, overflowY: 'auto',
                            bgcolor: 'rgba(0,0,0,0.03)', p: 1.5,
                            borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: 1, mb: 2
                        }}>
                            {chatMessages.map((msg, idx) => (
                                <Box key={idx} sx={{
                                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                    bgcolor: msg.role === 'user' ? themeStyles.primary : 'rgba(0,0,0,0.08)',
                                    color: msg.role === 'user' ? '#fff' : themeStyles.text,
                                    p: 1.5, borderRadius: '12px', maxWidth: '85%'
                                }}>
                                    <Typography variant="body2">{msg.content}</Typography>
                                </Box>
                            ))}
                            {isTyping &&
                                <Typography variant="caption" sx={{opacity: 0.5}}>L'IA sta pensando...</Typography>}
                        </Box>

                        {/* Input e Invio */}
                        <Box sx={{display: 'flex', gap: 1, pb: 1}}>
                            <input
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                placeholder="Chiedi un riassunto, spiegazioni..."
                                style={{
                                    flexGrow: 1, padding: '12px 16px', borderRadius: '12px',
                                    border: `1px solid ${themeStyles.border}`, outline: 'none',
                                    backgroundColor: themeStyles.bg, color: themeStyles.text
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSendMessage();
                                }}
                                disabled={isTyping}
                            />
                            <Button variant="contained" disableElevation disabled={isTyping} onClick={handleSendMessage}
                                    sx={{borderRadius: '12px', px: 3, fontWeight: 'bold'}}>
                                Invia
                            </Button>
                        </Box>
                    </>
                )}
            </Drawer>

            {/* FOOTER */}
            <Box sx={{p: 2, bgcolor: themeStyles.card, borderTop: `1px solid ${themeStyles.border}`}}>
                <Box sx={{display: 'flex', alignItems: 'center', width: '100%', maxWidth: 1200, mx: 'auto', gap: 2}}>
                    <IconButton onClick={() => epubService.prev()} sx={{
                        color: themeStyles.text,
                        border: `1px solid ${themeStyles.border}`,
                        borderRadius: '12px'
                    }}><NavigateBeforeIcon/></IconButton>

                    <Box sx={{flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5}}>
                        <Slider
                            value={bookProgress} marks={chaptersMarks} step={0.1}
                            onChange={(e, v) => setBookProgress(v)}
                            onChangeCommitted={(e, v) => {
                                epubService.goToPercentage(v);
                                if (document.activeElement) document.activeElement.blur();
                            }}
                            sx={{
                                color: themeStyles.primary, height: 6,
                                '& .MuiSlider-mark': {height: 6, width: 2, bgcolor: themeStyles.bg},
                                '& .MuiSlider-thumb': {width: 14, height: 14}
                            }}
                        />
                        <Box sx={{display: 'flex', justifyContent: 'space-between'}}>
                            <Typography variant="caption"
                                        sx={{fontWeight: 500, opacity: 0.8}}>{renderTimeLeft()}</Typography>
                            <Typography variant="caption" sx={{fontWeight: 800}}>{bookProgress.toFixed(1)}%</Typography>
                        </Box>
                    </Box>

                    <IconButton onClick={() => epubService.next()} sx={{
                        color: themeStyles.text,
                        border: `1px solid ${themeStyles.border}`,
                        borderRadius: '12px'
                    }}><NavigateNextIcon/></IconButton>
                </Box>
            </Box>

            {/* DRAWER INDICE E SEGNALIBRI */}
            <Drawer
                anchor="left" open={isTocOpen} onClose={() => setIsTocOpen(false)}
                PaperProps={{
                    sx: {
                        width: {xs: '85vw', sm: 360},
                        maxWidth: 360,
                        bgcolor: themeStyles.card,
                        color: themeStyles.text,
                        borderRadius: '0 16px 16px 0',
                        display: 'flex',
                        flexDirection: 'column'
                    }
                }}
            >
                {/* Header del Drawer */}
                <Box sx={{p: {xs: 1.5, sm: 2}, display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <Typography variant="h6" sx={{fontWeight: 800, px: 1}}>{t('menu')}</Typography>
                    <IconButton onClick={() => setIsTocOpen(false)} size="small"
                                sx={{color: themeStyles.text, opacity: 0.5}}><CloseIcon/></IconButton>
                </Box>

                {/* Tabs di navigazione */}
                <Tabs
                    value={drawerTab}
                    onChange={(e, newValue) => setDrawerTab(newValue)}
                    variant="fullWidth"
                    sx={{
                        borderBottom: `1px solid ${themeStyles.border}`,
                        '& .MuiTab-root': {color: themeStyles.text, fontWeight: 600},
                        '& .Mui-selected': {color: `${themeStyles.primary} !important`},
                        '& .MuiTabs-indicator': {backgroundColor: themeStyles.primary}
                    }}
                >
                    <Tab label={t('index_title')}/>
                    <Tab label={t('bookmarks')}/>
                    <Tab label={t('note')}/>
                </Tabs>

                {/* Contenuto del Drawer (UX Uniformata) */}
                <Box sx={{flexGrow: 1, overflowY: 'auto'}}>

                    {/* TAB 0: INDICE (TOC) */}
                    {drawerTab === 0 && (
                        <List sx={{py: 0}}>
                            {toc.map((chap, i) => (
                                <ListItem key={i} disablePadding divider sx={{borderColor: themeStyles.border}}>
                                    <ListItemButton
                                        onClick={() => {
                                            setIsTocOpen(false);
                                            epubService.goToChapterByIndex(i);
                                        }}
                                        selected={currentChapterIndex === i}
                                        sx={{pl: 2 + (chap.level || 0) * 2, py: 1.5}}
                                    >
                                        <ListItemText
                                            primary={chap.label}
                                            primaryTypographyProps={{
                                                fontWeight: currentChapterIndex === i ? 700 : 500,
                                                fontSize: '0.95rem',
                                                color: currentChapterIndex === i ? themeStyles.primary : 'inherit'
                                            }}
                                        />
                                    </ListItemButton>
                                </ListItem>
                            ))}
                        </List>
                    )}

                    {/* TAB 1: SEGNALIBRI */}
                    {drawerTab === 1 && (
                        <List sx={{py: 0}}>
                            {bookmarks.length > 0 ? (
                                bookmarks.map((b, i) => (
                                    <ListItem
                                        key={i}
                                        disablePadding
                                        divider
                                        sx={{borderColor: themeStyles.border}}
                                        secondaryAction={
                                            <IconButton
                                                edge="end"
                                                onClick={() => handleDeleteBookmark(b.cfi)}
                                                sx={{
                                                    color: themeStyles.text,
                                                    opacity: 0.6,
                                                    '&:hover': {opacity: 1, color: 'error.main'}
                                                }}
                                            >
                                                <DeleteOutlineIcon fontSize="small"/>
                                            </IconButton>
                                        }
                                    >
                                        <ListItemButton onClick={() => handleGoToBookmark(b.cfi)} sx={{py: 1.5, pr: 6}}>
                                            <ListItemText
                                                primary={b.chapterTitle}
                                                secondary={`${(b.percentage || 0).toFixed(1)}%`}
                                                primaryTypographyProps={{
                                                    fontWeight: 600,
                                                    color: themeStyles.text,
                                                    fontSize: '0.95rem'
                                                }}
                                                secondaryTypographyProps={{
                                                    color: themeStyles.primary,
                                                    fontWeight: 700,
                                                    fontSize: '0.85rem',
                                                    mt: 0.5
                                                }}
                                            />
                                        </ListItemButton>
                                    </ListItem>
                                ))
                            ) : (
                                <Box sx={{p: 4, textAlign: 'center', opacity: 0.5}}>
                                    <BookmarkBorderIcon sx={{fontSize: 40, mb: 1}}/>
                                    <Typography variant="body2">{t('no_bookmark_saved')}</Typography>
                                </Box>
                            )}
                        </List>
                    )}

                    {/* TAB 2: SOTTOLINEATURE */}
                    {drawerTab === 2 && (
                        <List sx={{py: 0}}>
                            {highlights.length > 0 ? (
                                highlights.map((h, i) => (
                                    <ListItem
                                        key={i}
                                        disablePadding
                                        divider
                                        sx={{borderColor: themeStyles.border}}
                                        secondaryAction={
                                            <IconButton
                                                edge="end"
                                                onClick={() => confirmDeleteHighlight(h.cfiRange)}
                                                sx={{
                                                    color: themeStyles.text,
                                                    opacity: 0.6,
                                                    '&:hover': {opacity: 1, color: 'error.main'}
                                                }}
                                            >
                                                <DeleteOutlineIcon fontSize="small"/>
                                            </IconButton>
                                        }
                                    >
                                        <ListItemButton onClick={() => handleGoToBookmark(h.cfiRange)}
                                                        sx={{py: 1.5, pr: 6}}>
                                            <ListItemText
                                                primary={h.chapterTitle}
                                                secondary={`"${h.text}"`}
                                                primaryTypographyProps={{
                                                    fontWeight: 600,
                                                    color: themeStyles.text,
                                                    fontSize: '0.95rem'
                                                }}
                                                secondaryTypographyProps={{
                                                    // Racchiudiamo tutti gli stili personalizzati nell'oggetto sx
                                                    sx: {
                                                        color: themeStyles.text,
                                                        fontSize: '0.85rem',
                                                        fontStyle: 'italic',
                                                        opacity: 0.8,
                                                        mt: 0.5,
                                                        display: '-webkit-box',
                                                        WebkitLineClamp: 2,
                                                        WebkitBoxOrient: 'vertical',
                                                        overflow: 'hidden'
                                                    }
                                                }}
                                            />
                                        </ListItemButton>
                                    </ListItem>
                                ))
                            ) : (
                                <Box sx={{p: 4, textAlign: 'center', opacity: 0.5}}>
                                    <Typography variant="body2">{t('no_notes')}</Typography>
                                </Box>
                            )}
                        </List>
                    )}
                </Box>
            </Drawer>

            <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings}
                            setSettings={setSettings} themeStyles={themeStyles}/>
        </Box>
    );
}