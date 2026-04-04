import React, {useEffect, useRef, useState} from 'react';
import {db} from '../services/db';
import {epubService} from '../services/EpubService';
import {
    AppBar,
    Box,
    Drawer,
    IconButton,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    Slider,
    Toolbar,
    Typography
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SettingsIcon from '@mui/icons-material/Settings';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import {SettingsDrawer} from './Settings';

export default function Reader({bookId, onClose, settings, setSettings, themeStyles}) {
    const viewerRef = useRef(null);

    // Stati UI e Info Libro
    const [bookTitle, setBookTitle] = useState('Caricamento...');
    const [time, setTime] = useState(new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}));
    const [isBookReady, setIsBookReady] = useState(false);

    // Stati Navigazione e Progresso
    const [bookProgress, setBookProgress] = useState(0);
    const [chapterStats, setChapterStats] = useState({title: '', timeLeft: '-- min'});
    const [toc, setToc] = useState([]);
    const [chaptersMarks, setChaptersMarks] = useState([]);
    const [currentChapterIndex, setCurrentChapterIndex] = useState(-1);

    // Menu
    const [isTocOpen, setIsTocOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);

    // Aggiornamento Orologio
    useEffect(() => {
        const timer = setInterval(() => setTime(new Date().toLocaleTimeString([], {
            hour: '2-digit', minute: '2-digit'
        })), 10000);
        return () => clearInterval(timer);
    }, []);

    // Inizializzazione del Libro
