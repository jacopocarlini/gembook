import React, { useEffect, useRef, useState } from 'react';
import ePub from 'epubjs';
import { db } from './db';
import {
    AppBar, Toolbar, Typography, IconButton, Box, Slider, CircularProgress, Tooltip,
    Dialog, DialogTitle, DialogContent, FormControl, InputLabel, Select, MenuItem,
    ToggleButtonGroup, ToggleButton, Divider
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SettingsIcon from '@mui/icons-material/Settings';

const PURPLE = '#5e35b1';

export default function Reader({ bookId, onClose }) {
    const viewerRef = useRef(null);
    const bookRef = useRef(null);

    const [rendition, setRendition] = useState(null);
    const [bookTitle, setBookTitle] = useState('Caricamento...');
    const [time, setTime] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

    const [isBookReady, setIsBookReady] = useState(false);
    const [bookProgress, setBookProgress] = useState(0);
    const [chapterStats, setChapterStats] = useState({ progress: 0, timeLeft: 'Calcolo...', title: '' });
    const [chaptersMarks, setChaptersMarks] = useState([]);

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [settings, setSettings] = useState({
        fontSize: 100, fontFamily: 'sans-serif', theme: 'light', flow: 'paginated'
    });

    const themeColors = {
        light: { bg: '#ffffff', text: '#000000', barBg: '#ffffff' },
        dark: { bg: '#121212', text: '#e0e0e0', barBg: '#121212' },
        sepia: { bg: '#f4ecd8', text: '#5b4636', barBg: '#f4ecd8' }
    };
    const currentTheme = themeColors[settings.theme];

    const tocRef = useRef([]);
    const lastTurnRef = useRef({ time: Date.now(), percent: 0 });
    const speedsRef = useRef([]);

    useEffect(() => {
        const timer = setInterval(() => {
            setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }, 10000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (rendition) {
            rendition.themes.select(settings.theme);
            rendition.themes.font(settings.fontFamily);
            rendition.themes.fontSize(`${settings.fontSize}%`);
            if (rendition.settings.flow !== settings.flow) rendition.flow(settings.flow);
        }
    }, [settings, rendition]);

    useEffect(() => {
        let isMounted = true;
        const loadBook = async () => {
            try {
                const bookData = await db.books.get(bookId);
                if (!bookData || !isMounted) return;

                setBookTitle(bookData.title);
                const bookInstance = ePub(bookData.file);
                bookRef.current = bookInstance;

                const newRendition = bookInstance.renderTo(viewerRef.current, {
                    width: '100%', height: '100%', spread: 'none', manager: 'continuous', flow: settings.flow
                });

                newRendition.themes.register('light', { body: { background: '#ffffff', color: '#000000' } });
                newRendition.themes.register('dark', { body: { background: '#121212', color: '#e0e0e0' } });
                newRendition.themes.register('sepia', { body: { background: '#f4ecd8', color: '#5b4636' } });

                newRendition.themes.select(settings.theme);
                newRendition.themes.font(settings.fontFamily);
                newRendition.themes.fontSize(`${settings.fontSize}%`);

                setRendition(newRendition);
                await newRendition.display(bookData.currentCfi || undefined);
                if (!isMounted) return;
                setIsBookReady(true);

                // Navigazione a click
                // --- LOGICA CLICK SUI LATI PER CAMBIARE PAGINA ---
                // Navigazione tramite click/touch utilizzando screenX
                newRendition.on('click', (e) => {
                    // 1. Evitiamo il cambio pagina se l'utente sta selezionando del testo
                    const selection = e.view ? e.view.getSelection().toString() : '';
                    if (selection.length > 0) return;

                    // 2. Funziona solo in modalità "paginated" (a pagine)
                    if (settings.flow !== 'paginated') return;

                    // 3. Utilizziamo screenX per la coordinata orizzontale
                    const clickX = e.screenX;

                    console.log('event', e);
                    console.log('innerWidth', window.innerWidth);
                    console.log('clientX', e.clientX);
                    console.log('screenX', e.screenX);

                    // 4. Per la larghezza dello schermo usiamo window.screen.width
                    // per essere coerenti con screenX
                    const viewWidth = window.innerWidth;
                    const sideZone = viewWidth * 0.5; // 30% ai lati


                    if (clickX < sideZone) {
                        console.log('left');
                        newRendition.prev();
                    } else if (clickX > viewWidth - sideZone) {
                        console.log('right');
                        newRendition.next();
                    }
                });


                newRendition.on('relocated', (locationData) => {
                    if (!isMounted) return;
                    let updateData = { currentCfi: locationData.start.cfi };

                    if (bookInstance.locations && bookInstance.locations.total > 0) {
                        const currentPercent = bookInstance.locations.percentageFromCfi(locationData.start.cfi);
                        const displayPercent = Math.round(currentPercent * 100);

                        setBookProgress(displayPercent);
                        updateData.progress = displayPercent;

                        const toc = tocRef.current;
                        if (toc.length > 0) {
                            let currentChapIndex = toc.findIndex(c => c.percent > currentPercent) - 1;
                            if (currentChapIndex < 0) currentChapIndex = 0;

                            const currentChap = toc[currentChapIndex];
                            const nextChap = toc[currentChapIndex + 1] || { percent: 1.0 };

                            const chapStart = currentChap ? currentChap.percent : 0;
                            const chapEnd = nextChap.percent;

                            let chapProg = 0;
                            if (chapEnd > chapStart) chapProg = Math.round(((currentPercent - chapStart) / (chapEnd - chapStart)) * 100);

                            const now = Date.now();
                            const timeDiff = now - lastTurnRef.current.time;
                            const percentDiff = currentPercent - lastTurnRef.current.percent;

                            if (percentDiff > 0 && percentDiff < 0.05 && timeDiff > 1000 && timeDiff < 300000) {
                                speedsRef.current = [...speedsRef.current, percentDiff / timeDiff].slice(-5);
                            }
                            lastTurnRef.current = { time: now, percent: currentPercent };

                            let timeLeftStr = "...";
                            if (speedsRef.current.length > 0) {
                                const avgSpeed = speedsRef.current.reduce((a, b) => a + b, 0) / speedsRef.current.length;
                                const remainingPercent = chapEnd - currentPercent;
                                if (remainingPercent > 0 && avgSpeed > 0) {
                                    const minsLeft = Math.ceil((remainingPercent / avgSpeed) / 60000);
                                    timeLeftStr = minsLeft < 1 ? "< 1 min" : `${minsLeft} minuti`;
                                } else {
                                    timeLeftStr = "0 minuti";
                                }
                            } else {
                                timeLeftStr = "Lettura in corso...";
                            }

                            setChapterStats({ progress: chapProg, timeLeft: timeLeftStr, title: currentChap?.label || 'Capitolo' });
                        }
                    }
                    db.books.update(bookId, updateData);
                });

                await bookInstance.ready;

                const extractToc = async () => {
                    const navigation = await bookInstance.loaded.navigation;
                    let tocData = [];
                    const processItem = (item) => {
                        let pct = bookInstance.locations.percentageFromCfi(item.href);
                        if (pct !== null && pct !== undefined) tocData.push({ label: item.label.trim(), percent: pct });
                        if (item.subitems && item.subitems.length > 0) item.subitems.forEach(processItem);
                    };
                    navigation.toc.forEach(processItem);
                    tocData.sort((a, b) => a.percent - b.percent);
                    if (tocData.length === 0 || tocData[0].percent > 0) tocData.unshift({ label: 'Inizio', percent: 0 });

                    tocRef.current = tocData;
                    setChaptersMarks(tocData.map(c => ({ value: Math.round(c.percent * 100) })));
                };

                if (bookData.locations) {
                    bookInstance.locations.load(bookData.locations);
                    await extractToc();
                    newRendition.reportLocation();
                } else {
                    await bookInstance.locations.generate(1600);
                    if (!isMounted) return;
                    await extractToc();
                    db.books.update(bookId, { locations: bookInstance.locations.save(), totalPages: bookInstance.locations.length });
                    newRendition.reportLocation();
                }

                newRendition.on('keyup', (e) => {
                    if (e.key === 'ArrowLeft') newRendition.prev();
                    if (e.key === 'ArrowRight') newRendition.next();
                });

            } catch (error) {
                console.error("Errore:", error);
            }
        };

        loadBook();
        return () => { isMounted = false; if (bookRef.current) bookRef.current.destroy(); };
    }, [bookId]);

    const handleSliderChange = (event, newValue) => setBookProgress(newValue);
    const handleSliderCommitted = async (event, newValue) => {
        const book = bookRef.current;
        if (!rendition || !book || book.locations.total === 0) return;
        const cfi = book.locations.cfiFromPercentage(newValue / 100);
        if (cfi) await rendition.display(cfi);
    };

    const updateSetting = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: currentTheme.bg, color: currentTheme.text, overflow: 'hidden', transition: 'background-color 0.3s' }}>

            {/* TOP BAR FIGMA STYLE */}
            <AppBar position="static" elevation={0} sx={{ bgcolor: currentTheme.barBg, color: currentTheme.text, borderBottom: `1px solid ${settings.theme === 'dark' ? '#333' : '#eee'}` }}>
                <Toolbar sx={{ px: { xs: 1, sm: 2 } }}>
                    <IconButton edge="start" color="inherit" onClick={onClose} aria-label="back">
                        <ArrowBackIcon />
                    </IconButton>

                    {/* Testi Centrali */}
                    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', mx: 2, overflow: 'hidden' }}>
                        <Typography variant="body1" noWrap sx={{ fontWeight: 500, fontSize: '1rem', width: '100%', textAlign: 'center' }}>
                            {bookTitle}
                        </Typography>
                        <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontSize: '0.75rem', width: '100%', textAlign: 'center' }}>
                            {chapterStats.title}
                        </Typography>
                    </Box>

                    {/* Lato Destro (Orologio + Impostazioni) */}
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mr: 1, fontSize: '0.85rem' }}>
                            {time}
                        </Typography>
                        <IconButton color="inherit" onClick={() => setIsSettingsOpen(true)} size="small">
                            <SettingsIcon fontSize="small" />
                        </IconButton>
                    </Box>
                </Toolbar>
            </AppBar>

            <Box sx={{ flexGrow: 1, position: 'relative', width: '100%' }}>
                {!isBookReady && (
                    <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 20, bgcolor: currentTheme.bg }}>
                        <CircularProgress size={40} sx={{ color: PURPLE }} />
                    </Box>
                )}
                <Box
                    ref={viewerRef}
                    sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, px: { xs: 2, sm: 4 }, py: 2 }}
                />
            </Box>

            {/* BOTTOM BAR FIGMA STYLE */}
            <Box sx={{ p: 2, bgcolor: currentTheme.barBg, borderTop: `1px solid ${settings.theme === 'dark' ? '#333' : 'transparent'}` }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 600, mx: 'auto' }}>
                    {/*<Typography variant="caption" sx={{ color: 'text.secondary', mb: 1, fontSize: '0.75rem' }}>*/}
                    {/*    {chapterStats.timeLeft.includes('Lettura') ? chapterStats.timeLeft : `${chapterStats.timeLeft} per finire il capitolo`}*/}
                    {/*</Typography>*/}

                    <Slider
                        value={bookProgress}
                        marks={chaptersMarks}
                        onChange={handleSliderChange}
                        onChangeCommitted={handleSliderCommitted}
                        sx={{
                            padding: '0 !important',
                            color: PURPLE,
                            height: 6,
                            '& .MuiSlider-thumb': { display: 'auto' }, // Niente pallino, stile flat
                            '& .MuiSlider-track': { border: 'auto' },
                            '& .MuiSlider-rail': { bgcolor: settings.theme === 'dark' ? '#333' : '#e0e0e0', opacity: 1 },
                            '& .MuiSlider-mark': { height: 8, width: 2, backgroundColor: currentTheme.bg, mt: -0.25 },
                        }}
                    />
                </Box>
            </Box>

            {/* MENU IMPOSTAZIONI */}
            <Dialog open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Impostazioni</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 2 }}>
                    {/* Stessi controlli tema, carattere e dimensioni di prima... */}
                    <Box>
                        <Typography variant="caption" color="text.secondary">Tema</Typography>
                        <ToggleButtonGroup value={settings.theme} exclusive onChange={(e, val) => val && updateSetting('theme', val)} fullWidth size="small">
                            <ToggleButton value="light">Chiaro</ToggleButton>
                            <ToggleButton value="sepia">Seppia</ToggleButton>
                            <ToggleButton value="dark">Scuro</ToggleButton>
                        </ToggleButtonGroup>
                    </Box>
                    <Box>
                        <Typography variant="caption" color="text.secondary">Scorrimento</Typography>
                        <ToggleButtonGroup value={settings.flow} exclusive onChange={(e, val) => val && updateSetting('flow', val)} fullWidth size="small">
                            <ToggleButton value="paginated">A Pagine</ToggleButton>
                            <ToggleButton value="scrolled-doc">Continuo</ToggleButton>
                        </ToggleButtonGroup>
                    </Box>
                    <Divider />
                    <FormControl fullWidth size="small">
                        <InputLabel>Carattere</InputLabel>
                        <Select value={settings.fontFamily} label="Carattere" onChange={(e) => updateSetting('fontFamily', e.target.value)}>
                            <MenuItem value="sans-serif">Sans-serif</MenuItem>
                            <MenuItem value="serif">Serif</MenuItem>
                            <MenuItem value="monospace">Monospace</MenuItem>
                        </Select>
                    </FormControl>
                    <Box>
                        <Typography variant="caption" color="text.secondary">Dimensione Testo ({settings.fontSize}%)</Typography>
                        <Slider value={settings.fontSize} min={50} max={250} step={10} onChange={(e, val) => updateSetting('fontSize', val)} />
                    </Box>
                </DialogContent>
            </Dialog>

        </Box>
    );
}