// Upgraded TextAnalyzer Engine
// Features: Full document awareness, Entity Categorization (Person, Concept, Date, Process, Location),
// Smart Distractor Generation, Precision Filtering, and Section-aware Study Guides.

class TextAnalyzer {
  constructor(text) {
    this.rawText = this.normalizeText(String(text || ''));
    this.sections = this.parseSections(this.rawText);
    this.paragraphs = this.parseParagraphs(this.rawText);
    this.sentences = this.parseSentences(this.rawText);
    this.chunks = this.chunkDocument(this.paragraphs);
    this.definitions = this.findDefinitions();
    this.names = this.extractNames();
    this.figures = this.extractFigures();
    this.keyTerms = this.findKeyTerms();
  }

  /* ─── Normalization ───────────────────────────────────────────────── */
  normalizeText(text) {
    text = text.replace(/\r\n|\r/g, '\n');
    // Normalize unicode typographic characters
    text = text.replace(/[\u2014\u2013\u2012\u2011]/g, ' - ');
    text = text.replace(/[\u2018\u2019]/g, "'");
    text = text.replace(/[\u201C\u201D]/g, '"');
    text = text.replace(/\u2026/g, '...');
    text = text.replace(/\u00A0/g, ' ');
    text = text.replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, '- ');

    // Normalize spacing after sentence endings if jammed together
    text = text.replace(/([.!?])(?=([A-Z0-9"'\(]))/g, '$1 ');

    // Collapse multiple blank lines to at most two
    text = text.replace(/\n{3,}/g, '\n\n');

    // Trim trailing whitespace from lines
    return text.split('\n').map(l => l.trimEnd()).join('\n');
  }

  /* ─── Parsing ─────────────────────────────────────────────────────── */
  parseSections(text) {
    const lines = text.split('\n');
    const sections = [];
    let currentTitle = 'Introduction & Overview';
    let currentLines = [];

    for (const line of lines) {
      const headerMatch = line.match(/^#{1,3}\s+(.+)$/);
      if (headerMatch) {
        if (currentLines.length > 0) {
          sections.push({ title: currentTitle, content: currentLines.join('\n').trim() });
          currentLines = [];
        }
        currentTitle = headerMatch[1].trim();
      } else {
        currentLines.push(line);
      }
    }

    if (currentLines.length > 0) {
      sections.push({ title: currentTitle, content: currentLines.join('\n').trim() });
    }

    return sections;
  }

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
      s = s.trim().replace(/^[-*•]\s+/, '');
      if (s.length < 20 || s.length > 1200) return;
      if (/^[A-Z0-9][\w\-]{0,30}$/.test(s)) return;
      const key = s.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        sentences.push(s);
      }
    };

    // 1. Line-by-line pass (lists, bullets, headers)
    for (const line of text.split('\n').map(l => l.trim()).filter(Boolean)) {
      if (!line.startsWith('#')) addSentence(line);
    }

    // 2. Sentence-split pass across paragraphs
    const flat = text.replace(/\n+/g, ' ');
    for (const s of flat.split(/(?<=[.!?])\s+(?=[A-Z"'\(0-9])/)) {
      addSentence(s);
    }

    return sentences;
  }

  _isRealSentence(s) {
    const words = s.trim().split(/\s+/);
    if (words.length < 6) return false;
    const lowercaseCount = words.slice(1).filter(w => w.length > 1 && /^[a-z]/.test(w)).length;
    if (lowercaseCount < 2) return false;
    const verbSignals = /\b(?:is|are|was|were|has|have|had|refers|means|describes|involves|includes|affects|causes|leads|results|allows|requires|provides|represents|defines|consists|occurs|develops|enables|prevents|supports|indicates|suggests|demonstrates|shows|explains|states|notes|found|used|known|called|considered|based|related|associated|connected|linked|derived|created|formed|produced|characterized|determined|identified|distinguished|integrated|analyzed|evaluated|measured|observed|recorded|studied|examined|applied|implemented|designed)\b/i;
    return verbSignals.test(s);
  }

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

  /* ─── Entity Classification Helpers ────────────────────────────────── */
  isPerson(term, def = '') {
    const t = term.trim();
    const d = (def || '').toLowerCase();

    // Check honorifics
    if (/\b(?:Dr\.|Mr\.|Mrs\.|Ms\.|Prof\.|President|King|Queen|Pope|Sir|Lord|Prime Minister|General|Emperor|Saint)\b/i.test(t)) {
      return true;
    }

    // Person indicators in definition
    const personDefSignals = [
      'person who', 'individual who', 'physicist', 'scientist', 'philosopher',
      'author', 'writer', 'developer', 'programmer', 'creator of', 'inventor',
      'founder of', 'mathematician', 'artist', 'psychologist', 'biologist',
      'historian', 'leader', 'explorer', 'born in', 'died in', 'who introduced',
      'who proposed', 'who discovered', 'who formulated', 'who was', 'who served as',
      'ruler of', 'statesman', 'theorist', 'scholar', 'architect of'
    ];

    if (personDefSignals.some(signal => d.includes(signal))) {
      return true;
    }

    // Capitalized two-word proper name heuristic (e.g. "Jeb Bush", "Alan Turing")
    // Ensure words are capitalized and not common stop words
    const words = t.split(/\s+/);
    if (words.length >= 2 && words.length <= 4) {
      const allCap = words.every(w => /^[A-Z][a-z]+$/.test(w));
      const stopWords = new Set(['The', 'A', 'An', 'In', 'On', 'At', 'For', 'With', 'And', 'Chapter', 'Section', 'Figure', 'Table', 'Slide']);
      if (allCap && !words.some(w => stopWords.has(w))) {
        // If the definition contains "he", "his", "she", "her", "who"
        if (/\b(he|his|she|her|who|whose)\b/i.test(d)) return true;
      }
    }

    // Check against single-word famous names or extracted names
    if (this.names && this.names.includes(t)) {
      return true;
    }

    return false;
  }

  isProcessOrMethod(term, def = '') {
    const d = (def || '').toLowerCase();
    const t = term.toLowerCase();
    if (/\b(process|method|technique|procedure|mechanism|protocol|cycle|algorithm|system)\b/.test(t)) return true;
    return /\b(process by which|method of|technique used|procedure for|mechanism of|steps involved in|way in which)\b/.test(d);
  }

  isDateOrPeriod(term, def = '') {
    const t = term.trim();
    const d = (def || '').toLowerCase();
    if (/^\b(?:\d{4}s?|\d{1,2}(?:st|nd|rd|th)\s+century|bce?|ce)\b/i.test(t)) return true;
    return /\b(period during|era when|year in which|date of|took place in|occurred between)\b/.test(d);
  }

  isLocation(term, def = '') {
    const d = (def || '').toLowerCase();
    return /\b(country in|city in|region of|located in|capital of|continent of|island in|mountain range|province)\b/.test(d);
  }

  isPlural(term) {
    const t = term.trim();
    if (t.endsWith('ies') || t.endsWith('es') || (t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us') && !t.endsWith('is'))) {
      return true;
    }
    return false;
  }

  formatQuestionForTerm(term, def = '') {
    const t = term.trim();
    if (this.isPerson(t, def)) {
      const pastVerb = /\b(?:was|died|served|developed|invented|discovered|founded|introduced)\b/i.test(def);
      return pastVerb ? `Who was ${t}?` : `Who is ${t}?`;
    }
    if (this.isDateOrPeriod(t, def)) {
      return `When did ${t} occur?`;
    }
    if (this.isLocation(t, def)) {
      return `Where or what is ${t}?`;
    }
    if (this.isProcessOrMethod(t, def)) {
      return `How does the process of ${t} work?`;
    }
    return this.isPlural(t) ? `What are ${t}?` : `What is ${t}?`;
  }

  /* ─── Definitions Extraction ───────────────────────────────────────── */
  findDefinitions() {
    const defs = {};

    const blacklistTerms = new Set([
      'this', 'it', 'these', 'those', 'there', 'here', 'he', 'she', 'they', 'we', 'you',
      'one', 'which', 'that', 'such', 'figure', 'table', 'section', 'chapter', 'slide',
      'page', 'example', 'note', 'notice', 'important', 'summary', 'introduction',
      'conclusion', 'source', 'references', 'title', 'module', 'unit', 'step', 'objective',
      'overview', 'outcome', 'part', 'key', 'total', 'definition', 'definitions',
      'question', 'answer', 'review', 'reviewer', 'study guide', 'terms'
    ]);

    const isValidDef = (term, def) => {
      if (!term || !def) return false;
      let t = term.trim().replace(/^[\*\-_#\s]+|[\*\-_#\s]+$/g, '');
      let d = def.trim().replace(/^[\*\-_#\s]+|[\*\-_#\s]+$/g, '');

      // Check length and word count
      if (t.length < 2 || t.length > 55) return false;
      const tWords = t.split(/\s+/);
      if (tWords.length > 5) return false;

      // Disallow blacklisted subjects
      const tLower = t.toLowerCase();
      if (blacklistTerms.has(tLower)) return false;
      if (blacklistTerms.has(tWords[0].toLowerCase()) && tWords.length === 1) return false;

      // Disallow starting with conjunctions or prepositions
      if (/^(and|or|because|although|however|therefore|moreover|furthermore|in addition|for example|such as|according to|based on)\b/i.test(t)) {
        return false;
      }

      // Definition must be substantial
      if (d.length < 20) return false;
      const dWords = d.split(/\s+/).filter(Boolean);
      if (dWords.length < 4) return false;

      // Prevent circular definitions (e.g. "Biology is biology")
      if (dLower(d).startsWith(tLower + ' ') || dLower(d) === tLower) return false;

      // Reject all-caps codes or metadata
      if (/^[A-Z0-9][\w\-]{0,25}$/.test(d)) return false;
      if (d === d.toUpperCase() && d.length > 10) return false;

      return true;
    };

    function dLower(str) { return (str || '').toLowerCase(); }

    const joinedParagraphs = this.paragraphs.map(p => p.replace(/\n/g, ' '));

    const patterns = [
      // Markdown bold definition: **Term**: Definition or **Term** — Definition
      /\*\*(.+?)\*\*\s*(?:[-:—–]|is|are|means)\s*(.+?)(?:\.|$)/,
      // "Term: Definition" or "Term - Definition"
      /^([A-Z][\w\s]{2,40}?)\s*[-:—–]\s*([A-Z].+?)(?:\.|$)/,
      // "X is/are/was/were (a/an/the) ..."
      /(?:The\s+|A\s+|An\s+)?([A-Z][\w\s]{2,45}?)\s+(?:is|are|was|were)\s+(?:a|an|the)?\s*(.+?)(?:\.|$)/,
      // "X refers to / means / denotes / describes ..."
      /([A-Z][\w\s]{2,45}?)\s+(?:refers to|means|denotes|describes|is defined as|is known as)\s+(.+?)(?:\.|$)/,
    ];

    for (const ps of joinedParagraphs) {
      for (const p of patterns) {
        const m = ps.match(p);
        if (m) {
          const rawTerm = m[1].trim().replace(/^[\*\-_]+|[\*\-_]+$/g, '');
          const rawDef = (m[2] || '').trim().replace(/^[\*\-_]+|[\*\-_]+$/g, '');
          const termKey = rawTerm.toLowerCase();
          if (isValidDef(rawTerm, rawDef) && !(termKey in defs)) {
            defs[rawTerm] = rawDef.replace(/[.]+$/, '');
          }
        }
      }
    }

    return defs;
  }

  /* ─── Named Entities & Figures ─────────────────────────────────────── */
  extractNames() {
    const names = new Set();
    const blacklist = new Set(['Chapter', 'Section', 'Figure', 'Table', 'Slide', 'Page', 'Module', 'Unit', 'United States', 'New York', 'North America', 'Western Europe']);

    for (const s of this.sentences) {
      // With title/honorific (e.g. Dr. Alan Turing, Prof. Smith)
      const mHonorific = s.match(/\b(?:Dr\.|Mr\.|Mrs\.|Ms\.|Prof\.|President|King|Queen|Pope|Sir|Lord)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g);
      if (mHonorific) {
        for (const h of mHonorific) names.add(h.trim());
      }

      // Two consecutive capitalized words (names)
      const mNames = s.match(/\b([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,})\b/g);
      if (mNames) {
        for (const name of mNames) {
          const trimmed = name.trim();
          if (!blacklist.has(trimmed)) names.add(trimmed);
        }
      }
    }
    return Array.from(names).slice(0, 80);
  }

  extractFigures() {
    const figs = new Set();
    for (const s of this.sentences) {
      const m = s.match(/\b(?:\$?\d+(?:\.\d+)?%?|\d{4}s?)\b/gi);
      if (m) {
        for (const f of m) {
          if (f.length >= 2 && !/^(19|20)\d{2}$/.test(f) || /^\d{4}$/.test(f)) {
            figs.add(f.trim());
          }
        }
      }
    }
    return Array.from(figs).slice(0, 80);
  }

  /* ─── Key Terms ────────────────────────────────────────────────────── */
  findKeyTerms() {
    const freq = {};
    const matches = this.rawText.match(/\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,3})\b/g) || [];
    const stopWords = new Set(['The', 'This', 'That', 'These', 'Those', 'There', 'Here', 'What', 'When', 'Where', 'Why', 'How', 'Chapter', 'Section', 'Figure', 'Table', 'Slide', 'Page', 'Example']);

    for (const t of matches) {
      const key = t.trim();
      if (key.length > 2 && !stopWords.has(key)) {
        freq[key] = (freq[key] || 0) + 1;
      }
    }

    const minFreq = Object.keys(freq).length > 40 ? 2 : 1;
    return Object.entries(freq)
      .filter(([, v]) => v >= minFreq)
      .sort((a, b) => b[1] - a[1])
      .map(x => x[0])
      .slice(0, 120);
  }

  shortenAnswer(ans) {
    if (!ans) return ans;
    let clean = ans.trim();
    if (clean.length <= 160) return clean;
    const parts = clean.split(/(?<=[.!?])\s+/);
    return parts[0].length <= 160 ? parts[0] : parts[0].substring(0, 157) + '...';
  }

  _sampleSentences(perChunk = 3) {
    const sampled = [];
    for (const chunk of this.chunks) {
      const chunkText = chunk.join(' ').toLowerCase();
      const chunkSentences = this.sentences.filter(s =>
        this._isRealSentence(s) &&
        chunkText.includes(s.toLowerCase().substring(0, Math.min(40, s.length)))
      );
      sampled.push(...chunkSentences.slice(0, perChunk));
    }
    const seen = new Set();
    return sampled.filter(s => {
      const k = s.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  /* ─── Study Guide Generation ───────────────────────────────────────── */
  generateStudyGuide() {
    let output = '## Document Overview\n\n';

    // Section-based summary if sections exist
    if (this.sections.length > 1) {
      for (const sec of this.sections.slice(0, 8)) {
        output += `### ${sec.title}\n`;
        const lines = sec.content.split('\n')
          .map(l => l.trim())
          .filter(l => this._isRealSentence(l) || l.startsWith('-'))
          .slice(0, 3);
        for (const l of lines) {
          output += l.startsWith('-') ? `${l}\n` : `- ${l}\n`;
        }
        output += '\n';
      }
    } else {
      // Chunk-based fallback
      const overviewSentences = [];
      for (const chunk of this.chunks) {
        const chunkText = chunk.join(' ').toLowerCase();
        const candidate = this.sentences.find(s =>
          this._isRealSentence(s) &&
          s.length >= 40 &&
          chunkText.includes(s.toLowerCase().substring(0, Math.min(40, s.length)))
        );
        if (candidate) overviewSentences.push(candidate);
      }
      const realSentences = this.sentences.filter(s => this._isRealSentence(s));
      const overviewSet = overviewSentences.length >= 3 ? overviewSentences.slice(0, 10) : realSentences.slice(0, 8);
      for (const s of overviewSet) output += `- ${s}\n`;
      output += '\n';
    }

    // Key Definitions section
    const defEntries = Object.entries(this.definitions);
    if (defEntries.length > 0) {
      output += '## Key Definitions\n\n';
      for (const [k, v] of defEntries.slice(0, 35)) {
        output += `**${k}** — ${v}.\n\n`;
      }
    }

    // Key Terms section
    if (this.keyTerms.length > 0) {
      output += '## High-Yield Key Terms\n\n';
      output += this.keyTerms.slice(0, 30).map(t => `- ${t}`).join('\n');
      output += '\n';
    }

    return output.trim();
  }

  /* ─── Flashcards Generation ────────────────────────────────────────── */
  generateFlashcards(min = 15) {
    const cards = [];
    const seen = new Set();

    const addCard = (q, a, type = 'concept') => {
      if (!q || !a) return;
      const k = q.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        cards.push({ question: q, answer: a.replace(/[.]+$/, '') + '.', type });
      }
    };

    // 1. Definition-based cards with smart entity-aware questions
    for (const [term, def] of Object.entries(this.definitions)) {
      const q = this.formatQuestionForTerm(term, def);
      const cardType = this.isPerson(term, def) ? 'person' : 'definition';
      addCard(q, def, cardType);
    }

    // 2. Cloze & explanatory sentences from across whole document
    const sampled = this._sampleSentences(5);
    for (const s of sampled) {
      if (cards.length >= min * 3) break;
      if (s.length > 40 && s.length < 350) {
        const parts = s.split(/[,;:]/);
        if (parts.length > 1 && parts[0].trim().length > 18) {
          const lead = parts[0].trim();
          addCard(`What is true regarding "${lead}"?`, s, 'sentence');
        } else {
          addCard(`Explain the concept: "${s.substring(0, Math.min(60, s.length))}..."`, s, 'sentence');
        }
      }
    }

    // 3. Named person cards if not already defined
    for (const name of this.names) {
      if (cards.length >= min * 3) break;
      if (name.split(/\s+/).length >= 2) {
        addCard(`Who is ${name}?`, `A key historical/academic figure mentioned in the study material: ${name}`, 'person');
      }
    }

    return cards.slice(0, Math.max(min, cards.length));
  }

  /* ─── Multiple Choice with Contextual Distractor Generation ───────── */
  generateMultipleChoice(min = 15) {
    const flashcards = this.generateFlashcards(min + 20);

    // Group cards by type so distractors match the question type!
    const poolByType = {
      person: [],
      definition: [],
      sentence: [],
      concept: []
    };

    for (const fc of flashcards) {
      const ans = this.shortenAnswer(fc.answer);
      if (ans && ans.length > 5) {
        const type = fc.type || 'definition';
        if (!poolByType[type]) poolByType[type] = [];
        poolByType[type].push(ans);
      }
    }

    const generalPool = flashcards.map(fc => this.shortenAnswer(fc.answer)).filter(a => a && a.length > 5);

    const questions = [];
    for (const fc of flashcards) {
      if (questions.length >= min) break;
      const correct = this.shortenAnswer(fc.answer);
      if (!correct || correct.length < 5) continue;

      const type = fc.type || 'definition';
      let candidatePool = (poolByType[type] && poolByType[type].length >= 4) ? poolByType[type] : generalPool;
      candidatePool = candidatePool.filter(a => a !== correct);

      // Filter by length similarity if definition/sentence
      if (correct.length > 30) {
        const lengthSimilar = candidatePool.filter(a => Math.abs(a.length - correct.length) < 80);
        if (lengthSimilar.length >= 3) candidatePool = lengthSimilar;
      }

      shuffleArray(candidatePool);
      const distractors = candidatePool.slice(0, 3);
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
    const targetTerms = Object.keys(this.definitions).concat(this.keyTerms, this.names).filter(t => t.length >= 3);
    const sampled = this._sampleSentences(6);

    for (const s of sampled) {
      if (fibs.length >= min * 2) break;
      if (s.split(/\s+/).length < 7) continue;

      let chosen = null;
      for (const term of targetTerms) {
        const re = new RegExp('\\b' + escapeRegex(term) + '\\b', 'i');
        if (re.test(s)) {
          chosen = term;
          break;
        }
      }

      if (!chosen) continue;
      const blanked = s.replace(new RegExp('\\b' + escapeRegex(chosen) + '\\b', 'i'), '_____');
      if (blanked && blanked !== s) {
        fibs.push({ question: blanked, correct_answer: chosen });
      }
    }

    return dedupeByKey(fibs, 'question').slice(0, Math.max(min, fibs.length));
  }

  generateAll(min = 15) {
    return {
      summary: this.generateStudyGuide(),
      flashcards: this.generateFlashcards(min),
      multiple_choice: this.generateMultipleChoice(min),
      fill_in_the_blank: this.generateFillInTheBlank(min),
    };
  }
}

/* ─── Helpers ──────────────────────────────────────────────────────── */
function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function shuffleArray(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function dedupeByKey(items, key) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const k = (it[key] || '').toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(it); }
  }
  return out;
}

module.exports = TextAnalyzer;
