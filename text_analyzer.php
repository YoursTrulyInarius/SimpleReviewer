<?php
/**
 * Simple Reviewer - Text Analyzer Engine
 * Pure PHP NLP engine. No external API required.
 * Extracts sentences, key terms, definitions, names, figures, and generates study materials.
 */

class TextAnalyzer {

    private string $rawText;
    private array  $sentences   = [];
    private array  $paragraphs  = [];
    private array  $definitions = []; // [term => definition]
    private array  $keyTerms    = []; // [term => frequency]
    private array  $names       = []; // Unique names extracted
    private array  $figures     = []; // Numeric stats, years, figures extracted

    public function __construct(string $text) {
        $text              = $this->normalizeText($text);
        $this->rawText     = $text;
        $this->paragraphs  = $this->parseParagraphs($text);
        $this->sentences   = $this->parseSentences($text);
        $this->definitions = $this->findDefinitions();
        $this->extractNamesAndFigures();
        $this->keyTerms    = $this->findKeyTerms();
    }

    /**
     * Normalize special Unicode characters to plain ASCII equivalents.
     * This prevents regex byte-splitting of multibyte characters (em-dash, en-dash,
     * smart quotes, etc.) which causes orphan bytes rendered as '??' in the output.
     */
    private function normalizeText(string $text): string {
        // Ensure valid UTF-8 — replace any malformed bytes with a replacement char
        $text = mb_convert_encoding($text, 'UTF-8', 'UTF-8');

        // Typographic dashes → hyphen-minus
        $text = str_replace(["\u{2014}", "\u{2013}", "\u{2012}", "\u{2011}"], ' - ', $text);

        // Smart/curly quotes → straight quotes
        $text = str_replace(["\u{2018}", "\u{2019}"], "'", $text);
        $text = str_replace(["\u{201C}", "\u{201D}"], '"', $text);

        // Ellipsis → three dots
        $text = str_replace("\u{2026}", '...', $text);

        // Non-breaking space → regular space
        $text = str_replace("\u{00A0}", ' ', $text);

        // Bullet / list markers → normalize to leading hyphen bullets
        $text = str_replace(["\u{2022}", "\u{2023}", "\u{25E6}", "\u{2043}", "\u{2219}"], '- ', $text);

        // Normalize line endings
        $text = str_replace(["\r\n", "\r"], "\n", $text);

        // Add missing spacing after sentence-ending punctuation if the extractor removed whitespace.
        $text = preg_replace('/([.!?])(?=([A-Z0-9"\'\(\[]))/', '$1 ', $text);

        // Remove repeated duplicate content that often occurs in corrupted/extracted files.
        $text = $this->removeDuplicateContent($text);

        return $text;
    }

    private function removeDuplicateContent(string $text): string {
        $paragraphs = preg_split('/\n{2,}/', $text);
        $seen = [];
        $clean = [];

        foreach ($paragraphs as $paragraph) {
            $paragraph = trim(preg_replace('/\s+/', ' ', $paragraph));
            if ($paragraph === '') {
                continue;
            }

            $key = mb_strtolower($paragraph);
            if (isset($seen[$key])) {
                continue;
            }

            $seen[$key] = true;
            $clean[] = $this->collapseRepeatedPhraseSegments($paragraph);
        }

        return implode("\n\n", $clean);
    }

    private function collapseRepeatedPhraseSegments(string $text): string {
        $words = preg_split('/\s+/u', $text, -1, PREG_SPLIT_NO_EMPTY);
        if ($words === false || count($words) < 8) {
            return $text;
        }

        $count = count($words);
        for ($window = min(10, (int) floor($count / 2)); $window >= 3; $window--) {
            $i = 0;
            while ($i + 2 * $window <= $count) {
                $first = array_slice($words, $i, $window);
                $second = array_slice($words, $i + $window, $window);

                if ($first === $second) {
                    array_splice($words, $i + $window, $window);
                    $count -= $window;
                    $i = max(0, $i - 1);
                    continue;
                }
                $i++;
            }
        }

        return implode(' ', $words);
    }

    /* ===========================
       PARSING HELPERS
    =========================== */

    private function parseParagraphs(string $text): array {
        $paras = preg_split('/\n{2,}/', $text);
        $paras = array_map('trim', $paras);
        return array_values(array_filter($paras, fn($p) => strlen($p) > 20));
    }

