# Simple Reviewer
**THIS IS A PERSONAL PROJECT, I'M TIRED OF READING EVERYTHING AT ONCE.** 
I created this to make study sessions faster and easier by automatically converting documents into structured study guides, interactive 3D flashcards, and practice quizzes.

> **v2.0 Updates:** Upgraded file parsing accuracy (multi-column PDF de-interleaving, PPTX speaker notes & bullet hierarchy, DOCX structured headings), modernized the UI design with glassmorphism & 3D tactile flashcards, and resolved entity question accuracy (e.g. properly generates "Who is Jeb?").

---

## Tech Stack

* **Frontend:** HTML, Vanilla CSS (with Bootstrap for layout/components), Vanilla JavaScript
* **Backend:** Node.js, Express.js
* **Database:** MySQL (using `mysql2`)
* **File Parsing Libraries:** `pdf.js` (for PDF), `mammoth.js` (for DOCX), `jszip` (for PPTX parsing)

## How It Works

1. **Upload:** Drag and drop your study materials (PDF, DOCX, PPTX, TXT) into the dashboard.
2. **Extraction:** The app extracts raw text from the uploaded files directly in the browser using client-side parsing libraries.
3. **Analysis:** The extracted text is sent to the Node.js backend where the custom `TextAnalyzer` processes the entire document.
4. **Generation:** 
   * It chunks the document to proportionally sample sentences from all sections.
   * It identifies definitions, key terms, and important entities.
   * It generates a Document Overview, Flashcards, Multiple Choice, and Fill-in-the-Blank quizzes based on the extracted data.
5. **Review:** The generated "Reviewer" is saved to the database and can be accessed anytime from your dashboard to help you study more effectively.
