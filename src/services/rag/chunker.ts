export interface TextChunk {
  id: string;
  text: string;
  index: number;
  startChar: number;
  endChar: number;
}

interface ChunkOptions {
  chunkSize?: number;
  overlap?: number;
}

export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  const chunkSize = options.chunkSize ?? 1000;
  const overlap = options.overlap ?? 200;

  if (chunkSize <= 0) throw new Error('chunkSize must be positive');
  if (overlap < 0) throw new Error('overlap cannot be negative');
  if (overlap >= chunkSize) throw new Error('overlap must be less than chunkSize');

  const chunks: TextChunk[] = [];

  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  let currentChunk = '';
  let currentIndex = 0;
  let startChar = 0;

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (trimmed.length === 0) continue;

    if (currentChunk.length + trimmed.length > chunkSize && currentChunk.length > 0) {
      const trimmedChunk = currentChunk.trim();
      chunks.push({
        id: `chunk-${currentIndex}`,
        text: trimmedChunk,
        index: currentIndex,
        startChar,
        endChar: startChar + trimmedChunk.length
      });
      currentIndex++;

      const words = currentChunk.split(/\s+/);
      const overlapWords: string[] = [];
      let overlapLen = 0;
      for (let i = words.length - 1; i >= 0; i--) {
        const w = words[i];
        if (overlapLen + w.length + 1 > overlap) break;
        overlapWords.unshift(w);
        overlapLen += w.length + 1;
      }
      currentChunk = overlapWords.join(' ');
      startChar = chunks[chunks.length - 1].endChar - overlapLen;
    }

    currentChunk += (currentChunk ? '\n\n' : '') + trimmed;
  }

  if (currentChunk.trim().length > 0) {
    const trimmedChunk = currentChunk.trim();
    chunks.push({
      id: `chunk-${currentIndex}`,
      text: trimmedChunk,
      index: currentIndex,
      startChar,
      endChar: startChar + trimmedChunk.length
    });
  }

  return chunks;
}
