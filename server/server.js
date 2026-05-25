import express from "express";
import axios from "axios";
import xml2js from "xml2js";
import cors from "cors";
import WebTorrent from "webtorrent";

const app = express();
app.use(cors());

const JACKETT_URL = 'http://127.0.0.1:9117';
const API_KEY = 'cqb0rujj4j2lotfnv8weayimevrq2tod';

const client = new WebTorrent();

// 1. GET /search: Cerca torrent su Jackett
app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Query mancante' });

    try {
        const response = await axios.get(`${JACKETT_URL}/api/v2.0/indexers/all/results/torznab/`, {
            params: {
                apikey: API_KEY,
                t: 'search',
                q: query,
                cat: '7000,7010,7020,7030'

            }
        });

        const parser = new xml2js.Parser({
            explicitArray: false,
            ignoreAttrs: false
        });

        const result = await parser.parseStringPromise(response.data);

        if (!result?.rss?.channel) {
            return res.json([]);
        }

        const items = result.rss.channel.item;
        if (!items) return res.json([]);

        const itemsArray = Array.isArray(items) ? items : [items];


        const books = itemsArray.map(item => {
            // Estrazione sicura degli attributi Torznab (seeders, peers, size)
            const getTorznabAttr = (attrName) => {
                const attrs = item['torznab:attr'];
                if (!attrs) return 0;

                // Normalizziamo sempre in array perché xml2js se c'è un solo attributo fa un oggetto
                const attrsArray = Array.isArray(attrs) ? attrs : [attrs];

                // Cerchiamo l'attributo controllando sia la proprietà diretta che l'oggetto "$" (attributi XML)
                const target = attrsArray.find(a => {
                    const name = a.name || a.$?.name;
                    return name === attrName;
                });

                if (!target) return 0;
                return target.value || target.$?.value || 0;
            };

            return {
                title: item.title,
                size: item.size || getTorznabAttr('size'),
                seeders: parseInt(getTorznabAttr('seeders')),
                peers: parseInt(getTorznabAttr('peers')),
                link: item.link,
                pubDate: item.pubDate,
                indexer: item.jackettindexer?._ || item.jackettindexer || 'Unknown'
            };
        });

        // Opzionale: Ordina per seeders decrescenti
        books.sort((a, b) => b.seeders - a.seeders);

        res.json(books);
    } catch (error) {
        console.error("Errore Jackett:", error.message);
        res.status(500).json({ error: 'Errore interno del server bridge' });
    }
});

// 2. GET /download: Scarica il file torrent e lo invia al client
// 2. GET /download: Usa WebTorrent per scaricare l'EPUB
app.get('/download', async (req, res) => {
    const { torrentUrl } = req.query;

    if (!torrentUrl) return res.status(400).json({ error: 'URL mancante' });

    console.log(`\n[Torrent] Avvio richiesta per: ${torrentUrl}`);

    // Aumentiamo il timeout della richiesta HTTP a 10 minuti
    req.setTimeout(600000);

    try {
        let torrentInput = torrentUrl;

        // SE È UN LINK HTTP, lo analizziamo con Axios
        if (torrentUrl.startsWith('http')) {
            console.log('[Torrent] Risoluzione del link Jackett...');

            // maxRedirects: 0 è il trucco per evitare il crash su "Unsupported protocol magnet"
            const response = await axios({
                method: 'GET',
                url: torrentUrl,
                responseType: 'arraybuffer',
                maxRedirects: 0,
                validateStatus: (status) => status >= 200 && status < 400 // Accetta i codici 3xx (Redirect) senza lanciare errori
            });

            // Se la risposta è un redirect (301, 302, ecc.)
            if (response.status >= 300 && response.status < 400 && response.headers.location) {
                const location = response.headers.location;

                if (location.startsWith('magnet:')) {
                    console.log('[Torrent] Redirect a Magnet Link intercettato con successo!');
                    torrentInput = location; // WebTorrent capisce benissimo la stringa magnet
                } else {
                    console.log(`[Torrent] Seguo il redirect HTTP verso: ${location}`);
                    const redirectRes = await axios.get(location, { responseType: 'arraybuffer' });
                    torrentInput = Buffer.from(redirectRes.data);
                }
            } else {
                console.log('[Torrent] File .torrent letto in memoria.');
                torrentInput = Buffer.from(response.data);
            }
        } else {
            console.log('[Torrent] Rilevato Magnet Link diretto.');
        }

        // Passiamo il Torrent (Buffer o Magnet) a WebTorrent
        client.add(torrentInput, { path: './tmp' }, (torrent) => {
            console.log(`[Torrent] Connesso allo sciame P2P per: ${torrent.name}`);

            const epubFile = torrent.files.find(file => file.name.toLowerCase().endsWith('.epub'));

            if (!epubFile) {
                console.log('[Torrent] Errore: Nessun file EPUB trovato nel torrent.');
                torrent.destroy();
                if (!res.headersSent) return res.status(404).json({ error: 'Nessun file EPUB trovato' });
                return;
            }

            console.log(`[Torrent] File trovato! Inizio streaming di: ${epubFile.name}`);

            res.setHeader('Content-Type', 'application/epub+zip');
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(epubFile.name)}"`);

            const stream = epubFile.createReadStream();
            stream.pipe(res);

            stream.on('end', () => {
                console.log(`[Torrent] Download completato: ${epubFile.name}`);
                torrent.destroy();
            });

            stream.on('error', (err) => {
                console.error("[Torrent] Errore stream:", err);
                torrent.destroy();
                if (!res.headersSent) res.status(500).json({ error: 'Errore nello streaming' });
            });
        });

    } catch (error) {
        console.error("[Torrent] Errore di rete o fetch:", error.message);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Impossibile risolvere il link dal server Jackett' });
        }
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Server bridge per Jackett attivo su http://localhost:${PORT}`);
});