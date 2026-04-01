import React, { useState } from 'react';
import Home from './views/Home';
import Reader from './views/Reader';

function App() {
  // Stato per memorizzare l'ID del libro attualmente in lettura.
  // Se è null, mostriamo la Home (Libreria).
  const [currentBookId, setCurrentBookId] = useState(null);

  const openBook = (id) => {
    setCurrentBookId(id);
  };

  const closeBook = () => {
    setCurrentBookId(null);
  };

  return (
      <div className="App font-sans antialiased text-gray-900">
        {currentBookId === null ? (
            // Passiamo la funzione openBook alla Home
            <Home onOpenBook={openBook} />
        ) : (
            // Passiamo l'ID e la funzione closeBook al Reader
            <Reader bookId={currentBookId} onClose={closeBook} />
        )}
      </div>
  );
}

export default App;