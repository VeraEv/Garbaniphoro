/**
 * search-worker.js - Web Worker for substring search across data chunks.
 *
 * Loads chunk files lazily, searches with String.includes(),
 * and streams results back to the main thread.
 *
 * Message protocol:
 *   Main -> Worker: { type: 'search', query: string, lang: 'ch'|'en', maxResults: number }
 *   Worker -> Main: { type: 'results', results: [...], done: boolean, progress: number }
 *   Worker -> Main: { type: 'ready' }
 */

let manifest = null;
let chunksCache = {}; // cached loaded chunks

async function loadManifest() {
  const res = await fetch('data/search/manifest.json');
  manifest = await res.json();
  postMessage({ type: 'ready', totalDocs: manifest.totalDocs });
}

async function loadChunk(file) {
  if (chunksCache[file]) return chunksCache[file];
  const res = await fetch(`data/search/${file}`);
  const data = await res.json();
  chunksCache[file] = data;
  return data;
}

async function search(query, lang, maxResults) {
  if (!manifest) await loadManifest();

  const chunks = lang === 'en' ? manifest.chunks.en : manifest.chunks.ch;
  const queryLower = query.toLowerCase();
  const results = [];
  let searched = 0;
  const total = chunks.length;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = await loadChunk(chunks[i].file);

    // Each doc in chunk: [id, type, speaker, text]
    for (const doc of chunk) {
      const speaker = doc[2] || '';
      const text = doc[3] || '';

      // Case-insensitive search for English, direct includes for Chinese
      const speakerMatch = lang === 'en'
        ? speaker.toLowerCase().includes(queryLower)
        : speaker.includes(query);
      const textMatch = lang === 'en'
        ? text.toLowerCase().includes(queryLower)
        : text.includes(query);

      if (speakerMatch || textMatch) {
        results.push({
          id: doc[0],
          type: doc[1], // 0 = dialogue, 1 = text
          speaker: speaker,
          text: text,
          matchIn: speakerMatch ? 'speaker' : 'text'
        });

        if (results.length >= maxResults) {
          postMessage({
            type: 'results',
            results,
            done: true,
            progress: 1,
            totalMatches: results.length
          });
          return;
        }
      }
    }

    searched++;
    // Send progress update every 5 chunks
    if (searched % 5 === 0 || searched === total) {
      postMessage({
        type: 'progress',
        progress: searched / total
      });
    }
  }

  postMessage({
    type: 'results',
    results,
    done: true,
    progress: 1,
    totalMatches: results.length
  });
}

self.onmessage = async (e) => {
  const { type, query, lang, maxResults } = e.data;
  if (type === 'init') {
    await loadManifest();
  } else if (type === 'search') {
    await search(query, lang, maxResults || 200);
  }
};

// Auto-init
loadManifest().catch(console.error);
