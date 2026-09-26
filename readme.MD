# Simple Reviewer
a
Simple Reviewer is a personal, local-first study tool that turns lecture notes and documents into structured study materials. It extracts text in the browser, analyzes it with a local NLP engine, and saves generated reviewer decks in MySQL.

## Current Features

- Upload one or more PDF, DOCX, PPTX, TXT, or Markdown files.
- Extract text from PDF layouts, DOCX headings and lists, and PPTX slide content and speaker notes.
- Generate a study guide, definitions, key terms, and entity-aware questions.
- Review interactive 3D flashcards with keyboard shortcuts and add custom cards.
- Practice multiple-choice and fill-in-the-blank quizzes.
- Search the study library, search flashcards and vocabulary, delete decks, and print a guide to PDF.
- Switch between light and dark themes.

Generated content uses the local `TextAnalyzer`; no external AI API is required for reviewer generation.

## Tech Stack

- **Frontend:** HTML, vanilla JavaScript, and CSS with Bootstrap and Bootstrap Icons.
- **Backend:** Node.js and Express.js.
- **Database:** MySQL through `mysql2`.
- **Document parsing:** PDF.js, Mammoth.js, and JSZip in the browser.
- **Legacy compatibility:** PHP handlers and a PHP analyzer remain in the repository for the earlier deployment path.

## Requirements

- Node.js and npm.
- MySQL running locally.
- A MySQL account that can create the `simple_reviewer` database and its tables.

The default Node configuration expects MySQL at `localhost` with username `root` and an empty password. Update `src/db.js` before starting the server if your local MySQL credentials differ.

## Setup and Run

From the project directory:

```bash
npm install
npm start
```

Open [http://localhost:3000/index.html](http://localhost:3000/index.html) in a browser. The Node server creates the database and tables on startup when they do not already exist. The schema can also be initialized manually from `schema.sql`.

## Application Flow

1. Select or drag supported files onto the dashboard.
2. The browser extracts and combines their readable text.
3. The frontend sends the extracted content to `process.php?action=create_reviewer`.
4. Express forwards the request to `src/textAnalyzer.js`, which generates the guide, flashcards, and quizzes.
5. The server stores the reviewer and related records in one MySQL transaction.
6. The saved deck is available from the study library and `reviewer.html`.

## Backend Actions

The Node server exposes the legacy-compatible `/process.php` route with these actions:

- `create_reviewer` - analyze content and save a reviewer deck.
- `list_reviewers` - return saved decks and item counts.
- `get_reviewer` - return a deck, flashcards, and quiz questions.
- `add_flashcard` - add a custom card to a deck.
- `delete_reviewer` - delete a deck and its related records.
- `save_key` - store a settings value for legacy compatibility; reviewer generation currently does not use an API key.

## Data and Privacy Notes

Files are parsed in the browser and only extracted text and generated results are sent to the local backend. The application has no authentication or multi-user isolation, so it should be treated as a local development or single-user tool. Do not expose the default configuration to an untrusted network.

Current request checks are intentionally basic: required fields and positive numeric IDs are checked before database operations. The application does not yet enforce complete length, format, ownership, rate, or content validation at every boundary.

## For Future Updates

Planned improvements include:

- Implement proper server-side validation for every request body, query parameter, title, filename, question, answer, and generated record.
- Add explicit size, count, and content limits for uploaded text and generated materials, with consistent user-facing error messages.
- Validate quiz structure and JSON choices before storing or rendering them.
- Verify that referenced reviewer IDs exist and add ownership checks when authentication is introduced.
- Add authentication, authorization, and per-user data separation.
- Move database credentials and runtime settings to environment variables instead of hard-coded defaults.
- Add CSRF protection, safer HTTP headers, rate limiting, structured error responses, and production logging.
- Add automated tests for the Node API, database transactions, parsers, analyzer output, and browser workflows.
- Improve extraction for scanned PDFs through optional OCR and expand support for additional document formats.
- Add reviewer editing, export/import, progress persistence, and richer study statistics.
- Decide whether the legacy PHP path should remain supported or be removed after the Node migration is complete.

## Project Notes

- `server.js` is the active Node/Express entry point.
- `assets/js/app.js` contains browser parsing and reviewer interactions.
- `src/textAnalyzer.js` is the active JavaScript NLP engine.
- `src/db.js` initializes the Node database connection and tables.
- `process.php`, `db.php`, and `text_analyzer.php` support the legacy PHP deployment path.
- `README-migration.md` contains the shorter Node migration quick-start notes.