    private function parseSentences(string $text): array {
        $sentences = [];
        $seen = [];

        // Pass 1: individual lines (captures list/bullet-style content like "Name - definition")
        $lines = explode("\n", $text);
        foreach ($lines as $line) {
            $line = trim(preg_replace('/[ \t]+/', ' ', $line));
            if ($this->isCaptionSentence($line)) {
                continue;
            }
            if (strlen($line) >= 15 && strlen($line) <= 800) {
                $key = strtolower($line);
                if (!isset($seen[$key])) {
                    $sentences[] = $line;
                    $seen[$key] = true;
                }
            }
        }

        // Pass 2: traditional sentence splitting on the full block
        $flat = preg_replace('/[ \t]+/', ' ', $text);
        $flat = preg_replace('/\n+/', ' ', $flat);
        $flat = trim($flat);
        $raw = preg_split('/(?<=[.!?])\s+(?=[A-Z"\(0-9])/', $flat);
        foreach ($raw as $s) {
            $s = trim($s);
            if ($this->isCaptionSentence($s)) {
                continue;
            }
            if (strlen($s) >= 20 && strlen($s) <= 600) {
                $key = strtolower($s);
                if (!isset($seen[$key])) {
                    $sentences[] = $s;
                    $seen[$key] = true;
                }
            }
        }

        return $sentences;
    }

    /* ===========================
       NAME & FIGURE EXTRACTION
    =========================== */

    private function extractNamesAndFigures(): void {
        $namesList = [];
        $figuresList = [];

        foreach ($this->sentences as $s) {
            // 1. Match names/titles (e.g. Dr. Jane Smith, John Doe, Marie Curie, Isaac Newton)
            // Look for patterns like Title + CapitalizedWords or multiple capitalized words
            preg_match_all('/\b(?:Dr\.|Mr\.|Mrs\.|Ms\.|Prof\.)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/', $s, $mNames);
            foreach ($mNames[0] as $name) {
                $name = trim($name);
                if (str_word_count($name) >= 2 && !$this->isGenericTerm($name)) {
                    $namesList[$name] = ($namesList[$name] ?? 0) + 1;
                }
            }

            // 2. Match figures (percentages, currencies, ranges, years)
            // e.g. "85%", "$10,000", "1945", "first", "million", "20.5%"
            preg_match_all('/\b(?:\$?\d+(?:\.\d+)?%?|\d{4}s?)\b|\b\d+\s+(?:percent|percentile|million|billion|trillion|meters|kg|miles)\b/i', $s, $mFigs);
            foreach ($mFigs[0] as $fig) {
                $fig = trim($fig);
                // Avoid capturing single isolated digits that are not informative
                if (strlen($fig) >= 2 && !preg_match('/^\d$/', $fig)) {
                    $figuresList[$fig] = ($figuresList[$fig] ?? 0) + 1;
                }
            }
        }

        // Sort by frequency and extract unique values
        arsort($namesList);
        arsort($figuresList);

        $this->names = array_slice(array_keys($namesList), 0, 50);
        $this->figures = array_slice(array_keys($figuresList), 0, 50);
    }

    /* ===========================
       KEY TERM EXTRACTION
    =========================== */

    private function findKeyTerms(): array {
        $freq = [];

        // 1. Multi-word capitalized phrases (e.g. "Civil War", "Photosynthesis Process")
        preg_match_all('/\b([A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,}){1,4})\b/', $this->rawText, $m1);
        foreach ($m1[1] as $t) {
            if ($this->isGenericTerm($t)) {
                continue;
            }
            $freq[$t] = ($freq[$t] ?? 0) + 1;
        }

        // 2. Single capitalized words appearing mid-sentence
        preg_match_all('/(?<=[a-z,;]\s)([A-Z][a-z]{3,20})\b/', $this->rawText, $m2);
        foreach ($m2[1] as $t) {
            if ($this->isGenericTerm($t)) {
                continue;
            }
            $freq[$t] = ($freq[$t] ?? 0) + 1;
        }

        // 3. Register definitions, names, and figures as high-value terms
        foreach (array_keys($this->definitions) as $term) {
            $freq[$term] = ($freq[$term] ?? 0) + 10;
        }
        foreach ($this->names as $name) {
            $freq[$name] = ($freq[$name] ?? 0) + 8;
        }
        foreach ($this->figures as $fig) {
            $freq[$fig] = ($freq[$fig] ?? 0) + 5;
        }

        // Filter: keep terms appearing multiple times (or boosted by category)
        $filtered = array_filter($freq, fn($c) => $c >= 2);
        arsort($filtered);

        return array_slice(array_keys($filtered), 0, 150);
    }

    /* ===========================
       DEFINITION EXTRACTION
    =========================== */

