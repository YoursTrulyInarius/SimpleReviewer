# Simple Reviewer
aaaqqqq
**THIS IS A PERSONAL PROJECT, I'M TIRED OF READING EVERYTHING AT ONCE.** 

I created this to make everything easier. Please note that this system is still not accurate; it needs improvements for the questionnaires, flashcards, and more. 

> **Known Issues:** Instead of asking "Who is Jeb?", it asks "What is Jeb?". Issues will be fixed later, since I'm still tired at the moment.

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
