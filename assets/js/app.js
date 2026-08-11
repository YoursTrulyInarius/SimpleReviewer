/**
 * Simple Reviewer - Client-side JS
 * Handles text extraction, API communication, quiz engine, flashcards, and dark mode toggling.
 */

document.addEventListener('DOMContentLoaded', () => {
    initTheme();

    if (document.getElementById('drag-zone')) {
        initDashboard();
    }
    if (document.getElementById('reviewer-page')) {
        initReviewerPage();
    }
});

// Helper to shuffle an array (Fisher-Yates)
function shuffleArray(array) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

/* ==========================================
   Theme Management
   ========================================== */
function initTheme() {
    const themeToggle = document.getElementById('theme-toggle-checkbox');
    const currentTheme = localStorage.getItem('theme') || 'light';

    if (currentTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        if (themeToggle) themeToggle.checked = true;
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        if (themeToggle) themeToggle.checked = false;
    }

    if (themeToggle) {
        themeToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
            } else {
                document.documentElement.setAttribute('data-theme', 'light');
                localStorage.setItem('theme', 'light');
            }
        });
    }
}

/* ==========================================
   Dashboard Page (File Upload & Settings)
   ========================================== */
function initDashboard() {
    const dragZone = document.getElementById('drag-zone');
    const fileInput = document.getElementById('file-input');
    const uploadStatus = document.getElementById('upload-status');
    const statusText = document.getElementById('status-text');
    const progressBar = document.getElementById('progress-bar');

    loadReviewers();

    // Drag and Drop Events
    ['dragenter', 'dragover'].forEach(eventName => {
        dragZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dragZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragZone.classList.remove('dragover');
        }, false);
    });

    dragZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length) {
            handleMultipleFileUploads(files);
        }
    });

    dragZone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleMultipleFileUploads(e.target.files);
        }
    });
}

async function loadReviewers() {
    const loadingEl = document.getElementById('reviewer-loading');
    const emptyEl = document.getElementById('reviewer-empty');
    const listEl = document.getElementById('reviewer-list');

    if (!loadingEl || !emptyEl || !listEl) return;

    loadingEl.classList.remove('d-none');
    emptyEl.classList.add('d-none');
    listEl.classList.add('d-none');
    listEl.innerHTML = '';

    try {
        const response = await fetch('process.php?action=list_reviewers');
        const data = await response.json();

        loadingEl.classList.add('d-none');

        if (!data.success || !Array.isArray(data.reviewers) || data.reviewers.length === 0) {
            emptyEl.classList.remove('d-none');
            return;
        }

        listEl.classList.remove('d-none');
        data.reviewers.forEach(reviewer => {
            const card = document.createElement('div');
            card.className = 'col';
            card.innerHTML = `
                <div class="card h-100 reviewer-card border border-light-subtle" onclick="window.location.href='reviewer.html?id=${reviewer.id}'">
                    <div class="card-body d-flex flex-column justify-content-between p-3.5">
                        <div>
                            <div class="d-flex justify-content-between align-items-start mb-2.5">
                                <span class="badge bg-light text-primary border border-primary-subtle px-2 py-1"><i class="bi bi-file-earmark-text"></i> Reviewer</span>
                                <button type="button" class="btn btn-link p-0 text-muted hover-danger" onclick="event.stopPropagation(); deleteReviewer(${reviewer.id});" title="Delete Reviewer">
                                    <i class="bi bi-trash fs-5"></i>
                                </button>
                            </div>
                            <h5 class="card-title fw-bold text-truncate mb-1" title="${escapeHtml(reviewer.title)}">${escapeHtml(reviewer.title)}</h5>
                            <p class="text-muted small text-truncate mb-3" style="font-size: 0.8rem;">
                                File: ${escapeHtml(reviewer.original_filename)}
                            </p>
                        </div>
                        <div class="border-top pt-2.5 mt-2.5 d-flex justify-content-between align-items-center text-muted small">
                            <span><i class="bi bi-card-text me-1"></i> ${reviewer.flashcards_count} cards</span>
                            <span><i class="bi bi-question-circle me-1"></i> ${reviewer.questions_count} quiz items</span>
                        </div>
                    </div>
                </div>
            `;
            listEl.appendChild(card);
        });
    } catch (err) {
        console.error('Failed to load reviewers:', err);
        loadingEl.classList.add('d-none');
        emptyEl.classList.remove('d-none');
    }
}

function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}

function renderSummaryCards(markdownText) {
    if (!markdownText || !markdownText.trim()) {
        return '<div class="card p-4 text-center"><div class="alert alert-warning mb-0">No study guide was generated for this reviewer.</div></div>';
    }

    const html = parseMarkdown(markdownText);
    const sections = html.split(/(?=<h[1-3]>)/i).filter(Boolean);

    if (!sections.length) {
        return `<div class="card p-4 mb-4 section-box" style="background-color: var(--card-bg) !important; border: 1px solid var(--border-color);">${html}</div>`;
    }

    return sections.map(section => {
        const match = section.match(/^(<h[1-3]>.*?<\/h[1-3]>)([\s\S]*)$/i);
        const headingHtml = match ? match[1] : '';
        let bodyHtml = match ? match[2] : section;

        bodyHtml = bodyHtml.replace(/<ul>([\s\S]*?)<\/ul>/gi, (all, listHtml) => {
            const items = Array.from(listHtml.matchAll(/<li>([\s\S]*?)<\/li>/gi));
            return items.map(item => `<div class="definition-box mb-2">${item[1].trim()}</div>`).join('');
        });

        bodyHtml = bodyHtml.replace(/<p>\s*<strong>(.*?)<\/strong>\s*(?:&mdash;|—|–|-)\s*(.*?)<\/p>/gi, (all, term, def) => {
            return `<div class="definition-box mb-2"><strong>${term}</strong> — ${def}</div>`;
        });

        return `<div class="card mb-4 section-box" style="background-color: var(--card-bg) !important; border: 1px solid var(--border-color);">
                    <div class="card-body p-4">
                        ${headingHtml}
                        ${bodyHtml}
                    </div>
                </div>`;
    }).join('');
}

