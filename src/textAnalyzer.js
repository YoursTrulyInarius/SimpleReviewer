// Simplified JS port of the PHP TextAnalyzer class with similar public API
class TextAnalyzer {
  constructor(text) {
    this.rawText = this.normalizeText(String(text || ''));
    this.sentences = this.parseSentences(this.rawText);
    this.paragraphs = this.parseParagraphs(this.rawText);
    this.definitions = this.findDefinitions();
    this.names = this.extractNames();
    this.figures = this.extractFigures();
    this.keyTerms = this.findKeyTerms();
  }

  normalizeText(text) {
    text = text.replace(/\r\n|\r/g, '\n');
    text = text.replace(/[\u2014\u2013\u2012\u2011]/g, ' - ');
    text = text.replace(/[\u2018\u2019]/g, "'");
    text = text.replace(/[\u201C\u201D]/g, '"');
    text = text.replace(/\u2026/g, '...');
    text = text.replace(/\u00A0/g, ' ');
    return text;
  }

  parseParagraphs(text) {
    return text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 20);
  }

  parseSentences(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const sentences = [];
    const seen = new Set();

    for (const line of lines) {
      if (line.length >= 15 && line.length <= 800) {
        const key = line.toLowerCase();
        if (!seen.has(key)) { sentences.push(line); seen.add(key); }
      }
    }

    // split big blocks
    const flat = text.replace(/\n+/g, ' ');
    const raw = flat.split(/(?<=[.!?])\s+(?=[A-Z"\(0-9])/);
    for (const s of raw) {
      const t = s.trim();
      if (t.length >= 20 && t.length <= 600) {
        const key = t.toLowerCase();
        if (!seen.has(key)) { sentences.push(t); seen.add(key); }
      }
    }
    return sentences;
  }

  findDefinitions() {
    const defs = {};
    const patterns = [/(?:The\s+|A\s+|An\s+)?([A-Z][\w\s\.]{2,50}?)\s+(?:is|are|was|were)\s+(?:a|an|the)?\s*(.{15,300}?)\./m,
      /([A-Z][\w\s\.]{2,40}?)\s*[-:]\s*(.{15,300}?)\.?/m];

    for (const s of this.sentences) {
      for (const p of patterns) {
        const m = s.match(p);
        if (m) {
          const term = m[1].trim();
          const def = (m[2] || '').trim();
          if (term && def && !(term.toLowerCase() in defs)) defs[term] = def;
        }
      }
    }
    return defs;
  }

  extractNames() {
    const names = new Set();
    for (const s of this.sentences) {
      const m = s.match(/\b(?:Dr\.|Mr\.|Mrs\.|Ms\.|Prof\.)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g);
      if (m) for (const name of m) names.add(name.trim());
    }
    return Array.from(names).slice(0,50);
  }

  extractFigures() {
    const figs = new Set();
    for (const s of this.sentences) {
      const m = s.match(/\b(?:\$?\d+(?:\.\d+)?%?|\d{4}s?)\b/gi);
      if (m) for (const f of m) if (f.length>=2) figs.add(f);
    }
    return Array.from(figs).slice(0,50);
  }

  findKeyTerms() {
    const freq = {};
    const text = this.rawText;
    const m1 = text.match(/\b([A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,}){1,4})\b/g) || [];
    for (const t of m1) { const key = t.trim(); if (key.length>2) freq[key] = (freq[key]||0)+1; }
    const filtered = Object.entries(freq).filter(([k,v]) => v>=1).sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
    return filtered.slice(0,150);
  }

  shortenAnswer(ans) {
    if (!ans) return ans;
    if (ans.length <= 150) return ans;
    const parts = ans.split(/(?<=[.!?])\s+/);
    return parts[0];
  }

  generateStudyGuide() {
    const sentences = this.sentences.slice(0,6);
    let output = '## Document Summary\n\n';
    for (const s of sentences) output += `- ${s}\n`;
    if (Object.keys(this.definitions).length) {
      output += '\n## Key Definitions\n\n';
      for (const [k,v] of Object.entries(this.definitions)) {
        output += `**${k}** — ${v}\n\n`;
      }
    }
    return output.trim();
  }

  generateFlashcards(min=15) {
    const cards = [];
    for (const [term, def] of Object.entries(this.definitions)) {
      if (cards.length >= min*3) break;
      cards.push({ question: `What is ${term}?`, answer: def.replace(/[.]+$/,'') + '.' });
    }

    for (const name of this.names) {
      if (cards.length >= min*3) break;
      cards.push({ question: `Who is ${name}?`, answer: name });
    }

    // fallback: use sentences
    for (const s of this.sentences) {
      if (cards.length >= min) break;
      if (s.length>40 && s.length<250) cards.push({ question: s.split(/[.?!]/)[0]+'?', answer: s });
    }

    // dedupe
    const seen = new Set();
    const unique = [];
    for (const c of cards) {
      const k = (c.question||'').toLowerCase();
      if (!seen.has(k)) { seen.add(k); unique.push(c); }
    }
    return unique.slice(0, Math.max(min, unique.length));
  }

  generateMultipleChoice(min=15) {
    const flashcards = this.generateFlashcards(min+20);
    const answerPool = flashcards.map(fc => this.shortenAnswer(fc.answer)).filter(a=>a && a.length>8);
    const questions = [];
    for (const fc of flashcards) {
      if (questions.length >= min) break;
      const correct = this.shortenAnswer(fc.answer);
      if (!correct || correct.length < 8) continue;
      const pool = answerPool.filter(a=>a!==correct);
      shuffleArray(pool);
      const distractors = pool.slice(0,3);
      if (distractors.length<3) continue;
      const choices = [correct, ...distractors];
      shuffleArray(choices);
      questions.push({ question: fc.question, choices, correct_answer: correct });
    }
    return questions.slice(0, Math.max(min, questions.length));
  }

  generateFillInTheBlank(min=15) {
    const fibs = [];
    const priority = Object.keys(this.definitions).concat(this.names).slice(0,200);
    for (const s of this.sentences) {
      if (fibs.length >= min) break;
      let chosen = null;
      for (const term of priority) {
        if (term.length<3) continue;
        const re = new RegExp('\\b'+escapeRegex(term)+'\\b','i');
        if (re.test(s)) { chosen = term; break; }
      }
      if (!chosen) continue;
      const blanked = s.replace(new RegExp('\\b'+escapeRegex(chosen)+'\\b','i'),'_____');
      if (blanked && blanked !== s) fibs.push({ question: blanked, correct_answer: chosen });
    }
    return dedupeByKey(fibs,'question').slice(0, Math.max(min, fibs.length));
  }

  generateAll(min=15) {
    return {
      summary: this.generateStudyGuide(),
      flashcards: this.generateFlashcards(min),
      multiple_choice: this.generateMultipleChoice(min),
      fill_in_the_blank: this.generateFillInTheBlank(min),
    };
  }
}

// Helpers
function escapeRegex(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
function dedupeByKey(items,key){ const seen=new Set(); const out=[]; for(const it of items){ const k=(it[key]||'').toLowerCase(); if(!seen.has(k)){seen.add(k); out.push(it);} } return out; }
function shuffleArray(a){ for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

module.exports = TextAnalyzer;