    private function findDefinitions(): array {
        $defs = [];

        // Patterns that signal a definition sentence
        $patterns = [
            // "X is a/an Y" or "X are Y"
            '/^(?:The\s+|A\s+|An\s+)?([A-Z][a-zA-Z\s.]{2,50}?)\s+(?:is|are|was|were)\s+(?:a|an|the)?\s*(.{15,300}?)\.$/mu',
            // "X refers to Y" / "X means Y" / "X is defined as Y"
            '/^(?:The\s+)?([A-Z][a-zA-Z\s.]{2,50}?)\s+(?:refers to|means|is defined as|is known as|is called)\s+(.{10,300}?)\.$/mu',
            // "X - Y" or "X — Y" (dash definitions; after normalization, all dashes become " - ")
            '/^([A-Z][a-zA-Z\s.]{2,40}?)\s*-\s*(.{15,300}?)\.?$/mu',
            // "X: Y"
            '/^([A-Z][a-zA-Z\s.]{2,40}?):\s*(.{15,300}?)\.?$/mu',
        ];

        foreach ($this->sentences as $sentence) {
            $sentence = trim($sentence);
            if ($this->isCaptionSentence($sentence)) {
                continue;
            }
            foreach ($patterns as $pattern) {
                if (preg_match($pattern, $sentence, $m)) {
                    $term = $this->cleanDefinitionTerm(trim($m[1]));
                    if ($this->isGenericTerm($term) || $this->isCaptionSentence($term)) {
                        continue;
                    }
                    $def  = $this->cleanDefinitionText(trim($m[2]));
                    $termWords = str_word_count($term);
                    if ($termWords >= 1 && $termWords <= 6 && strlen($def) >= 8 && !isset($defs[$term])) {
                        $defs[$term] = $def;
                    }
                }
            }
        }

        // Additional pass: detect headings followed by list/bullet lines and
        // convert them into a combined definition for the heading.
        $lines = preg_split('/\r?\n/', $this->rawText);
        $lineCount = count($lines);
        for ($i = 0; $i < $lineCount; $i++) {
            $line = trim($lines[$i]);
            if ($line === '') continue;

            $words = str_word_count($line);
            $isHeading = $words >= 1
                && $words <= 10
                && !preg_match('/[.!?]$/', $line)
                && preg_match('/^[A-Z0-9]/', $line)
                && !preg_match('/^\d+\.\s/', $line)
                && strlen($line) >= 3;

            if (!$isHeading) continue;

            // Collect following non-heading lines (likely bullets or keyed items)
            $parts = [];
            for ($j = $i + 1; $j < $lineCount; $j++) {
                $next = trim($lines[$j]);
                if ($next === '') break;

                $nextWords = str_word_count($next);
                $nextLooksLikeHeading = $nextWords >= 1
                    && $nextWords <= 10
                    && !preg_match('/[.!?]$/', $next)
                    && preg_match('/^[A-Z0-9]/', $next)
                    && !preg_match('/^\d+\.\s/', $next)
                    && strlen($next) >= 3;
                if ($nextLooksLikeHeading) break;

                // Remove common bullet markers and leading dashes
                $cleanNext = preg_replace('/^[\-\*\•\s]+/u', '', $next);
                if ($cleanNext === '') continue;

                // Keep lines that are key: value or reasonably informative
                if (strpos($cleanNext, ':') !== false || strlen($cleanNext) > 20) {
                    $parts[] = $cleanNext;
                }
            }

            if (!empty($parts)) {
                $heading = preg_replace('/^["\'\s]+|["\'\s]+$/', '', $line);
                $combined = implode(' ; ', array_map('trim', $parts));
                $combined = $this->cleanDefinitionText($combined);
                if (!isset($defs[$heading]) && strlen($combined) > 8) {
                    $defs[$heading] = $combined;
                }
            }
        }

        return $defs;
    }

    private function cleanDefinitionTerm(string $term): string {
        $term = trim($term);
        $term = preg_replace('/^(?:The|A|An)\s+/i', '', $term);
        $term = preg_replace('/\s+$/', '', $term);
        return $term;
    }

    private function cleanDefinitionText(string $definition): string {
        $definition = trim($definition);
        $definition = preg_replace('/[.]+$/', '', $definition);
        $definition = preg_replace('/^(?:is|are|was|were|refers to|means|is defined as|is known as|is called)\s+/i', '', $definition);
        $definition = preg_replace('/^(?:a|an|the)\s+/i', '', $definition);
        $definition = trim($definition);

        if (strlen($definition) < 8) {
            return 'A key concept explained in the text.';
        }

        return ucfirst($definition);
    }