function parseMarkdown(text) {
    if (!text) return '';
    let result = escapeHtml(text);

    result = result.replace(/^####\s+(.*)$/gm, '<h4>$1</h4>');
    result = result.replace(/^###\s+(.*)$/gm, '<h3>$1</h3>');
    result = result.replace(/^##\s+(.*)$/gm, '<h2>$1</h2>');
    result = result.replace(/^#\s+(.*)$/gm, '<h1>$1</h1>');

    result = result.replace(/\*\*\*(.*?)\*\*\*/gs, '<strong><em>$1</em></strong>');
    result = result.replace(/\*\*(.*?)\*\*/gs, '<strong>$1</strong>');
    result = result.replace(/\*(.*?)\*/gs, '<em>$1</em>');
    result = result.replace(/`(.*?)`/gs, '<code>$1</code>');
    result = result.replace(/^>\s?(.*)$/gm, '<blockquote>$1</blockquote>');
    result = result.replace(/^---+$/gm, '<hr>');

    const lines = result.split(/\r?\n/);
    let output = '';
    let inUl = false;
    let inOl = false;

    for (let line of lines) {
        if (/^\s*[-\*\+]\s+/.test(line)) {
            if (!inUl) {
                output += '<ul>';
                inUl = true;
            }
            output += `<li>${line.replace(/^\s*[-\*\+]\s+/, '').trim()}</li>`;
            continue;
        }

        if (/^\s*\d+\.\s+/.test(line)) {
            if (!inOl) {
                output += '<ol>';
                inOl = true;
            }
            output += `<li>${line.replace(/^\s*\d+\.\s+/, '').trim()}</li>`;
            continue;
        }

        if (inUl) {
            output += '</ul>';
            inUl = false;
        }
        if (inOl) {
            output += '</ol>';
            inOl = false;
        }

        if (line.trim() === '') {
            output += '\n';
        } else {
            output += `<p>${line}</p>`;
        }
    }

    if (inUl) output += '</ul>';
    if (inOl) output += '</ol>';

    output = output.replace(/<p>\s*<\/p>/g, '');
    output = output.replace(/\n{2,}/g, '\n');

    return output;
}

async function initReviewerPage() {
    const reviewerId = getQueryParam('id');
    const loadingEl = document.getElementById('reviewer-loading');
    const errorEl = document.getElementById('reviewer-error');
    const contentEl = document.getElementById('reviewer-content');
    const titleEl = document.getElementById('reviewer-title');
    const metaEl = document.getElementById('reviewer-meta');
    const originalFileEl = document.getElementById('reviewer-original-filename');
    const createdAtEl = document.getElementById('reviewer-created-at');
    const flashcardsCountBadge = document.getElementById('flashcards-count-badge');
    const mcCountBadge = document.getElementById('mc-count-badge');
    const fibCountBadge = document.getElementById('fib-count-badge');
    const cardTotalIndex = document.getElementById('card-total-index');
    const reviewerIdInput = document.getElementById('card-reviewer-id');
    const deckWrapper = document.getElementById('flashcard-deck-wrapper');

    if (!reviewerId) {
        window.location.href = 'index.html';
        return;
    }

    try {
        const response = await fetch(`process.php?action=get_reviewer&id=${encodeURIComponent(reviewerId)}`);
        const data = await response.json();

        if (!data.success || !data.reviewer) {
            throw new Error(data.message || 'Reviewer not found.');
        }

        const reviewer = data.reviewer;
        const generatedAt = reviewer.created_at ? new Date(reviewer.created_at) : null;
        const formattedDate = generatedAt ? generatedAt.toLocaleString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        }) : '';

        const mcCount = reviewer.quiz_questions.filter(q => q.type === 'multiple_choice').length;
        const fibCount = reviewer.quiz_questions.filter(q => q.type === 'fill_in_the_blank').length;

        document.title = `${reviewer.title} - Simple Reviewer`;
        if (titleEl) titleEl.textContent = reviewer.title;
        if (createdAtEl) createdAtEl.textContent = formattedDate;
        if (originalFileEl) originalFileEl.textContent = reviewer.original_filename || '';
        if (flashcardsCountBadge) flashcardsCountBadge.textContent = reviewer.flashcards.length;
        if (mcCountBadge) mcCountBadge.textContent = mcCount;
        if (fibCountBadge) fibCountBadge.textContent = fibCount;
        if (cardTotalIndex) cardTotalIndex.textContent = reviewer.flashcards.length || 0;
        if (reviewerIdInput) reviewerIdInput.value = reviewer.id;

        if (metaEl) {
            metaEl.innerHTML = `
                <i class="bi bi-calendar3 me-1"></i> Generated on ${formattedDate}
                &nbsp;&bull;&nbsp;
                <i class="bi bi-card-text me-1"></i> ${reviewer.flashcards.length} Flashcards
                &nbsp;&bull;&nbsp;
                <i class="bi bi-question-circle me-1"></i> ${mcCount} Multiple Choice
                &nbsp;&bull;&nbsp;
                <i class="bi bi-pencil-square me-1"></i> ${fibCount} Fill in the Blank
            `;
        }

        const summaryContainer = document.getElementById('summary-content');
        if (summaryContainer) {
            summaryContainer.innerHTML = renderSummaryCards(reviewer.summary || '');
        }

        allFlashcards = reviewer.flashcards || [];
        allMCQuestions = reviewer.quiz_questions.filter(q => q.type === 'multiple_choice').map(q => ({
            ...q,
            choices: typeof q.choices === 'string' ? JSON.parse(q.choices || '[]') : q.choices || []
        }));
        allFIBQuestions = reviewer.quiz_questions.filter(q => q.type === 'fill_in_the_blank');

        renderFlashcardList();

        if (allFlashcards.length === 0 && deckWrapper) {
            deckWrapper.classList.add('d-none');
        }

        initFlashcards();
        initMultipleChoiceQuiz();
        initFillBlankQuiz();

        if (loadingEl) loadingEl.classList.add('d-none');
        if (errorEl) errorEl.classList.add('d-none');
        if (contentEl) contentEl.classList.remove('d-none');
    } catch (err) {
        console.error('Reviewer page load error:', err);
        if (loadingEl) loadingEl.classList.add('d-none');
        if (contentEl) contentEl.classList.add('d-none');
        if (errorEl) {
            errorEl.classList.remove('d-none');
            errorEl.innerHTML = `Error loading reviewer: ${escapeHtml(err.message || 'Unable to fetch reviewer.')} <a href="index.html" class="alert-link">Return to dashboard</a>.`;
        }
    }
}

function renderFlashcardList() {
    const listBody = document.getElementById('flashcard-list-body');
    const emptyNotice = document.getElementById('flashcard-list-empty');

    if (!listBody) return;
    listBody.innerHTML = '';

    if (!allFlashcards.length) {
        if (emptyNotice) emptyNotice.classList.remove('d-none');
        return;
    }

    if (emptyNotice) emptyNotice.classList.add('d-none');

    allFlashcards.forEach(card => {
        const item = document.createElement('div');
        item.className = 'card-list-item';
        item.innerHTML = `
            <span class="card-list-question">${escapeHtml(card.question)}</span>
            <span class="card-list-answer text-muted">${escapeHtml(card.answer)}</span>
        `;
        listBody.appendChild(item);
    });
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, function(m) { return map[m]; });
}

async function handleMultipleFileUploads(files) {
    const uploadStatus = document.getElementById('upload-status');
    const dragZone = document.getElementById('drag-zone');
    const fileStatusList = document.getElementById('file-status-list');

    const validExtensions = ['pdf', 'docx', 'pptx', 'txt', 'md'];
    const filesArray = Array.from(files);

    const targetFiles = filesArray.filter(f => validExtensions.includes(f.name.split('.').pop().toLowerCase()));
    const invalidFiles = filesArray.filter(f => !validExtensions.includes(f.name.split('.').pop().toLowerCase()));

    if (invalidFiles.length > 0) {
        Swal.fire({
            icon: 'warning',
            title: 'Unsupported Files Skipped',
            text: `Skipping files: ${invalidFiles.map(f => f.name).join(', ')}`,
            confirmButtonColor: '#4f46e5'
        });
    }
    if (targetFiles.length === 0) return;

    dragZone.classList.add('d-none');
    uploadStatus.classList.remove('d-none');

    if (fileStatusList) {
        fileStatusList.innerHTML = targetFiles.map((f, i) =>
            `<div id="fstatus-${i}" class="d-flex align-items-center gap-2 py-1 border-bottom" style="border-color: var(--border-color) !important;">
                <span id="ficon-${i}" class="text-muted" style="font-size:0.9rem;">&#9675;</span>
                <span class="text-truncate flex-grow-1" style="max-width: 220px;" title="${f.name}">${f.name}</span>
                <span id="fstep-${i}" class="text-muted ms-auto text-end" style="white-space: nowrap; font-size: 0.78rem; min-width: 120px;">queued</span>
            </div>`
        ).join('');
    }

    const setFileStatus = (i, icon, step) => {
        const ficon = document.getElementById(`ficon-${i}`);
        const fstep = document.getElementById(`fstep-${i}`);
        if (ficon) ficon.innerHTML = icon;
        if (fstep) fstep.textContent = step;
    };

    const extractedFiles = [];
    let failedFiles = [];

    for (let i = 0; i < targetFiles.length; i++) {
        const file = targetFiles[i];
        const extension = file.name.split('.').pop().toLowerCase();
        const title = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
        const baseProgress = Math.round((i / targetFiles.length) * 90);

        updateProgress(baseProgress + 2, `[${i + 1}/${targetFiles.length}] Reading: ${file.name}`);
        setFileStatus(i,
            '<span class="spinner-border spinner-border-sm text-primary" style="width:13px;height:13px;border-width:2px;"></span>',
            'extracting text...'
        );

        let fileText = '';
        try {
            if (extension === 'txt' || extension === 'md') fileText = await readTextFile(file);
            else if (extension === 'pdf') fileText = await readPdfFile(file);
            else if (extension === 'docx') fileText = await readDocxFile(file);
            else if (extension === 'pptx') fileText = await readPptxFile(file);
        } catch (err) {
            console.error(`Text extraction failed for ${file.name}:`, err);
        }

        const wordCount = fileText ? fileText.trim().split(/\s+/).filter(w => w.length > 0).length : 0;

        if (!fileText || wordCount === 0) {
            failedFiles.push(file.name);
            setFileStatus(i, '<i class="bi bi-x-circle-fill text-danger"></i>', 'no text found');
            continue;
        }

        extractedFiles.push({ title, filename: file.name, text: fileText.trim() });
        setFileStatus(i,
            '<span class="spinner-border spinner-border-sm text-warning" style="width:13px;height:13px;border-width:2px;"></span>',
            `${wordCount.toLocaleString()} words · ready`
        );
        updateProgress(baseProgress + 6, `[${i + 1}/${targetFiles.length}] Collected text from: ${title}`);
    }

    if (extractedFiles.length === 0) {
        updateProgress(100, 'No readable text was found in the selected files.');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1800);
        return;
    }

    const combinedContent = extractedFiles
        .map(item => `Document: ${item.title}\n${item.text}`)
        .join('\n\n---\n\n');

    const combinedTitle = extractedFiles.length > 1
        ? `${extractedFiles[0].title} + ${extractedFiles.length - 1} more`
        : extractedFiles[0].title;
    const originalFilename = extractedFiles.map(item => item.filename).join(', ');

    updateProgress(95, `Generating one reviewer from ${extractedFiles.length} file(s)...`);

    try {
        const response = await fetch('process.php?action=create_reviewer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: combinedTitle,
                original_filename: originalFilename,
                content: combinedContent,
                file_count: extractedFiles.length
            })
        });

        const result = await response.json();

        if (result.success) {
            updateProgress(100, `Completed! Reviewer created from ${extractedFiles.length} file(s). Redirecting to dashboard...`);
        } else {
            failedFiles.push(...extractedFiles.map(item => item.filename));
            updateProgress(100, `Review generation failed: ${(result.message || 'unknown error').substring(0, 60)}`);
        }
    } catch (netErr) {
        console.error('Backend error while generating combined reviewer:', netErr);
        failedFiles.push(...extractedFiles.map(item => item.filename));
        updateProgress(100, 'Connection error while generating reviewer.');
    }

    if (failedFiles.length > 0) {
        const failMsg = failedFiles.join(', ');
        console.warn('Files that could not be processed:', failMsg);
    }

    setTimeout(() => {
        window.location.href = 'index.html';
    }, 1800);
}


