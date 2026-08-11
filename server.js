const express = require('express');
const path = require('path');
const { init, getPool } = require('./src/db');
const TextAnalyzer = require('./src/textAnalyzer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

let pool;

async function start() {
  pool = await init();


  app.all('/process.php', async (req, res) => {
    res.type('application/json');
    const action = (req.query.action || '').toString();

    try {
      switch(action) {
        case 'save_key': {
          const apiKey = (req.body.api_key || (req.body && req.body.api_key) || '').toString().trim();
          if (!apiKey) return res.json({ success: false, message: 'API Key cannot be empty.' });
          await pool.execute("INSERT INTO settings (`key`,`value`) VALUES ('gemini_api_key', ?) ON DUPLICATE KEY UPDATE `value` = ?", [apiKey, apiKey]);
          return res.json({ success: true });
        }

        case 'create_reviewer': {
          const { title, original_filename, content } = req.body || {};
          if (!title || !content) return res.json({ success: false, message: 'Missing document title or content.' });

          const analyzer = new TextAnalyzer(content);
          const studyMaterials = analyzer.generateAll(30);

          if (!studyMaterials.flashcards || studyMaterials.flashcards.length === 0) {
            return res.json({ success: false, message: 'Could not extract enough content from the document. Please ensure the file contains readable text.' });
          }

          const conn = await pool.getConnection();
          try {
            await conn.beginTransaction();
            const [rRes] = await conn.execute('INSERT INTO reviewers (title, original_filename, summary) VALUES (?, ?, ?)', [title, original_filename || '', studyMaterials.summary || '']);
            const reviewerId = rRes.insertId;

            if (Array.isArray(studyMaterials.flashcards)) {
              for (const card of studyMaterials.flashcards) {
                if (!card.question || !card.answer) continue;
                await conn.execute('INSERT INTO flashcards (reviewer_id, question, answer) VALUES (?, ?, ?)', [reviewerId, card.question, card.answer]);
              }
            }

            if (Array.isArray(studyMaterials.multiple_choice)) {
              for (const q of studyMaterials.multiple_choice) {
                if (!q.question || !q.choices || !q.correct_answer) continue;
                await conn.execute('INSERT INTO quiz_questions (reviewer_id, type, question, correct_answer, choices) VALUES (?, ?, ?, ?, ?)', [reviewerId, 'multiple_choice', q.question, q.correct_answer, JSON.stringify(q.choices || [])]);
              }
            }

            if (Array.isArray(studyMaterials.fill_in_the_blank)) {
              for (const q of studyMaterials.fill_in_the_blank) {
                if (!q.question || !q.correct_answer) continue;
                await conn.execute('INSERT INTO quiz_questions (reviewer_id, type, question, correct_answer, choices) VALUES (?, ?, ?, ?, NULL)', [reviewerId, 'fill_in_the_blank', q.question, q.correct_answer]);
              }
            }

            await conn.commit();
            return res.json({ success: true, id: reviewerId });
          } catch (err) {
            await conn.rollback();
            console.error('create_reviewer error:', err);
            return res.json({ success: false, message: String(err.message || err) });
          } finally {
            conn.release();
          }
        }

        case 'add_flashcard': {
          const { reviewer_id, question, answer } = req.body || {};
          const rid = parseInt(reviewer_id || 0, 10);
          if (!rid || !question || !answer) return res.json({ success: false, message: 'Reviewer ID, Question, and Answer are required.' });
          const [r] = await pool.execute('INSERT INTO flashcards (reviewer_id, question, answer) VALUES (?, ?, ?)', [rid, question, answer]);
          return res.json({ success: true, id: r.insertId });
        }

        case 'delete_reviewer': {
          const id = parseInt(req.query.id || req.body.id || 0, 10);
          if (!id) return res.json({ success: false, message: 'Invalid reviewer ID.' });
          await pool.execute('DELETE FROM reviewers WHERE id = ?', [id]);
          return res.json({ success: true });
        }

        case 'list_reviewers': {
          const [rows] = await pool.query(`
            SELECT r.id, r.title, r.original_filename, r.created_at,
                   (SELECT COUNT(*) FROM flashcards WHERE reviewer_id = r.id) as flashcards_count,
                   (SELECT COUNT(*) FROM quiz_questions WHERE reviewer_id = r.id) as questions_count
            FROM reviewers r
            ORDER BY r.created_at DESC
          `);
          return res.json({ success: true, reviewers: rows });
        }

        case 'get_reviewer': {
          const id = parseInt(req.query.id || 0, 10);
          if (!id) return res.json({ success: false, message: 'Invalid reviewer ID.' });
          const [[reviewer]] = await pool.query('SELECT * FROM reviewers WHERE id = ? LIMIT 1', [id]);
          if (!reviewer) return res.json({ success: false, message: 'Reviewer not found.' });
          const [flashcards] = await pool.query('SELECT * FROM flashcards WHERE reviewer_id = ? ORDER BY created_at ASC', [id]);
          const [quizQuestions] = await pool.query('SELECT * FROM quiz_questions WHERE reviewer_id = ? ORDER BY created_at ASC', [id]);
          return res.json({ success: true, reviewer: { id: reviewer.id, title: reviewer.title, original_filename: reviewer.original_filename, summary: reviewer.summary, created_at: reviewer.created_at, flashcards, quiz_questions: quizQuestions } });
        }

        default:
          return res.json({ success: false, message: 'Invalid action endpoint.' });
      }
    } catch (err) {
      console.error('process.php handler error:', err);
      return res.json({ success: false, message: String(err.message || err) });
    }
  });

  // Serve static site files AFTER the /process.php route so the
  // route handler takes priority over serving process.php as a raw file.
  app.use(express.static(path.join(__dirname)));

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
