/**
 * Simple Reviewer - Client-side JS (v2.0 AI-Enhanced)
 * Handles advanced multi-format file extraction (PDF, DOCX, PPTX, TXT, MD),
 * local text processing pipeline, interactive 3D flashcards, quiz engines, and UI state.
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

// Helper: Fisher-Yates array shuffle
function shuffleArray(array) {
    const arr = [...array];
    let currentIndex = arr.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [arr[currentIndex], arr[randomIndex]] = [arr[randomIndex], arr[currentIndex]];
    }
    return arr;
}

// Helper: Escape HTML strings
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text || '').replace(/[&<>"']/g, m => map[m]);
}

// Helper: Format bytes to human readable string
function formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/* ==========================================================================
   Theme Management (Smooth Dark / Light Switch)
   ========================================================================== */
function initTheme() {
    const themeToggle = document.getElementById('theme-toggle-checkbox');
    const savedTheme = localStorage.getItem('theme') || 'light';

    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        if (themeToggle) themeToggle.checked = true;
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        if (themeToggle) themeToggle.checked = false;
    }

    if (themeToggle) {
        themeToggle.addEventListener('change', (e) => {
            const nextTheme = e.target.checked ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', nextTheme);
            localStorage.setItem('theme', nextTheme);
        });
    }
}

/* ==========================================================================
   Dashboard Page (File Staging, Upload & Reviewer Library)
   ========================================================================== */
let stagedFiles = [];
let allReviewersCache = [];

function initDashboard() {
    const dragZone = document.getElementById('drag-zone');
    const fileInput = document.getElementById('file-input');
    const stagedContainer = document.getElementById('staged-files-container');
    const clearStagedBtn = document.getElementById('clear-staged-btn');
    const processStagedBtn = document.getElementById('process-staged-btn');
    const searchInput = document.getElementById('reviewer-search');

    loadReviewers();

    if (!dragZone || !fileInput) return;

    // Drag-and-drop animations
    ['dragenter', 'dragover'].forEach(name => {
        dragZone.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(name => {
        dragZone.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragZone.classList.remove('dragover');
        }, false);
    });

    dragZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt.files && dt.files.length) {
            stageFiles(dt.files);
        }
    });

    dragZone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length) {
            stageFiles(e.target.files);
        }
    });

    if (clearStagedBtn) {
        clearStagedBtn.addEventListener('click', () => {
            stagedFiles = [];
            renderStagedFiles();
        });
    }

    if (processStagedBtn) {
        processStagedBtn.addEventListener('click', () => {
            if (stagedFiles.length > 0) {
                handleMultipleFileUploads(stagedFiles);
            }
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterReviewersList(e.target.value.trim().toLowerCase());
        });
    }
}

function stageFiles(fileList) {
    const validExtensions = ['pdf', 'docx', 'pptx', 'txt', 'md'];
    const filesArray = Array.from(fileList);
    const validFiles = [];
    const invalidFiles = [];

    filesArray.forEach(f => {
        const ext = f.name.split('.').pop().toLowerCase();
        if (validExtensions.includes(ext)) {
            // Avoid duplicate files in staging
            if (!stagedFiles.some(existing => existing.name === f.name && existing.size === f.size)) {
                validFiles.push(f);
            }
        } else {
            invalidFiles.push(f.name);
        }
    });

    if (invalidFiles.length > 0) {
        Swal.fire({
            icon: 'info',
            title: 'Unsupported Files Skipped',
            text: `Skipped: ${invalidFiles.join(', ')}. Supported formats: PDF, DOCX, PPTX, TXT, MD.`,
            confirmButtonColor: '#4f46e5'
        });
    }

    stagedFiles.push(...validFiles);
    renderStagedFiles();
}

function renderStagedFiles() {
    const stagedContainer = document.getElementById('staged-files-container');
    const stagedList = document.getElementById('staged-files-list');
    const stagedCount = document.getElementById('staged-count');

    if (!stagedContainer || !stagedList) return;

    if (stagedFiles.length === 0) {
        stagedContainer.classList.add('d-none');
        stagedList.innerHTML = '';
        if (stagedCount) stagedCount.textContent = '0';
        return;
    }

    stagedContainer.classList.remove('d-none');
    if (stagedCount) stagedCount.textContent = stagedFiles.length;

    stagedList.innerHTML = stagedFiles.map((file, idx) => {
        const ext = file.name.split('.').pop().toLowerCase();
        let iconClass = 'bi-file-earmark-text';
        let chipClass = 'txt';
        if (ext === 'pdf') { iconClass = 'bi-filetype-pdf'; chipClass = 'pdf'; }
        else if (ext === 'docx') { iconClass = 'bi-filetype-docx'; chipClass = 'docx'; }
        else if (ext === 'pptx') { iconClass = 'bi-filetype-pptx'; chipClass = 'pptx'; }
        else if (ext === 'md') { iconClass = 'bi-filetype-md'; chipClass = 'md'; }

        return `
            <div class="staged-file-card">
                <span class="format-chip ${chipClass} p-1.5 fs-6"><i class="bi ${iconClass}"></i></span>
                <div class="text-truncate flex-grow-1">
                    <div class="fw-semibold text-truncate small">${escapeHtml(file.name)}</div>
                    <div class="text-muted" style="font-size: 0.75rem;">${formatBytes(file.size)}</div>
                </div>
                <button type="button" class="btn btn-link btn-sm text-muted hover-danger p-0" onclick="removeStagedFile(${idx})" title="Remove file">
                    <i class="bi bi-x-circle fs-6"></i>
                </button>
            </div>
        `;
    }).join('');
}

window.removeStagedFile = function(index) {
    stagedFiles.splice(index, 1);
    renderStagedFiles();
};

/* ==========================================================================
   Reviewer Library Loading & Rendering
   ========================================================================== */
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
            updateTopStats(0, 0, 0);
            return;
        }

        allReviewersCache = data.reviewers;
        listEl.classList.remove('d-none');
        renderReviewerCards(allReviewersCache);

        // Update stats banner
        let totalCards = 0;
        let totalQuizzes = 0;
        allReviewersCache.forEach(r => {
            totalCards += parseInt(r.flashcards_count || 0, 10);
            totalQuizzes += parseInt(r.questions_count || 0, 10);
        });
        updateTopStats(allReviewersCache.length, totalCards, totalQuizzes);
    } catch (err) {
        console.error('Failed to load reviewers:', err);
        loadingEl.classList.add('d-none');
        emptyEl.classList.remove('d-none');
    }
}

function updateTopStats(reviewersCount, cardsCount, quizCount) {
    const revEl = document.getElementById('stat-reviewers-count');
    const cardEl = document.getElementById('stat-cards-count');
    const quizEl = document.getElementById('stat-quiz-count');
    if (revEl) revEl.textContent = reviewersCount;
    if (cardEl) cardEl.textContent = cardsCount;
    if (quizEl) quizEl.textContent = quizCount;
}

