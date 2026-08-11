// Full-document aware TextAnalyzer
// Reads and samples from the entire document proportionally instead of
// truncating to the first N sentences.

class TextAnalyzer {
  constructor(text) {
    this.rawText  = this.normalizeText(String(text || ''));
    this.sentences  = this.parseSentences(this.rawText);
    this.paragraphs = this.parseParagraphs(this.rawText);
    this.chunks     = this.chunkDocument(this.paragraphs);
    this.definitions = this.findDefinitions();
    this.names       = this.extractNames();
    this.figures     = this.extractFigures();
    this.keyTerms    = this.findKeyTerms();
  }

  /* ─── Normalisation ───────────────────────────────────────────────── */
  normalizeText(text) {
    text = text.replace(/\r\n|\r/g, '\n');
    text = text.replace(/[\u2014\u2013\u2012\u2011]/g, ' - ');
    text = text.replace(/[\u2018\u2019]/g, "'");
    text = text.replace(/[\u201C\u201D]/g, '"');
    text = text.replace(/\u2026/g, '...');
    text = text.replace(/\u00A0/g, ' ');
    // collapse runs of 3+ blank lines into exactly two (paragraph break)
    text = text.replace(/\n{3,}/g, '\n\n');
    return text;
  }

  /* ─── Parsing ─────────────────────────────────────────────────────── */
  parseParagraphs(text) {
    return text
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(p => p.length > 20);
  }

