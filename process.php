<?php
/**
 * Simple Reviewer - AJAX PHP Handlers
 */

require_once 'db.php';

header('Content-Type: application/json');

// Check action parameter
$action = isset($_GET['action']) ? $_GET['action'] : '';

// Helper to get raw JSON input
function getJsonInput() {
    $input = file_get_contents('php://input');
    return json_decode($input, true);
}

try {
    switch ($action) {
        case 'save_key':
            $input = getJsonInput();
            $apiKey = isset($input['api_key']) ? trim($input['api_key']) : '';
            
            if (empty($apiKey)) {
                echo json_encode(['success' => false, 'message' => 'API Key cannot be empty.']);
                exit;
            }

            // Save key using UPSERT pattern
            $stmt = $pdo->prepare("INSERT INTO settings (`key`, `value`) VALUES ('gemini_api_key', :val) ON DUPLICATE KEY UPDATE `value` = :val");
            $stmt->execute(['val' => $apiKey]);
            
            echo json_encode(['success' => true]);
            break;

        case 'create_reviewer':
            // Allow up to 5 min and 512 MB for large file processing
            set_time_limit(300);
            ini_set('memory_limit', '512M');

            require_once 'text_analyzer.php';

            $input = getJsonInput();
            $title            = isset($input['title'])             ? trim($input['title'])             : '';
            $originalFilename = isset($input['original_filename']) ? trim($input['original_filename']) : '';
            $content          = isset($input['content'])           ? trim($input['content'])           : '';

            if (empty($title) || empty($content)) {
                echo json_encode(['success' => false, 'message' => 'Missing document title or content.']);
                exit;
            }

            // Run the local text analysis engine (no API key required)
            $analyzer       = new TextAnalyzer($content);
            $studyMaterials = $analyzer->generateAll(30); // Generate a larger pool of 30 items for database

            // Validate we got something useful
            if (empty($studyMaterials['flashcards'])) {
                echo json_encode(['success' => false, 'message' => 'Could not extract enough content from the document. Please ensure the file contains readable text.']);
                exit;
            }

            // Save everything to the database in one transaction
            $pdo->beginTransaction();

            // 1. Insert reviewer
            $stmt = $pdo->prepare("INSERT INTO reviewers (title, original_filename, summary) VALUES (:title, :orig, :summary)");
            $stmt->execute([
                'title'   => $title,
                'orig'    => $originalFilename,
                'summary' => $studyMaterials['summary']
            ]);
            $reviewerId = $pdo->lastInsertId();

            // 2. Insert flashcards
            if (!empty($studyMaterials['flashcards'])) {
                $stmt = $pdo->prepare("INSERT INTO flashcards (reviewer_id, question, answer) VALUES (:rid, :q, :a)");
                foreach ($studyMaterials['flashcards'] as $card) {
                    if (empty($card['question']) || empty($card['answer'])) continue;
                    $stmt->execute(['rid' => $reviewerId, 'q' => $card['question'], 'a' => $card['answer']]);
                }
            }

            // 3. Insert Multiple Choice questions
            if (!empty($studyMaterials['multiple_choice'])) {
                $stmt = $pdo->prepare("INSERT INTO quiz_questions (reviewer_id, type, question, correct_answer, choices) VALUES (:rid, 'multiple_choice', :q, :ans, :choices)");
                foreach ($studyMaterials['multiple_choice'] as $q) {
                    if (empty($q['question']) || empty($q['choices']) || empty($q['correct_answer'])) continue;
                    $stmt->execute([
                        'rid'     => $reviewerId,
                        'q'       => $q['question'],
                        'ans'     => $q['correct_answer'],
                        'choices' => json_encode($q['choices'], JSON_UNESCAPED_UNICODE)
                    ]);
                }
            }

            // 4. Insert Fill-in-the-blank questions
            if (!empty($studyMaterials['fill_in_the_blank'])) {
                $stmt = $pdo->prepare("INSERT INTO quiz_questions (reviewer_id, type, question, correct_answer, choices) VALUES (:rid, 'fill_in_the_blank', :q, :ans, NULL)");
                foreach ($studyMaterials['fill_in_the_blank'] as $q) {
                    if (empty($q['question']) || empty($q['correct_answer'])) continue;
                    $stmt->execute(['rid' => $reviewerId, 'q' => $q['question'], 'ans' => $q['correct_answer']]);
                }
            }

            $pdo->commit();

            echo json_encode(['success' => true, 'id' => $reviewerId]);
            break;


        case 'add_flashcard':
            $input = getJsonInput();
            $reviewerId = isset($input['reviewer_id']) ? intval($input['reviewer_id']) : 0;
            $question = isset($input['question']) ? trim($input['question']) : '';
            $answer = isset($input['answer']) ? trim($input['answer']) : '';

            if ($reviewerId <= 0 || empty($question) || empty($answer)) {
                echo json_encode(['success' => false, 'message' => 'Reviewer ID, Question, and Answer are required.']);
                exit;
            }

            $stmt = $pdo->prepare("INSERT INTO flashcards (reviewer_id, question, answer) VALUES (:rid, :q, :a)");
            $stmt->execute([
                'rid' => $reviewerId,
                'q' => $question,
                'a' => $answer
            ]);
            $newCardId = $pdo->lastInsertId();

            echo json_encode(['success' => true, 'id' => $newCardId]);
            break;

        case 'delete_reviewer':
            $reviewerId = isset($_GET['id']) ? intval($_GET['id']) : 0;
            
            if ($reviewerId <= 0) {
                echo json_encode(['success' => false, 'message' => 'Invalid reviewer ID.']);
                exit;
            }

            // Deleting the reviewer triggers cascading deletion on flashcards and quiz_questions tables
            $stmt = $pdo->prepare("DELETE FROM reviewers WHERE id = :id");
            $stmt->execute(['id' => $reviewerId]);

            echo json_encode(['success' => true]);
            break;

        case 'list_reviewers':
            $reviewersQuery = "
                SELECT r.id, r.title, r.original_filename, r.created_at,
                       (SELECT COUNT(*) FROM flashcards WHERE reviewer_id = r.id) as flashcards_count,
                       (SELECT COUNT(*) FROM quiz_questions WHERE reviewer_id = r.id) as questions_count
                FROM reviewers r
                ORDER BY r.created_at DESC
            ";
            $reviewers = $pdo->query($reviewersQuery)->fetchAll();
            echo json_encode(['success' => true, 'reviewers' => $reviewers]);
            break;

        case 'get_reviewer':
            $reviewerId = isset($_GET['id']) ? intval($_GET['id']) : 0;
            if ($reviewerId <= 0) {
                echo json_encode(['success' => false, 'message' => 'Invalid reviewer ID.']);
                exit;
            }

            $stmt = $pdo->prepare("SELECT * FROM reviewers WHERE id = :id LIMIT 1");
            $stmt->execute(['id' => $reviewerId]);
            $reviewer = $stmt->fetch();
            if (!$reviewer) {
                echo json_encode(['success' => false, 'message' => 'Reviewer not found.']);
                exit;
            }

            $stmt = $pdo->prepare("SELECT * FROM flashcards WHERE reviewer_id = :id ORDER BY created_at ASC");
            $stmt->execute(['id' => $reviewerId]);
            $flashcards = $stmt->fetchAll();

            $stmt = $pdo->prepare("SELECT * FROM quiz_questions WHERE reviewer_id = :id ORDER BY created_at ASC");
            $stmt->execute(['id' => $reviewerId]);
            $quizQuestions = $stmt->fetchAll();

            echo json_encode([
                'success' => true,
                'reviewer' => [
                    'id' => $reviewer['id'],
                    'title' => $reviewer['title'],
                    'original_filename' => $reviewer['original_filename'],
                    'summary' => $reviewer['summary'],
                    'created_at' => $reviewer['created_at'],
                    'flashcards' => $flashcards,
                    'quiz_questions' => $quizQuestions
                ]
            ]);
            break;

        default:
            echo json_encode(['success' => false, 'message' => 'Invalid action endpoint.']);
            break;
    }
} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
?>
