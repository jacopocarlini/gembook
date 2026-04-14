import React, { useState, useEffect } from 'react';
import Home from './views/Home';
import Reader from './views/Reader';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
    it: {
        translation: {
            "app_name": "GemBook",
            "search_placeholder": "Cerca libri...",
            "add_book": "Aggiungi Libro",
            "tab_all": "Tutti",
            "tab_to_read": "Da Leggere",
            "tab_finished": "Finiti",
            "empty_library_title": "La tua libreria è vuota",
            "empty_library_desc": "Tocca il pulsante 'Aggiungi Libro' in alto per importare il tuo primo file .epub.",
            "empty_search_title": "Nessun libro trovato",
            "empty_search_desc": "Prova a cambiare i termini di ricerca o la tab selezionata per trovare il tuo libro.",
            "delete_book": "Elimina libro",
            "delete_confirm": "Eliminare definitivamente questo libro?",
            "import_error": "Errore nell'importazione",
            "importing_book": "Analisi in corso...",
            "no_cover": "Nessuna copertina",
            "settings_title": "Impostazioni",
            "theme_label": "Tema",
            "font_size_label": "Dimensione testo",
            "justify_label": "Forza giustificato",
            "font_family_label": "Carattere",
            "reading_mode_label": "Modalità di lettura",
            "page_layout_label": "Layout pagina",
            "font_original": "Originale",
            "mode_paged": "Pagine",
            "mode_infinity": "Continuo",
            "mode_chapters": "Capitoli",
            "loading": "Caricamento...",
            "cover": "Copertina",
            "unknown_title": "Titolo sconosciuto",
            "index_title": "Indice",

            "minutes_short": "{{count}}m",
            "hours_short": "{{count}}h",
            "cap_label": "cap",
            "tot_label": "tot",
            "finished": "Finito",
            "time_separator": "•",

            "selection_title": "Selezione",
            "save_note": "Salva nota",
            "copy": "Copia",
        }
    },
    en: {
        translation: {
            "app_name": "GemBook",
            "search_placeholder": "Search books...",
            "add_book": "Add Book",
            "tab_all": "All Books",
            "tab_to_read": "To Read",
            "tab_finished": "Finished",
            "empty_library_title": "Your library is empty",
            "empty_library_desc": "Tap the 'Add Book' button above to import your first .epub file.",
            "empty_search_title": "No books found",
            "empty_search_desc": "Try changing your search terms or the selected tab to find your book.",
            "delete_book": "Delete book",
            "delete_confirm": "Permanently delete this book?",
            "import_error": "Error during import",
            "importing_book": "Analyzing book...",
            "no_cover": "No Cover",
            "cover": "Cover",
            "settings_title": "Settings",
            "theme_label": "Theme",
            "font_size_label": "Font Size",
            "justify_label": "Force Justify Text",
            "font_family_label": "Font",
            "reading_mode_label": "Reading Mode",
            "page_layout_label": "Page Layout",
            "font_original": "Original",
            "mode_paged": "Paged",
            "mode_infinity": "Infinity",
            "mode_chapters": "Chapters",
            "loading": "Loading...",
            "unknown_title": "Unknown Title",
            "index_title": "Table of Contents",

            "minutes_short": "{{count}}m",
            "hours_short": "{{count}}h",
            "cap_label": "cap",
            "tot_label": "tot",
            "finished": "Finished",
            "time_separator": "•",
            "selection_title": "Selection",
            "save_note": "Save Note",
            "copy": "Copy",
        }
    }
};

i18n
    .use(LanguageDetector)
    .use(initReactI18next) // Passa l'istanza a react-i18next
    .init({
        resources,
        fallbackLng: "en",
        interpolation: {
            escapeValue: false // React protegge già dagli XSS
        },
        detection: {
            // Ordine in cui il plugin cerca di capire la lingua dell'utente
            order: ['localStorage', 'navigator'],
            // Chiave usata per salvare la preferenza nel localStorage se l'utente la cambia
            caches: ['localStorage']
        }
    });


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