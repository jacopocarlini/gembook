import React, {useEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {db} from '../services/db';
import {epubService} from '../services/EpubService';
import {
    AppBar,
    Box,
    Drawer,
    GlobalStyles,
    IconButton,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    Slider,
    Toolbar,
    Typography,
    Tabs,
    Tab
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

import {SettingsDrawer} from './Settings';
import ePub from 'epubjs';

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

            await epubService.init({
                bookData,
                elementId: viewerRef.current,
                settings: settings,
                onReady: () => {
                    if (!isMounted) return;
                    setChaptersMarks(epubService.getChapterMarks());
                },
                onRelocated: (data) => {
                    if (!isMounted) return;
                    setChapterStats({title: data.chapterTitle, timeStats: data.timeStats});
                    setCurrentChapterIndex(data.chapterIndex);
                    setBookProgress(data.percentage);

                    setCurrentLocation(data);

                    db.books.update(bookId, {currentCfi: data.cfi, progress: data.percentage});
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

        // Se per qualche motivo epubjs non ha ancora i dati visibili, usiamo un fallback sicuro
        if (!visibleLocation || !visibleLocation.start || !visibleLocation.end) {
            setIsBookmarked(bookmarks.some(b => b.cfi === currentLocation.cfi));
            return;
        }

        const cfiHelper = new ePub.CFI();

        const isHere = bookmarks.some(b => {
            try {
                // Controlla se il bookmark si trova TRA l'inizio e la fine della pagina visibile
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

    // Aggiungi / Rimuovi Bookmark dalla Header (Con UI Ottimistica)
// Aggiungi / Rimuovi Bookmark dalla Header
    const handleToggleBookmark = async () => {
        if (!currentLocation || !epubService.rendition) return;

        // Salviamo lo stato attuale per l'aggiornamento ottimistico
        const wasBookmarked = isBookmarked;
        setIsBookmarked(!wasBookmarked);

        try {
            const bookData = await db.books.get(bookId);
            const existingBookmarks = bookData.bookmarks || [];
            let newBookmarks;

            if (wasBookmarked) {
                // RIMOZIONE: Eliminiamo TUTTI i segnalibri visibili in questa schermata
                const visibleLocation = epubService.rendition.location;
                const cfiHelper = new ePub.CFI();

                newBookmarks = existingBookmarks.filter(b => {
                    if (visibleLocation && visibleLocation.start && visibleLocation.end) {
                        try {
                            const isAfterStart = cfiHelper.compare(b.cfi, visibleLocation.start.cfi) >= 0;
                            const isBeforeEnd = cfiHelper.compare(b.cfi, visibleLocation.end.cfi) <= 0;
                            const isVisible = isAfterStart && isBeforeEnd;

                            // Se è visibile lo scartiamo (ritorniamo false), altrimenti lo teniamo
                            return !isVisible;
                        } catch (e) {
                            return b.cfi !== currentLocation.cfi;
                        }
                    }
                    return b.cfi !== currentLocation.cfi;
                });
            } else {
                // AGGIUNTA: Creiamo un solo nuovo segnalibro all'inizio della pagina visibile
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

            await db.books.update(bookId, { bookmarks: newBookmarks });
            setBookmarks(newBookmarks);

        } catch (error) {
            console.error("Errore durante il salvataggio del bookmark:", error);
            // In caso di errore ripristiniamo l'icona
            setIsBookmarked(wasBookmarked);
        }
    };
    // Elimina un bookmark dalla lista del Drawer
    const handleDeleteBookmark = async (cfiToRemove) => {
        try {
            const bookData = await db.books.get(bookId);
            const existingBookmarks = bookData.bookmarks || [];
            const newBookmarks = existingBookmarks.filter(b => b.cfi !== cfiToRemove);

            await db.books.update(bookId, { bookmarks: newBookmarks });
            setBookmarks(newBookmarks);
        } catch (error) {
            console.error("Errore durante l'eliminazione del bookmark:", error);
        }
    };

    // Vai alla pagina del bookmark
    const handleGoToBookmark = (cfi) => {
        if (epubService.display) {
            epubService.display(cfi);
        } else if (epubService.rendition) {
            epubService.rendition.display(cfi);
        }
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

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: themeStyles.bg, color: themeStyles.text, overflow: 'hidden' }}>

            <GlobalStyles styles={{
                '*': { scrollbarWidth: 'thin', scrollbarColor: `${themeStyles.text} ${themeStyles.bg}` },
                '*::-webkit-scrollbar': { width: '10px', height: '10px' },
                '*::-webkit-scrollbar-track': { background: themeStyles.bg },
                '*::-webkit-scrollbar-thumb': { backgroundColor: themeStyles.text, borderRadius: '10px', border: `3px solid ${themeStyles.bg}`, opacity: 0.5 }
            }}/>

            {/* HEADER */}
            <AppBar position="static" elevation={0} sx={{ bgcolor: themeStyles.card, color: themeStyles.text, borderBottom: `1px solid ${themeStyles.border}`, backgroundImage: 'none' }}>
                <Toolbar sx={{gap: 0.5}}>
                    <IconButton edge="start" color="inherit" onClick={onClose}><ArrowBackIcon/></IconButton>
                    <IconButton color="inherit" onClick={() => setIsTocOpen(true)}><FormatListBulletedIcon/></IconButton>

                    <Box sx={{flexGrow: 1, textAlign: 'center', px: 1, minWidth: 0}}>
                        <Typography variant="body1" noWrap sx={{fontWeight: 700, fontSize: '0.95rem'}}>{bookTitle}</Typography>
                        <Typography variant="caption" noWrap sx={{display: 'block', opacity: 0.7}}>{chapterStats.title}</Typography>
                    </Box>

                    <Typography variant="body2" sx={{fontWeight: 600, display: {xs: 'none', sm: 'block'}, mx: 1}}>{time}</Typography>
                    <IconButton color="inherit" onClick={handleToggleBookmark} sx={{ color: isBookmarked ? themeStyles.primary : 'inherit' }}>
                        {isBookmarked ? <BookmarkIcon /> : <BookmarkBorderIcon />}
                    </IconButton>
                    <IconButton color="inherit" onClick={() => setSettingsOpen(true)}><SettingsIcon/></IconButton>
                </Toolbar>
            </AppBar>

            {/* AREA LETTURA */}
            <Box sx={{flexGrow: 1, position: 'relative', overflow: 'hidden', px: {xs: 1, sm: 2}}}>
                <Box ref={viewerRef} sx={{ position: 'absolute', top: 0, bottom: 0, left: {xs: 8, sm: 1}, right: {xs: 8, sm: 1}, '& .epub-view': { width: settings.readingMode === 2 ? '99% !important' : '100%' } }} />
            </Box>

            {/* FOOTER */}
            <Box sx={{p: 2, bgcolor: themeStyles.card, borderTop: `1px solid ${themeStyles.border}`}}>
                <Box sx={{display: 'flex', alignItems: 'center', width: '100%', maxWidth: 1200, mx: 'auto', gap: 2}}>
                    <IconButton onClick={() => epubService.prev()} sx={{ color: themeStyles.text, border: `1px solid ${themeStyles.border}`, borderRadius: '12px' }}><NavigateBeforeIcon/></IconButton>

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
                            <Typography variant="caption" sx={{fontWeight: 500, opacity: 0.8}}>{renderTimeLeft()}</Typography>
                            <Typography variant="caption" sx={{fontWeight: 800}}>{bookProgress.toFixed(1)}%</Typography>
                        </Box>
                    </Box>

                    <IconButton onClick={() => epubService.next()} sx={{ color: themeStyles.text, border: `1px solid ${themeStyles.border}`, borderRadius: '12px' }}><NavigateNextIcon/></IconButton>
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
                <Box sx={{ p: {xs: 1.5, sm: 2}, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6" sx={{fontWeight: 800, px: 1}}>Menu</Typography>
                    <IconButton onClick={() => setIsTocOpen(false)} size="small"><CloseIcon/></IconButton>
                </Box>

                {/* Tabs di navigazione */}
                <Tabs
                    value={drawerTab}
                    onChange={(e, newValue) => setDrawerTab(newValue)}
                    variant="fullWidth"
                    sx={{
                        borderBottom: `1px solid ${themeStyles.border}`,
                        '& .MuiTab-root': { color: themeStyles.text, fontWeight: 600 },
                        '& .Mui-selected': { color: `${themeStyles.primary} !important` },
                        '& .MuiTabs-indicator': { backgroundColor: themeStyles.primary }
                    }}
                >
                    <Tab label={t('index_title')} />
                    <Tab label={t('bookmarks')} />
                </Tabs>

                {/* Contenuto del Drawer */}
                <Box sx={{flexGrow: 1, overflowY: 'auto'}}>

                    {/* TAB 0: INDICE (TOC) */}
                    {drawerTab === 0 && (
                        <List>
                            {toc.map((chap, i) => (
                                <ListItem key={i} disablePadding divider sx={{borderColor: themeStyles.border}}>
                                    <ListItemButton
                                        onClick={() => {
                                            setIsTocOpen(false);
                                            epubService.goToChapterByIndex(i);
                                        }}
                                        selected={currentChapterIndex === i}
                                        sx={{pl: 2 + (chap.level || 0) * 2}}
                                    >
                                        <ListItemText
                                            primary={chap.label}
                                            primaryTypographyProps={{
                                                fontWeight: currentChapterIndex === i ? 700 : 400,
                                                fontSize: chap.level > 0 ? '0.9rem' : '1rem',
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
                        <List>
                            {bookmarks.length > 0 ? (
                                bookmarks.map((b, i) => (
                                    <ListItem key={i} disablePadding divider sx={{borderColor: themeStyles.border}}>
                                        <ListItemButton onClick={() => handleGoToBookmark(b.cfi)}>
                                            <ListItemText
                                                primary={`${t('chapter')+": "+b.chapterTitle}`}
                                                secondary={`${(b.percentage || 0).toFixed(1)}%`}
                                                primaryTypographyProps={{ fontWeight: 600, color: themeStyles.text, fontSize: '0.95rem' }}
                                                secondaryTypographyProps={{ color: themeStyles.primary, fontWeight: 700 }}
                                            />
                                        </ListItemButton>

                                        <IconButton
                                            edge="end"
                                            onClick={() => handleDeleteBookmark(b.cfi)}
                                            sx={{ color: themeStyles.text, opacity: 0.6, mr: 1, '&:hover': { opacity: 1, color: 'error.main' } }}
                                        >
                                            <DeleteOutlineIcon fontSize="small" />
                                        </IconButton>
                                    </ListItem>
                                ))
                            ) : (
                                <Box sx={{ p: 4, textAlign: 'center', opacity: 0.5 }}>
                                    <BookmarkBorderIcon sx={{ fontSize: 40, mb: 1 }} />
                                    <Typography variant="body2">{t('no_bookmark_saved')}</Typography>
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