function renderReviewerCards(reviewers) {
    const listEl = document.getElementById('reviewer-list');
    const emptyEl = document.getElementById('reviewer-empty');
    if (!listEl) return;

    listEl.innerHTML = '';

    if (reviewers.length === 0) {
        if (emptyEl) emptyEl.classList.remove('d-none');
        return;
    }
    if (emptyEl) emptyEl.classList.add('d-none');

    reviewers.forEach(reviewer => {
        const cardCol = document.createElement('div');
        cardCol.className = 'col';

        // Detect icon based on original file extension
        const orig = (reviewer.original_filename || '').toLowerCase();
        let iconClass = 'bi-journal-text';
        let chipType = 'txt';
        if (orig.includes('.pdf')) { iconClass = 'bi-filetype-pdf'; chipType = 'pdf'; }
        else if (orig.includes('.docx')) { iconClass = 'bi-filetype-docx'; chipType = 'docx'; }
        else if (orig.includes('.pptx')) { iconClass = 'bi-filetype-pptx'; chipType = 'pptx'; }
        else if (orig.includes('.md')) { iconClass = 'bi-filetype-md'; chipType = 'md'; }

        // Relative date or formatted date
        let dateStr = 'Recently';
        if (reviewer.created_at) {
            const dateObj = new Date(reviewer.created_at);
            dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }

        cardCol.innerHTML = `
            <div class="card reviewer-card h-100" onclick="window.location.href='reviewer.html?id=${reviewer.id}'">
                <div class="card-body p-3.5 d-flex flex-column justify-content-between">
                    <div>
                        <div class="d-flex justify-content-between align-items-start mb-2.5">
                            <span class="format-chip ${chipType}">
                                <i class="bi ${iconClass}"></i> ${chipType.toUpperCase()}
                            </span>
                            <button type="button" class="btn btn-link p-0 text-muted hover-danger" onclick="event.stopPropagation(); deleteReviewer(${reviewer.id});" title="Delete Reviewer">
                                <i class="bi bi-trash fs-6"></i>
                            </button>
                        </div>
                        <h5 class="fw-bold text-truncate mb-1" title="${escapeHtml(reviewer.title)}">${escapeHtml(reviewer.title)}</h5>
                        <p class="text-muted small text-truncate mb-3" style="font-size: 0.78rem;">
                            <i class="bi bi-paperclip me-1"></i>${escapeHtml(reviewer.original_filename || 'Direct Text')}
                        </p>
                    </div>
                    
                    <div class="border-top pt-2.5 mt-2.5 d-flex justify-content-between align-items-center text-muted small" style="font-size: 0.8rem;">
                        <span class="badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-1">
                            <i class="bi bi-layers-fill me-1"></i>${reviewer.flashcards_count} cards
                        </span>
                        <span><i class="bi bi-patch-question me-1"></i>${reviewer.questions_count} quiz items</span>
                        <span><i class="bi bi-clock me-1"></i>${dateStr}</span>
                    </div>
                </div>
            </div>
        `;
        listEl.appendChild(cardCol);
    });
}

function filterReviewersList(query) {
    if (!query) {
        renderReviewerCards(allReviewersCache);
        return;
    }
    const filtered = allReviewersCache.filter(r => {
        const titleMatch = (r.title || '').toLowerCase().includes(query);
        const fileMatch = (r.original_filename || '').toLowerCase().includes(query);
        return titleMatch || fileMatch;
    });
    renderReviewerCards(filtered);
}

/* ==========================================================================
   Multi-file Extraction Pipeline
   ========================================================================== */
async function handleMultipleFileUploads(files) {
    const uploadStatus = document.getElementById('upload-status');
    const dragZone = document.getElementById('drag-zone');
    const stagedContainer = document.getElementById('staged-files-container');
    const fileStatusList = document.getElementById('file-status-list');

    const validExtensions = ['pdf', 'docx', 'pptx', 'txt', 'md'];
    const filesArray = Array.from(files);
    const targetFiles = filesArray.filter(f => validExtensions.includes(f.name.split('.').pop().toLowerCase()));

    if (targetFiles.length === 0) return;

    if (dragZone) dragZone.classList.add('d-none');
    if (stagedContainer) stagedContainer.classList.add('d-none');
    if (uploadStatus) uploadStatus.classList.remove('d-none');

    if (fileStatusList) {
        fileStatusList.innerHTML = targetFiles.map((f, i) =>
            `<div id="fstatus-${i}" class="d-flex align-items-center gap-2 py-1.5 border-bottom" style="border-color: var(--border-color) !important;">
                <span id="ficon-${i}" class="text-muted"><i class="bi bi-hourglass-split"></i></span>
                <span class="text-truncate flex-grow-1" style="max-width: 210px;" title="${f.name}">${f.name}</span>
                <span id="fstep-${i}" class="text-muted ms-auto text-end" style="white-space: nowrap; font-size: 0.78rem;">Queued</span>
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
    const failedFiles = [];

    for (let i = 0; i < targetFiles.length; i++) {
        const file = targetFiles[i];
        const extension = file.name.split('.').pop().toLowerCase();
        const title = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
        const baseProgress = Math.round((i / targetFiles.length) * 80);

        updateProgress(baseProgress + 5, `Reading & parsing: ${file.name}`, 'Extracting layout, definitions & lecture hierarchy...');
        setFileStatus(i, '<span class="spinner-border spinner-border-sm text-primary" style="width:13px;height:13px;"></span>', 'Reading structure...');

        let fileText = '';
        try {
            if (extension === 'txt' || extension === 'md') {
                fileText = await readTextFile(file);
            } else if (extension === 'pdf') {
                fileText = await readPdfFile(file);
            } else if (extension === 'docx') {
                fileText = await readDocxFile(file);
            } else if (extension === 'pptx') {
                fileText = await readPptxFile(file);
            }
        } catch (err) {
            console.error(`Text extraction failed for ${file.name}:`, err);
        }

        const wordCount = fileText ? fileText.trim().split(/\s+/).filter(w => w.length > 0).length : 0;

        if (!fileText || wordCount === 0) {
            failedFiles.push(file.name);
            setFileStatus(i, '<i class="bi bi-x-circle-fill text-danger"></i>', 'No readable text');
            continue;
        }

        extractedFiles.push({ title, filename: file.name, text: fileText.trim() });
        setFileStatus(i, '<i class="bi bi-check-circle-fill text-success"></i>', `${wordCount.toLocaleString()} words`);
        updateProgress(baseProgress + 15, `Parsed: ${file.name}`, 'Analyzing key entities and concepts...');
    }

    if (extractedFiles.length === 0) {
        updateProgress(100, 'Extraction Failed', 'No readable text found in selected files.');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
        return;
    }

    const combinedContent = extractedFiles
        .map(item => `# Document: ${item.title}\n\n${item.text}`)
        .join('\n\n---\n\n');

    const combinedTitle = extractedFiles.length > 1
        ? `${extractedFiles[0].title} (+${extractedFiles.length - 1} more)`
        : extractedFiles[0].title;
    const originalFilename = extractedFiles.map(item => item.filename).join(', ');

    updateProgress(85, 'Running Natural Language Analysis', 'Generating study guide, flashcards, and quizzes...');

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
            updateProgress(100, 'Study Deck Generated!', 'Reviewer created successfully. Redirecting to workspace...');
            setTimeout(() => {
                window.location.href = `reviewer.html?id=${result.id}`;
            }, 1000);
            return;
        } else {
            updateProgress(100, 'Generation Error', result.message || 'Error creating study deck.');
        }
    } catch (netErr) {
        console.error('Backend error while generating reviewer:', netErr);
        updateProgress(100, 'Connection Error', 'Failed to communicate with processing server.');
    }

    setTimeout(() => {
        window.location.href = 'index.html';
    }, 2500);
}

function updateProgress(percentage, text, subText = '') {
    const statusText = document.getElementById('status-text');
    const subStatusText = document.getElementById('sub-status-text');
    const progressBar = document.getElementById('progress-bar');
    if (statusText) statusText.textContent = text;
    if (subStatusText && subText) subStatusText.textContent = subText;
    if (progressBar) progressBar.style.width = percentage + '%';
}

