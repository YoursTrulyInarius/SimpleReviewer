-- Simple Reviewer Database Schema
-- You can manually run this script in phpMyAdmin or command line to initialize the database.

CREATE DATABASE IF NOT EXISTS `simple_reviewer` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `simple_reviewer`;

-- 1. Configuration Settings
CREATE TABLE IF NOT EXISTS `settings` (
    `key` VARCHAR(255) PRIMARY KEY,
    `value` TEXT NOT NULL
) ENGINE=InnoDB;

-- 2. Reviewer Sessions
CREATE TABLE IF NOT EXISTS `reviewers` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `title` VARCHAR(255) NOT NULL,
    `original_filename` VARCHAR(255) NOT NULL,
    `summary` TEXT DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 3. Flashcards
CREATE TABLE IF NOT EXISTS `flashcards` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `reviewer_id` INT NOT NULL,
    `question` TEXT NOT NULL,
    `answer` TEXT NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`reviewer_id`) REFERENCES `reviewers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 4. Quiz Questions (Multiple Choice & Fill in the Blank)
CREATE TABLE IF NOT EXISTS `quiz_questions` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `reviewer_id` INT NOT NULL,
    `type` VARCHAR(50) NOT NULL, -- 'multiple_choice' or 'fill_in_the_blank'
    `question` TEXT NOT NULL,
    `correct_answer` VARCHAR(255) NOT NULL,
    `choices` TEXT DEFAULT NULL, -- JSON formatted array for multiple choice questions, NULL for fill in the blank
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`reviewer_id`) REFERENCES `reviewers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;
