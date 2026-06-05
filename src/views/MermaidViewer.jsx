import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

// Inizializza il motore in modo che non cerchi di renderizzare tutto da solo
mermaid.initialize({
    startOnLoad: false,
    theme: 'base', // Puoi impostarlo su 'dark' se il tuo tema è scuro
    securityLevel: 'loose',
});

export const MermaidViewer = ({ chart }) => {
    const containerRef = useRef(null);

    useEffect(() => {
        if (chart && containerRef.current) {
            // Usiamo un ID univoco per evitare conflitti se ci sono più grafici
            const uniqueId = `mermaid-${Math.random().toString(36).substr(2, 9)}`;

            mermaid.render(uniqueId, chart).then(({ svg }) => {
                if (containerRef.current) {
                    containerRef.current.innerHTML = svg;
                }
            }).catch(error => {
                console.error("Errore di rendering Mermaid:", error);
                if (containerRef.current) {
                    containerRef.current.innerHTML = `<p style="color: red;">Errore nel grafico</p>`;
                }
            });
        }
    }, [chart]);

    return <div ref={containerRef} style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }} />;
};