/* ==========================================================================
   Upgraded File Parsers (PDF, DOCX, PPTX, TXT)
   ========================================================================== */

/**
 * 1. Plain Text / Markdown Reader
 * Cleans UTF-8 BOM, normalizes line endings and control characters.
 */
function readTextFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            let text = e.target.result || '';
            // Strip BOM
            if (text.charCodeAt(0) === 0xFEFF) {
                text = text.substring(1);
            }
            // Normalize CRLF to LF
            text = text.replace(/\r\n|\r/g, '\n');
            // Remove null and unprintable ASCII control codes (preserve tabs and newlines)
            text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
            resolve(text);
        };
        reader.onerror = (err) => reject(new Error('Failed to read TXT/MD file: ' + err.message));
        reader.readAsText(file);
    });
}

/**
 * 2. Advanced Multi-Column PDF Reader
 * Features:
 * - Detects 2-column academic/slide layouts to prevent line interleaving
 * - Calculates coordinate horizontal gaps to prevent mashed or split words
 * - Automatically stitches line-end hyphenated words (e.g. "differ-\nent" -> "different")
 * - Filters repeating header/footer page numbers and disclaimers
 * - Accurately inserts paragraph breaks based on vertical spacing
 */
function readPdfFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function() {
            try {
                if (!window.pdfjsLib) throw new Error('PDF.js library is not available');
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/vendor/pdf.worker.min.js';
                const arrayBuffer = this.result;
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                const pageTexts = [];

                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const viewport = page.getViewport({ scale: 1.0 });
                    const content = await page.getTextContent();
                    const pageWidth = viewport.width;
                    const pageHeight = viewport.height;

                    if (!content.items || content.items.length === 0) continue;

                    // Clean items with normalized Y (0 is top)
                    const items = content.items.map(item => {
                        const tx = item.transform;
                        const x = tx[4];
                        const y = pageHeight - tx[5];
                        const height = Math.abs(tx[0]) || Math.abs(tx[3]) || item.height || 12;
                        const width = item.width || (item.str.length * (height * 0.5));
                        return {
                            str: item.str,
                            x,
                            y,
                            width,
                            height,
                            hasEOL: item.hasEOL
                        };
                    }).filter(it => it.str.trim().length > 0);

                    if (items.length === 0) continue;

                    // Filter out header/footer noise (top 5% or bottom 5% page numbers)
                    const contentItems = items.filter(it => {
                        const isHeader = it.y < pageHeight * 0.05;
                        const isFooter = it.y > pageHeight * 0.95;
                        const isPageNum = /^(?:page\s*)?\d+(?:\s*(?:\/|of)\s*\d+)?$/i.test(it.str.trim());
                        return !((isHeader || isFooter) && (isPageNum || it.str.trim().length < 8));
                    });

                    // Multi-column layout detection: check if there's a middle gutter
                    const midX = pageWidth / 2;
                    let leftCount = 0;
                    let rightCount = 0;
                    let overlapCount = 0;

                    for (const it of contentItems) {
                        const itemEnd = it.x + it.width;
                        if (itemEnd < midX + 15) leftCount++;
                        else if (it.x > midX - 15) rightCount++;
                        else overlapCount++;
                    }

                    const isTwoColumn = (leftCount > 8 && rightCount > 8 && overlapCount < (leftCount + rightCount) * 0.25);

                    const extractColumnText = (colItems) => {
                        colItems.sort((a, b) => {
                            const yDiff = a.y - b.y;
                            if (Math.abs(yDiff) > a.height * 0.55) return yDiff;
                            return a.x - b.x;
                        });

                        let colText = '';
                        let prevItem = null;

                        for (const it of colItems) {
                            if (!prevItem) {
                                colText += it.str;
                                prevItem = it;
                                continue;
                            }

                            const yDiff = it.y - prevItem.y;
                            const isNewLine = Math.abs(yDiff) > prevItem.height * 0.55;

                            if (isNewLine) {
                                // Stitch hyphenated words across lines
                                if (prevItem.str.endsWith('-') && /^[a-z]/.test(it.str)) {
                                    colText = colText.slice(0, -1) + it.str;
                                } else {
                                    if (yDiff > prevItem.height * 1.5) {
                                        colText += '\n\n' + it.str;
                                    } else {
                                        colText += '\n' + it.str;
                                    }
                                }
                            } else {
                                // Same line: check horizontal gap
                                const xGap = it.x - (prevItem.x + prevItem.width);
                                const avgCharWidth = (prevItem.width / Math.max(1, prevItem.str.length));
                                if (xGap > avgCharWidth * 0.35 && !colText.endsWith(' ') && !it.str.startsWith(' ')) {
                                    colText += ' ';
                                }
                                colText += it.str;
                            }
                            prevItem = it;
                        }
                        return colText;
                    };

                    let pageResult = '';
                    if (isTwoColumn) {
                        const leftCol = [];
                        const rightCol = [];
                        const fullWidth = [];

                        for (const it of contentItems) {
                            if (it.x + it.width <= midX + 15) leftCol.push(it);
                            else if (it.x >= midX - 15) rightCol.push(it);
                            else fullWidth.push(it);
                        }

                        if (fullWidth.length > 0) pageResult += extractColumnText(fullWidth) + '\n\n';
                        pageResult += extractColumnText(leftCol) + '\n\n' + extractColumnText(rightCol);
                    } else {
                        pageResult = extractColumnText(contentItems);
                    }

                    if (pageResult.trim()) {
                        pageTexts.push(pageResult.trim());
                    }
                }

                if (pageTexts.length === 0) {
                    throw new Error('No readable text found in PDF.');
                }
                resolve(pageTexts.join('\n\n'));
            } catch (err) {
                reject(new Error('Failed to extract text from PDF: ' + err.message));
            }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
    });
}

/**
 * 3. Upgraded Word DOCX Reader
 * Uses Mammoth.js convertToHtml to preserve:
 * - Headings (h1, h2, h3) -> converted to Markdown #, ##, ###
 * - Definitions (<strong>Term</strong>: Def) -> converted to **Term** — Def
 * - Bulleted and numbered lists (ul, ol) -> converted to Markdown lists
 * - Tables -> converted to structured table lines
 */
function readDocxFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function() {
            try {
                if (!window.mammoth) throw new Error('Mammoth.js library is not loaded');
                const arrayBuffer = this.result;

                const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
                if (htmlResult && htmlResult.value && htmlResult.value.trim().length > 20) {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = htmlResult.value;

                    const mdLines = [];
                    tempDiv.querySelectorAll('h1, h2, h3, h4, p, ul, ol, table').forEach(el => {
                        const tag = el.tagName.toLowerCase();
                        if (tag === 'h1') {
                            mdLines.push(`\n# ${el.textContent.trim()}\n`);
                        } else if (tag === 'h2') {
                            mdLines.push(`\n## ${el.textContent.trim()}\n`);
                        } else if (tag === 'h3' || tag === 'h4') {
                            mdLines.push(`\n### ${el.textContent.trim()}\n`);
                        } else if (tag === 'ul' || tag === 'ol') {
                            el.querySelectorAll('li').forEach(li => {
                                const strong = li.querySelector('strong, b');
                                if (strong && (li.textContent.includes(':') || li.textContent.includes('—'))) {
                                    const term = strong.textContent.trim();
                                    const rest = li.textContent.replace(term, '').replace(/^[:\s—–-]+/, '').trim();
                                    mdLines.push(`- **${term}** — ${rest}`);
                                } else {
                                    mdLines.push(`- ${li.textContent.trim()}`);
                                }
                            });
                            mdLines.push('');
                        } else if (tag === 'table') {
                            el.querySelectorAll('tr').forEach(tr => {
                                const cells = Array.from(tr.querySelectorAll('td, th')).map(c => c.textContent.trim());
                                if (cells.length > 0) mdLines.push(`| ${cells.join(' | ')} |`);
                            });
                            mdLines.push('');
                        } else if (tag === 'p') {
                            const strong = el.querySelector('strong, b');
                            if (strong && (el.textContent.includes(':') || el.textContent.includes('—') || el.textContent.includes(' - '))) {
                                const term = strong.textContent.trim();
                                const rest = el.textContent.replace(term, '').replace(/^[:\s—–-]+/, '').trim();
                                mdLines.push(`**${term}** — ${rest}`);
                            } else {
                                const text = el.textContent.trim();
                                if (text) mdLines.push(text);
                            }
                        }
                    });

                    const finalMd = mdLines.join('\n').trim();
                    if (finalMd.length > 30) {
                        resolve(finalMd);
                        return;
                    }
                }

                // Fallback to raw text
                const rawResult = await mammoth.extractRawText({ arrayBuffer });
                resolve(rawResult.value);
            } catch (err) {
                reject(new Error('Failed to extract text from DOCX: ' + err.message));
            }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
    });
}

/**
 * 4. Upgraded PowerPoint PPTX Reader
 * Features:
 * - Sequential slide ordering via presentation.xml sldIdLst
 * - Detects Slide Titles (placeholder title / ctrTitle) -> writes "## Slide N: Title"
 * - Extracts presenter Speaker Notes (notesSlides) which contain core definitions!
 * - Parses tables (<a:tbl>) into formatted table lines
 * - Preserves bullet hierarchies (<a:pPr lvl="N">)
 * - Properly concatenates text runs (<a:r><a:t>) preserving word boundaries
 */
function readPptxFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function() {
            try {
                const arrayBuffer = this.result;
                const zip = await loadPptxZip(arrayBuffer);
                const slideEntries = await getPptxSlideEntries(zip);

                if (slideEntries.length === 0) {
                    throw new Error('No slides found in PPTX presentation.');
                }

                const parser = new DOMParser();
                const slideTexts = [];

                for (let i = 0; i < slideEntries.length; i++) {
                    const { slidePath, notesPath } = slideEntries[i];
                    if (!(await pptxHasEntry(zip, slidePath))) continue;

                    const slideXml = await pptxReadEntry(zip, slidePath);
                    const slideDoc = parser.parseFromString(slideXml, 'application/xml');

                    const { title, content } = extractSlideStructuredContent(slideDoc, i + 1);
                    let slideBlock = `## Slide ${i + 1}: ${title}\n\n${content}`;

                    // Extract speaker notes if present
                    if (notesPath && await pptxHasEntry(zip, notesPath)) {
                        try {
                            const notesXml = await pptxReadEntry(zip, notesPath);
                            const notesDoc = parser.parseFromString(notesXml, 'application/xml');
                            const notesText = extractTextFromPptxXml(notesDoc);
                            if (notesText && notesText.trim().length > 10) {
                                slideBlock += `\n\n**Speaker Notes:**\n${notesText.trim()}`;
                            }
                        } catch (ne) {
                            // Speaker notes are optional
                        }
                    }

                    if (slideBlock.trim()) {
                        slideTexts.push(slideBlock.trim());
                    }
                }

                if (slideTexts.length === 0) {
                    throw new Error('No readable text found inside PPTX slides.');
                }

                resolve(slideTexts.join('\n\n---\n\n'));
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
    if (window.mammoth && typeof window.mammoth.openArrayBuffer === 'function') {
        return window.mammoth.openArrayBuffer(arrayBuffer);
    }
    throw new Error('ZIP decompression library is not available in browser');
}

async function pptxHasEntry(zip, path) {
    path = path.replace(/^\/+/, '').replace(/\\/g, '/');
    if (typeof zip.exists === 'function') return zip.exists(path);
    if (typeof zip.file === 'function') {
        if (zip.file(path)) return true;
        if (path.startsWith('ppt/')) return !!zip.file(path.replace(/^ppt\//, ''));
    }
    return false;
}

async function pptxReadEntry(zip, path) {
    path = path.replace(/^\/+/, '').replace(/\\/g, '/');
    if (typeof zip.read === 'function') return await zip.read(path, 'utf8');
    if (typeof zip.file === 'function') {
        let entry = zip.file(path);
        if (!entry && path.startsWith('ppt/')) {
            entry = zip.file(path.replace(/^ppt\//, ''));
        }
        if (!entry) throw new Error(`PPTX entry not found: ${path}`);
        return await entry.async('text');
    }
    throw new Error('Unsupported PPTX ZIP object');
}

async function getPptxSlideEntries(zip) {
    const presentationPath = 'ppt/presentation.xml';
    const relsPath = 'ppt/_rels/presentation.xml.rels';
    const parser = new DOMParser();

    if (!(await pptxHasEntry(zip, presentationPath))) return [];

    const presXml = await pptxReadEntry(zip, presentationPath);
    const presDoc = parser.parseFromString(presXml, 'application/xml');

    const sldIdNodes = Array.from(presDoc.getElementsByTagName('*')).filter(n => n.localName === 'sldId');
    const slideRelIds = sldIdNodes.map(n => n.getAttribute('r:id')).filter(Boolean);

    let relsMap = {};
    if (await pptxHasEntry(zip, relsPath)) {
        const relsXml = await pptxReadEntry(zip, relsPath);
        const relsDoc = parser.parseFromString(relsXml, 'application/xml');
        const relNodes = Array.from(relsDoc.getElementsByTagName('*')).filter(n => n.localName === 'Relationship');
        relNodes.forEach(node => {
            const id = node.getAttribute('Id');
            const target = node.getAttribute('Target');
            if (id && target) relsMap[id] = target;
        });
    }

    const entries = [];
    for (let i = 0; i < slideRelIds.length; i++) {
        const relId = slideRelIds[i];
        let target = relsMap[relId];
        if (!target) continue;
        target = target.replace(/^\/+/, '');
        if (!target.startsWith('ppt/')) target = `ppt/${target}`;

        // Infer speaker notes slide path
        const slideFileName = target.split('/').pop();
        const slideNumMatch = slideFileName.match(/\d+/);
        const slideNum = slideNumMatch ? slideNumMatch[0] : (i + 1);
        const candidateNotes = `ppt/notesSlides/notesSlide${slideNum}.xml`;

        entries.push({ slidePath: target, notesPath: candidateNotes });
    }

    // Fallback if sldId list is empty
    if (entries.length === 0) {
        for (let idx = 1; idx <= 150; idx++) {
            const candidate = `ppt/slides/slide${idx}.xml`;
            if (await pptxHasEntry(zip, candidate)) {
                entries.push({ slidePath: candidate, notesPath: `ppt/notesSlides/notesSlide${idx}.xml` });
            } else if (idx > 15) break;
        }
    }

    return entries;
}

function extractSlideStructuredContent(xmlDoc, slideNum) {
    let title = `Topic ${slideNum}`;
    const bodyLines = [];

    // Check for title placeholder shapes
    const shapes = Array.from(xmlDoc.getElementsByTagName('*')).filter(n => n.localName === 'sp');
    for (const sp of shapes) {
        const ph = Array.from(sp.getElementsByTagName('*')).find(n => n.localName === 'ph');
        const phType = ph ? ph.getAttribute('type') : null;
        const isTitleShape = phType === 'title' || phType === 'ctrTitle' || phType === 'subTitle';

        const shapeText = extractTextFromPptxXml(sp);
        if (shapeText) {
            if (isTitleShape && title.startsWith('Topic ')) {
                title = shapeText.split('\n')[0].trim();
            } else {
                bodyLines.push(shapeText);
            }
        }
    }

    // Check for table frames
    const tables = Array.from(xmlDoc.getElementsByTagName('*')).filter(n => n.localName === 'tbl');
    for (const tbl of tables) {
        const rows = Array.from(tbl.getElementsByTagName('*')).filter(n => n.localName === 'tr');
        for (const tr of rows) {
            const cells = Array.from(tr.getElementsByTagName('*')).filter(n => n.localName === 'tc');
            const cellTexts = cells.map(tc => extractTextFromPptxXml(tc).replace(/\n+/g, ' ').trim()).filter(Boolean);
            if (cellTexts.length > 0) {
                bodyLines.push(`| ${cellTexts.join(' | ')} |`);
            }
        }
    }

    return {
        title,
        content: bodyLines.join('\n\n')
    };
}

function extractTextFromPptxXml(xmlDoc) {
    const paragraphTexts = [];

    function collectParagraph(node) {
        const runs = [];
        function traverse(n) {
            if (!n) return;
            if (n.nodeType === Node.ELEMENT_NODE) {
                const name = (n.localName || n.nodeName || '').toLowerCase();
                if (name === 't') {
                    runs.push(n.textContent || '');
                    return;
                }
            }
            for (let child = n.firstChild; child; child = child.nextSibling) {
                traverse(child);
            }
        }
        traverse(node);
        return runs.join('').trim();
    }

    function walk(node) {
        if (!node) return;
        if (node.nodeType === Node.ELEMENT_NODE) {
            const name = (node.localName || node.nodeName || '').toLowerCase();
            if (name === 'p') {
                const pText = collectParagraph(node);
                if (pText) {
                    const pPr = Array.from(node.getElementsByTagName('*')).find(n => n.localName === 'pPr');
                    const lvl = pPr ? parseInt(pPr.getAttribute('lvl') || '0', 10) : 0;
                    const indent = '  '.repeat(lvl);
                    paragraphTexts.push(`${indent}- ${pText}`);
                }
                return;
            }
        }
        for (let child = node.firstChild; child; child = child.nextSibling) {
            walk(child);
        }
    }

    walk(xmlDoc.documentElement || xmlDoc);
    return paragraphTexts.join('\n');
}

// Delete reviewer function
async function deleteReviewer(id) {
    const resultConfirm = await Swal.fire({
        title: 'Delete Reviewer Deck?',
        text: 'All associated study guides, flashcards, and quizzes will be permanently deleted.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, delete it',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b'
    });

    if (!resultConfirm.isConfirmed) return;

    try {
        const response = await fetch('process.php?action=delete_reviewer&id=' + id, { method: 'POST' });
        const result = await response.json();
        if (result.success) {
            loadReviewers();
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Failed to delete reviewer: ' + (result.message || 'Unknown error'),
                confirmButtonColor: '#4f46e5'
            });
        }
    } catch (err) {
        console.error(err);
        Swal.fire({ icon: 'error', title: 'Error', text: 'Network connection error.', confirmButtonColor: '#4f46e5' });
    }
}

/* ==========================================================================
   Reviewer Page (Interactive Flashcards, Quizzes & Study Guide)
   ========================================================================== */
let allFlashcards = [];
let flashcards = [];
let currentCardIndex = 0;
let reviewedCardsCount = 0;

async function initReviewerPage() {
    const params = new URLSearchParams(window.location.search);
    const reviewerId = params.get('id');

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
    const reviewerIdInput = document.getElementById('card-reviewer-id');

    if (!reviewerId) {
        window.location.href = 'index.html';
        return;
    }

    try {
        const response = await fetch(`process.php?action=get_reviewer&id=${encodeURIComponent(reviewerId)}`);
        const data = await response.json();

        if (!data.success || !data.reviewer) {
            throw new Error(data.message || 'Reviewer deck not found.');
        }

        const reviewer = data.reviewer;
        const generatedAt = reviewer.created_at ? new Date(reviewer.created_at) : null;
        const formattedDate = generatedAt ? generatedAt.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        }) : '';

        const mcCount = (reviewer.quiz_questions || []).filter(q => q.type === 'multiple_choice').length;
        const fibCount = (reviewer.quiz_questions || []).filter(q => q.type === 'fill_in_the_blank').length;

        document.title = `${reviewer.title} - Simple Reviewer`;
        if (titleEl) titleEl.textContent = reviewer.title;
        if (createdAtEl) createdAtEl.textContent = formattedDate;
        if (originalFileEl) originalFileEl.textContent = reviewer.original_filename || 'Direct Text';
        if (flashcardsCountBadge) flashcardsCountBadge.textContent = (reviewer.flashcards || []).length;
        if (mcCountBadge) mcCountBadge.textContent = mcCount;
        if (fibCountBadge) fibCountBadge.textContent = fibCount;
        if (reviewerIdInput) reviewerIdInput.value = reviewer.id;

        if (metaEl) {
            metaEl.innerHTML = `
                <span><i class="bi bi-calendar3 me-1 text-primary"></i> Created ${formattedDate}</span>
                <span>&bull;</span>
                <span><i class="bi bi-layers-fill me-1 text-primary"></i> ${(reviewer.flashcards || []).length} Flashcards</span>
                <span>&bull;</span>
                <span><i class="bi bi-patch-question me-1 text-primary"></i> ${mcCount} Multiple Choice</span>
                <span>&bull;</span>
                <span><i class="bi bi-pencil-fill me-1 text-primary"></i> ${fibCount} Fill in the Blank</span>
            `;
        }

        // Render Structured Study Guide
        const summaryContainer = document.getElementById('summary-content');
        if (summaryContainer) {
            summaryContainer.innerHTML = renderSummaryCards(reviewer.summary || '');
        }

        allFlashcards = reviewer.flashcards || [];
        flashcards = [...allFlashcards];

        allMCQuestions = (reviewer.quiz_questions || []).filter(q => q.type === 'multiple_choice').map(q => ({
            ...q,
            choices: typeof q.choices === 'string' ? JSON.parse(q.choices || '[]') : q.choices || []
        }));

        allFIBQuestions = (reviewer.quiz_questions || []).filter(q => q.type === 'fill_in_the_blank');

        renderFlashcardList();
        initFlashcards();
        initMultipleChoiceQuiz();
        initFillBlankQuiz();
        initKeyboardShortcuts();

        if (loadingEl) loadingEl.classList.add('d-none');
        if (errorEl) errorEl.classList.add('d-none');
        if (contentEl) contentEl.classList.remove('d-none');
    } catch (err) {
        console.error('Reviewer page load error:', err);
        if (loadingEl) loadingEl.classList.add('d-none');
        if (contentEl) contentEl.classList.add('d-none');
        if (errorEl) {
            errorEl.classList.remove('d-none');
            errorEl.innerHTML = `Error loading reviewer: ${escapeHtml(err.message || 'Unable to fetch deck.')} <a href="index.html" class="alert-link">Return to dashboard</a>.`;
        }
    }
}

/* ==========================================================================
   Study Guide Markdown Rendering
   ========================================================================== */
function renderSummaryCards(markdownText) {
    if (!markdownText || !markdownText.trim()) {
        return '<div class="card p-4 text-center"><div class="alert alert-warning mb-0">No study guide was generated for this deck.</div></div>';
    }

    const html = parseMarkdown(markdownText);
    const sections = html.split(/(?=<h[1-3]>)/i).filter(Boolean);

    if (!sections.length) {
        return `<div class="card p-4 mb-4 section-box">${html}</div>`;
    }

    return sections.map(section => {
        const match = section.match(/^(<h[1-3]>.*?<\/h[1-3]>)([\s\S]*)$/i);
        const headingHtml = match ? match[1] : '';
        let bodyHtml = match ? match[2] : section;

        // Beautify definition callouts
        bodyHtml = bodyHtml.replace(/<p>\s*<strong>(.*?)<\/strong>\s*(?:&mdash;|—|–|-)\s*(.*?)<\/p>/gi, (all, term, def) => {
            return `<div class="definition-box"><span class="definition-term">${term}</span> — ${def}</div>`;
        });

        return `
            <div class="card mb-4 section-box">
                <div class="card-body p-4">
                    ${headingHtml}
                    ${bodyHtml}
                </div>
            </div>
        `;
    }).join('');
}

function parseMarkdown(text) {
    if (!text) return '';
    let result = escapeHtml(text);

    result = result.replace(/^####\s+(.*)$/gm, '<h5 class="fw-bold mb-2">$1</h5>');
    result = result.replace(/^###\s+(.*)$/gm, '<h4 class="fw-bold mb-2.5">$1</h4>');
    result = result.replace(/^##\s+(.*)$/gm, '<h3 class="fw-bold mb-3 text-primary">$1</h3>');
    result = result.replace(/^#\s+(.*)$/gm, '<h2 class="fw-bold mb-3">$1</h2>');

    result = result.replace(/\*\*\*(.*?)\*\*\*/gs, '<strong><em>$1</em></strong>');
    result = result.replace(/\*\*(.*?)\*\*/gs, '<strong>$1</strong>');
    result = result.replace(/\*(.*?)\*/gs, '<em>$1</em>');
    result = result.replace(/`(.*?)`/gs, '<code class="px-1.5 py-0.5 rounded bg-body-tertiary border">$1</code>');
    result = result.replace(/^---+$/gm, '<hr class="my-3 opacity-25">');

    const lines = result.split(/\r?\n/);
    let output = '';
    let inUl = false;

    for (let line of lines) {
        if (/^\s*[-\*\+]\s+/.test(line)) {
            if (!inUl) { output += '<ul class="mb-3 ps-3">'; inUl = true; }
            output += `<li class="mb-1">${line.replace(/^\s*[-\*\+]\s+/, '').trim()}</li>`;
            continue;
        }
        if (inUl) { output += '</ul>'; inUl = false; }

        if (line.trim() === '') {
            output += '\n';
        } else {
            output += `<p class="mb-2">${line}</p>`;
        }
    }
    if (inUl) output += '</ul>';

    return output;
}

window.copyStudyGuide = function() {
    const content = document.getElementById('summary-content');
    if (!content) return;
    navigator.clipboard.writeText(content.innerText).then(() => {
        Swal.fire({
            icon: 'success',
            title: 'Copied to Clipboard!',
            text: 'Study guide text copied successfully.',
            timer: 1500,
            showConfirmButton: false
        });
    });
};

/* ==========================================================================
   Flashcards Interface & 3D Tactile Engine
   ========================================================================== */
function initFlashcards() {
    const deck = document.getElementById('flashcard-deck');
    const prevBtn = document.getElementById('card-prev-btn');
    const nextBtn = document.getElementById('card-next-btn');
    const addCardForm = document.getElementById('add-card-form');
    const cardSearchInput = document.getElementById('card-search-input');

    if (!deck || flashcards.length === 0) return;

    deck.addEventListener('click', () => {
        deck.classList.toggle('is-flipped');
        reviewedCardsCount = Math.max(reviewedCardsCount, currentCardIndex + 1);
        updateMastery();
    });

    if (prevBtn) {
        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentCardIndex > 0) {
                currentCardIndex--;
                deck.classList.remove('is-flipped');
                setTimeout(updateFlashcardUI, 150);
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentCardIndex < flashcards.length - 1) {
                currentCardIndex++;
                deck.classList.remove('is-flipped');
                setTimeout(updateFlashcardUI, 150);
                reviewedCardsCount = Math.max(reviewedCardsCount, currentCardIndex + 1);
                updateMastery();
            }
        });
    }

    if (cardSearchInput) {
        cardSearchInput.addEventListener('input', (e) => {
            filterFlashcardList(e.target.value.trim().toLowerCase());
        });
    }

    if (addCardForm) {
        addCardForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const reviewerId = document.getElementById('card-reviewer-id').value;
            const question = document.getElementById('card-question').value.trim();
            const answer = document.getElementById('card-answer').value.trim();

            if (!question || !answer) return;

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

                    const newCard = { id: result.id, question, answer };
                    allFlashcards.push(newCard);
                    flashcards.push(newCard);
                    currentCardIndex = flashcards.length - 1;
                    deck.classList.remove('is-flipped');
                    updateFlashcardUI();
                    renderFlashcardList();
                    addCardForm.reset();

                    Swal.fire({
                        icon: 'success',
                        title: 'Card Added!',
                        timer: 1000,
                        showConfirmButton: false
                    });
                }
            } catch (err) {
                console.error(err);
            }
        });
    }

    updateFlashcardUI();
}

