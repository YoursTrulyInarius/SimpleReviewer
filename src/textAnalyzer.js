// Full-document aware TextAnalyzer
// Reads and samples from the entire document proportionally instead of
// truncating to the first N sentences.

class TextAnalyzer {
  constructor(text) {
    this.rawText   = this.normalizeText(String(text || ''));
    this.sentences = this.parseSentences(this.rawText);
    this.paragraphs = this.parseParagraphs(this.rawText);
    this.chunks    = this.chunkDocument(this.paragraphs);
    this.definitions = this.findDefinitions();
    this.names       = this.extractNames();
    this.figures     = this.extractFigures();
    this.keyTerms    = this.findKeyTerms();
  }

  /* ─── Normalisation ───────────────────────────────────────────────── */
  normalizeText(text) {
    text = text.replace(/\r\n|\r/g, '\n');
    // Em dashes / en dashes → preserve as " - " (but NOT hyphens in hyphenated words)
    text = text.replace(/[\u2014\u2013\u2012\u2011]/g, ' - ');
    text = text.replace(/[\u2018\u2019]/g, "'");
    text = text.replace(/[\u201C\u201D]/g, '"');
    text = text.replace(/\u2026/g, '...');
    text = text.replace(/\u00A0/g, ' ');
    // collapse runs of 3+ blank lines to exactly two (paragraph break)
    text = text.replace(/\n{3,}/g, '\n\n');
    // Trim trailing whitespace from each line
    text = text.split('\n').map(l => l.trimEnd()).join('\n');
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
      if (s.length < 20 || s.length > 1200) return;
      // Skip lines that are obviously metadata / document codes
      // (e.g. "PICG-12MODERN-C" — all-caps alphanumeric tokens)
      if (/^[A-Z0-9][\w\-]{0,30}$/.test(s)) return;
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

  /**
   * Returns true if the string looks like a real explanatory sentence
   * (not a slide heading, bullet label, or metadata token).
   *
   * Requirements:
   *  - At least 7 words
   *  - At least one lowercase word after position 0 (rules out pure Title Case headings)
   *  - Contains at least one verb-like signal word
   */
  _isRealSentence(s) {
    const words = s.trim().split(/\s+/);
    if (words.length < 7) return false;
    // At least two words (not first) must start lowercase
    const lowercaseCount = words.slice(1).filter(w => w.length > 1 && /^[a-z]/.test(w)).length;
    if (lowercaseCount < 2) return false;
    // Must contain at least one verb-signal word
    const verbSignals = /\b(?:is|are|was|were|has|have|had|refers|means|describes|involves|includes|affects|causes|leads|results|allows|requires|provides|represents|defines|consists|occurs|develops|enables|prevents|supports|indicates|suggests|demonstrates|shows|explains|states|notes|found|used|known|called|considered|based|related|associated|connected|linked|derived|created|formed|produced|caused|affected|influenced|characterized|determined|established|identified|recognized|classified|distinguished|separated|combined|integrated|analyzed|evaluated|measured|observed|recorded|reported|studied|examined|investigated|applied|implemented|developed|designed|constructed|built|made|produced)\b/i;
    return verbSignals.test(s);
  }

  /* ─── Chunk document into N equal sections ────────────────────────── */
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

    // Validate that a captured definition is actually meaningful
    const isValidDef = (term, def) => {
      if (!term || !def) return false;
      const t = term.trim();
      const d = def.trim();
      // Term: 2–50 chars, at most 5 words (prevents merged heading pairs)
      if (t.length < 2 || t.length > 50) return false;
      if (t.split(/\s+/).length > 5) return false;
      // Definition must be substantial
      if (d.length < 25) return false;
      const defWords = d.split(/\s+/).filter(w => w.length > 0);
      if (defWords.length < 5) return false;
      // Reject metadata codes (e.g. "PICG-12MODERN-C", "ABC123")
      if (/^[A-Z0-9][\w\-]{0,30}$/.test(d)) return false;
      // Reject all-uppercase definitions
      if (d === d.toUpperCase() && d.length > 5) return false;
      return true;
    };

    // Build a version of the text where soft line-breaks within a paragraph
    // are joined so multi-line definitions are captured in full.
    const joinedSentences = this.paragraphs.map(p => p.replace(/\n/g, ' '));

    const patterns = [
      // "X is/are/was/were (a/an/the) …" — greedy up to period or end-of-string
      /(?:The\s+|A\s+|An\s+)?([A-Z][\w\s]{2,50}?)\s+(?:is|are|was|were)\s+(?:a|an|the)?\s*(.+?)(?:\.|$)/,
      // "X: Definition" or "X - Definition" (definition side must start with capital)
      /^([A-Z][\w\s]{2,40}?)\s*[-:]\s*([A-Z].+?)(?:\.|$)/,
      // "X refers to / means / denotes …"
      /([A-Z][\w\s]{2,40}?)\s+(?:refers to|means|denotes|describes|involves)\s+(.+?)(?:\.|$)/,
    ];

    // Match on joined paragraph text to avoid line-break truncation
    for (const ps of joinedSentences) {
      for (const p of patterns) {
        const m = ps.match(p);
        if (m) {
          const term = m[1].trim();
          const def  = (m[2] || '').trim();
          const termKey = term.toLowerCase();
          if (isValidDef(term, def) && !(termKey in defs)) {
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
      // Require title/honorific OR two consecutive capitalized words
      const m = s.match(/\b(?:Dr\.|Mr\.|Mrs\.|Ms\.|Prof\.)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b|\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,3})\b/g);
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

  /* ─── Key terms (noun phrases, frequency-adaptive) ─────────────────── */
  findKeyTerms() {
    const freq = {};
    const m1 = this.rawText.match(/\b([A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,}){1,4})\b/g) || [];
    for (const t of m1) {
      const key = t.trim();
      if (key.length > 2) freq[key] = (freq[key] || 0) + 1;
    }
    // Use ≥2 frequency for larger documents; ≥1 for short ones
    const totalMatches = m1.length;
    const minFreq = totalMatches > 50 ? 2 : 1;
    return Object.entries(freq)
      .filter(([, v]) => v >= minFreq)
      .sort((a, b) => b[1] - a[1])
      .map(x => x[0])
      .slice(0, 150);
  }

  /* ─── Helpers ─────────────────────────────────────────────────────── */
  shortenAnswer(ans) {
    if (!ans) return ans;
    if (ans.length <= 200) return ans;
    const parts = ans.split(/(?<=[.!?])\s+/);
    return parts[0];
  }

  /**
   * Returns up to `perChunk` REAL sentences from each document chunk.
   * Headings and short labels are excluded.
   */
  _sampleSentences(perChunk = 3) {
    const sampled = [];

    for (const chunk of this.chunks) {
      const chunkText = chunk.join(' ').toLowerCase();
      // Only collect real sentences that belong to this chunk
      const chunkSentences = this.sentences.filter(s =>
        this._isRealSentence(s) &&
        chunkText.includes(s.toLowerCase().substring(0, Math.min(50, s.length)))
      );
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

    // Pick a representative REAL sentence from each chunk
    const overviewSentences = [];
    for (const chunk of this.chunks) {
      const chunkText = chunk.join(' ').toLowerCase();
      const candidate = this.sentences.find(s =>
        this._isRealSentence(s) &&
        s.length >= 40 &&
        chunkText.includes(s.toLowerCase().substring(0, Math.min(50, s.length)))
      );
      if (candidate) overviewSentences.push(candidate);
    }

    // Fallback: first real sentences
    const realSentences = this.sentences.filter(s => this._isRealSentence(s));
    const overviewSet = overviewSentences.length >= 3
      ? overviewSentences.slice(0, 12)
      : realSentences.slice(0, 8);

    for (const s of overviewSet) output += `- ${s}\n`;

    // Key Definitions section (from across the whole document)
    const defEntries = Object.entries(this.definitions);
    if (defEntries.length > 0) {
      output += '\n## Key Definitions\n\n';
      for (const [k, v] of defEntries.slice(0, 30)) {
        output += `**${k}** — ${v}\n\n`;
      }
    }

    // Key Terms section (high-frequency noun phrases appearing ≥ 2×)
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

    // 1. Definition-based cards — these have validated, meaningful definitions
    for (const [term, def] of Object.entries(this.definitions)) {
      addCard(`What is ${term}?`, def.replace(/[.]+$/, '') + '.');
    }

    // 2. Key-term + definition cards (avoids duplicate if already added above)
    for (const term of this.keyTerms) {
      if (cards.length >= min * 4) break;
      const defForTerm = this.definitions[term];
      if (defForTerm) {
        addCard(`Define "${term}".`, defForTerm.replace(/[.]+$/, '') + '.');
      }
    }

    // 3. Fallback: real sentences sampled proportionally from the whole document
    //    Convert each to a cloze-style question using the first clause.
    const sampled = this._sampleSentences(5);
    for (const s of sampled) {
      if (cards.length >= min * 4) break;
      // Only use proper explanatory sentences (not headings)
      if (s.length > 50 && s.length < 400) {
        // Build a question from the sentence by blanking the subject
        const firstClause = s.split(/[,;]/)[0].trim();
        const q = firstClause.length > 15
          ? `Complete the following: "${firstClause}..."`
          : s.split(/[.?!]/)[0].trim() + '?';
        addCard(q, s);
      }
    }

    // 4. Named-entity cards (supplementary, lower priority)
    for (const name of this.names) {
      if (cards.length >= min * 4) break;
      // Only add person names that have at least two words
      if (name.trim().split(/\s+/).length >= 2) {
        addCard(`Who is ${name}?`, name);
      }
    }

    return cards.slice(0, Math.max(min, cards.length));
  }

  /* ─── Multiple Choice ─────────────────────────────────────────────── */
  generateMultipleChoice(min = 15) {
    const flashcards = this.generateFlashcards(min + 20);
    // Build a rich answer pool from the FULL document
    const answerPool = flashcards
      .map(fc => this.shortenAnswer(fc.answer))
      .filter(a => a && a.length > 10);

    const questions = [];
    for (const fc of flashcards) {
      if (questions.length >= min) break;
      const correct = this.shortenAnswer(fc.answer);
      if (!correct || correct.length < 10) continue;
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

    // Use only real sentences from proportional document sampling
    const sampled = this._sampleSentences(6);

    for (const s of sampled) {
      if (fibs.length >= min * 2) break;
      // Only use sentences long enough to be meaningful fill-in-the-blank
      if (s.split(/\s+/).length < 6) continue;
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
      summary:           this.generateStudyGuide(),
      flashcards:        this.generateFlashcards(min),
      multiple_choice:   this.generateMultipleChoice(min),
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