  parseSentences(text) {
    const seen = new Set();
    const sentences = [];

    const addSentence = (s) => {
      s = s.trim();
      // Accept 15–1200 chars (raised from 800 so long academic sentences aren't dropped)
      if (s.length < 15 || s.length > 1200) return;
      const key = s.toLowerCase();
      if (!seen.has(key)) { seen.add(key); sentences.push(s); }
    };

    // 1. Line-by-line pass (catches bullet points, numbered lists, etc.)
    for (const line of text.split('\n').map(l => l.trim()).filter(Boolean)) {
      addSentence(line);
    }

    // 2. Sentence-split pass on the whole text (catches long prose paragraphs)
    const flat = text.replace(/\n+/g, ' ');
    for (const s of flat.split(/(?<=[.!?])\s+(?=[A-Z"'\(0-9])/)) {
      addSentence(s);
    }

    return sentences;
  }

  /* ─── Chunk document into N equal sections ────────────────────────── */
  // Each chunk is a group of consecutive paragraphs. We use chunks to
  // ensure cards/questions are drawn proportionally from the whole doc.
  chunkDocument(paragraphs, chunkCount = 10) {
    if (paragraphs.length <= chunkCount) {
      return paragraphs.map(p => [p]);
    }
    const size = Math.ceil(paragraphs.length / chunkCount);
    const chunks = [];
    for (let i = 0; i < paragraphs.length; i += size) {
      chunks.push(paragraphs.slice(i, i + size));
    }
    return chunks;
  }

  /* ─── Definitions ─────────────────────────────────────────────────── */
  findDefinitions() {
    const defs = {};
    const patterns = [
      /(?:The\s+|A\s+|An\s+)?([A-Z][\w\s\.]{2,50}?)\s+(?:is|are|was|were)\s+(?:a|an|the)?\s*(.{15,300}?)\./m,
      /([A-Z][\w\s\.]{2,40}?)\s*[-:]\s*(.{15,300}?)\.?/m,
      // "X refers to Y", "X means Y", "X denotes Y"
      /([A-Z][\w\s\.]{2,40}?)\s+(?:refers to|means|denotes|describes|involves)\s+(.{15,250}?)(?:\.|$)/m,
    ];

    for (const s of this.sentences) {
      for (const p of patterns) {
        const m = s.match(p);
        if (m) {
          const term = m[1].trim();
          const def  = (m[2] || '').trim();
          if (term && def && !(term.toLowerCase() in defs)) {
            defs[term] = def;
          }
        }
      }
    }
    return defs;
  }

  /* ─── Named entities & figures ───────────────────────────────────── */
  extractNames() {
    const names = new Set();
    for (const s of this.sentences) {
      const m = s.match(/\b(?:Dr\.|Mr\.|Mrs\.|Ms\.|Prof\.|\b)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g);
      if (m) for (const name of m) names.add(name.trim());
    }
    return Array.from(names).slice(0, 100);
  }

  extractFigures() {
    const figs = new Set();
    for (const s of this.sentences) {
      const m = s.match(/\b(?:\$?\d+(?:\.\d+)?%?|\d{4}s?)\b/gi);
      if (m) for (const f of m) if (f.length >= 2) figs.add(f);
    }
    return Array.from(figs).slice(0, 100);
  }

  /* ─── Key terms (noun phrases with frequency) ─────────────────────── */
  findKeyTerms() {
    const freq = {};
    const m1 = this.rawText.match(/\b([A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,}){1,4})\b/g) || [];
    for (const t of m1) {
      const key = t.trim();
      if (key.length > 2) freq[key] = (freq[key] || 0) + 1;
    }
    return Object.entries(freq)
      .filter(([, v]) => v >= 1)
      .sort((a, b) => b[1] - a[1])
      .map(x => x[0])
      .slice(0, 200);
  }

  /* ─── Helpers ─────────────────────────────────────────────────────── */
  shortenAnswer(ans) {
    if (!ans) return ans;
    if (ans.length <= 150) return ans;
    const parts = ans.split(/(?<=[.!?])\s+/);
    return parts[0];
  }

  /**
   * Returns up to `perChunk` sentences from each document chunk,
   * providing a proportional view across the whole document.
   */
  _sampleSentences(perChunk = 3) {
    const sampled = [];
    const allSentencesSet = new Set(this.sentences.map(s => s.toLowerCase()));

    for (const chunk of this.chunks) {
      const chunkText = chunk.join(' ');
      // collect sentences that appear in this chunk
      const chunkSentences = this.sentences.filter(s =>
        chunkText.toLowerCase().includes(s.toLowerCase().substring(0, Math.min(50, s.length)))
      );
      // take up to perChunk from this chunk
      sampled.push(...chunkSentences.slice(0, perChunk));
    }

    // dedupe while preserving order
    const seen = new Set();
    return sampled.filter(s => {
      const k = s.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  /* ─── Study Guide ─────────────────────────────────────────────────── */
  generateStudyGuide() {
    let output = '## Document Overview\n\n';

    // 1. Pick a representative sentence from each chunk for the overview
    const overviewSentences = [];
    for (const chunk of this.chunks) {
      const chunkText = chunk.join(' ');
      const candidate = this.sentences.find(s =>
        s.length >= 30 &&
        chunkText.toLowerCase().includes(s.toLowerCase().substring(0, Math.min(40, s.length)))
      );
      if (candidate) overviewSentences.push(candidate);
    }
    // fallback: first 8 sentences if chunks didn't yield enough
    const overviewSet = overviewSentences.length >= 3
      ? overviewSentences.slice(0, 12)
      : this.sentences.slice(0, 8);

    for (const s of overviewSet) output += `- ${s}\n`;

    // 2. Key Definitions section (from across the whole document)
    const defEntries = Object.entries(this.definitions);
    if (defEntries.length > 0) {
      output += '\n## Key Definitions\n\n';
      for (const [k, v] of defEntries.slice(0, 30)) {
        output += `**${k}** — ${v}\n\n`;
      }
    }

    // 3. Key Terms section (high-frequency noun phrases)
    if (this.keyTerms.length > 0) {
      output += '\n## Key Terms\n\n';
      output += this.keyTerms.slice(0, 30).map(t => `- ${t}`).join('\n');
      output += '\n';
    }

    return output.trim();
  }

  /* ─── Flashcards ─────────────────────────────────────────────────── */
  generateFlashcards(min = 15) {
    const cards = [];
    const seen  = new Set();

    const addCard = (q, a) => {
      if (!q || !a) return;
      const k = q.toLowerCase();
      if (!seen.has(k)) { seen.add(k); cards.push({ question: q, answer: a }); }
    };

    // 1. Definition-based cards (full document)
    for (const [term, def] of Object.entries(this.definitions)) {
      addCard(`What is ${term}?`, def.replace(/[.]+$/, '') + '.');
    }

    // 2. Named-entity cards (full document)
    for (const name of this.names) {
      addCard(`Who is ${name}?`, name);
    }

    // 3. Key-term flashcards (ask for the term from context)
    for (const term of this.keyTerms) {
      if (cards.length >= min * 4) break;
      const defForTerm = this.definitions[term];
      if (defForTerm) {
        addCard(`Define "${term}".`, defForTerm.replace(/[.]+$/, '') + '.');
      }
    }

    // 4. Fallback: proportionally sampled sentences from the whole document
    const sampled = this._sampleSentences(5);
    for (const s of sampled) {
      if (cards.length >= min * 4) break;
      if (s.length > 40 && s.length < 300) {
        const q = s.split(/[.?!]/)[0].trim() + '?';
        addCard(q, s);
      }
    }

    return cards.slice(0, Math.max(min, cards.length));
  }

  /* ─── Multiple Choice ─────────────────────────────────────────────── */
  generateMultipleChoice(min = 15) {
    const flashcards = this.generateFlashcards(min + 20);
    // Build a rich answer pool from the FULL document, not a truncated slice
    const answerPool = flashcards
      .map(fc => this.shortenAnswer(fc.answer))
      .filter(a => a && a.length > 8);

    const questions = [];
    for (const fc of flashcards) {
      if (questions.length >= min) break;
      const correct = this.shortenAnswer(fc.answer);
      if (!correct || correct.length < 8) continue;
      const pool = answerPool.filter(a => a !== correct);
      shuffleArray(pool);
      const distractors = pool.slice(0, 3);
      if (distractors.length < 3) continue;
      const choices = [correct, ...distractors];
      shuffleArray(choices);
      questions.push({ question: fc.question, choices, correct_answer: correct });
    }
    return questions.slice(0, Math.max(min, questions.length));
  }

  /* ─── Fill in the Blank ───────────────────────────────────────────── */
  generateFillInTheBlank(min = 15) {
    const fibs = [];
    const priority = Object.keys(this.definitions).concat(this.names).slice(0, 300);

    // Use proportionally sampled sentences from the whole document
    const sampled = this._sampleSentences(6);

    for (const s of sampled) {
      if (fibs.length >= min * 2) break;
      let chosen = null;
      for (const term of priority) {
        if (term.length < 3) continue;
        const re = new RegExp('\\b' + escapeRegex(term) + '\\b', 'i');
        if (re.test(s)) { chosen = term; break; }
      }
      if (!chosen) continue;
      const blanked = s.replace(new RegExp('\\b' + escapeRegex(chosen) + '\\b', 'i'), '_____');
      if (blanked && blanked !== s) fibs.push({ question: blanked, correct_answer: chosen });
    }

    return dedupeByKey(fibs, 'question').slice(0, Math.max(min, fibs.length));
  }

  /* ─── Generate All ────────────────────────────────────────────────── */
  generateAll(min = 15) {
    return {
      summary:          this.generateStudyGuide(),
      flashcards:       this.generateFlashcards(min),
      multiple_choice:  this.generateMultipleChoice(min),
      fill_in_the_blank: this.generateFillInTheBlank(min),
    };
  }
}

/* ─── Module-level helpers ─────────────────────────────────────────── */
function escapeRegex(s)  { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function shuffleArray(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function dedupeByKey(items, key) {
  const seen = new Set();
  const out  = [];
  for (const it of items) {
    const k = (it[key] || '').toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(it); }
  }
  return out;
}

module.exports = TextAnalyzer;
