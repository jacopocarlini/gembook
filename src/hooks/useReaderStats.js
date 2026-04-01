import { useRef, useState } from 'react';

export const useReaderStats = () => {
    const [chapterStats, setChapterStats] = useState({ title: '', timeLeft: '-- min', index: -1 });

    const readingStats = useRef({
        lastCfi: null,
        lastTime: Date.now(),
        speedArray: [] // velocità in locs/secondo
    });

    const updateStats = (bookInstance, currentCfi, currentHref, toc) => {
        if (!bookInstance.locations || !toc || toc.length === 0) return;

        const totalLocs = bookInstance.locations.total;
        const currentLoc = bookInstance.locations.locationFromCfi(currentCfi);

        // 1. Identifica il capitolo attuale
        let activeIndex = toc.findIndex(item => item.baseHref && currentHref.includes(item.baseHref));
        if (activeIndex === -1) activeIndex = 0;

        // 2. Calcola distanza dalla fine del capitolo
        const nextChapter = toc[activeIndex + 1];
        const chapterEndPercent = nextChapter ? nextChapter.percent : 1;
        const chapterEndLoc = Math.floor(chapterEndPercent * totalLocs);
        const locsLeftInChapter = Math.max(0, chapterEndLoc - currentLoc);

        // 3. Calcolo velocità media (Moving Average)
        const now = Date.now();
        const timeDiff = (now - readingStats.current.lastTime) / 1000; // secondi

        if (readingStats.current.lastCfi && timeDiff > 2 && timeDiff < 300) {
            const lastLoc = bookInstance.locations.locationFromCfi(readingStats.current.lastCfi);
            const locsRead = currentLoc - lastLoc;

            if (locsRead > 0) {
                const speed = locsRead / timeDiff;
                readingStats.current.speedArray.push(speed);
                if (readingStats.current.speedArray.length > 5) readingStats.current.speedArray.shift();
            }
        }

        const avgSpeed = readingStats.current.speedArray.length > 0
            ? readingStats.current.speedArray.reduce((a, b) => a + b) / readingStats.current.speedArray.length
            : 0.5; // Fallback: 0.5 loc/sec

        // 4. Stima tempo rimanente
        const secondsLeft = locsLeftInChapter / avgSpeed;
        const minutesLeft = Math.ceil(secondsLeft / 60);
        const timeLeftStr = minutesLeft > 0 ? `${minutesLeft} min` : 'Fine cap.';

        // Aggiorna stato
        setChapterStats({
            title: toc[activeIndex]?.label || 'Capitolo',
            timeLeft: timeLeftStr,
            index: activeIndex
        });

        // Salva riferimenti per prossimo calcolo
        readingStats.current.lastTime = now;
        readingStats.current.lastCfi = currentCfi;
    };

    return { chapterStats, updateStats };
};