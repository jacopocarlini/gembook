import React, { useState, useEffect, useMemo } from 'react';
import {
    AppBar, Toolbar, Typography, Button, Box, Container,
    Menu, MenuItem, CircularProgress, Backdrop, Tabs, Tab, IconButton, InputBase
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import SearchIcon from '@mui/icons-material/Search';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { db } from '../services/db';
import { processEpubFile } from '../services/epubService';
import { BookCard } from './BookCard';
import { SettingsDrawer } from './Settings';

export default function Home({ onOpenBook, settings, setSettings, themeStyles }) {
    const [books, setBooks] = useState([]);
    const [isImporting, setIsImporting] = useState(false);
    const [tabValue, setTabValue] = useState(0);
    const [searchQuery, setSearchQuery] = useState("");
    const [settingsOpen, setSettingsOpen] = useState(false);

    // STATO PER IL MENU DI ELIMINAZIONE
    const [menuState, setMenuState] = useState({ anchor: null, bookId: null });

    useEffect(() => {
        db.books.toArray().then(setBooks);
    }, []);

    const filteredBooks = useMemo(() => {
        return books.filter(book => {
            const matchesSearch =
                book.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                book.author?.toLowerCase().includes(searchQuery.toLowerCase());
            let matchesTab = true;
            if (tabValue === 1) matchesTab = (book.progress || 0) < 98;
            if (tabValue === 2) matchesTab = (book.progress || 0) >= 98;
            return matchesSearch && matchesTab;
        });
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
            alert("Errore nell'importazione");
        } finally {
            setIsImporting(false);
            event.target.value = '';
        }
    };

    // FUNZIONE PER ELIMINARE IL LIBRO
    const handleDelete = async () => {
        if (window.confirm("Eliminare definitivamente questo libro?")) {
            await db.books.delete(menuState.bookId);
            setBooks(prev => prev.filter(b => b.id !== menuState.bookId));
        }
        setMenuState({ anchor: null, bookId: null }); // Chiude il menu
    };

    return (
        <Box sx={{
            height: '100svh',
            bgcolor: themeStyles.bg,
            color: themeStyles.text,
            transition: 'background-color 0.3s ease',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <SettingsDrawer
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                settings={settings}
                setSettings={setSettings}
                themeStyles={themeStyles}
            />

            <AppBar position="static" elevation={0} sx={{ bgcolor: 'transparent', py: 2 }}>
                <Toolbar sx={{ px: { xs: 2, sm: 6 }, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', minWidth: '150px' }}>
                        <img src="/gembook/icon.png" alt="Logo" style={{ width: 35, height: 35 }} />
                        <Typography variant="h6" sx={{ color: themeStyles.text, fontWeight: 800, ml: 1.5 }}>GemBook</Typography>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexGrow: 1, justifyContent: 'center' }}>
                        <Box sx={{
                            display: { xs: 'none', md: 'flex' },
                            bgcolor: themeStyles.card,
                            borderRadius: '12px', px: 2, py: 0.5,
                            width: '100%', maxWidth: 350,
                            border: `1px solid ${themeStyles.border}`,
                            alignItems: 'center'
                        }}>
                            <SearchIcon sx={{ color: 'grey.400', fontSize: 20, mr: 1 }} />
                            <InputBase
                                placeholder="Search books..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                sx={{ flex: 1, fontSize: '0.9rem', color: themeStyles.text }}
                            />
                        </Box>
                        <Button
                            component="label"
                            variant="contained"
                            disableElevation
                            sx={{ bgcolor: themeStyles.primary, borderRadius: '12px', textTransform: 'none', px: 3, fontWeight: 'bold' }}
                        >
                            + Add Book
                            <input type="file" accept=".epub" hidden onChange={handleImport} />
                        </Button>
                    </Box>

                    <Box sx={{ minWidth: '150px', display: 'flex', justifyContent: 'flex-end' }}>
                        <IconButton onClick={() => setSettingsOpen(true)} sx={{ color: themeStyles.text, bgcolor: themeStyles.card }}>
                            <SettingsIcon fontSize="small" />
                        </IconButton>
                    </Box>
                </Toolbar>
            </AppBar>

            <Box sx={{ flexGrow: 1, overflowY: 'auto', mt: 2 }}>
                <Container maxWidth="md">
                    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 6 }}>
                        <Tabs
                            value={tabValue}
                            onChange={(e, v) => setTabValue(v)}
                            sx={{
                                bgcolor: themeStyles.paper,
                                borderRadius: '16px', p: 0.8, minHeight: 'auto',
                                '& .MuiTabs-indicator': { display: 'none' }
                            }}
                        >
                            {['All Books', 'To Read', 'Finished'].map((label) => (
                                <Tab
                                    key={label}
                                    label={label}
                                    sx={{
                                        borderRadius: '12px', textTransform: 'none', fontWeight: 'bold', minWidth: 120,
                                        color: 'grey.500',
                                        '&.Mui-selected': { bgcolor: themeStyles.card, color: themeStyles.text }
                                    }}
                                />
                            ))}
                        </Tabs>
                    </Box>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {filteredBooks.map(book => (
                            <BookCard
                                key={book.id}
                                book={book}
                                themeStyles={themeStyles}
                                onOpen={onOpenBook}
                                // PASSA LA FUNZIONE CHE APRE IL MENU
                                onMenuOpen={(e, id) => setMenuState({ anchor: e.currentTarget, bookId: id })}
                            />
                        ))}
                    </Box>
                </Container>
            </Box>

            {/* IL COMPONENTE MENU CHE ERA SPARITO */}
            <Menu
                anchorEl={menuState.anchor}
                open={Boolean(menuState.anchor)}
                onClose={() => setMenuState({ anchor: null, bookId: null })}
                PaperProps={{
                    sx: {
                        bgcolor: themeStyles.card,
                        color: themeStyles.text,
                        borderRadius: '12px',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                        border: `1px solid ${themeStyles.border}`
                    }
                }}
            >
                <MenuItem
                    onClick={handleDelete}
                    sx={{
                        color: 'error.main',
                        fontWeight: 'bold',
                        fontSize: '0.9rem',
                        px: 3
                    }}
                >
                    Elimina libro
                </MenuItem>
            </Menu>

            <Backdrop sx={{ color: '#fff', zIndex: 2000, flexDirection: 'column', gap: 2 }} open={isImporting}>
                <CircularProgress color="inherit" />
                <Typography>Analisi in corso...</Typography>
            </Backdrop>
        </Box>
    );
}