    private function normalizeGlossaryDefinition(string $definition): string {
        $definition = trim(preg_replace('/\s+/', ' ', preg_replace('/[.]+$/', '', $definition)));
        return strtolower($definition);
    }

    private function termLooksLikePersonName(string $term): bool {
        return preg_match('/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$/', $term) === 1;
    }

    private function getPersonIndicatorRegex(): string {
        $words = [
            'born', 'died', 'married', 'wife', 'husband', 'son', 'daughter',
            'father', 'mother', 'brother', 'sister', 'spouse', 'career', 'life',
            'achievements', 'author', 'engineer', 'scientist', 'historian',
            'artist', 'leader', 'founder', 'creator', 'inventor', 'researcher',
            'politician', 'president', 'governor', 'senator', 'minister',
            'director', 'CEO', 'author', 'teacher', 'professor', 'doctor',
            'judge', 'captain', 'bishop', 'poet', 'composer', 'composer',
            'architect', 'journalist', 'editor', 'filmmaker', 'actor', 'actress',
            'coach', 'scientist', 'engineer', 'mathematician', 'philosopher'
        ];
        return '/\b(?:' . implode('|', array_map('preg_quote', $words)) . ')\b/i';
    }

    private function isGenericTerm(string $term): bool {
        $term = trim($term);
        if ($term === '') {
            return true;
        }

        $lower = mb_strtolower($term);
        $genericWords = [
            'figure', 'table', 'section', 'chapter', 'appendix', 'report', 'chart',
            'slide', 'page', 'item', 'document', 'summary', 'introduction', 'conclusion',
            'overview', 'note', 'notes', 'diagram', 'example', 'method', 'analysis',
            'result', 'results', 'problem', 'solution', 'context', 'data', 'study',
            'image', 'graph', 'form', 'model', 'world war', 'world war i', 'world war ii',
            'portrait', 'photograph', 'photo', 'painting', 'sketch', 'drawing', 'plate'
        ];

        if (in_array($lower, $genericWords, true)) {
            return true;
        }

        if (preg_match('/^(figure|table|slide|chapter|section|appendix|page|item)\s*\d+$/i', $term)) {
            return true;
        }

        if (preg_match('/^(fig|tbl|chart|sec|chap)\.?\s*\d+/i', $term)) {
            return true;
        }

        if (preg_match('/^\d+$/', $term) && strlen($term) < 4) {
            return true;
        }

        return false;
    }

    private function isCaptionSentence(string $sentence): bool {
        return preg_match('/\b(?:figure\s*\d+|fig\.?\s*\d+|portrait of|portrait|photo(?:graph)?|image|painting|plate|caption)\b/i', $sentence) === 1;
    }

    private function hasPersonDefinitionIndicators(string $definition): bool {
        return preg_match('/\b(?:born|died|born in|died in|married|wife|husband|son|daughter|career|life|achievements|author|engineer|scientist|historian|artist|leader|founder|creator|inventor|researcher|politician|president|governor|senator|minister|judge|doctor|professor|actor|actress|architect|journalist|editor|composer|poet|coach|served as|led|headed|founded|authored|wrote|published|created|known for|known as|was a|is a|was an|is an)\b/i', $definition) === 1;
    }

    private function isPersonTerm(string $term, string $definition = ''): bool {
        $term = trim($term);
        $definition = trim($definition);

        if ($term === '' || $this->isGenericTerm($term)) {
            return false;
        }

        if (preg_match('/\b(?:Dr|Mr|Mrs|Ms|Prof|Sir|Lady|Lord|Miss|Master|President|Governor|Senator|Judge|Captain|Chief|Colonel|Rev|Rabbi)\.?\b/i', $term)) {
            return true;
        }

        foreach ($this->names as $name) {
            if ($name === $term || stripos($name, $term) === 0 || stripos($name, " $term") !== false) {
                if ($definition !== '' && $this->hasPersonDefinitionIndicators($definition)) {
                    return true;
                }
            }
        }

        if ($definition !== '' && $this->hasPersonDefinitionIndicators($definition)) {
            return true;
        }

        return false;
    }

    /**
     * Build a context blob from every sentence that mentions this name, so
     * isPersonTerm() has something real to check for "born", "wrote",
     * "scientist", "was a", etc. — instead of being called with an empty
     * definition and defaulting to false for anyone without an explicit
     * Dr./Mr./Prof. title in front of their name.
     */
    private function getNameContext(string $name): string {
        $context = [];
        foreach ($this->sentences as $s) {
            if (stripos($s, $name) !== false) {
                $context[] = $s;
            }
            if (count($context) >= 5) break; // enough signal, keep it cheap
        }
        return implode(' ', $context);
    }

