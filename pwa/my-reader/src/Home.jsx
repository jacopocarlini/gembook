import React, { useState, useEffect } from 'react';
import ePub from 'epubjs';
import { db } from './db';
import {
    AppBar, Toolbar, Typography, Button, Card, CardActionArea,
    Box, Container, IconButton, LinearProgress, Menu, MenuItem
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';

const PURPLE = '#5e35b1';

export default function Home({ onOpenBook }) {
    const [books, setBooks] = useState([]);

    // Stati per il menu a tendina (3 puntini)
    const [anchorEl, setAnchorEl] = useState(null);
    const [selectedBookId, setSelectedBookId] = useState(null);

    useEffect(() => {
        db.books.toArray().then(setBooks);
    }, []);

    const calculateAndSaveLocations = async (id, bookData) => {
        try {
            const bgBook = ePub(bookData);
            await bgBook.ready;
            await bgBook.locations.generate(1600);
            const savedLocations = bgBook.locations.save();
            await db.books.update(id, { locations: savedLocations, totalPages: savedLocations.length });
        } catch (error) {
            console.error("Errore nel calcolo background:", error);
        }
    };

    const handleImport = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const isExactFileDuplicate = books.some(b => b.fileName === file.name && b.fileSize === file.size);
        if (isExactFileDuplicate) {
            alert(`Hai già importato il file "${file.name}".`);
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            const bookData = e.target.result;
            const tempBook = ePub(bookData);

            const metadata = await tempBook.loaded.metadata;
            const parsedTitle = metadata.title || 'Libro senza titolo';
            const parsedAuthor = metadata.creator || 'Autore Sconosciuto'; // Estrazione Autore

            const isTitleDuplicate = books.some(b => b.title === parsedTitle && parsedTitle !== 'Libro senza titolo');
            if (isTitleDuplicate) {
                alert(`Il libro "${parsedTitle}" è già presente!`);
                event.target.value = '';
                return;
            }

            const tempCoverUrl = await tempBook.coverUrl();
            let persistentCover = null;

            if (tempCoverUrl) {
                try {
                    const response = await fetch(tempCoverUrl);
                    const blob = await response.blob();
                    persistentCover = await new Promise((resolve) => {
                        const fileReader = new FileReader();
                        fileReader.onloadend = () => resolve(fileReader.result);
                        fileReader.readAsDataURL(blob);
                    });
                    URL.revokeObjectURL(tempCoverUrl);
                } catch (error) {
                    console.error("Errore cover:", error);
                }
            }

            const newBook = {
                title: parsedTitle,
                author: parsedAuthor,
                fileName: file.name,
                fileSize: file.size,
                file: bookData,
                cover: persistentCover,
                progress: 0,
                currentCfi: null,
                locations: null,
                totalPages: 0
            };

            const id = await db.books.add(newBook);
            setBooks((prevBooks) => [...prevBooks, { ...newBook, id }]);
            calculateAndSaveLocations(id, bookData);
        };

        reader.readAsArrayBuffer(file);
        event.target.value = '';
    };

    const handleMenuOpen = (event, id) => {
        event.stopPropagation(); // Evita di aprire il libro
        setAnchorEl(event.currentTarget);
        setSelectedBookId(id);
    };

    const handleMenuClose = (event) => {
        if (event) event.stopPropagation();
        setAnchorEl(null);
        setSelectedBookId(null);
    };

    const handleDelete = async (event) => {
        event.stopPropagation();
        if (window.confirm("Sei sicuro di voler rimuovere questo libro?")) {
            await db.books.delete(selectedBookId);
            setBooks(books.filter(book => book.id !== selectedBookId));
        }
        handleMenuClose();
    };

    return (
        <Box sx={{ flexGrow: 1, bgcolor: '#f4f4f9', minHeight: '100vh', pb: 4 }}>
            {/* APP BAR COME DA FIGMA */}
            <AppBar position="static" elevation={0} sx={{ bgcolor: PURPLE }}>
                <Toolbar sx={{ px: { xs: 2, sm: 4 } }}>
                    <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 'bold' }}>
                        GemBook
                    </Typography>
                    <Button
                        component="label"
                        variant="outlined"
                        startIcon={<AddIcon />}
                        sx={{
                            color: 'white',
                            borderColor: 'rgba(255,255,255,0.5)',
                            borderRadius: '20px',
                            textTransform: 'none',
                            px: 2,
                            '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' }
                        }}
                    >
                        Add Book
                        <input type="file" accept=".epub" hidden onChange={handleImport} />
                    </Button>
                </Toolbar>
            </AppBar>

            <Container maxWidth="md" sx={{ mt: 4 }}>
                {books.map(book => (
                    <Card key={book.id} elevation={0} sx={{
                        display: 'flex',
                        mb: 2.5,
                        borderRadius: 3,
                        boxShadow: '0px 4px 12px rgba(0,0,0,0.04)',
                        overflow: 'visible' // Permette all'ombra della cover di uscire
                    }}>
                        <CardActionArea
                            onClick={() => onOpenBook(book.id)}
                            sx={{ display: 'flex', alignItems: 'stretch', justifyContent: 'flex-start', p: 2 }}
                        >
                            {/* COPERTINA */}
                            <Box sx={{
                                width: 70,
                                height: 105,
                                flexShrink: 0,
                                borderRadius: 1,
                                overflow: 'hidden',
                                boxShadow: '0px 2px 8px rgba(0,0,0,0.15)',
                                bgcolor: '#e0e0e0',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                {book.cover ? (
                                    <img src={book.cover} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <Typography variant="caption" color="text.secondary">No Cover</Typography>
                                )}
                            </Box>

                            {/* DETTAGLI LIBRO E PROGRESSO */}
                            <Box sx={{ ml: 3, display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'space-between' }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <Box sx={{ pr: 2 }}>
                                        <Typography variant="subtitle1" fontWeight="bold" sx={{ lineHeight: 1.2, mb: 0.5 }}>
                                            {book.title}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'left' }}>
                                            {book.author}
                                        </Typography>
                                    </Box>

                                    {/* ICONA 3 PUNTINI (Previene il click della Card) */}
                                    <IconButton
                                        size="small"
                                        onClick={(e) => handleMenuOpen(e, book.id)}
                                        onMouseDown={(e) => e.stopPropagation()} // Importante per non aprire il libro
                                        sx={{ mt: -1, mr: -1 }}
                                    >
                                        <MoreVertIcon />
                                    </IconButton>
                                </Box>

                                {/* PROGRESS BAR */}
                                <Box sx={{ mt: 2 }}>
                                    <LinearProgress
                                        variant="determinate"
                                        value={book.progress || 0}
                                        sx={{
                                            height: 6,
                                            borderRadius: 3,
                                            bgcolor: 'rgba(94, 53, 177, 0.15)', // Sfondo lilla chiaro
                                            '& .MuiLinearProgress-bar': { bgcolor: PURPLE } // Barra viola
                                        }}
                                    />
                                </Box>
                            </Box>
                        </CardActionArea>
                    </Card>
                ))}

                {/* MENU A TENDINA PER ELIMINARE */}
                <Menu
                    anchorEl={anchorEl}
                    open={Boolean(anchorEl)}
                    onClose={handleMenuClose}
                    onClick={(e) => e.stopPropagation()}
                >
                    <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
                        Elimina libro
                    </MenuItem>
                </Menu>
            </Container>
        </Box>
    );
}