function updateProgress(percentage, text) {
    const statusText = document.getElementById('status-text');
    const progressBar = document.getElementById('progress-bar');
    if (statusText) statusText.innerText = text;
    if (progressBar) progressBar.style.width = percentage + '%';
}

/* File Readers */
function readTextFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (err) => reject(new Error('Failed to read TXT file: ' + err.message));
        reader.readAsText(file);
    });
}

function readPdfFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function() {
            try {
                // Configure PDFJS worker
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/vendor/pdf.worker.min.js';
                const arrayBuffer = this.result;
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let text = '';
                
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    
                    // Sort items top-to-bottom, left-to-right to improve layout extraction accuracy
                    const items = [...content.items];
                    items.sort((a, b) => {
                        const yDiff = b.transform[5] - a.transform[5];
                        if (Math.abs(yDiff) > 5) {
                            return yDiff; // Different lines
                        }
                        return a.transform[4] - b.transform[4]; // Same line, left to right
                    });

                    let lastY = null;
                    let pageText = '';
                    for (const item of items) {
                        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
                            pageText += '\n';
                        }
                        pageText += item.str + ' ';
                        lastY = item.transform[5];
                    }
                    text += pageText.trimEnd() + '\n\n';
                }
                resolve(text);
            } catch (err) {
                reject(new Error('Failed to extract text from PDF: ' + err.message));
            }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
    });
}

function readDocxFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function() {
            try {
                const arrayBuffer = this.result;
                const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
                resolve(result.value);
            } catch (err) {
                reject(new Error('Failed to extract text from DOCX: ' + err.message));
            }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
    });
}

function readPptxFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function() {
            try {
                const arrayBuffer = this.result;
                const zip = await loadPptxZip(arrayBuffer);
                const slidePaths = await getPptxSlidePaths(zip);

                if (slidePaths.length === 0) {
                    throw new Error('No slides found in PPTX');
                }

                const parser = new DOMParser();
                const slideTexts = [];

                for (const slidePath of slidePaths) {
                    if (!(await pptxHasEntry(zip, slidePath))) {
                        continue;
                    }

                        const slideXml = await pptxReadEntry(zip, slidePath);
                    const slideDoc = parser.parseFromString(slideXml, 'application/xml');
                    const slideText = extractTextFromPptxXml(slideDoc);

                    if (slideText) {
                        slideTexts.push(slideText);
                    }
                }

                if (slideTexts.length === 0) {
                    throw new Error('No readable text found inside PPTX slides');
                }

                resolve(slideTexts.join('\n\n'));
            } catch (err) {
                reject(new Error('Failed to extract text from PPTX: ' + err.message));
            }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
    });
}

async function loadPptxZip(arrayBuffer) {
    if (window.JSZip && typeof window.JSZip.loadAsync === 'function') {
        return await JSZip.loadAsync(arrayBuffer);
    }

    if (window.mammoth) {
        if (typeof window.mammoth.openArrayBuffer === 'function') {
            return window.mammoth.openArrayBuffer(arrayBuffer);
        }
        if (typeof window.mammoth.openZip === 'function') {
            return window.mammoth.openZip({ arrayBuffer });
        }
    }
    if (window.JSZip && typeof window.JSZip.loadAsync === 'function') {
        return await JSZip.loadAsync(arrayBuffer);
    }
    throw new Error('ZIP library is not available in the browser');
}

