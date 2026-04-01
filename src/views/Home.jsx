import React, { useState, useEffect } from 'react';
import { AppBar, Toolbar, Typography, Button, Box, Container, Menu, MenuItem, CircularProgress, Backdrop } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { db } from '../services/db';
import { processEpubFile } from '../services/epubService';
import { BookCard } from './BookCard';

const PURPLE = '#5e35b1';

export default function Home({ onOpenBook }) {
    const [books, setBooks] = useState([]);
    const [isImporting, setIsImporting] = useState(false);
    const [menuState, setMenuState] = useState({ anchor: null, bookId: null });

    useEffect(() => {
        db.books.toArray().then(setBooks);
    }, []);

    const handleImport = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (books.some(b => b.fileName === file.name && b.fileSize === file.size)) {
            alert("Libro già presente.");
            return;
        }

        setIsImporting(true);
        try {
            const processedBook = await processEpubFile(file);
            const id = await db.books.add(processedBook);
            setBooks(prev => [...prev, { ...processedBook, id }]);
        } catch (error) {
            console.error(error);
            alert("Errore nell'importazione");
        } finally {
            setIsImporting(false);
            event.target.value = '';
        }
    };

    const handleDelete = async () => {
        if (window.confirm("Rimuovere questo libro?")) {
            await db.books.delete(menuState.bookId);
            setBooks(books.filter(b => b.id !== menuState.bookId));
        }
        setMenuState({ anchor: null, bookId: null });
    };

    return (
        <Box sx={{ flexGrow: 1, bgcolor: '#f4f4f9', minHeight: '100vh', pb: 4 }}>
            <Backdrop sx={{ color: '#fff', zIndex: 2000, flexDirection: 'column', gap: 2 }} open={isImporting}>
                <CircularProgress color="inherit" />
                <Typography>Analisi del libro in corso...</Typography>
            </Backdrop>

            <AppBar position="static" elevation={0} sx={{ bgcolor: PURPLE }}>
                <Toolbar sx={{ px: { xs: 2, sm: 4 } }}>
                    <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 'bold' }}>GemBook</Typography>
                    <Button
                        component="label"
                        variant="outlined"
                        startIcon={<AddIcon />}
                        sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', borderRadius: '20px' }}
                    >
                        Add Book
                        <input type="file" accept=".epub" hidden onChange={handleImport} />
                    </Button>
                </Toolbar>
            </AppBar>

            <Container maxWidth="md" sx={{ mt: 4 }}>
                {books.map(book => (
                    <BookCard
                        key={book.id}
                        book={book}
                        purpleColor={PURPLE}
                        onOpen={onOpenBook}
                        onMenuOpen={(e, id) => setMenuState({ anchor: e.currentTarget, bookId: id })}
                    />
                ))}

                <Menu
                    anchorEl={menuState.anchor}
                    open={Boolean(menuState.anchor)}
                    onClose={() => setMenuState({ anchor: null, bookId: null })}
                >
                    <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>Elimina libro</MenuItem>
                </Menu>
            </Container>
        </Box>
    );
}