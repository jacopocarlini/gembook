import React, {useEffect, useRef, useState} from 'react';
import ePub from 'epubjs';
import {db} from '../services/db';
import {
    AppBar,
    Box,
    Dialog,
    DialogContent,
    DialogTitle,
    Drawer,
    FormControl,
    IconButton,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    MenuItem,
    Select,
    Slider,
    ToggleButton,
    ToggleButtonGroup,
    Toolbar,
    Typography
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SettingsIcon from '@mui/icons-material/Settings';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';

const PURPLE = '#5e35b1';

const AVAILABLE_FONTS = [
    {label: 'Sans Serif', value: 'sans-serif'},
    {label: 'Serif', value: 'serif'},
    {label: 'Roboto', value: 'Roboto'},
    {label: 'Bookerly', value: 'Bookerly'},
    {label: 'Merriweather', value: 'Merriweather'},
    {label: 'Monospace', value: 'monospace'}
];

export default function Reader({bookId, onClose}) {
    const viewerRef = useRef(null);
    const bookRef = useRef(null);
    const renditionRef = useRef(null);

    const [rendition, setRendition] = useState(null);
    const [bookTitle, setBookTitle] = useState('Caricamento...');
    const [time, setTime] = useState(new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}));

    const [isBookReady, setIsBookReady] = useState(false);
    const [bookProgress, setBookProgress] = useState(0);
    const [chapterStats, setChapterStats] = useState({title: '', timeLeft: '-- min'});
    const [chaptersMarks, setChaptersMarks] = useState([]);

    const [toc, setToc] = useState([]);
    const [isTocOpen, setIsTocOpen] = useState(false);
    const [currentChapterIndex, setCurrentChapterIndex] = useState(-1);

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [settings, setSettings] = useState({
        fontSize: 100, fontFamily: 'serif', theme: 'light', flow: 'paginated'
    });

    // --- LOGICA VELOCITÀ DI LETTURA ---
    const readingStats = useRef({
        lastCfi: null,
        lastTime: Date.now(),
        speedArray: [] // velocità in caratteri/secondo
    });

    const themeColors = {
        light: {bg: '#ffffff', text: '#000000', barBg: '#ffffff', active: 'rgba(94, 53, 177, 0.08)'},
        dark: {bg: '#121212', text: '#e0e0e0', barBg: '#121212', active: 'rgba(255, 255, 255, 0.08)'},
        sepia: {bg: '#f4ecd8', text: '#5b4636', barBg: '#f4ecd8', active: 'rgba(91, 70, 54, 0.1)'}
    };
    const currentTheme = themeColors[settings.theme];

    useEffect(() => {
        const timer = setInterval(() => {
            setTime(new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}));
        }, 10000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (isSettingsOpen || isTocOpen || !renditionRef.current) return;
            if (e.key === 'ArrowRight') renditionRef.current.next();
            if (e.key === 'ArrowLeft') renditionRef.current.prev();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isSettingsOpen, isTocOpen]);

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
                console.log(bookRef);

                const newRendition = bookInstance.renderTo(viewerRef.current, {
                    width: '100%', height: '100%', spread: 'none', manager: 'continuous',
                    flow: settings.flow, allowScript: true
                });

                newRendition.themes.register('light', {body: {background: '#ffffff', color: '#000000'}});
                newRendition.themes.register('dark', {body: {background: '#121212', color: '#e0e0e0'}});
                newRendition.themes.register('sepia', {body: {background: '#f4ecd8', color: '#5b4636'}});

                renditionRef.current = newRendition;
                setRendition(newRendition);

                if (bookData.locations) bookInstance.locations.load(bookData.locations);
                if (bookData.toc) {
                    setToc(bookData.toc);
                    setChaptersMarks(bookData.toc.filter(c => c.percent > 0).map(c => ({value: Number((c.percent * 100).toFixed(1))})));
                }

                await newRendition.display(bookData.currentCfi || undefined);
                if (!isMounted) return;
                setIsBookReady(true);

                newRendition.on('relocated', (locationData) => {
                    if (!isMounted) return;
                    const currentCfi = locationData.start.cfi;
                    const currentHref = locationData.start.href;

                    // --- CALCOLO TEMPO RIMANENTE ---
                    let timeLeftStr = '-- min';
                    if (bookInstance.locations && bookData.toc) {
                        const totalLocs = bookInstance.locations.total;
                        const currentLoc = bookInstance.locations.locationFromCfi(currentCfi);

                        // Trova la fine del capitolo corrente
                        let activeIndex = bookData.toc.findIndex(item => item.baseHref && currentHref.includes(item.baseHref));
                        const nextChapter = bookData.toc[activeIndex + 1];
                        const chapterEndPercent = nextChapter ? nextChapter.percent : 1;
                        const chapterEndLoc = Math.floor(chapterEndPercent * totalLocs);

                        const locsToReadInChapter = chapterEndLoc - currentLoc;

                        // Calcolo velocità (basato su tempo trascorso tra due "turn page")
                        const now = Date.now();
                        const timeDiff = (now - readingStats.current.lastTime) / 1000; // secondi
                        if (readingStats.current.lastCfi && timeDiff > 2 && timeDiff < 300) {
                            const lastLoc = bookInstance.locations.locationFromCfi(readingStats.current.lastCfi);
                            const locsRead = currentLoc - lastLoc;
                            if (locsRead > 0) {
                                const speed = locsRead / timeDiff; // locs al secondo
                                readingStats.current.speedArray.push(speed);
                                if (readingStats.current.speedArray.length > 5) readingStats.current.speedArray.shift();
                            }
                        }

                        const avgSpeed = readingStats.current.speedArray.length > 0
                            ? readingStats.current.speedArray.reduce((a, b) => a + b) / readingStats.current.speedArray.length
                            : 0.5; // fallback: 0.5 loc/sec

                        const secondsLeft = locsToReadInChapter / avgSpeed;
                        const minutesLeft = Math.ceil(secondsLeft / 60);
                        timeLeftStr = minutesLeft > 0 ? `${minutesLeft} min` : 'Fine cap.';

                        readingStats.current.lastTime = now;
                        readingStats.current.lastCfi = currentCfi;

                        setCurrentChapterIndex(Math.max(0, activeIndex));
                        setChapterStats({
                            title: bookData.toc[activeIndex]?.label || 'Capitolo',
                            timeLeft: timeLeftStr
                        });
                    }

                    if (bookInstance.locations) {
                        const pct = bookInstance.locations.percentageFromCfi(currentCfi);
                        const displayPct = Number((pct * 100).toFixed(1));
                        setBookProgress(displayPct);
                        db.books.update(bookId, {currentCfi, progress: displayPct});
                    }
                });

            } catch (error) {
                console.error(error);
            }
        };
        loadBook();
        return () => {
            isMounted = false;
            if (bookRef.current) bookRef.current.destroy();
        };
    }, [bookId]);

    const goToChapter = (chapter) => {
        setIsTocOpen(false);
        if (renditionRef.current) {
            // Se abbiamo le locations caricate, usiamo la percentuale per precisione
            if (bookRef.current?.locations?.total > 0) {
                const cfi = bookRef.current.locations.cfiFromPercentage(chapter.percent);
                renditionRef.current.display(cfi);
                setBookProgress(cfi);
            } else {
                // Altrimenti usiamo l'href (percorso del file)
                renditionRef.current.display(chapter.href);
            }
        }
    };

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            bgcolor: currentTheme.bg,
            color: currentTheme.text,
            overflow: 'hidden'
        }}>

            <AppBar position="static" elevation={0} sx={{
                bgcolor: currentTheme.barBg,
                color: currentTheme.text,
                borderBottom: '1px solid rgba(0,0,0,0.1)'
            }}>
                <Toolbar>
                    <IconButton edge="start" color="inherit" onClick={onClose}><ArrowBackIcon/></IconButton>
                    <IconButton color="inherit"
                                onClick={() => setIsTocOpen(true)}><FormatListBulletedIcon/></IconButton>
                    <Box sx={{flexGrow: 1, textAlign: 'center'}}>
                        <Typography variant="body1" noWrap sx={{fontWeight: 600}}>{bookTitle}</Typography>
                        <Typography variant="caption" noWrap
                                    sx={{display: 'block', opacity: 0.7}}>{chapterStats.title}</Typography>
                    </Box>
                    <Typography
                        variant="body2"
                        sx={{
                            mr: 1,
                            display: {xs: 'none', sm: 'block'}, // Opzionale: nasconde su schermi molto piccoli per non affollare
                            fontWeight: 500,
                            opacity: 0.8
                        }}
                    >
                        {time}
                    </Typography>
                    <IconButton color="inherit" onClick={() => setIsSettingsOpen(true)}><SettingsIcon/></IconButton>
                </Toolbar>
            </AppBar>

            <Box sx={{flexGrow: 1, position: 'relative'}}>
                <Box ref={viewerRef} sx={{height: '100%', px: {xs: 1, sm: 4}}}/>
            </Box>

            {/* --- FOOTER CON PROGRESS BAR E STATISTICHE --- */}
            <Box sx={{p: 2, bgcolor: currentTheme.barBg, borderTop: '1px solid rgba(0,0,0,0.05)'}}>
                <Box sx={{display: 'flex', alignItems: 'center', gap: 2, maxWidth: 800, mx: 'auto'}}>

                    {/* Tempo rimanente (Sinistra) */}
                    <Typography variant="caption" sx={{minWidth: 50, fontWeight: 500, color: 'text.secondary'}}>
                        {chapterStats.timeLeft}
                    </Typography>

                    <Slider
                        value={bookProgress}
                        marks={chaptersMarks}
                        step={0.1}
                        onChange={(e, v) => setBookProgress(v)}
                        onChangeCommitted={(e, v) => {
                            // Verifica che il libro e le locations siano pronti
                            if (renditionRef.current && bookRef.current?.locations?.total > 0) {
                                try {
                                    const cfi = bookRef.current.locations.cfiFromPercentage(v / 100);
                                    if (cfi) {
                                        renditionRef.current.display(cfi);
                                    }
                                } catch (err) {
                                    console.error("Errore nel salto alla posizione:", err);
                                }
                            }
                        }}
                        sx={{
                            flexGrow: 1,
                            color: PURPLE,
                            '& .MuiSlider-mark': {height: 6, width: 2, bgcolor: currentTheme.barBg},
                            '& .MuiSlider-thumb': {width: 14, height: 14}
                        }}
                    />

                    {/* Percentuale (Destra) */}
                    <Typography variant="caption" sx={{ minWidth: 50, fontWeight: 'bold', color: PURPLE }}>
                        {typeof bookProgress === 'number' ? bookProgress.toFixed(1) : '0.0'}%
                    </Typography>
                </Box>
            </Box>

            {/* Drawer e Dialog rimangono identici... */}
            <Drawer anchor="left" open={isTocOpen} onClose={() => setIsTocOpen(false)}>
                <Box sx={{width: 280, bgcolor: currentTheme.bg, color: currentTheme.text, height: '100%'}}>
                    <Typography variant="h6" sx={{p: 2, borderBottom: '1px solid #eee'}}>Indice</Typography>
                    <List>
                        {toc.map((chap, i) => (
                            <ListItem key={i} disablePadding divider>
                                <ListItemButton onClick={() => goToChapter(chap)} selected={currentChapterIndex === i}>
                                    <ListItemText primary={chap.label} primaryTypographyProps={{
                                        fontSize: '0.9rem',
                                        color: currentChapterIndex === i ? PURPLE : 'inherit'
                                    }}/>
                                </ListItemButton>
                            </ListItem>
                        ))}
                    </List>
                </Box>
            </Drawer>

            {/* Modal Impostazioni */}
            <Dialog open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} fullWidth maxWidth="xs">
                <DialogTitle>Personalizzazione</DialogTitle>
                <DialogContent sx={{display: 'flex', flexDirection: 'column', gap: 3, mt: 1}}>
                    <Box>
                        <Typography variant="caption">Carattere</Typography>
                        <FormControl fullWidth size="small">
                            <Select value={settings.fontFamily}
                                    onChange={(e) => updateSetting('fontFamily', e.target.value)}>
                                {AVAILABLE_FONTS.map(f => (
                                    <MenuItem key={f.value} value={f.value}
                                              sx={{fontFamily: f.value}}>{f.label}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>

                    <Box>
                        <Typography variant="caption">Dimensione Testo ({settings.fontSize}%)</Typography>
                        <Slider value={settings.fontSize} min={60} max={200} step={10}
                                onChange={(e, v) => updateSetting('fontSize', v)}/>
                    </Box>

                    <Box>
                        <Typography variant="caption">Tema</Typography>
                        <ToggleButtonGroup value={settings.theme} exclusive fullWidth
                                           onChange={(e, v) => v && updateSetting('theme', v)}>
                            <ToggleButton value="light">Chiaro</ToggleButton>
                            <ToggleButton value="sepia">Seppia</ToggleButton>
                            <ToggleButton value="dark">Scuro</ToggleButton>
                        </ToggleButtonGroup>
                    </Box>

                    <Box>
                        <Typography variant="caption">Modalità di lettura</Typography>
                        <ToggleButtonGroup value={settings.flow} exclusive fullWidth
                                           onChange={(e, v) => v && updateSetting('flow', v)}>
                            <ToggleButton value="paginated">Pagine</ToggleButton>
                            <ToggleButton value="scrolled-doc">Continuo</ToggleButton>
                        </ToggleButtonGroup>
                    </Box>
                </DialogContent>
            </Dialog>
        </Box>
    );
}