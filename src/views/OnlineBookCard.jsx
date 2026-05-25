import React from 'react';
import { Box, Typography, IconButton, CardActionArea, CircularProgress } from '@mui/material';
import DownloadForOfflineIcon from '@mui/icons-material/DownloadForOffline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useTranslation } from 'react-i18next';

export const OnlineBookCard = ({ book, onDownload, isDownloaded, isDownloading, themeStyles }) => {
    const { t } = useTranslation();

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, width: '100%' }}>
            <CardActionArea
                disabled // Disabilitiamo il click sull'intera area se è solo per ricerca
                sx={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    p: 1,
                    borderRadius: '16px',
                    cursor: 'default'
                }}
            >
                {/* Copertina */}
                <Box sx={{
                    width: 70, // Leggermente più piccola per la ricerca online
                    height: 100,
                    flexShrink: 0,
                    borderRadius: '8px',
                    overflow: 'hidden',
                    boxShadow: '0px 4px 12px rgba(0,0,0,0.08)',
                    bgcolor: '#eee'
                }}>
                    {book.cover ? (
                        <img src={book.cover} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                            <Typography variant="caption" sx={{ color: 'grey.600', textAlign: 'center' }}>{t('no_cover')}</Typography>
                        </Box>
                    )}
                </Box>

                {/* Testi */}
                <Box sx={{ ml: 3, flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem', color: themeStyles.text }}>
                        {book.title}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: 'grey.500' }}>
                        {book.author}
                    </Typography>
                </Box>
            </CardActionArea>

            {/* Pulsante Azione */}
            <Box sx={{ ml: 1 }}>
                {isDownloading ? (
                    <CircularProgress size={24} sx={{ color: themeStyles.primary }} />
                ) : isDownloaded ? (
                    <CheckCircleIcon sx={{ color: 'success.main', fontSize: 30 }} />
                ) : (
                    <IconButton
                        onClick={() => onDownload(book)}
                        sx={{ color: themeStyles.primary }}
                    >
                        <DownloadForOfflineIcon sx={{ fontSize: 30 }} />
                    </IconButton>
                )}
            </Box>
        </Box>
    );
};