    private function isGenericLabel(string $term): bool {
        return preg_match('/^(?:figure|table|section|chapter|appendix|report|chart|slide|page|item|figure\s*\d+|table\s*\d+)$/i', trim($term)) === 1;
    }

    private function sentenceContainsOtherName(string $sentence, string $currentName): bool {
        foreach ($this->names as $name) {
            if ($name === $currentName) {
                continue;
            }
            if (stripos($sentence, $name) !== false) {
                return true;
            }
        }
        return false;
    }

    private function chooseQuestionTemplate(array $templates): string {
        shuffle($templates);
        return $templates[0];
    }

    private function isPersonWorkDescription(string $definition): bool {
        return preg_match('/\b(?:known for|known as|works? in|worked in|was a|is a|was an|is an|served as|led|headed|founded|authored|wrote|published|created|engineer|scientist|artist|historian|politician|president|governor|senator|minister|judge|doctor|professor|actor|actress|architect|journalist|researcher|inventor|composer|poet|coach)\b/i', $definition) === 1;
    }

    private function makeDefinitionQuestion(string $term, string $definition): string {
        if ($this->isPersonTerm($term, $definition)) {
            if ($this->isPersonWorkDescription($definition)) {
                return $this->chooseQuestionTemplate([
                    "What is $term known for?",
                    "What does $term do?",
                    "What work is $term known for?",
                    "How is $term described in this text?",
                    "What role does $term play in the report?"
                ]);
            }

            return $this->chooseQuestionTemplate([
                "Who is $term?",
                "What is $term known for?",
                "What role does $term play in this text?",
                "How is $term described in this report?",
                "Why is $term important in this passage?"
            ]);
        }

        if (preg_match('/^\d{4}$/', $term)) {
            return $this->chooseQuestionTemplate([
                "What significant event is linked to $term?",
                "What happened in $term?",
                "Why is the year $term important in this report?",
                "What does $term represent in this passage?"
            ]);
        }

        if ($this->isGenericLabel($term)) {
            return $this->chooseQuestionTemplate([
                "What does $term refer to in this report?",
                "How is $term described in the text?",
                "What does $term mean in this passage?"
            ]);
        }

        if (preg_match('/%|\$|\d+\s+(?:percent|million|billion|trillion)/i', $term)) {
            return $this->chooseQuestionTemplate([
                "What does the figure $term represent in the report?",
                "How is $term used in this passage?",
                "Why is $term important in the study material?"
            ]);
        }

        return $this->chooseQuestionTemplate([
            "How is $term defined in the text?",
            "What does $term mean in this report?",
            "Why is $term important in this passage?",
            "What key idea does $term represent?"
        ]);
    }

    private function summarizeText(string $text, int $maxChars = 140): string {
        $text = trim($text);
        if ($text === '') return '';

        // Prefer the first full sentence if available
        $parts = preg_split('/(?<=[.!?])\s+/', $text);
        $first = $parts[0] ?? $text;

        // Collapse repeated fragments inside the first sentence
        $first = $this->collapseRepeatedPhraseSegments($first);

        // If first sentence is too long, truncate gracefully
        if (strlen($first) > $maxChars) {
            $trunc = substr($first, 0, $maxChars);
            $lastSpace = strrpos($trunc, ' ');
            if ($lastSpace !== false) {
                $trunc = substr($trunc, 0, $lastSpace);
            }
            return rtrim($trunc) . '...';
        }

        return rtrim($first);
    }

    private function extractSummarySentences(int $limit = 4): array {
        $scored = [];

        foreach ($this->sentences as $sentence) {
            $sentence = trim($sentence);
            if ($sentence === '' || $this->isCaptionSentence($sentence)) {
                continue;
            }

            $score = $this->scoreSentence($sentence);
            if ($score <= 0) {
                continue;
            }

            $key = mb_strtolower(preg_replace('/\s+/', ' ', $sentence));
            if (isset($scored[$key])) {
                continue;
            }

            $scored[$key] = ['sentence' => $sentence, 'score' => $score];
        }

        usort($scored, fn($a, $b) => $b['score'] <=> $a['score']);

        return array_map(fn($item) => $item['sentence'], array_slice($scored, 0, $limit));
    }

