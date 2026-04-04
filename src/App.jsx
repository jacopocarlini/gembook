import React, { useState, useEffect } from 'react';
import Home from './views/Home';
import Reader from './views/Reader';

// Costanti globali
const PRIMARY_PURPLE = '#7c4dff';

// Mappatura temi
const themeColors = {
    white: {
        primary: PRIMARY_PURPLE,
        bg: '#ffffff',
        text: '#000000',
        card: '#ffffff',
        paper: '#f0f0f0',
        secondaryText: 'grey.600',
        border: '#f0f0f0'
    },
    sepia: {
        primary: PRIMARY_PURPLE,
        bg: '#f4ecd8',
        text: '#5b4636',
        card: '#fdf6e3',
        paper: '#eae0c9',
        secondaryText: '#8c7662',
        border: '#e2d7bf'
    },
    dark: {
        primary: PRIMARY_PURPLE,
        bg: '#121212',
        text: '#e0e0e0',
        card: '#1e1e1e',
        paper: '#2d2d2d',
        secondaryText: 'grey.500',
        border: '#333'
    }
};

function App() {
    const [currentBookId, setCurrentBookId] = useState(null);

    // Stato Settings con caricamento da LocalStorage
    const [settings, setSettings] = useState(() => {
        const saved = localStorage.getItem('gembook-settings');
        return saved ? JSON.parse(saved) : {
            theme: 'white',
            fontSize: 130,
            fontFamily: 'Original',
            readingMode: 0,
            textAlign: 'original',
            pageLayout: 'single'
        };
    });

    // Salvataggio automatico settings
    useEffect(() => {
        localStorage.setItem('gembook-settings', JSON.stringify(settings));
    }, [settings]);

    const currentThemeStyles = themeColors[settings.theme] || themeColors.white;

    return (
        <div className="App" style={{ transition: 'all 0.3s ease' }}>
            {currentBookId === null ? (
                <Home
                    onOpenBook={(id) => setCurrentBookId(id)}
                    settings={settings}
                    setSettings={setSettings}
                    themeStyles={currentThemeStyles}
                    PRIMARY_PURPLE={PRIMARY_PURPLE}
                />
            ) : (
                <Reader
                    bookId={currentBookId}
                    onClose={() => setCurrentBookId(null)}
                    settings={settings}
                    setSettings={setSettings}
                    themeStyles={currentThemeStyles}
                />
            )}
        </div>
    );
}

export default App;