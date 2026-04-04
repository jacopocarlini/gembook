import React from 'react';
import { Box, Typography, LinearProgress, IconButton, CardActionArea } from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';

export const BookCard = ({ book, onOpen, onMenuOpen, themeStyles }) => (
    <Box sx={{
        display: 'flex',
        alignItems: 'center',
        mb: 4,
        width: '100%'
    }}>
        <CardActionArea
            onClick={() => onOpen(book.id)}
            sx={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'flex-start', // Forza l'inizio a sinistra
                p: 1,
                borderRadius: '16px',
            }}
        >
            {/* Copertina */}
            <Box sx={{
                width: 90,
                height: 130,
                flexShrink: 0,
                borderRadius: '8px',
                overflow: 'hidden',
                boxShadow: '0px 10px 20px rgba(0,0,0,0.12)',
                bgcolor: '#eee'
            }}>
                {book.cover ? (
                    <img src={book.cover} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                    <Typography variant="caption">No Cover</Typography>
                )}
            </Box>

            {/* Testi Allineati a Sinistra */}
            <Box sx={{
                ml: 4,
                flexGrow: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start' // Allinea i figli (titolo, autore, progress) a sinistra
            }}>
                <Typography
                    variant="h6"
                    sx={{
                        fontWeight: 800,
                        fontSize: '1.1rem',
                        textAlign: 'left', // Forza allineamento testo
                        width: '100%'
                    }}
                >
                    {book.title}
                </Typography>

                <Typography
                    variant="body2"
                    sx={{
                        fontWeight: 500,
                        textAlign: 'left', // Forza allineamento testo
                        mb: 3,
                        width: '100%'
                    }}
                >
                    {book.author}
                </Typography>

                {/* Barra di progresso */}
                <Box sx={{ width: '100%', maxWidth: 500 }}>
                    <LinearProgress
                        variant="determinate"
                        value={book.progress || 0}
                        sx={{
                            height: 4,
                            borderRadius: 2,
                            bgcolor: '#e0e0e0',
                            '& .MuiLinearProgress-bar': { bgcolor: themeStyles.primary }
                        }}
                    />
                </Box>
            </Box>
        </CardActionArea>

        <IconButton
            size="small"
            onClick={(e) => {
                e.stopPropagation(); // Impedisce l'apertura del libro al clic sul menu
                onMenuOpen(e, book.id); // Invia l'elemento (anchor) e l'ID del libro
            }}
            sx={{ ml: 1, color: themeStyles.text, opacity: 0.6 }}
        >
            <MoreVertIcon fontSize="small" />
        </IconButton>
    </Box>
);