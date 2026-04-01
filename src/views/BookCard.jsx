import React from 'react';
import { Card, CardActionArea, Box, Typography, LinearProgress, IconButton } from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';

export const BookCard = ({ book, onOpen, onMenuOpen, purpleColor }) => (
    <Card elevation={0} sx={{ display: 'flex', mb: 2.5, borderRadius: 3, boxShadow: '0px 4px 12px rgba(0,0,0,0.04)', position: 'relative' }}>
        <CardActionArea onClick={() => onOpen(book.id)} sx={{ display: 'flex', alignItems: 'stretch', justifyContent: 'flex-start', p: 2, pr: 6 }}>
            <Box sx={{ width: 70, height: 105, flexShrink: 0, borderRadius: 1, overflow: 'hidden', boxShadow: '0px 2px 8px rgba(0,0,0,0.15)', bgcolor: '#e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {book.cover ? <img src={book.cover} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Typography variant="caption">No Cover</Typography>}
            </Box>
            <Box sx={{ ml: 3, display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'space-between' }}>
                <Box>
                    <Typography variant="subtitle1" fontWeight="bold">{book.title}</Typography>
                    <Typography variant="body2" color="text.secondary">{book.author}</Typography>
                </Box>
                <Box sx={{ mt: 2 }}>
                    <LinearProgress variant="determinate" value={book.progress || 0} sx={{ height: 6, borderRadius: 3, bgcolor: 'rgba(94, 53, 177, 0.15)', '& .MuiLinearProgress-bar': { bgcolor: purpleColor } }} />
                </Box>
            </Box>
        </CardActionArea>
        <IconButton size="small" onClick={(e) => onMenuOpen(e, book.id)} sx={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }}><MoreVertIcon /></IconButton>
    </Card>
);