<?php
$host = 'localhost';
$username = 'root';
$password = '';
$dbname = 'simple_reviewer';

try {
    // Connect to MySQL server first (without database name)
    $pdo = new PDO("mysql:host=$host", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Create database if it doesn't exist
    $pdo->exec("CREATE DATABASE IF NOT EXISTS `$dbname` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    
    // Connect to the specific database
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    // Initialize tables
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS settings (
            `key` VARCHAR(255) PRIMARY KEY,
            `value` TEXT NOT NULL
        ) ENGINE=InnoDB;
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS reviewers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            original_filename VARCHAR(255) NOT NULL,
            summary TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS flashcards (
            id INT AUTO_INCREMENT PRIMARY KEY,
            reviewer_id INT NOT NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (reviewer_id) REFERENCES reviewers(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS quiz_questions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            reviewer_id INT NOT NULL,
            type VARCHAR(50) NOT NULL,
            question TEXT NOT NULL,
            correct_answer VARCHAR(255) NOT NULL,
            choices TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (reviewer_id) REFERENCES reviewers(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
    ");

} catch (PDOException $e) {
    die("Database connection failed: " . $e->getMessage());
}
?>