function updateFlashcardUI() {
    const frontText = document.getElementById('card-front-text');
    const backText = document.getElementById('card-back-text');
    const currentIndexEl = document.getElementById('card-current-index');
    const cardIndexTop = document.getElementById('card-index-top');
    const totalIndexEl = document.getElementById('card-total-index');
    const prevBtn = document.getElementById('card-prev-btn');
    const nextBtn = document.getElementById('card-next-btn');

    if (!flashcards.length) return;

    const card = flashcards[currentCardIndex];
    if (frontText) frontText.textContent = card.question;
    if (backText) backText.textContent = card.answer;
    if (currentIndexEl) currentIndexEl.textContent = currentCardIndex + 1;
    if (cardIndexTop) cardIndexTop.textContent = currentCardIndex + 1;
    if (totalIndexEl) totalIndexEl.textContent = flashcards.length;

    if (prevBtn) prevBtn.disabled = currentCardIndex === 0;
    if (nextBtn) nextBtn.disabled = currentCardIndex === flashcards.length - 1;
}

window.shuffleFlashcards = function() {
    const deck = document.getElementById('flashcard-deck');
    if (deck) deck.classList.remove('is-flipped');
    flashcards = shuffleArray(flashcards);
    currentCardIndex = 0;
    setTimeout(updateFlashcardUI, 200);
};

function updateMastery() {
    const masteryEl = document.getElementById('mastery-percent');
    if (!masteryEl || flashcards.length === 0) return;
    const pct = Math.round((reviewedCardsCount / flashcards.length) * 100);
    masteryEl.textContent = `${pct}%`;
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

    allFlashcards.forEach((card, idx) => {
        const item = document.createElement('div');
        item.className = 'definition-box mb-2.5 p-3';
        item.innerHTML = `
            <div class="d-flex justify-content-between align-items-start gap-3">
                <div>
                    <span class="badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-0.5 me-2" style="font-size: 0.72rem;">#${idx + 1}</span>
                    <strong class="text-body">${escapeHtml(card.question)}</strong>
                    <div class="text-muted small mt-1.5">${escapeHtml(card.answer)}</div>
                </div>
            </div>
        `;
        listBody.appendChild(item);
    });
}