async function pptxHasEntry(zip, path) {
    path = path.replace(/^\/+/, '').replace(/\\/g, '/');
    if (typeof zip.exists === 'function') {
        return zip.exists(path);
    }
    if (typeof zip.file === 'function') {
        if (zip.file(path)) return true;
        if (path.startsWith('ppt/')) {
            return !!zip.file(path.replace(/^ppt\//, ''));
        }
        return false;
    }
    return false;
}

function extractTextFromPptxXml(xmlDoc) {
    // Collect text paragraph by paragraph so bullets / list items become
    // separate lines that TextAnalyzer can parse as individual sentences.
    const paragraphTexts = [];

    function collectParagraph(node) {
        const texts = [];
        function traverse(n) {
            if (!n) return;
            if (n.nodeType === Node.ELEMENT_NODE) {
                const name = (n.localName || n.nodeName || '').toLowerCase();
                if (name === 't') {
                    const t = (n.textContent || '').trim();
                    if (t) texts.push(t);
                    return;
                }
            }
            for (let child = n.firstChild; child; child = child.nextSibling) traverse(child);
        }
        traverse(node);
        return texts.join(' ');
    }

    function walkForParagraphs(node) {
        if (!node) return;
        if (node.nodeType === Node.ELEMENT_NODE) {
            const name = (node.localName || node.nodeName || '').toLowerCase();
            if (name === 'p') { // <a:p> paragraph element
                const pText = collectParagraph(node);
                if (pText) paragraphTexts.push(pText);
                return; // don't recurse into sub-paragraphs
            }
        }
        for (let child = node.firstChild; child; child = child.nextSibling) walkForParagraphs(child);
    }

    walkForParagraphs(xmlDoc.documentElement || xmlDoc);
    return paragraphTexts.join('\n');
}

async function pptxReadEntry(zip, path) {
    path = path.replace(/^\/+/, '').replace(/\\/g, '/');

    if (typeof zip.read === 'function') {
        return await zip.read(path, 'utf8');
    }
    if (typeof zip.file === 'function') {
        let entry = zip.file(path);
        if (!entry && path.startsWith('ppt/')) {
            entry = zip.file(path.replace(/^ppt\//, ''));
        }
        if (!entry) {
            throw new Error(`PPTX entry not found: ${path}`);
        }
        return await entry.async('text');
    }
    throw new Error('Unsupported PPTX ZIP object');
}

async function getPptxSlidePaths(zip) {
    const presentationPath = 'ppt/presentation.xml';
    const relsPath = 'ppt/_rels/presentation.xml.rels';
    const parser = new DOMParser();

    if (!(await pptxHasEntry(zip, presentationPath))) {
        return [];
    }

    const presentationXml = await pptxReadEntry(zip, presentationPath);
    const presentationDoc = parser.parseFromString(presentationXml, 'application/xml');
    const slideIdNodes = Array.from(presentationDoc.getElementsByTagName('*')).filter(node => node.localName === 'sldId');
    const slideRelIds = slideIdNodes.map(node => node.getAttribute('r:id')).filter(Boolean);
    const slidePaths = [];

    if (slideRelIds.length === 0 || !(await pptxHasEntry(zip, relsPath))) {
        for (let index = 1; index <= 200; index++) {
            const candidate = `ppt/slides/slide${index}.xml`;
            if (await pptxHasEntry(zip, candidate)) {
                slidePaths.push(candidate);
                continue;
            }
            if (index > 20) {
                break;
            }
        }
        return slidePaths;
    }

    const relsXml = await pptxReadEntry(zip, relsPath);
    const relsDoc = parser.parseFromString(relsXml, 'application/xml');
    const relationshipNodes = Array.from(relsDoc.getElementsByTagName('*')).filter(node => node.localName === 'Relationship');
    const relsMap = relationshipNodes.reduce((map, node) => {
        const id = node.getAttribute('Id');
        const target = node.getAttribute('Target');
        if (id && target) {
            map[id] = target;
        }
        return map;
    }, {});

    for (const relId of slideRelIds) {
        const target = relsMap[relId];
        if (!target) {
            continue;
        }
        let slidePath = target.replace(/^\/+/, '');
        if (!slidePath.startsWith('ppt/')) {
            slidePath = `ppt/${slidePath}`;
        }
        slidePaths.push(slidePath);
    }

    return slidePaths;
}

// Delete reviewer function
async function deleteReviewer(id) {
    const resultConfirm = await Swal.fire({
        title: 'Delete Reviewer?',
        text: 'All associated flashcards and quiz questions will be lost.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, delete it!',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b'
    });

    if (!resultConfirm.isConfirmed) {
        return;
    }
    
    try {
        const response = await fetch('process.php?action=delete_reviewer&id=' + id, {
            method: 'POST'
        });
        const result = await response.json();
        
        if (result.success) {
            location.reload();
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Error deleting reviewer: ' + (result.message || 'Unknown error'),
                confirmButtonColor: '#4f46e5'
            });
        }
    } catch (err) {
        console.error(err);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Network error.',
            confirmButtonColor: '#4f46e5'
        });
    }
}

/* ==========================================
   Flashcards Interface
   ========================================== */
let allFlashcards = [];
let flashcards = [];
let currentCardIndex = 0;

