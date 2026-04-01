import React from 'react';
import {
    AppBar, Toolbar, IconButton, Typography, Box, Slider,
    Drawer, List, ListItem, ListItemButton, ListItemText
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SettingsIcon from '@mui/icons-material/Settings';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';

const PURPLE = '#5e35b1';

export const ReaderHeader = ({ title, chapter, time, onBack, onOpenToc, onOpenSettings, theme }) => (
    <AppBar position="static" elevation={0} sx={{ bgcolor: theme.barBg, color: theme.text, borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
        <Toolbar>
            <IconButton edge="start" color="inherit" onClick={onBack}><ArrowBackIcon/></IconButton>
            <IconButton color="inherit" onClick={onOpenToc}><FormatListBulletedIcon/></IconButton>
            <Box sx={{ flexGrow: 1, textAlign: 'center', overflow: 'hidden' }}>
                <Typography variant="body1" noWrap sx={{ fontWeight: 600 }}>{title}</Typography>
                <Typography variant="caption" noWrap sx={{ display: 'block', opacity: 0.7 }}>{chapter}</Typography>
            </Box>
            <Typography variant="body2" sx={{ mr: 1, fontWeight: 500, opacity: 0.8, display: {xs: 'none', sm: 'block'} }}>{time}</Typography>
            <IconButton color="inherit" onClick={onOpenSettings}><SettingsIcon/></IconButton>
        </Toolbar>
    </AppBar>
);

export const ReaderFooter = ({ progress, marks, timeLeft, onCommit, theme }) => (
    <Box sx={{ p: 2, bgcolor: theme.barBg, borderTop: '1px solid rgba(0,0,0,0.05)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, maxWidth: 800, mx: 'auto' }}>
            <Typography variant="caption" sx={{ minWidth: 55, color: 'text.secondary' }}>{timeLeft}</Typography>
            <Slider
                value={progress}
                marks={marks}
                step={0.1}
                onChangeCommitted={onCommit}
                sx={{
                    flexGrow: 1, color: PURPLE,
                    '& .MuiSlider-mark': { height: 6, width: 2, bgcolor: theme.barBg },
                    '& .MuiSlider-thumb': { width: 14, height: 14 }
                }}
            />
            <Typography variant="caption" sx={{ minWidth: 40, fontWeight: 'bold', color: PURPLE }}>{progress}%</Typography>
        </Box>
    </Box>
);

export const TocDrawer = ({ open, onClose, toc, currentIndex, onSelect, theme }) => (
    <Drawer anchor="left" open={open} onClose={onClose}>
        <Box sx={{ width: 280, bgcolor: theme.bg, color: theme.text, height: '100%' }}>
            <Typography variant="h6" sx={{ p: 2, borderBottom: '1px solid rgba(0,0,0,0.1)' }}>Indice</Typography>
            <List>
                {toc.map((chap, i) => (
                    <ListItem key={i} disablePadding divider>
                        <ListItemButton onClick={() => onSelect(chap)} selected={currentIndex === i}>
                            <ListItemText
                                primary={chap.label}
                                primaryTypographyProps={{ fontSize: '0.9rem', color: currentIndex === i ? PURPLE : 'inherit' }}
                            />
                        </ListItemButton>
                    </ListItem>
                ))}
            </List>
        </Box>
    </Drawer>
);