// Dentro Reader.js, nell'useEffect di inizializzazione:

    useEffect(() => {
        let isMounted = true;

        const loadBook = async () => {
            const bookData = await db.books.get(bookId);
            if (!bookData || !isMounted) return;

            // Passiamo direttamente il riferimento al DOM
            await epubService.init({
                bookData,
                elementId: viewerRef.current, // Passa il nodo DOM direttamente
                settings: settings,
                onReady: () => {
                    if (!isMounted) return;
                    setIsBookReady(true);
                    setChaptersMarks(epubService.getChapterMarks());

                    // Evento tastiera dentro l'iframe
                    epubService.rendition.on('keydown', (e) => {
                        if (e.key === 'ArrowLeft') epubService.prev();
                        if (e.key === 'ArrowRight') epubService.next();
                    });
                },
                onRelocated: (data) => {
                    if (!isMounted) return;
                    setChapterStats({title: data.chapterTitle, timeLeft: data.timeLeft});
                    setCurrentChapterIndex(data.chapterIndex);
                    setBookProgress(data.percentage);
                    db.books.update(bookId, {currentCfi: data.cfi, progress: data.percentage});
                }
            });
        };

        loadBook();

        return () => {
            isMounted = false;
            // La distruzione è gestita dal service
            epubService.destroy();
        };
    }, [bookId, settings]); // Riesegue quando cambia la modalità
    // Applica settings dinamici (font, temi, etc)


    useEffect(() => {
        if (isBookReady && epubService) {
            epubService.applySettings(settings);
        }
    }, [settings, isBookReady]);

    // Tastiera finestra principale
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
            if (event.key === 'ArrowLeft') epubService.prev();
            if (event.key === 'ArrowRight') epubService.next();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleMarginClick = (e) => {
        if (window.getSelection().toString().length > 0) return;
        const containerRect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - containerRect.left;
        if (clickX < containerRect.width * 0.25) epubService.prev();
        else if (clickX > containerRect.width * 0.75) epubService.next();
    };

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '100dvh',
            bgcolor: themeStyles.bg,
            color: themeStyles.text,
            overflow: 'hidden',
            transition: 'background-color 0.3s ease'
        }}>

            {/* HEADER */}
            <AppBar position="static" elevation={0} sx={{
                bgcolor: themeStyles.card,
                color: themeStyles.text,
                borderBottom: `1px solid ${themeStyles.border}`,
                backgroundImage: 'none'
            }}>
                <Toolbar>
                    <IconButton edge="start" color="inherit" onClick={onClose}><ArrowBackIcon/></IconButton>
                    <IconButton color="inherit"
                                onClick={() => setIsTocOpen(true)}><FormatListBulletedIcon/></IconButton>

                    <Box sx={{flexGrow: 1, textAlign: 'center', px: 2}}>
                        <Typography variant="body1" noWrap sx={{fontWeight: 600}}>{bookTitle}</Typography>
                        <Typography variant="caption" noWrap
                                    sx={{display: 'block', opacity: 0.7, color: themeStyles.secondaryText}}>
                            {chapterStats.title || 'Caricamento...'}
                        </Typography>
                    </Box>

                    <Typography variant="body2"
                                sx={{mr: 1, fontWeight: 500, opacity: 0.8, display: {xs: 'none', sm: 'block'}}}>
                        {time}
                    </Typography>

                    <IconButton color="inherit" onClick={() => setSettingsOpen(true)}><SettingsIcon/></IconButton>
                </Toolbar>
            </AppBar>


            {/* AREA LETTURA */}
            <Box
                sx={{
                    flexGrow: 1,
                    position: 'relative',
                    overflow: 'hidden', // <-- DEVE essere sempre hidden! Lo scroll lo fa epub.js internamente
                }}
                onClick={handleMarginClick}
            >
                <Box
                    ref={viewerRef}
                    sx={{
                        height: '100%',
                        width: '100%',
                        px: {xs: 1, sm: 4},
                        // Reset forzato per evitare bug di epub.js che aggiunge inline styles
                        '& .epub-container': {
                            height: '100% !important',
                            minWidth: '100% !important',
                            // Se usi 'scrolled', l'iframe all'interno avrà la sua barra di scorrimento nativa
                        }
                    }}
                />
            </Box>

            {/* FOOTER */}
            <Box sx={{p: 2, bgcolor: themeStyles.card, borderTop: `1px solid ${themeStyles.border}`}}>
                <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    maxWidth: 1200, // Puoi regolarlo o toglierlo per full-width
                    mx: 'auto'
                }}>

                    {/* SEZIONE SINISTRA: Pulsante centrato in questo spazio */}
                    <Box sx={{flex: 1, display: 'flex', justifyContent: 'center'}}>
                        <IconButton
                            onClick={() => epubService.prev()}
                            sx={{
                                color: themeStyles.text,
                                border: `1px solid ${themeStyles.border}`,
                                borderRadius: '10px',
                                width: 48,
                                height: 48,
                                '&:hover': {bgcolor: 'rgba(0,0,0,0.04)'}
                            }}
                        >
                            <NavigateBeforeIcon/>
                        </IconButton>
                    </Box>

                    {/* SEZIONE CENTRALE: La barra e le info */}
                    <Box sx={{flex: 3, display: 'flex', flexDirection: 'column', gap: 0.5}}>
                        <Slider
                            value={bookProgress}
                            marks={chaptersMarks}
                            step={0.1}
                            onChange={(e, v) => setBookProgress(v)}
                            onChangeCommitted={(e, v) => {
                                epubService.goToPercentage(v);
                                if (document.activeElement) document.activeElement.blur();
                            }}
                            sx={{
                                color: themeStyles.primary,
                                height: 6,
                                '& .MuiSlider-mark': {height: 6, width: 2, bgcolor: themeStyles.bg},
                                '& .MuiSlider-thumb': {width: 14, height: 14}
                            }}
                        />
                        <Box sx={{display: 'flex', justifyContent: 'space-between', px: 0.5}}>
                            <Typography variant="caption" sx={{color: themeStyles.secondaryText, fontWeight: 500}}>
                                {chapterStats.timeLeft}
                            </Typography>
                            <Typography variant="caption" sx={{fontWeight: 'bold', color: themeStyles.secondaryText}}>
                                {bookProgress.toFixed(1)}%
                            </Typography>
                        </Box>
                    </Box>

                    {/* SEZIONE DESTRA: Pulsante centrato in questo spazio */}
                    <Box sx={{flex: 1, display: 'flex', justifyContent: 'center'}}>
                        <IconButton
                            onClick={() => epubService.next()}
                            sx={{
                                color: themeStyles.text,
                                border: `1px solid ${themeStyles.border}`,
                                borderRadius: '10px',
                                width: 48,
                                height: 48,
                                '&:hover': {bgcolor: 'rgba(0,0,0,0.04)'}
                            }}
                        >
                            <NavigateNextIcon/>
                        </IconButton>
                    </Box>

                </Box>
            </Box>

            {/* DRAWER INDICE */}
            <Drawer anchor="left" open={isTocOpen} onClose={() => setIsTocOpen(false)}
                    PaperProps={{
                        sx: {
                            width: {xs: '100%', sm: 360},
                            p: 3,
                            bgcolor: themeStyles.card,
                            color: themeStyles.text,
                            borderRadius: {xs: 0, sm: '0 16px 16px 0'},
                            transition: 'background-color 0.3s ease'
                        },
                    }}

            >


                <Box sx={{display: 'flex', flexDirection: 'column', height: '100%'}}>
                    <Typography variant="h6" sx={{fontWeight: 800}}>Indice</Typography>
                    <List sx={{overflowY: 'auto', p: 0}}>
                        {toc.map((chap, i) => (
                            <ListItem key={i} disablePadding divider sx={{borderColor: themeStyles.border}}>
                                <ListItemButton onClick={() => {
                                    setIsTocOpen(false);
                                    epubService.goToChapterByIndex(i);
                                }} selected={currentChapterIndex === i}>
                                    <ListItemText primary={chap.label}
                                                  primaryTypographyProps={{
                                                      fontWeight: currentChapterIndex === i ? 600 : 400,
                                                      color: currentChapterIndex === i ? themeStyles.primary : 'inherit'
                                                  }}/>
                                </ListItemButton>
                            </ListItem>
                        ))}
                    </List>
                </Box>
            </Drawer>

            {/* COMPONENTE SETTINGS ESTERNO */}
            <SettingsDrawer
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                settings={settings}
                setSettings={setSettings}
                themeStyles={themeStyles}
            />
        </Box>
    );
}