    private function scoreSentence(string $sentence): int {
        $score = 1;

        $length = strlen($sentence);
        if ($length >= 50 && $length <= 200) {
            $score += 3;
        } elseif ($length > 200 && $length <= 300) {
            $score += 1;
        } elseif ($length < 40 || $length > 320) {
            $score -= 1;
        }

        foreach (array_keys($this->definitions) as $term) {
            if (preg_match('/\b' . preg_quote($term, '/') . '\b/i', $sentence)) {
                $score += 5;
            }
        }

        foreach ($this->names as $name) {
            if (stripos($sentence, $name) !== false) {
                $score += 3;
            }
        }

        foreach ($this->figures as $fig) {
            if (stripos($sentence, $fig) !== false) {
                $score += 2;
            }
        }

        foreach ($this->keyTerms as $term) {
            if (preg_match('/\b' . preg_quote($term, '/') . '\b/i', $sentence)) {
                $score += 2;
            }
        }

        if (preg_match('/\b(?:therefore|thus|however|in summary|overall|consequently|additionally)\b/i', $sentence)) {
            $score += 1;
        }

        return $score;
    }


    /* ===========================
       STUDY GUIDE GENERATOR
    =========================== */

    public function generateStudyGuide(): string {
        $output = '';
        $lines = explode("\n", $this->rawText);

        $sections       = [];
        $currentHeading = 'Overview';
        $currentLines   = [];

        foreach ($lines as $line) {
            $line = trim($line);
            if (empty($line)) continue;

            $words     = str_word_count($line);
            $isHeading = $words >= 1
                && $words <= 10
                && !preg_match('/[.!?,;]$/', $line)
                && preg_match('/^[A-Z0-9]/', $line)
                && !preg_match('/^\d+\.\s/', $line)
                && strlen($line) >= 3;

            if ($isHeading && !empty($currentLines)) {
                $sections[$currentHeading][] = implode(' ', $currentLines);
                $currentLines = [];
                $currentHeading = $line;
            } elseif (!$isHeading) {
                $currentLines[] = $line;
            }
        }
        if (!empty($currentLines)) {
            $sections[$currentHeading][] = implode(' ', $currentLines);
        }

        $summarySentences = $this->extractSummarySentences(4);
        if (!empty($summarySentences)) {
            $output .= "## Document Summary\n\n";
            foreach ($summarySentences as $sentence) {
                $output .= "- $sentence\n";
            }
            $output .= "\n";
        }

        $seenSentences = [];
        foreach ($sections as $heading => $paragraphs) {
            $output .= "## $heading\n\n";
            foreach ($paragraphs as $para) {
                $sents = $this->parseSentences($para);
                foreach ($sents as $s) {
                    $key = mb_strtolower($s);
                    if (isset($seenSentences[$key])) {
                        continue;
                    }
                    $seenSentences[$key] = true;
                    $output .= "- $s\n";
                }
                $output .= "\n";
            }
        }

        // Highlight names & figures in study guide
        if (!empty($this->names) || !empty($this->figures)) {
            $output .= "## Key Figures & Entities\n\n";
            if (!empty($this->names)) {
                $output .= "### Important Names & Organizations\n";
                foreach (array_slice($this->names, 0, 15) as $name) {
                    // Find a sentence that describes/contains this name
                    $context = "";
                    foreach ($this->sentences as $s) {
                        if (stripos($s, $name) !== false) {
                            $context = ": $s";
                            break;
                        }
                    }
                    $output .= "- **$name**$context\n";
                }
                $output .= "\n";
            }

            if (!empty($this->figures)) {
                $output .= "### Key Numbers, Dates & Statistics\n";
                foreach (array_slice($this->figures, 0, 15) as $fig) {
                    $context = "";
                    foreach ($this->sentences as $s) {
                        if (stripos($s, $fig) !== false) {
                            $context = ": $s";
                            break;
                        }
                    }
                    $output .= "- **$fig**$context\n";
                }
                $output .= "\n";
            }
        }

        // Append key definitions (show concise summaries, with a simple paraphrase and context)
        if (!empty($this->definitions)) {
            $output .= "## Key Definitions\n\n";
            foreach ($this->definitions as $term => $def) {
                $summary = $this->summarizeText($def, 140);
                $simple  = $this->summarizeText($this->cleanDefinitionText($def), 100);

                // Find a context sentence from the source that contains the term
                $context = '';
                foreach ($this->sentences as $s) {
                    if (preg_match('/\b' . preg_quote($term, '/') . '\b/i', $s)) {
                        $context = $this->summarizeText($s, 160);
                        break;
                    }
                }

                $output .= "**$term** — $summary\n\n";
                if (!empty($simple)) {
                    $output .= "Simple: $simple\n\n";
                }
                if (!empty($context)) {
                    $output .= "Context: $context\n\n";
                }
            }
        }

        // Glossary: single-word key terms with short definitions
        $glossTerms = [];
        foreach ($this->keyTerms as $kt) {
            if (count($glossTerms) >= 40) break;
            if (strpos($kt, ' ') !== false) continue; // only single-word terms
            $clean = trim($kt);
            if (strlen($clean) < 3 || strlen($clean) > 30) continue;
            if (isset($glossTerms[strtolower($clean)])) continue;

            // Prefer explicit definition if available
            if (isset($this->definitions[$clean])) {
                $def = $this->summarizeText($this->definitions[$clean], 120);
            } else {
                // Find a sentence that mentions the term
                $found = '';
                foreach ($this->sentences as $s) {
                    if (preg_match('/\b' . preg_quote($clean, '/') . '\b/i', $s)) {
                        $found = $this->summarizeText($s, 120);
                        break;
                    }
                }
                $def = $found ?: 'See context in the study guide.';
            }

            $glossTerms[strtolower($clean)] = ['term' => $clean, 'def' => $def];
        }

        if (!empty($glossTerms)) {
            $groupedGloss = [];
            foreach ($glossTerms as $g) {
                $norm = $this->normalizeGlossaryDefinition($g['def']);
                if (!isset($groupedGloss[$norm])) {
                    $groupedGloss[$norm] = ['terms' => [], 'def' => $g['def']];
                }
                $groupedGloss[$norm]['terms'][$g['term']] = true;
            }

            $output .= "## Glossary\n\n";
            foreach ($groupedGloss as $group) {
                $terms = array_keys($group['terms']);
                sort($terms, SORT_NATURAL | SORT_FLAG_CASE);
                $output .= "**" . implode(', ', $terms) . "** — {$group['def']}\n\n";
            }
        }

        if (trim($output) === '') {
            $output .= "## Document Summary\n\n";
            foreach ($this->sentences as $s) {
                $output .= "- $s\n";
            }
        }

        return trim($output);
    }

