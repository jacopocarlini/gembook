import React, {useEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {db} from '../services/db';
import {epubService} from '../services/EpubService';
import {
    AppBar,
    Box,
    Button,
    Drawer,
    IconButton,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    Paper,
    Slider,
    Toolbar,
    Typography
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SettingsIcon from '@mui/icons-material/Settings';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import CloseIcon from '@mui/icons-material/Close';
import {SettingsDrawer} from './Settings';
import { GlobalStyles } from '@mui/material';

export default function Reader({bookId, onClose, settings, setSettings, themeStyles}) {
    const {t} = useTranslation();
    const viewerRef = useRef(null);

    // Stati UI e Info Libro
    const [bookTitle, setBookTitle] = useState(t('loading'));
    const [time, setTime] = useState(new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', hour12: false}));

    // Stati Navigazione e Progresso
    const [bookProgress, setBookProgress] = useState(0);
    const [chapterStats, setChapterStats] = useState({
        title: '',
        timeStats: {chapterMinutes: 0, totalMinutes: 0, isFinished: false}
    });
    const [toc, setToc] = useState([]);
    const [chaptersMarks, setChaptersMarks] = useState([]);
    const [currentChapterIndex, setCurrentChapterIndex] = useState(-1);

    // Menu
    const [isTocOpen, setIsTocOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);

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

            await epubService.init({
                bookData,
                elementId: viewerRef.current,
                // Passiamo i settings correnti solo all'avvio
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
                    db.books.update(bookId, {currentCfi: data.cfi, progress: data.percentage});
                }
            });
        };

        loadBook();
        return () => {
            isMounted = false;
            epubService.destroy();
        };
        // RIMOSSO settings da qui: il libro non deve morire se cambio font
    }, [bookId, t, settings]);

    useEffect(() => {

        const handleKeyDown = (event) => {
            if (event.key === 'ArrowLeft') epubService.prev();
            if (event.key === 'ArrowRight') epubService.next();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Helper per formattare il tempo (es. 75 -> 1h 15m)
    const formatMinutes = (mins) => {
        if (mins <= 0) return `< 1${t('minutes_short', {count: ''})}`;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        if (h > 0) {
            return m > 0
                ? `${t('hours_short', {count: h})} ${t('minutes_short', {count: m})}`
                : t('hours_short', {count: h});
        }
        return t('minutes_short', {count: m});
    };

    const renderTimeLeft = () => {
        const {timeStats} = chapterStats;
        if (!timeStats || timeStats.isFinished) return t('finished');

        const chap = `${formatMinutes(timeStats.chapterMinutes)} ${t('cap_label')}`;
        const tot = `${formatMinutes(timeStats.totalMinutes)} ${t('tot_label')}`;
        return `${chap} ${t('time_separator')} ${tot}`;
    };

    return (
        <Box sx={{
            display: 'flex', flexDirection: 'column',
            height: '100vh',
            bgcolor: themeStyles.bg, color: themeStyles.text, overflow: 'hidden'
        }}>

            <GlobalStyles styles={{
                '*': {
                    scrollbarWidth: 'thin',
                    scrollbarColor: `${themeStyles.text} ${themeStyles.bg}`,
                },
                '*::-webkit-scrollbar': {
                    width: '10px',
                    height: '10px',
                },
                '*::-webkit-scrollbar-track': {
                    background: themeStyles.bg,
                },
                '*::-webkit-scrollbar-thumb': {
                    backgroundColor: themeStyles.text,
                    borderRadius: '10px',
                    border: `3px solid ${themeStyles.bg}`,
                    opacity: 0.5,
                }
            }} />

            {/* HEADER */}
            <AppBar position="static" elevation={0} sx={{
                bgcolor: themeStyles.card, color: themeStyles.text,
                borderBottom: `1px solid ${themeStyles.border}`, backgroundImage: 'none'
            }}>
                <Toolbar sx={{gap: 0.5}}>
                    <IconButton edge="start" color="inherit" onClick={onClose}><ArrowBackIcon/></IconButton>
                    <IconButton color="inherit"
                                onClick={() => setIsTocOpen(true)}><FormatListBulletedIcon/></IconButton>

                    <Box sx={{flexGrow: 1, textAlign: 'center', px: 1, minWidth: 0}}>
                        <Typography variant="body1" noWrap sx={{fontWeight: 700, fontSize: '0.95rem'}}>
                            {bookTitle}
                        </Typography>
                        <Typography variant="caption" noWrap sx={{display: 'block', opacity: 0.7}}>
                            {chapterStats.title}
                        </Typography>
                    </Box>

                    <Typography variant="body2" sx={{fontWeight: 600, display: {xs: 'none', sm: 'block'}, mx: 1}}>
                        {time}
                    </Typography>
                    <IconButton color="inherit" onClick={() => setSettingsOpen(true)}><SettingsIcon/></IconButton>
                </Toolbar>
            </AppBar>

            {/* AREA LETTURA */}
            <Box sx={{flexGrow: 1, position: 'relative', overflow: 'hidden', px: {xs: 1, sm: 2}}}>
                <Box
                    ref={viewerRef}
                    sx={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: {xs: 8, sm: 1},
                        right: {xs: 8, sm: 1},

                        '& .epub-view': {
                            width: settings.readingMode === 2 ? '99% !important' : '100%',
                        }
                    }}

                />
            </Box>

            {/* FOOTER */}
            <Box sx={{ p: 2, bgcolor: themeStyles.card, borderTop: `1px solid ${themeStyles.border}` }}>
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', maxWidth: 1200, mx: 'auto', gap: 2 }}>

                    <IconButton onClick={() => epubService.prev()} sx={{
                        color: themeStyles.text,
                        border: `1px solid ${themeStyles.border}`,
                        borderRadius: '12px'
                    }}>
                        <NavigateBeforeIcon/>
                    </IconButton>

                    <Box sx={{flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5}}>
                        <Slider
                            value={bookProgress}
                            marks={chaptersMarks}
                            step={0.1}
                            onChange={(e, v) => setBookProgress(v)}
                            onChangeCommitted={(e, v) => {
                                epubService.goToPercentage(v);
                                if (document.activeElement) {
                                    document.activeElement.blur();
                                }
                            }} sx={{
                            color: themeStyles.primary, height: 6,
                            '& .MuiSlider-mark': {height: 6, width: 2, bgcolor: themeStyles.bg},
                            '& .MuiSlider-thumb': {width: 14, height: 14}
                        }}
                        />
                        <Box sx={{display: 'flex', justifyContent: 'space-between'}}>
                            <Typography variant="caption" sx={{fontWeight: 500, opacity: 0.8}}>
                                {renderTimeLeft()}
                            </Typography>
                            <Typography variant="caption" sx={{fontWeight: 800}}>
                                {bookProgress.toFixed(1)}%
                            </Typography>
                        </Box>
                    </Box>

                    <IconButton onClick={() => epubService.next()} sx={{ color: themeStyles.text, border: `1px solid ${themeStyles.border}`, borderRadius: '12px' }}>
                        <NavigateNextIcon />
                    </IconButton>
                </Box>
            </Box>

            {/*/!* POPUP CONTESTUALE *!/*/}
            {/*{selectionInfo && (*/}
            {/*    <Paper*/}
            {/*        elevation={10}*/}
            {/*        sx={{*/}
            {/*            position: 'fixed',*/}
            {/*            // Posizionamento al centro esatto*/}
            {/*            top: '50%',*/}
            {/*            left: '50%',*/}
            {/*            transform: 'translate(-50%, -50%)',*/}

            {/*            zIndex: 9999,*/}
            {/*            p: 2,*/}
            {/*            width: { xs: '80vw', sm: 400 }, // Responsive: più largo su desktop*/}
            {/*            maxWidth: 450,*/}
            {/*            bgcolor: themeStyles.card,*/}
            {/*            color: themeStyles.text,*/}
            {/*            borderRadius: '16px',*/}
            {/*            boxShadow: '0px 8px 32px rgba(0,0,0,0.4)',*/}
            {/*            pointerEvents: 'auto',*/}
            {/*            display: 'flex',*/}
            {/*            flexDirection: 'column',*/}
            {/*            gap: 2*/}
            {/*        }}*/}
            {/*    >*/}
            {/*        /!* Intestazione Popup *!/*/}
            {/*        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>*/}
            {/*            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: themeStyles.primary, textTransform: 'uppercase', letterSpacing: 1 }}>*/}
            {/*                {t('selection_title')}*/}
            {/*            </Typography>*/}
            {/*            <IconButton size="small" onClick={() => setSelectionInfo(null)} sx={{ color: themeStyles.text }}>*/}
            {/*                <CloseIcon />*/}
            {/*            </IconButton>*/}
            {/*        </Box>*/}

            {/*        /!* Testo Estratto *!/*/}
            {/*        <Box sx={{*/}
            {/*            maxHeight: '150px',*/}
            {/*            overflowY: 'auto',*/}
            {/*            bgcolor: 'rgba(0,0,0,0.05)',*/}
            {/*            p: 1.5,*/}
            {/*            borderRadius: '8px',*/}
            {/*            borderLeft: `4px solid ${themeStyles.primary}`*/}
            {/*        }}>*/}
            {/*            <Typography*/}
            {/*                variant="body2"*/}
            {/*                sx={{*/}
            {/*                    fontStyle: 'italic',*/}
            {/*                    lineHeight: 1.5,*/}
            {/*                    color: themeStyles.text*/}
            {/*                }}*/}
            {/*            >*/}
            {/*                "{selectionInfo.text}"*/}
            {/*            </Typography>*/}
            {/*        </Box>*/}

            {/*        /!* Azioni *!/*/}
            {/*        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>*/}
            {/*            <Button*/}
            {/*                variant="outlined"*/}
            {/*                size="medium"*/}
            {/*                sx={{ borderRadius: '8px', color: themeStyles.text, borderColor: themeStyles.border }}*/}
            {/*                onClick={() => {*/}
            {/*                    navigator.clipboard.writeText(selectionInfo.text);*/}
            {/*                    setSelectionInfo(null);*/}
            {/*                }}*/}
            {/*            >*/}
            {/*                {t('copy')}*/}
            {/*            </Button>*/}
            {/*        </Box>*/}
            {/*    </Paper>*/}
            {/*)}*/}

            {/* DRAWER INDICE */}
            <Drawer
                anchor="left" open={isTocOpen} onClose={() => setIsTocOpen(false)}
                PaperProps={{
                    sx: {
                        width: {xs: '85vw', sm: 360},
                        maxWidth: 360,
                        bgcolor: themeStyles.card,
                        color: themeStyles.text,
                        borderRadius: '0 16px 16px 0'
                    }
                }}
            >
                <Box sx={{
                    p: {xs: 2, sm: 3},
                    borderBottom: `1px solid ${themeStyles.border}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <Typography variant="h6" sx={{fontWeight: 800}}>{t('index_title')}</Typography>
                    <IconButton onClick={() => setIsTocOpen(false)} size="small"><CloseIcon/></IconButton>
                </Box>
                <Box sx={{flexGrow: 1, overflowY: 'auto'}}>
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
                </Box>
            </Drawer>

            <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings}
                            setSettings={setSettings} themeStyles={themeStyles}/>
        </Box>
    );
}