function initFlashcards() {
    const deck = document.getElementById('flashcard-deck');
    const frontText = document.getElementById('card-front-text');
    const backText = document.getElementById('card-back-text');
    const currentIndexEl = document.getElementById('card-current-index');
    const totalIndexEl = document.getElementById('card-total-index');
    const prevBtn = document.getElementById('card-prev-btn');
    const nextBtn = document.getElementById('card-next-btn');

    // Parse flashcards data embedded in page JSON script tag
    const flashcardsDataEl = document.getElementById('flashcards-data');
    if (flashcardsDataEl) {
        try {
            allFlashcards = JSON.parse(flashcardsDataEl.textContent);
            flashcards = shuffleArray([...allFlashcards]).slice(0, 15);
        } catch (e) {
            console.error('Failed to parse flashcards:', e);
        }
    }

    if (flashcards.length === 0) {
        if (deck) deck.style.display = 'none';
        return;
    }

    // Bind Flip Interaction
    deck.addEventListener('click', () => {
        deck.classList.toggle('is-flipped');
    });

    // Update UI
    updateFlashcardUI();

    // Nav Bindings
    prevBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Avoid flipping when clicking buttons
        if (currentCardIndex > 0) {
            currentCardIndex--;
            deck.classList.remove('is-flipped');
            setTimeout(updateFlashcardUI, deck.classList.contains('is-flipped') ? 300 : 0);
        }
    });

    nextBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Avoid flipping when clicking buttons
        if (currentCardIndex < flashcards.length - 1) {
            currentCardIndex++;
            deck.classList.remove('is-flipped');
            setTimeout(updateFlashcardUI, deck.classList.contains('is-flipped') ? 300 : 0);
        }
    });

    // Handle Manual Card Form Submission
    const addCardForm = document.getElementById('add-card-form');
    if (addCardForm) {
        addCardForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const reviewerId = document.getElementById('card-reviewer-id').value;
            const question = document.getElementById('card-question').value.trim();
            const answer = document.getElementById('card-answer').value.trim();

            if (!question || !answer) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Missing Fields',
                    text: 'Both Question and Answer fields are required.',
                    confirmButtonColor: '#4f46e5'
                });
                return;
            }

            try {
                const response = await fetch('process.php?action=add_flashcard', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reviewer_id: reviewerId, question, answer })
                });
                const result = await response.json();

                if (result.success) {
                    const modalEl = document.getElementById('addCardModal');
                    const modal = bootstrap.Modal.getInstance(modalEl);
                    if (modal) modal.hide();
                    
                    flashcards.push({ id: result.id, question, answer });
                    currentCardIndex = flashcards.length - 1;
                    deck.classList.remove('is-flipped');
                    updateFlashcardUI();
                    addCardForm.reset();
                    
                    // Show beautiful success notification
                    Swal.fire({
                        icon: 'success',
                        title: 'Card Added!',
                        showConfirmButton: false,
                        timer: 1000
                    });
                    
                    setTimeout(() => {
                        location.reload();
                    }, 1000);
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: 'Failed to add card: ' + result.message,
                        confirmButtonColor: '#4f46e5'
                    });
                }
            } catch (err) {
                console.error(err);
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'Connection error.',
                    confirmButtonColor: '#4f46e5'
                });
            }
        });
    }
}

function updateFlashcardUI() {
    const deck = document.getElementById('flashcard-deck');
    const frontText = document.getElementById('card-front-text');
    const backText = document.getElementById('card-back-text');
    const currentIndexEl = document.getElementById('card-current-index');
    const totalIndexEl = document.getElementById('card-total-index');
    const prevBtn = document.getElementById('card-prev-btn');
    const nextBtn = document.getElementById('card-next-btn');

    if (!flashcards.length) return;

    const currentCard = flashcards[currentCardIndex];
    frontText.innerText = currentCard.question;
    backText.innerText = currentCard.answer;

    currentIndexEl.innerText = currentCardIndex + 1;
    totalIndexEl.innerText = flashcards.length;

    // Disabled states
    prevBtn.disabled = currentCardIndex === 0;
    nextBtn.disabled = currentCardIndex === flashcards.length - 1;
}

/* ==========================================
   Multiple Choice Quiz
   ========================================== */
let allMCQuestions = [];
let mcQuestions = [];
let mcAnswers = {}; // Map question index -> choice index selected
let mcSubmitted = false;

function loadRandomMCQuestions() {
    if (!allMCQuestions.length) return;
    mcQuestions = shuffleArray([...allMCQuestions]).slice(0, 15).map(q => {
        let choices = [];
        try {
            choices = typeof q.choices === 'string' ? JSON.parse(q.choices) : q.choices;
        } catch(e) {
            choices = q.choices || [];
        }
        return {
            ...q,
            shuffledChoices: shuffleArray([...choices])
        };
    });
}

function initMultipleChoiceQuiz() {
    const container = document.getElementById('multiple-choice-container');
    const mcDataEl = document.getElementById('mc-questions-data');
    
    if (mcDataEl) {
        try {
            allMCQuestions = JSON.parse(mcDataEl.textContent);
            loadRandomMCQuestions();
        } catch (e) {
            console.error('Failed to parse multiple choice questions:', e);
        }
    }

    if (mcQuestions.length === 0) {
        container.innerHTML = '<div class="alert alert-warning">No multiple choice questions generated.</div>';
        return;
    }

    renderMCQuiz();

    // Check quiz action
    const submitBtn = document.getElementById('mc-submit-btn');
    const resetBtn = document.getElementById('mc-reset-btn');

    submitBtn.addEventListener('click', async () => {
        // Count unanswered questions
        let unanswered = 0;
        mcQuestions.forEach((q, idx) => {
            if (mcAnswers[idx] === undefined) unanswered++;
        });

        if (unanswered > 0) {
            const mcConfirm = await Swal.fire({
                title: 'Unanswered Questions',
                text: `You have ${unanswered} unanswered question(s). Submit anyway?`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Submit anyway',
                cancelButtonText: 'Keep editing',
                confirmButtonColor: '#4f46e5',
                cancelButtonColor: '#64748b'
            });
            if (!mcConfirm.isConfirmed) {
                return;
            }
        }

        mcSubmitted = true;
        gradeMCQuiz();
    });

    resetBtn.addEventListener('click', () => {
        mcAnswers = {};
        mcSubmitted = false;
        loadRandomMCQuestions(); // Generate a new fresh set of random questions!
        renderMCQuiz();
        
        // Hide result alert
        const resultAlert = document.getElementById('mc-result-alert');
        resultAlert.classList.add('d-none');
        
        // Toggle buttons
        submitBtn.classList.remove('d-none');
        resetBtn.innerText = 'Reset Quiz';
    });
}