    /* ===========================
       FLASHCARD GENERATOR
    =========================== */

    public function generateFlashcards(int $min = 15): array {
        $cards = [];

        // 1. Definition pairs
        foreach ($this->definitions as $term => $def) {
            if ($this->isGenericTerm($term) || $this->isGenericLabel($term)) {
                continue;
            }

            $question = $this->makeDefinitionQuestion($term, $def);
            $cards[] = [
                'question' => $question,
                'answer'   => ucfirst($def) . (substr($def, -1) !== '.' ? '.' : '')
            ];
        }

        // 2. Specific questions about names/figures (highly accurate study helpers)
        foreach ($this->names as $index => $name) {
            if ($this->isGenericTerm($name)) {
                continue;
            }

            $isPerson = $this->isPersonTerm($name, $this->getNameContext($name));
            $questionTemplates = $isPerson
                ? [
                    "Who is $name?",
                    "What does the text say about $name?",
                    "Why is $name important in this summary?",
                    "How does $name relate to the main topic?",
                    "What role does $name play in the report?"
                ]
                : [
                    "Why does the report mention $name?",
                    "How is $name described in the passage?",
                    "What is the importance of $name in this text?",
                    "What role does $name play in the story?",
                    "How is $name used in the discussion?"
                ];

            foreach ($this->sentences as $s) {
                if (stripos($s, $name) === false || strlen($s) <= 40 || strlen($s) >= 250) {
                    continue;
                }
                if ($this->sentenceContainsOtherName($s, $name)) {
                    continue;
                }
                $cards[] = [
                    'question' => $questionTemplates[$index % count($questionTemplates)],
                    'answer'   => $s
                ];
                break; // one card per name
            }
        }

        // 3. Subject-Verb-Object sentence patterns
        foreach ($this->sentences as $sentence) {
            if (count($cards) >= $min * 3) break;

            if (preg_match(
                '/^((?:[A-Z][a-z]+\s+){1,4})(is|are|was|were|has|have|had|can|may|will|does)\s+(.{10,200}?[.!?])$/',
                $sentence, $m
            )) {
                $subject   = trim($m[1]);
                $verb      = $m[2];
                $predicate = trim($m[3]);

                if (strlen($subject) > 2 && strlen($predicate) > 8 && !$this->isGenericTerm($subject) && !$this->isGenericLabel($subject) && !isset($this->definitions[$subject]) && !in_array($subject, $this->names, true)) {
                    $formattedSubject = preg_match('/^[A-Z]/', $subject) ? $subject : strtolower($subject);
                    $cards[] = [
                        'question' => "What $verb $formattedSubject?",
                        'answer'   => $sentence
                    ];
                }
            }
        }

        return $this->deduplicateAndSlice($cards, $min);
    }

    /* ===========================
       MULTIPLE CHOICE GENERATOR
    =========================== */

