import ePub from 'epubjs';

/**
 * Elabora un file EPUB e restituisce un oggetto pronto per il database
 */
export const processEpubFile = async (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                const bookData = e.target.result;
                const tempBook = ePub(bookData);

                // 1. Metadati e Cover
                const metadata = await tempBook.loaded.metadata;
                const tempCoverUrl = await tempBook.coverUrl();
                let persistentCover = null;

                if (tempCoverUrl) {
                    const response = await fetch(tempCoverUrl);
                    const blob = await response.blob();
                    persistentCover = await new Promise((r) => {
                        const fr = new FileReader();
                        fr.onloadend = () => r(fr.result);
                        fr.readAsDataURL(blob);
                    });
                }

                // 2. Calcolo Locations (Ottimizzato)
                await tempBook.ready;
                await tempBook.locations.generate(1600);
                const savedLocations = tempBook.locations.save();

                // 3. Navigazione (ToC)
                const navigation = await tempBook.loaded.navigation;
                let tocData = [];
                const processItem = (item) => {
                    const baseHref = item.href ? item.href.split('#')[0] : '';
                    let safePct = 0;
                    if (item.href) {
                        const spineItem = tempBook.spine.get(baseHref);
                        if (spineItem) safePct = spineItem.index / tempBook.spine.length;
                    }
                    tocData.push({
                        label: item.label?.trim() || 'Capitolo',
                        percent: safePct,
                        href: item.href,
                    });
                    if (item.subitems) item.subitems.forEach(processItem);
                };
                navigation.toc.forEach(processItem);

                const result = {
                    title: metadata.title || 'Titolo Sconosciuto',
                    author: metadata.creator || 'Autore Sconosciuto',
                    fileName: file.name,
                    fileSize: file.size,
                    file: bookData,
                    cover: persistentCover,
                    locations: savedLocations,
                    toc: tocData,
                    progress: 0,
                    currentCfi: null,
                    addedDate: Date.now()
                };

                tempBook.destroy();
                resolve(result);
            } catch (err) {
                reject(err);
            }
        };

        reader.onerror = () => reject(new Error("Errore lettura file"));
        reader.readAsArrayBuffer(file);
    });
};