function renderMCQuiz() {
    const quizBody = document.getElementById('mc-quiz-body');
    quizBody.innerHTML = '';

    mcQuestions.forEach((q, qIndex) => {
        const choices = q.shuffledChoices || [];
        const card = document.createElement('div');
        card.className = 'card mb-4';
        
        let choicesHTML = '';
        choices.forEach((choice, cIndex) => {
            const isSelected = mcAnswers[qIndex] === cIndex;
            let btnClass = 'quiz-choice-btn';
            let iconHTML = '';

            if (isSelected) {
                btnClass += ' selected';
            }

            // After submission classes
            if (mcSubmitted) {
                const isCorrectChoice = choice === q.correct_answer;
                const isUserChoice = mcAnswers[qIndex] === cIndex;

                if (isCorrectChoice) {
                    btnClass = 'quiz-choice-btn correct';
                    iconHTML = '<i class="bi bi-check-circle-fill text-success fs-5"></i>';
                } else if (isUserChoice) {
                    btnClass = 'quiz-choice-btn incorrect';
                    iconHTML = '<i class="bi bi-x-circle-fill text-danger fs-5"></i>';
                } else {
                    btnClass = 'quiz-choice-btn opacity-50';
                }
            }

            choicesHTML += `
                <button type="button" class="${btnClass}" ${mcSubmitted ? 'disabled' : ''} onclick="selectMCOption(${qIndex}, ${cIndex})">
                    <span><strong>${String.fromCharCode(65 + cIndex)}.</strong> ${choice}</span>
                    ${iconHTML}
                </button>
            `;
        });

        card.innerHTML = `
            <div class="card-header bg-transparent font-weight-medium">
                <span class="badge bg-secondary me-2">Q${qIndex + 1}</span>
                ${q.question}
            </div>
            <div class="card-body">
                ${choicesHTML}
            </div>
        `;
        quizBody.appendChild(card);
    });
}

window.selectMCOption = function(qIndex, cIndex) {
    if (mcSubmitted) return;
    mcAnswers[qIndex] = cIndex;
    
    // Re-render to update selected classes
    renderMCQuiz();
};

function gradeMCQuiz() {
    let score = 0;
    
    mcQuestions.forEach((q, qIndex) => {
        const choices = q.shuffledChoices || [];
        const selectedIndex = mcAnswers[qIndex];
        const selectedText = selectedIndex !== undefined ? choices[selectedIndex] : null;
        
        if (selectedText === q.correct_answer) {
            score++;
        }
    });

    // Re-render with styling
    renderMCQuiz();

    // Show Result Alert
    const resultAlert = document.getElementById('mc-result-alert');
    const resultScore = document.getElementById('mc-score-text');
    const percentage = Math.round((score / mcQuestions.length) * 100);
    
    resultScore.innerHTML = `You scored <strong>${score} / ${mcQuestions.length}</strong> (${percentage}%)`;
    resultAlert.className = `alert mt-4 ${percentage >= 70 ? 'alert-success' : 'alert-warning'}`;
    resultAlert.classList.remove('d-none');

    // Scroll to top of quiz to see score
    document.getElementById('multiple-choice-container').scrollIntoView({ behavior: 'smooth' });

    // Modify controls
    document.getElementById('mc-submit-btn').classList.add('d-none');
    document.getElementById('mc-reset-btn').innerText = 'Retake Quiz';
}

/* ==========================================
   Fill in the Blank Quiz
   ========================================== */
let allFIBQuestions = [];
let fibQuestions = [];
let fibSubmitted = false;

function loadRandomFIBQuestions() {
    if (!allFIBQuestions.length) return;
    fibQuestions = shuffleArray([...allFIBQuestions]).slice(0, 15);
}

function initFillBlankQuiz() {
    const container = document.getElementById('fill-blank-container');
    const fibDataEl = document.getElementById('fib-questions-data');

    if (fibDataEl) {
        try {
            allFIBQuestions = JSON.parse(fibDataEl.textContent);
            loadRandomFIBQuestions();
        } catch (e) {
            console.error('Failed to parse fill-in-the-blank questions:', e);
        }
    }

    if (fibQuestions.length === 0) {
        container.innerHTML = '<div class="alert alert-warning">No fill-in-the-blank questions generated.</div>';
        return;
    }

    renderFIBQuiz();

    const submitBtn = document.getElementById('fib-submit-btn');
    const resetBtn = document.getElementById('fib-reset-btn');

    submitBtn.addEventListener('click', () => {
        fibSubmitted = true;
        gradeFIBQuiz();
    });

    resetBtn.addEventListener('click', () => {
        fibSubmitted = false;
        loadRandomFIBQuestions(); // Generate a new fresh set of random questions!
        renderFIBQuiz();
        
        const resultAlert = document.getElementById('fib-result-alert');
        resultAlert.classList.add('d-none');
        
        submitBtn.classList.remove('d-none');
        resetBtn.innerText = 'Reset Quiz';
    });
}

