import React from 'react';
import {
    Drawer, Box, Typography, IconButton, Slider, Select, MenuItem, Divider, Tabs, Tab
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FormatAlignJustifyIcon from '@mui/icons-material/FormatAlignJustify';
import CropPortraitIcon from '@mui/icons-material/CropPortrait';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import { useTranslation } from 'react-i18next'; // <-- Import per le traduzioni

const themeOptions = [
    { id: 'white', color: '#ffffff' },
    { id: 'sepia', color: '#d4b781' },
    { id: 'dark', color: '#4a4a4a' },
];

export const SettingsDrawer = ({ open, onClose, settings, setSettings, themeStyles }) => {
    const { t } = useTranslation(); // <-- Inizializzazione hook

    const updateSetting = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const currentLayout = settings.pageLayout || 'single';

    // Array per gestire le traduzioni delle tab di lettura
    const readingModes = [
        { label: t('mode_paged'), value: 0 },
        { label: t('mode_infinity'), value: 1 },
        { label: t('mode_chapters'), value: 2 }
    ];

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={onClose}
            PaperProps={{
                sx: {
                    width: { xs: '85vw', sm: 360 },
                    maxWidth: 360,
                    p: { xs: 2, sm: 3 },
                    bgcolor: themeStyles.card,
                    color: themeStyles.text,
                    borderRadius: '16px 0 0 16px',
                    transition: 'background-color 0.3s ease',
                    overflowY: 'auto',
                    boxSizing: 'border-box'
                },
            }}
        >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: { xs: 2, sm: 3 } }}>
                <Typography variant="h6" sx={{ fontWeight: 800, fontSize: { xs: '1.1rem', sm: '1.25rem' } }}>
                    {t('settings_title')}
                </Typography>
                <IconButton onClick={onClose} size="small" sx={{ color: themeStyles.text, opacity: 0.5 }}>
                    <CloseIcon />
                </IconButton>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 3, sm: 4 } }}>

                {/* THEME */}
                <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1.5, opacity: 0.7 }}>
                        {t('theme_label')}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: { xs: 2, sm: 2.5 } }}>
                        {themeOptions.map((opt) => (
                            <Box
                                key={opt.id}
                                onClick={() => updateSetting('theme', opt.id)}
                                sx={{
                                    width: { xs: 40, sm: 45 }, height: { xs: 40, sm: 45 }, borderRadius: '50%',
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
                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', opacity: 0.7 }}>
                            {t('font_size_label')}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{settings.fontSize}%</Typography>
                    </Box>
                    <Slider
                        value={settings.fontSize}
                        onChange={(e, v) => updateSetting('fontSize', v)}
                        min={50} max={250} step={10}
                        sx={{ color: themeStyles.primary, py: { xs: 1, sm: 1.5 } }}
                    />
                </Box>

                <Divider sx={{ borderColor: themeStyles.border }} />

                {/* FONT FAMILY */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold', opacity: 0.7 }}>
                        {t('font_family_label')}
                    </Typography>
                    <Select
                        value={settings.fontFamily}
                        onChange={(e) => updateSetting('fontFamily', e.target.value)}
                        size="small"
                        sx={{
                            borderRadius: '12px',
                            bgcolor: themeStyles.paper,
                            color: themeStyles.text,
                            '& fieldset': { border: 'none' },
                            minWidth: { xs: 110, sm: 130 },
                            fontSize: { xs: '0.85rem', sm: '1rem' }
                        }}
                    >
                        <MenuItem value="Original">{t('font_original')}</MenuItem>
                        <MenuItem value="Roboto">Roboto</MenuItem>
                        <MenuItem value="Merriweather">Merriweather</MenuItem>
                        <MenuItem value="Lora">Lora</MenuItem>
                        <MenuItem value="Bookerly">Bookerly</MenuItem>
                    </Select>
                </Box>

                <Divider sx={{ borderColor: themeStyles.border }} />

                {/* READING MODE */}
                <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold', opacity: 0.7, mb: 1.5 }}>
                        {t('reading_mode_label')}
                    </Typography>
                    <Box sx={{ bgcolor: themeStyles.paper, borderRadius: '16px', p: 0.5 }}>
                        <Tabs
                            value={settings.readingMode}
                            onChange={(e, v) => updateSetting('readingMode', v)}
                            variant="fullWidth"
                            sx={{ minHeight: 'auto', '& .MuiTabs-indicator': { display: 'none' } }}
                        >
                            {readingModes.map((mode) => (
                                <Tab
                                    key={mode.value}
                                    value={mode.value}
                                    label={mode.label}
                                    sx={{
                                        borderRadius: '12px',
                                        textTransform: 'none',
                                        fontWeight: 'bold',
                                        minHeight: { xs: 32, sm: 36 },
                                        fontSize: { xs: '0.75rem', sm: '0.875rem' },
                                        p: { xs: 0.5, sm: 1 },
                                        color: 'grey.500',
                                        '&.Mui-selected': { bgcolor: themeStyles.card, color: themeStyles.text }
                                    }}
                                />
                            ))}
                        </Tabs>
                    </Box>
                </Box>

                {/* PAGE LAYOUT */}
                {settings.readingMode === 0 && (
                    <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                        <Divider sx={{ borderColor: themeStyles.border, mb: { xs: 3, sm: 4 } }} />
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 'bold', opacity: 0.7 }}>
                                {t('page_layout_label')}
                            </Typography>
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
                    </Box>
                )}
            </Box>
        </Drawer>
    );
};