function filterFlashcardList(query) {
    const listBody = document.getElementById('flashcard-list-body');
    const emptyNotice = document.getElementById('flashcard-list-empty');
    if (!listBody) return;

    listBody.innerHTML = '';
    const filtered = allFlashcards.filter(c => 
        c.question.toLowerCase().includes(query) || c.answer.toLowerCase().includes(query)
    );

    if (filtered.length === 0) {
        if (emptyNotice) emptyNotice.classList.remove('d-none');
        return;
    }
    if (emptyNotice) emptyNotice.classList.add('d-none');

    filtered.forEach((card, idx) => {
        const item = document.createElement('div');
        item.className = 'definition-box mb-2.5 p-3';
        item.innerHTML = `
            <div class="d-flex justify-content-between align-items-start gap-3">
                <div>
                    <span class="badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-0.5 me-2" style="font-size: 0.72rem;">#${idx + 1}</span>
                    <strong class="text-body">${escapeHtml(card.question)}</strong>
                    <div class="text-muted small mt-1.5">${escapeHtml(card.answer)}</div>
                </div>
            </div>
        `;
        listBody.appendChild(item);
    });
}

function initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
        // Do not trigger if typing in an input or textarea
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

        const deckTab = document.getElementById('tab-flashcards');
        const isDeckActive = deckTab && deckTab.classList.contains('active');
        if (!isDeckActive) return;

        const deck = document.getElementById('flashcard-deck');
        if (e.code === 'Space') {
            e.preventDefault();
            if (deck) deck.classList.toggle('is-flipped');
        } else if (e.code === 'ArrowLeft') {
            e.preventDefault();
            document.getElementById('card-prev-btn')?.click();
        } else if (e.code === 'ArrowRight') {
            e.preventDefault();
            document.getElementById('card-next-btn')?.click();
        } else if (e.key === 'r' || e.key === 'R') {
            e.preventDefault();
            shuffleFlashcards();
        }
    });
}

/* ==========================================================================
   Multiple Choice Quiz Engine
   ========================================================================== */
let allMCQuestions = [];
let mcQuestions = [];
let mcAnswers = {};
let mcSubmitted = false;

function loadRandomMCQuestions() {
    if (!allMCQuestions.length) return;
    mcQuestions = shuffleArray([...allMCQuestions]).slice(0, 15).map(q => {
        let choices = [];
        try {
            choices = typeof q.choices === 'string' ? JSON.parse(q.choices) : q.choices;
        } catch (e) {
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
    if (!allMCQuestions.length) {
        if (container) container.innerHTML = '<div class="alert alert-warning">No multiple choice questions generated for this document.</div>';
        return;
    }

    loadRandomMCQuestions();
    renderMCQuiz();

    const submitBtn = document.getElementById('mc-submit-btn');
    const resetBtn = document.getElementById('mc-reset-btn');

    if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
            let unanswered = 0;
            mcQuestions.forEach((q, idx) => {
                if (mcAnswers[idx] === undefined) unanswered++;
            });

            if (unanswered > 0) {
                const conf = await Swal.fire({
                    title: 'Unanswered Questions',
                    text: `You have ${unanswered} unanswered question(s). Submit quiz anyway?`,
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Submit Anyway',
                    cancelButtonText: 'Keep Answering',
                    confirmButtonColor: '#4f46e5',
                    cancelButtonColor: '#64748b'
                });
                if (!conf.isConfirmed) return;
            }

            mcSubmitted = true;
            gradeMCQuiz();
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            mcAnswers = {};
            mcSubmitted = false;
            loadRandomMCQuestions();
            renderMCQuiz();

            const resultAlert = document.getElementById('mc-result-alert');
            if (resultAlert) resultAlert.classList.add('d-none');
            if (submitBtn) submitBtn.classList.remove('d-none');
            resetBtn.innerHTML = '<i class="bi bi-arrow-counterclockwise me-1"></i> Reset Quiz';
        });
    }
}

function renderMCQuiz() {
    const quizBody = document.getElementById('mc-quiz-body');
    if (!quizBody) return;
    quizBody.innerHTML = '';

    mcQuestions.forEach((q, qIndex) => {
        const choices = q.shuffledChoices || [];
        const card = document.createElement('div');
        card.className = 'quiz-question-card';

        let choicesHTML = '';
        choices.forEach((choice, cIndex) => {
            const isSelected = mcAnswers[qIndex] === cIndex;
            let btnClass = 'quiz-choice-btn';
            let iconHTML = '';

            if (isSelected) btnClass += ' selected';

            if (mcSubmitted) {
                const isCorrect = choice === q.correct_answer;
                const isUser = mcAnswers[qIndex] === cIndex;

                if (isCorrect) {
                    btnClass = 'quiz-choice-btn correct';
                    iconHTML = '<i class="bi bi-check-circle-fill text-success fs-5"></i>';
                } else if (isUser) {
                    btnClass = 'quiz-choice-btn incorrect';
                    iconHTML = '<i class="bi bi-x-circle-fill text-danger fs-5"></i>';
                } else {
                    btnClass = 'quiz-choice-btn opacity-50';
                }
            }

            const letter = String.fromCharCode(65 + cIndex);
            choicesHTML += `
                <button type="button" class="${btnClass}" ${mcSubmitted ? 'disabled' : ''} onclick="selectMCOption(${qIndex}, ${cIndex})">
                    <div class="d-flex align-items-center gap-2.5">
                        <span class="choice-letter-badge">${letter}</span>
                        <span>${escapeHtml(choice)}</span>
                    </div>
                    ${iconHTML}
                </button>
            `;
        });

        card.innerHTML = `
            <div class="d-flex align-items-center gap-2 mb-3">
                <span class="badge bg-primary-subtle text-primary border border-primary-subtle px-2.5 py-1">Q${qIndex + 1}</span>
                <h5 class="fw-bold mb-0">${escapeHtml(q.question)}</h5>
            </div>
            <div>${choicesHTML}</div>
        `;
        quizBody.appendChild(card);
    });
}

window.selectMCOption = function(qIndex, cIndex) {
    if (mcSubmitted) return;
    mcAnswers[qIndex] = cIndex;
    renderMCQuiz();
};

function gradeMCQuiz() {
    let score = 0;
    mcQuestions.forEach((q, qIndex) => {
        const choices = q.shuffledChoices || [];
        const selectedIndex = mcAnswers[qIndex];
        const selectedText = selectedIndex !== undefined ? choices[selectedIndex] : null;
        if (selectedText === q.correct_answer) score++;
    });

    renderMCQuiz();

    const resultAlert = document.getElementById('mc-result-alert');
    const resultScore = document.getElementById('mc-score-text');
    const pct = Math.round((score / mcQuestions.length) * 100);

    if (resultScore) {
        resultScore.innerHTML = `You Scored ${score} / ${mcQuestions.length} (${pct}%)`;
    }
    if (resultAlert) {
        resultAlert.classList.remove('d-none');
    }

    document.getElementById('multiple-choice-container')?.scrollIntoView({ behavior: 'smooth' });
    document.getElementById('mc-submit-btn')?.classList.add('d-none');
    const resetBtn = document.getElementById('mc-reset-btn');
    if (resetBtn) resetBtn.innerHTML = '<i class="bi bi-arrow-repeat me-1"></i> Retake Quiz';
}