function renderFIBQuiz() {
    const quizBody = document.getElementById('fib-quiz-body');
    quizBody.innerHTML = '';

    fibQuestions.forEach((q, qIndex) => {
        const card = document.createElement('div');
        card.className = 'card mb-4';

        // Split question text at ____ to place input field
        // Usually, the prompt produces questions with "____" or "_____"
        // We will replace sequences of underscores with a text input.
        const originalText = q.question;
        const underscoreRegex = /_{2,}/g;
        let formQuestionHTML = originalText;

        if (underscoreRegex.test(originalText)) {
            // Replaces the blank placeholder with an actual input tag
            let inputCount = 0;
            formQuestionHTML = originalText.replace(underscoreRegex, () => {
                inputCount++;
                return `<input type="text" 
                               class="fill-blank-input d-inline-block mx-2" 
                               style="max-width: 180px;" 
                               id="fib-${qIndex}-${inputCount}" 
                               ${fibSubmitted ? 'disabled' : ''} 
                               placeholder="type answer..." 
                               autocomplete="off">`;
            });
        } else {
            // Fallback: If no underscore in question, place the input box at the end
            formQuestionHTML = `${originalText} <br><input type="text" class="fill-blank-input mt-2 d-inline-block" id="fib-${qIndex}-1" ${fibSubmitted ? 'disabled' : ''} placeholder="Answer...">`;
        }

        let feedbackHTML = '';
        if (fibSubmitted) {
            feedbackHTML = `
                <div class="mt-2 text-muted" style="font-size: 0.9rem;">
                    Correct Answer: <strong class="text-success">${q.correct_answer}</strong>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="card-header bg-transparent font-weight-medium">
                <span class="badge bg-secondary me-2">Q${qIndex + 1}</span> Fill in the missing word:
            </div>
            <div class="card-body">
                <div style="line-height: 2.2;">${formQuestionHTML}</div>
                ${feedbackHTML}
            </div>
        `;
        quizBody.appendChild(card);
    });
}

function gradeFIBQuiz() {
    let score = 0;

    fibQuestions.forEach((q, qIndex) => {
        // Collect all inputs for this question (usually 1, but handles multiple placeholders)
        const inputElements = document.querySelectorAll(`[id^="fib-${qIndex}-"]`);
        let allCorrect = true;

        inputElements.forEach((inputEl) => {
            const rawUserAnswer = inputEl.value.trim().toLowerCase();
            const rawCorrectAnswer = q.correct_answer.trim().toLowerCase();

            // Simple comparison: ignore casing, punctuation or leading/trailing whitespace
            // We can strip extra spacing, symbols for better accuracy
            const cleanUser = rawUserAnswer.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
            const cleanCorrect = rawCorrectAnswer.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");

            if (cleanUser === cleanCorrect && cleanUser.length > 0) {
                inputEl.className = 'fill-blank-input correct d-inline-block mx-2';
            } else {
                inputEl.className = 'fill-blank-input incorrect d-inline-block mx-2';
                allCorrect = false;
            }
        });

        if (allCorrect && inputElements.length > 0) {
            score++;
        }
    });

    // Show results
    const resultAlert = document.getElementById('fib-result-alert');
    const resultScore = document.getElementById('fib-score-text');
    const percentage = Math.round((score / fibQuestions.length) * 100);

    // Re-render inputs to keep user entries but mark correct answers in feedback text block
    renderFIBQuizGraded();

    resultScore.innerHTML = `You scored <strong>${score} / ${fibQuestions.length}</strong> (${percentage}%)`;
    resultAlert.className = `alert mt-4 ${percentage >= 70 ? 'alert-success' : 'alert-warning'}`;
    resultAlert.classList.remove('d-none');

    document.getElementById('fill-blank-container').scrollIntoView({ behavior: 'smooth' });

    document.getElementById('fib-submit-btn').classList.add('d-none');
    document.getElementById('fib-reset-btn').innerText = 'Retake Quiz';
}

// Special render helper to retain typed answers when showing feedback
function renderFIBQuizGraded() {
    const quizBody = document.getElementById('fib-quiz-body');
    
    fibQuestions.forEach((q, qIndex) => {
        const inputElements = document.querySelectorAll(`[id^="fib-${qIndex}-"]`);
        const values = Array.from(inputElements).map(el => ({ id: el.id, val: el.value, class: el.className }));
        
        // Re-generate HTML with values and colors preserved
        const originalText = q.question;
        const underscoreRegex = /_{2,}/g;
        let formQuestionHTML = originalText;

        let inputIdx = 0;
        if (underscoreRegex.test(originalText)) {
            formQuestionHTML = originalText.replace(underscoreRegex, () => {
                inputIdx++;
                const stored = values[inputIdx - 1] || { val: '', class: 'fill-blank-input' };
                return `<input type="text" 
                               class="${stored.class}" 
                               style="max-width: 180px;" 
                               id="${stored.id}" 
                               value="${stored.val}"
                               disabled>`;
            });
        } else {
            const stored = values[0] || { val: '', class: 'fill-blank-input' };
            formQuestionHTML = `${originalText} <br><input type="text" class="${stored.class} mt-2" id="${stored.id}" value="${stored.val}" disabled>`;
        }

        const card = quizBody.children[qIndex];
        if (card) {
            card.querySelector('.card-body').innerHTML = `
                <div style="line-height: 2.2;">${formQuestionHTML}</div>
                <div class="mt-2 text-muted" style="font-size: 0.9rem;">
                    Correct Answer: <strong class="text-success">${q.correct_answer}</strong>
                </div>
            `;
        }
    });
}
