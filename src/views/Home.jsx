import React, { useState, useEffect, useMemo } from 'react';
import {
    AppBar, Toolbar, Typography, Button, Box, Container,
    Menu, MenuItem, CircularProgress, Backdrop, Tabs, Tab, IconButton, InputBase, Select,
    Dialog, DialogTitle, DialogContent, List, ListItem, Chip
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import BookIcon from '@mui/icons-material/Book';
import { db } from '../services/db';
import { processEpubFile } from '../services/epubService';
import { BookCard } from './BookCard';
import { OnlineBookCard } from './OnlineBookCard';
import { SettingsDrawer } from './Settings';
import { useTranslation } from 'react-i18next';

// Helper per formattare i byte in MB
const formatBytes = (bytes) => {
    if (!bytes || isNaN(bytes)) return "0 MB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
};

export default function Home({ onOpenBook, settings, setSettings, themeStyles }) {
    const { t } = useTranslation();

    // Stati Originali
    const [books, setBooks] = useState([]);
    const [isImporting, setIsImporting] = useState(false);
    const [tabValue, setTabValue] = useState(0); // 0: My Books, 1: Online
    const [searchQuery, setSearchQuery] = useState("");
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [menuState, setMenuState] = useState({ anchor: null, bookId: null });

    // Stati API Google & Infinite Scroll
    const [apiBooks, setApiBooks] = useState([]);
    const [isApiLoading, setIsApiLoading] = useState(false);
    const [apiLanguage, setApiLanguage] = useState("it");
    const [startIndex, setStartIndex] = useState(0);
    const [hasMore, setHasMore] = useState(true);

    // Stati Jackett (Torrent)
    const [downloadingId, setDownloadingId] = useState(null); // Loader per la singola card
    const [torrentResults, setTorrentResults] = useState([]);
    const [isTorrentDialogOpen, setIsTorrentDialogOpen] = useState(false);
    const [selectedBook, setSelectedBook] = useState(null);
    const [downloadingTorrentLink, setDownloadingTorrentLink] = useState(null); // Loader per il bottone modale

    // Caricamento libri locali
    useEffect(() => {
        db.books.toArray().then(setBooks);
    }, []);

    // Reset quando cambiano i filtri di ricerca online
    useEffect(() => {
        if (tabValue !== 0) {
            setApiBooks([]);
            setStartIndex(0);
            setHasMore(true);
        }
    }, [tabValue, searchQuery, apiLanguage]);

    // Fetch da Google Books API
    useEffect(() => {
        if (tabValue === 0) return;

        const fetchApiBooks = async () => {
            setIsApiLoading(true);
            const MAX_RETRIES = 3;
            const RETRY_DELAY = 1000;
            const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

            const executeFetch = async (attempt = 1) => {
                try {
                    const query = searchQuery.trim() === "" ? `subject:fiction` : searchQuery;
                    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&langRestrict=${apiLanguage}&orderBy=relevance&startIndex=${startIndex}&maxResults=20`;

                    const response = await fetch(url);
                    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

                    const data = await response.json();

                    if (data.items) {
                        const mappedBooks = data.items.map(item => ({
                            id: item.id,
                            title: item.volumeInfo.title,
                            author: item.volumeInfo.authors ? item.volumeInfo.authors.join(', ') : t('unknown_author'),
                            cover: item.volumeInfo.imageLinks?.thumbnail?.replace('http:', 'https:') || null,
                            year: item.volumeInfo.publishedDate ? item.volumeInfo.publishedDate.split('-')[0] : '',
                            isExternal: true
                        }));

                        setApiBooks(prev => [...prev, ...mappedBooks]);
                        if (data.items.length < 20) setHasMore(false);
                    } else {
                        setHasMore(false);
                    }
                } catch (error) {
                    if (attempt < MAX_RETRIES) {
                        await sleep(RETRY_DELAY);
                        return executeFetch(attempt + 1);
                    }
                    console.error("Errore API Google:", error);
                }
            };

            await executeFetch();
            setIsApiLoading(false);
        };

        const timeoutId = setTimeout(fetchApiBooks, 500);
        return () => clearTimeout(timeoutId);
    }, [tabValue, searchQuery, apiLanguage, startIndex, t]);

    // Gestione Scroll (Infinite Scroll)
    const handleScroll = (e) => {
        if (tabValue === 0 || isApiLoading || !hasMore) return;
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollHeight - scrollTop <= clientHeight + 100) {
            setStartIndex(prev => prev + 20);
        }
    };

    // Helper per verificare se un libro è in locale
    const checkIfDownloaded = (book) => {
        return books.some(local =>
            local.title.toLowerCase() === book.title.toLowerCase() &&
            local.author.toLowerCase() === book.author.toLowerCase()
        );
    };

    // DOWNLOAD: Cerca Torrent via Bridge Node.js
    const handleDownloadOnlineBook = async (book) => {
        setDownloadingId(book.id);
        setSelectedBook(book);

        try {
            // Mappa delle lingue per ottimizzare la ricerca torrent
            const torrentLangMap = {
                'it': 'ITA',
                'en': 'ENG',
                'fr': 'FRA',
                'es': 'SPA'
            };

            // Otteniamo il tag lingua (es. "ITA"), se non esiste stringa vuota
            const langTag = torrentLangMap[apiLanguage] || '';

            // Aggiungiamo la lingua alla query di ricerca
            const query = `${book.title} ${langTag}`.trim();

            // Chiamata al server bridge
            const response = await fetch(`http://localhost:3001/search?query=${encodeURIComponent(query)}`);

            if (!response.ok) throw new Error("Errore dal server Bridge");

            const data = await response.json();

            if (data.length === 0) {
                alert(t('no_torrents_found') || `Nessun torrent trovato per questo libro in ${langTag}.`);
            } else {
                setTorrentResults(data);
                setIsTorrentDialogOpen(true);
            }
        } catch (error) {
            console.error("Errore ricerca torrent:", error);
            alert(t('download_error') || "Errore di connessione al server torrent.");
        } finally {
            setDownloadingId(null);
        }
    };

    // NUOVO: Gestisce il download del torrent dal server Node e importa il file
    const handleTorrentAction = async (torrent) => {
        setDownloadingTorrentLink(torrent.link);

        try {
            // Chiamata al server Node.js che usa WebTorrent per restituirci l'EPUB
            const response = await fetch(`http://localhost:3001/download?torrentUrl=${encodeURIComponent(torrent.link)}`);

            if (!response.ok) {
                let errorMessage = "Errore durante il download dal server.";
                try {
                    const errorData = await response.json();
                    if (errorData.error) errorMessage = errorData.error;
                } catch(e) {}
                throw new Error(errorMessage);
            }

            // Trasforma il file binario in entrata in un Blob
            const blob = await response.blob();

            // Crea un File virtuale (come se fosse stato scelto con l'input file)
            // Usiamo il titolo del libro e l'estensione epub
            const file = new File([blob], `${selectedBook.title}.epub`, { type: 'application/epub+zip' });

            // Processa ed estrai i metadati/copertina
            const processedBook = await processEpubFile(file);

            // Salva nel database
            const id = await db.books.add(processedBook);
            setBooks(prev => [...prev, { ...processedBook, id }]);

            // Feedback di successo
            setIsTorrentDialogOpen(false); // Chiude la modale
            setTabValue(0); // Torna alla pagina My Books

        } catch (error) {
            console.error("Errore download file torrent:", error);
            alert(error.message);
        } finally {
            setDownloadingTorrentLink(null);
        }
    };

    const filteredLocalBooks = useMemo(() => {
        if (tabValue !== 0) return [];
        return books.filter(book =>
            book.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            book.author?.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [books, searchQuery, tabValue]);

    const handleImport = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        setIsImporting(true);
        try {
            const processedBook = await processEpubFile(file);
            const id = await db.books.add(processedBook);
            setBooks(prev => [...prev, { ...processedBook, id }]);
        } catch (error) {
            alert(t('import_error'));
        } finally {
            setIsImporting(false);
            event.target.value = '';
        }
    };

    const handleDelete = async () => {
        if (window.confirm(t('delete_confirm'))) {
            await db.books.delete(menuState.bookId);
            setBooks(prev => prev.filter(b => b.id !== menuState.bookId));
        }
        setMenuState({ anchor: null, bookId: null });
    };

    return (
        <Box sx={{
            height: '100vh', display: 'flex', flexDirection: 'column',
            bgcolor: themeStyles.bg, color: themeStyles.text, overflow: 'hidden'
        }}>
            <SettingsDrawer
                open={settingsOpen} onClose={() => setSettingsOpen(false)}
                settings={settings} setSettings={setSettings} themeStyles={themeStyles}
            />

            {/* HEADER */}
            <AppBar position="static" elevation={0} sx={{ bgcolor: 'transparent', flexShrink: 0 }}>
                <Toolbar sx={{ px: { xs: 2, sm: 6 }, py: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <img src="/gembook/icon.png" alt="Logo" style={{ width: 35, height: 35 }} />
                        <Typography variant="h6" sx={{ color: themeStyles.text, fontWeight: 800, ml: 1.5, display: { xs: 'none', sm: 'block' } }}>
                            GemBook
                        </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', gap: 2, flexGrow: 1, justifyContent: 'center', px: 2 }}>
                        <Box sx={{
                            display: { xs: 'none', md: 'flex' }, bgcolor: themeStyles.card,
                            borderRadius: '12px', px: 2, py: 0.5, width: '100%', maxWidth: 350,
                            border: `1px solid ${themeStyles.border}`, alignItems: 'center'
                        }}>
                            <SearchIcon sx={{ color: 'grey.400', fontSize: 20, mr: 1 }} />
                            <InputBase
                                placeholder={t('search_placeholder')}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                sx={{ flex: 1, fontSize: '0.9rem', color: themeStyles.text }}
                            />
                        </Box>

                        <Button component="label" variant="contained" disableElevation
                                sx={{ bgcolor: themeStyles.primary, borderRadius: '12px', textTransform: 'none', px: { xs: 1.5, sm: 3 }, fontWeight: 'bold' }}>
                            <AddIcon />
                            <Box sx={{ ml: 1, display: { xs: 'none', sm: 'block' } }}>{t('add_book')}</Box>
                            <input type="file" accept=".epub" hidden onChange={handleImport} />
                        </Button>
                    </Box>

                    <IconButton onClick={() => setSettingsOpen(true)} sx={{ color: themeStyles.text, bgcolor: themeStyles.card }}>
                        <SettingsIcon fontSize="small" />
                    </IconButton>
                </Toolbar>
            </AppBar>

            {/* AREA CONTROLLI */}
            <Container maxWidth="md" sx={{ flexShrink: 0, mt: 1 }}>
                <Box sx={{ display: { xs: 'flex', md: 'none' }, bgcolor: themeStyles.card, borderRadius: '12px', px: 2, py: 0.5, mb: 2, border: `1px solid ${themeStyles.border}`, alignItems: 'center' }}>
                    <SearchIcon sx={{ color: 'grey.400', fontSize: 20, mr: 1 }} />
                    <InputBase
                        placeholder={tabValue === 0 ? t('search_local') : t('search_online')}
                        value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                        sx={{ flex: 1, fontSize: '0.9rem', color: themeStyles.text }}
                    />
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
                    <Tabs
                        value={tabValue}
                        onChange={(e, v) => setTabValue(v)}
                        sx={{
                            bgcolor: themeStyles.paper, borderRadius: '16px', p: 0.5, minHeight: 'auto',
                            '& .MuiTabs-indicator': { display: 'none' }
                        }}
                    >
                        <Tab label={t('tab_my_books')} sx={getTabStyles(themeStyles)} />
                        <Tab label={t('tab_online')} sx={getTabStyles(themeStyles)} />
                    </Tabs>
                </Box>

                {tabValue !== 0 && (
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                        <Select
                            value={apiLanguage}
                            onChange={(e) => setApiLanguage(e.target.value)}
                            size="small"
                            sx={{
                                borderRadius: '12px', bgcolor: themeStyles.paper, color: themeStyles.text,
                                height: '36px', '& fieldset': { border: 'none' }, minWidth: 100,
                                fontSize: '0.85rem'
                            }}
                        >
                            <MenuItem value="it">IT</MenuItem>
                            <MenuItem value="en">EN</MenuItem>
                            <MenuItem value="fr">FR</MenuItem>
                            <MenuItem value="es">ES</MenuItem>
                        </Select>
                    </Box>
                )}
            </Container>

            {/* AREA LISTA */}
            <Box
                onScroll={handleScroll}
                sx={{ flexGrow: 1, overflowY: 'auto', pt: 1, pb: 4, WebkitOverflowScrolling: 'touch' }}
            >
                <Container maxWidth="md">
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>

                        {tabValue === 0 ? (
                            filteredLocalBooks.map(book => (
                                <BookCard
                                    key={book.id}
                                    book={book}
                                    themeStyles={themeStyles}
                                    onOpen={onOpenBook}
                                    onMenuOpen={(e, id) => setMenuState({ anchor: e.currentTarget, bookId: id })}
                                />
                            ))
                        ) : (
                            apiBooks.map(book => (
                                <OnlineBookCard
                                    key={book.id}
                                    book={book}
                                    themeStyles={themeStyles}
                                    isDownloaded={checkIfDownloaded(book)}
                                    isDownloading={downloadingId === book.id}
                                    onDownload={handleDownloadOnlineBook}
                                />
                            ))
                        )}

                        {isApiLoading && (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                                <CircularProgress size={30} sx={{ color: themeStyles.primary }} />
                            </Box>
                        )}

                        {!isApiLoading && (tabValue === 0 ? filteredLocalBooks : apiBooks).length === 0 && (
                            <Box sx={{
                                textAlign: 'center', py: 10, bgcolor: themeStyles.card,
                                borderRadius: '16px', border: `1px dashed ${themeStyles.border}`
                            }}>
                                <Typography variant="h6" sx={{ color: themeStyles.text, fontWeight: 'bold' }}>
                                    {t('empty_search_title')}
                                </Typography>
                            </Box>
                        )}
                    </Box>
                </Container>
            </Box>

            {/* DIALOG TORRENT (Risultati da Jackett) */}
            <Dialog
                open={isTorrentDialogOpen}
                onClose={() => {
                    if(!downloadingTorrentLink) setIsTorrentDialogOpen(false); // Evita chiusure accidentali durante il download
                }}
                fullWidth
                maxWidth="sm"
                PaperProps={{ sx: { bgcolor: themeStyles.bg, color: themeStyles.text, borderRadius: '16px' } }}
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                        Risultati: {selectedBook?.title}
                    </Typography>
                    <IconButton
                        onClick={() => setIsTorrentDialogOpen(false)}
                        disabled={!!downloadingTorrentLink} // Disabilita tasto X durante download
                        sx={{ color: themeStyles.text }}
                    >
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>

                <DialogContent dividers sx={{ borderColor: themeStyles.border, p: 0 }}>
                    <List sx={{ pt: 0, pb: 0 }}>
                        {torrentResults.map((torrent, idx) => {
                            const isEpub = torrent.title.toLowerCase().includes('epub');
                            const isThisDownloading = downloadingTorrentLink === torrent.link;
                            const isAnyDownloading = !!downloadingTorrentLink;

                            return (
                                <ListItem
                                    key={idx}
                                    divider={idx !== torrentResults.length - 1}
                                    sx={{
                                        flexDirection: { xs: 'column', sm: 'row' },
                                        alignItems: { xs: 'flex-start', sm: 'center' },
                                        gap: 2, p: 2, borderColor: themeStyles.border
                                    }}
                                >
                                    <Box sx={{ flexGrow: 1, width: '100%' }}>
                                        <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.5, wordBreak: 'break-word' }}>
                                            {torrent.title}
                                        </Typography>

                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                                            {isEpub && (
                                                <Chip size="small" icon={<BookIcon />} label="EPUB" color="success" variant="outlined" />
                                            )}
                                            <Chip size="small" label={formatBytes(torrent.size)} sx={{ bgcolor: themeStyles.card, color: themeStyles.text }} />
                                            <Chip size="small" label={`Seeders: ${torrent.seeders}`} sx={{ bgcolor: themeStyles.card, color: themeStyles.text }} />
                                            <Typography variant="caption" sx={{ color: 'grey.500', ml: 1 }}>
                                                {torrent.indexer}
                                            </Typography>
                                        </Box>
                                    </Box>

                                    <Button
                                        variant="contained"
                                        disabled={isAnyDownloading}
                                        startIcon={isThisDownloading ? <CircularProgress size={20} color="inherit" /> : <DownloadIcon />}
                                        onClick={() => handleTorrentAction(torrent)}
                                        sx={{
                                            bgcolor: themeStyles.primary,
                                            textTransform: 'none',
                                            fontWeight: 'bold',
                                            borderRadius: '8px',
                                            alignSelf: { xs: 'flex-end', sm: 'center' },
                                            minWidth: '120px'
                                        }}
                                    >
                                        {isThisDownloading ? "In corso..." : "Scarica"}
                                    </Button>
                                </ListItem>
                            );
                        })}
                    </List>
                </DialogContent>
            </Dialog>

            {/* Menu Opzioni My Books */}
            <Menu
                anchorEl={menuState.anchor} open={Boolean(menuState.anchor)}
                onClose={() => setMenuState({ anchor: null, bookId: null })}
                PaperProps={{ sx: { bgcolor: themeStyles.card, color: themeStyles.text, borderRadius: '12px' } }}
            >
                <MenuItem onClick={handleDelete} sx={{ color: 'error.main', fontWeight: 'bold' }}>
                    {t('delete_book')}
                </MenuItem>
            </Menu>

            <Backdrop sx={{ color: '#fff', zIndex: 2000, flexDirection: 'column', gap: 2 }} open={isImporting}>
                <CircularProgress color="inherit" />
                <Typography>{t('importing_book')}</Typography>
            </Backdrop>
        </Box>
    );
}

const getTabStyles = (themeStyles) => ({
    borderRadius: '12px', textTransform: 'none', fontWeight: 'bold',
    minHeight: '40px', minWidth: { xs: '80px', sm: 120 },
    color: 'grey.500',
    '&.Mui-selected': { bgcolor: themeStyles.card, color: themeStyles.text }
});