/* ==========================================================================
   Fill in the Blank Quiz Engine
   ========================================================================== */
let allFIBQuestions = [];
let fibQuestions = [];
let fibSubmitted = false;

function loadRandomFIBQuestions() {
    if (!allFIBQuestions.length) return;
    fibQuestions = shuffleArray([...allFIBQuestions]).slice(0, 15);
}

function initFillBlankQuiz() {
    const container = document.getElementById('fill-blank-container');
    if (!allFIBQuestions.length) {
        if (container) container.innerHTML = '<div class="alert alert-warning">No fill-in-the-blank questions generated for this document.</div>';
        return;
    }

    loadRandomFIBQuestions();
    renderFIBQuiz();

    const submitBtn = document.getElementById('fib-submit-btn');
    const resetBtn = document.getElementById('fib-reset-btn');

    if (submitBtn) {
        submitBtn.addEventListener('click', () => {
            fibSubmitted = true;
            gradeFIBQuiz();
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            fibSubmitted = false;
            loadRandomFIBQuestions();
            renderFIBQuiz();

            const resultAlert = document.getElementById('fib-result-alert');
            if (resultAlert) resultAlert.classList.add('d-none');
            if (submitBtn) submitBtn.classList.remove('d-none');
            resetBtn.innerHTML = '<i class="bi bi-arrow-counterclockwise me-1"></i> Reset Quiz';
        });
    }
}

function renderFIBQuiz() {
    const quizBody = document.getElementById('fib-quiz-body');
    if (!quizBody) return;
    quizBody.innerHTML = '';

    fibQuestions.forEach((q, qIndex) => {
        const card = document.createElement('div');
        card.className = 'quiz-question-card';

        const originalText = escapeHtml(q.question);
        const underscoreRegex = /_{2,}/g;
        let formHTML = originalText;

        if (underscoreRegex.test(originalText)) {
            let inputIdx = 0;
            formHTML = originalText.replace(underscoreRegex, () => {
                inputIdx++;
                return `
                    <input type="text" 
                           class="fill-blank-input d-inline-block mx-1.5" 
                           id="fib-${qIndex}-${inputIdx}" 
                           ${fibSubmitted ? 'disabled' : ''} 
                           placeholder="type answer..." 
                           autocomplete="off">
                `;
            });
        } else {
            formHTML = `${originalText} <br><input type="text" class="fill-blank-input mt-2" id="fib-${qIndex}-1" ${fibSubmitted ? 'disabled' : ''} placeholder="Type missing term...">`;
        }

        let hintHTML = '';
        if (!fibSubmitted && q.correct_answer && q.correct_answer.length > 2) {
            hintHTML = `
                <button type="button" class="btn btn-link btn-sm text-muted p-0 mt-2 text-decoration-none" onclick="giveFIBHint(${qIndex})">
                    <i class="bi bi-lightbulb"></i> Need a hint?
                </button>
                <span id="fib-hint-${qIndex}" class="small text-primary ms-2 d-none"></span>
            `;
        }

        card.innerHTML = `
            <div class="d-flex align-items-center gap-2 mb-2.5">
                <span class="badge bg-primary-subtle text-primary border border-primary-subtle px-2.5 py-1">Q${qIndex + 1}</span>
                <span class="text-muted small fw-semibold">Fill in the blank:</span>
            </div>
            <div style="line-height: 2.2; font-size: 1.05rem;">${formHTML}</div>
            <div>${hintHTML}</div>
        `;
        quizBody.appendChild(card);
    });
}

window.giveFIBHint = function(qIndex) {
    const hintEl = document.getElementById(`fib-hint-${qIndex}`);
    const q = fibQuestions[qIndex];
    if (hintEl && q) {
        hintEl.textContent = `Starts with "${q.correct_answer.charAt(0).toUpperCase()}" (${q.correct_answer.length} letters)`;
        hintEl.classList.remove('d-none');
    }
};

function gradeFIBQuiz() {
    let score = 0;

    fibQuestions.forEach((q, qIndex) => {
        const inputElements = document.querySelectorAll(`[id^="fib-${qIndex}-"]`);
        let allCorrect = true;

        inputElements.forEach(inputEl => {
            const cleanUser = inputEl.value.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '');
            const cleanCorrect = q.correct_answer.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '');

            if (cleanUser === cleanCorrect && cleanUser.length > 0) {
                inputEl.className = 'fill-blank-input correct d-inline-block mx-1.5';
            } else {
                inputEl.className = 'fill-blank-input incorrect d-inline-block mx-1.5';
                allCorrect = false;
            }
        });

        if (allCorrect && inputElements.length > 0) score++;
    });

    renderFIBQuizGraded();

    const resultAlert = document.getElementById('fib-result-alert');
    const resultScore = document.getElementById('fib-score-text');
    const pct = Math.round((score / fibQuestions.length) * 100);

    if (resultScore) resultScore.innerHTML = `You Scored ${score} / ${fibQuestions.length} (${pct}%)`;
    if (resultAlert) resultAlert.classList.remove('d-none');

    document.getElementById('fill-blank-container')?.scrollIntoView({ behavior: 'smooth' });
    document.getElementById('fib-submit-btn')?.classList.add('d-none');
    const resetBtn = document.getElementById('fib-reset-btn');
    if (resetBtn) resetBtn.innerHTML = '<i class="bi bi-arrow-repeat me-1"></i> Retake Quiz';
}

function renderFIBQuizGraded() {
    const quizBody = document.getElementById('fib-quiz-body');
    if (!quizBody) return;

    fibQuestions.forEach((q, qIndex) => {
        const inputElements = document.querySelectorAll(`[id^="fib-${qIndex}-"]`);
        const values = Array.from(inputElements).map(el => ({ id: el.id, val: el.value, class: el.className }));

        const originalText = escapeHtml(q.question);
        const underscoreRegex = /_{2,}/g;
        let formHTML = originalText;
        let inputIdx = 0;

        if (underscoreRegex.test(originalText)) {
            formHTML = originalText.replace(underscoreRegex, () => {
                inputIdx++;
                const stored = values[inputIdx - 1] || { val: '', class: 'fill-blank-input' };
                return `<input type="text" class="${stored.class}" id="${stored.id}" value="${escapeHtml(stored.val)}" disabled style="max-width: 180px;">`;
            });
        } else {
            const stored = values[0] || { val: '', class: 'fill-blank-input' };
            formHTML = `${originalText} <br><input type="text" class="${stored.class} mt-2" id="${stored.id}" value="${escapeHtml(stored.val)}" disabled>`;
        }

        const card = quizBody.children[qIndex];
        if (card) {
            card.innerHTML = `
                <div class="d-flex align-items-center gap-2 mb-2.5">
                    <span class="badge bg-primary-subtle text-primary border border-primary-subtle px-2.5 py-1">Q${qIndex + 1}</span>
                    <span class="text-muted small fw-semibold">Fill in the blank:</span>
                </div>
                <div style="line-height: 2.2; font-size: 1.05rem;">${formHTML}</div>
                <div class="mt-2.5 small">
                    <span class="text-muted">Correct Answer:</span> 
                    <strong class="text-success">${escapeHtml(q.correct_answer)}</strong>
                </div>
            `;
        }
    });
}
