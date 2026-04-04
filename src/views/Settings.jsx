import React from 'react';
import {
    Drawer, Box, Typography, IconButton, Slider, Select, MenuItem, Divider, Tabs, Tab
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter';
import FormatAlignJustifyIcon from '@mui/icons-material/FormatAlignJustify';
import CropPortraitIcon from '@mui/icons-material/CropPortrait';
import MenuBookIcon from '@mui/icons-material/MenuBook';

const themeOptions = [
    { id: 'white', color: '#ffffff' },
    { id: 'sepia', color: '#d4b781' },
    { id: 'dark', color: '#4a4a4a' },
];

export const SettingsDrawer = ({ open, onClose, settings, setSettings, themeStyles }) => {

    const updateSetting = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    // Assicuriamoci che pageLayout abbia un valore di fallback
    const currentLayout = settings.pageLayout || 'single';

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={onClose}
            PaperProps={{
                sx: {
                    width: { xs: '100%', sm: 360 },
                    p: 3,
                    bgcolor: themeStyles.card,
                    color: themeStyles.text,
                    borderRadius: { xs: 0, sm: '16px 0 0 16px' },
                    transition: 'background-color 0.3s ease'
                },
            }}
        >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>Settings</Typography>
                <IconButton onClick={onClose} size="small" sx={{ color: themeStyles.text, opacity: 0.5 }}>
                    <CloseIcon />
                </IconButton>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {/* THEME */}
                <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 2, opacity: 0.7 }}>Theme</Typography>
                    <Box sx={{ display: 'flex', gap: 2.5 }}>
                        {themeOptions.map((opt) => (
                            <Box
                                key={opt.id}
                                onClick={() => updateSetting('theme', opt.id)}
                                sx={{
                                    width: 45, height: 45, borderRadius: '50%',
                                    bgcolor: opt.color,
                                    border: `3px solid ${settings.theme === opt.id ? themeStyles.primary : 'transparent'}`,
                                    boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
                                    cursor: 'pointer', transition: '0.2s',
                                    '&:hover': { transform: 'scale(1.1)' }
                                }}
                            />
                        ))}
                    </Box>
                </Box>

                <Divider sx={{ borderColor: themeStyles.border }} />

                {/* FONT SIZE */}
                <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', opacity: 0.7 }}>Font Size</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{settings.fontSize}%</Typography>
                    </Box>
                    <Slider
                        value={settings.fontSize}
                        onChange={(e, v) => updateSetting('fontSize', v)}
                        min={50} max={250} step={10}
                        sx={{ color: themeStyles.primary }}
                    />
                </Box>

                <Divider sx={{ borderColor: themeStyles.border }} />

                {/* ALIGNMENT */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold', opacity: 0.7 }}>Alignment</Typography>
                    <Box sx={{ bgcolor: themeStyles.paper, borderRadius: '12px', p: 0.5, display: 'flex', gap: 0.5 }}>
                        {['left', 'justify'].map((align) => (
                            <IconButton
                                key={align}
                                size="small"
                                onClick={() => updateSetting('textAlign', align)}
                                sx={{
                                    bgcolor: settings.textAlign === align ? themeStyles.card : 'transparent',
                                    color: settings.textAlign === align ? themeStyles.primary : 'grey.500',
                                    borderRadius: '8px',
                                    boxShadow: settings.textAlign === align ? '0 2px 6px rgba(0,0,0,0.1)' : 'none'
                                }}
                            >
                                {align === 'left' ? <FormatAlignCenterIcon fontSize="small" /> : <FormatAlignJustifyIcon fontSize="small" />}
                            </IconButton>
                        ))}
                    </Box>
                </Box>

                <Divider sx={{ borderColor: themeStyles.border }} />

                {/* FONT FAMILY */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold', opacity: 0.7 }}>Font</Typography>
                    <Select
                        value={settings.fontFamily}
                        onChange={(e) => updateSetting('fontFamily', e.target.value)}
                        size="small"
                        sx={{
                            borderRadius: '12px',
                            bgcolor: themeStyles.paper,
                            color: themeStyles.text,
                            '& fieldset': { border: 'none' },
                            minWidth: 130
                        }}
                    >
                        <MenuItem value="Original">Originale</MenuItem>
                        <MenuItem value="Roboto">Roboto</MenuItem>
                        <MenuItem value="Merriweather">Merriweather</MenuItem>
                        <MenuItem value="Lora">Lora</MenuItem>
                        <MenuItem value="Bookerly">Bookerly</MenuItem>
                    </Select>
                </Box>

                <Divider sx={{ borderColor: themeStyles.border }} />

                {/* READING MODE */}
                <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold', opacity: 0.7, mb: 2 }}>Reading Mode</Typography>
                    <Box sx={{ bgcolor: themeStyles.paper, borderRadius: '16px', p: 0.5 }}>
                        <Tabs
                            value={settings.readingMode}
                            onChange={(e, v) => updateSetting('readingMode', v)}
                            variant="fullWidth"
                            sx={{ minHeight: 'auto', '& .MuiTabs-indicator': { display: 'none' } }}
                        >
                            {['Paged', 'Infinity', 'Chapters'].map((label, index) => (
                                <Tab
                                    key={label}
                                    value={index}
                                    label={label}
                                    sx={{
                                        borderRadius: '12px', textTransform: 'none', fontWeight: 'bold', minHeight: 36,
                                        color: 'grey.500',
                                        '&.Mui-selected': { bgcolor: themeStyles.card, color: themeStyles.text }
                                    }}
                                />
                            ))}
                        </Tabs>
                    </Box>
                </Box>

                {/* PAGE LAYOUT (Singola / Doppia) - Visibile SOLO se in modalità Paginata (0) */}
                {settings.readingMode === 0 && (
                    <>
                        <Divider sx={{ borderColor: themeStyles.border }} />
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 'bold', opacity: 0.7 }}>Layout Pagine</Typography>
                            <Box sx={{ bgcolor: themeStyles.paper, borderRadius: '12px', p: 0.5, display: 'flex', gap: 0.5 }}>
                                {['single', 'double'].map((layout) => (
                                    <IconButton
                                        key={layout}
                                        size="small"
                                        onClick={() => updateSetting('pageLayout', layout)}
                                        sx={{
                                            bgcolor: currentLayout === layout ? themeStyles.card : 'transparent',
                                            color: currentLayout === layout ? themeStyles.primary : 'grey.500',
                                            borderRadius: '8px',
                                            boxShadow: currentLayout === layout ? '0 2px 6px rgba(0,0,0,0.1)' : 'none'
                                        }}
                                    >
                                        {layout === 'single' ? <CropPortraitIcon fontSize="small" /> : <MenuBookIcon fontSize="small" />}
                                    </IconButton>
                                ))}
                            </Box>
                        </Box>
                    </>
                )}

            </Box>
        </Drawer>
    );
};