    public function generateMultipleChoice(int $min = 15): array {
        $flashcards = $this->generateFlashcards($min + 25);
        $questions  = [];

        $answerPool = [];
        foreach ($flashcards as $fc) {
            $short = $this->shortenAnswer($fc['answer']);
            if (strlen($short) > 8) {
                $answerPool[] = $short;
            }
        }
        $answerPool = array_values(array_unique($answerPool));

        foreach ($flashcards as $fc) {
            if (count($questions) >= $min * 2) break;

            $correct = $this->shortenAnswer($fc['answer']);
            if (strlen($correct) < 8) continue;

            $pool = array_filter($answerPool, fn($a) => $a !== $correct);
            $pool = array_values(array_unique($pool));
            shuffle($pool);
            $distractors = array_slice($pool, 0, 3);

            if (count($distractors) < 3) continue;

            $choices = array_merge([$correct], $distractors);
            shuffle($choices);

            $questions[] = [
                'question'       => $fc['question'],
                'choices'        => array_values($choices),
                'correct_answer' => $correct
            ];
        }

        return $this->deduplicateAndSlice($questions, $min, 'question');
    }

    /* ===========================
       FILL IN THE BLANK GENERATOR
    =========================== */

    public function generateFillInTheBlank(int $min = 15): array {
        $fibs = [];

        // Blanks must prioritize names, dates, and definitions — avoid noisy figure labels.
        $priorityBlanks = array_unique(array_filter(array_merge(
            array_keys($this->definitions),
            $this->names
        ), fn($term) => !$this->isGenericTerm($term) && !$this->isGenericLabel($term)));

        // Shuffle priority list to distribute blanks
        shuffle($priorityBlanks);

        foreach ($this->sentences as $sentence) {
            if (count($fibs) >= $min * 3) break;
            $sentence = trim($sentence);
            if (strlen($sentence) < 30 || strlen($sentence) > 300) continue;

            $chosenTerm = null;

            // Look for a priority term
            foreach ($priorityBlanks as $term) {
                if (strlen($term) < 3) continue;
                if (preg_match('/\b' . preg_quote($term, '/') . '\b/i', $sentence)) {
                    $chosenTerm = $term;
                    break;
                }
            }

            if (!$chosenTerm) continue;

            // Replace term with blank
            $blanked = preg_replace(
                '/\b' . preg_quote($chosenTerm, '/') . '\b/i',
                '_____',
                $sentence,
                1,
                $count
            );

            if ($count === 0 || $blanked === $sentence) continue;

            $fibs[] = [
                'question'       => $blanked,
                'correct_answer' => $chosenTerm
            ];
        }

        // If we still need more blanks, fallback to standard key terms
        if (count($fibs) < $min) {
            foreach ($this->sentences as $sentence) {
                if (count($fibs) >= $min) break;
                foreach ($this->keyTerms as $term) {
                    if (strlen($term) < 3 || $this->isGenericTerm($term) || $this->isGenericLabel($term)) continue;
                    if (preg_match('/\b' . preg_quote($term, '/') . '\b/i', $sentence)) {
                        $blanked = preg_replace('/\b' . preg_quote($term, '/') . '\b/i', '_____', $sentence, 1, $count);
                        if ($count > 0 && $blanked !== $sentence) {
                            $fibs[] = [
                                'question'       => $blanked,
                                'correct_answer' => $term
                            ];
                            break;
                        }
                    }
                }
            }
        }

        return $this->deduplicateAndSlice($fibs, $min, 'question');
    }

    /* ===========================
       HELPERS
    =========================== */

    private function shortenAnswer(string $answer): string {
        if (strlen($answer) <= 150) return $answer;
        $parts = preg_split('/(?<=[.!?])\s+/', $answer, 2);
        return $parts[0];
    }

    private function deduplicateAndSlice(array $items, int $min, string $key = 'question'): array {
        $seen   = [];
        $unique = [];
        foreach ($items as $item) {
            $k = md5(strtolower($item[$key]));
            if (!isset($seen[$k])) {
                $seen[$k] = true;
                $unique[] = $item;
            }
        }
        return array_slice($unique, 0, max($min, count($unique)));
    }

    /* ===========================
       PUBLIC GENERATE ALL
    =========================== */

    public function generateAll(int $min = 15): array {
        return [
            'summary'           => $this->generateStudyGuide(),
            'flashcards'        => $this->generateFlashcards($min),
            'multiple_choice'   => $this->generateMultipleChoice($min),
            'fill_in_the_blank' => $this->generateFillInTheBlank($min),
        ];
    }
}
