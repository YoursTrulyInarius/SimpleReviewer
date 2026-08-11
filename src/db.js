const mysql = require('mysql2/promise');

const DB_NAME = 'simple_reviewer';
const DB_CONFIG = {
  host: 'localhost',
  user: 'root',
  password: ''
};

let pool = null;

async function init() {
  // Create database if missing and ensure tables exist
  const conn = await mysql.createConnection(DB_CONFIG);
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.end();

  pool = mysql.createPool({
    host: DB_CONFIG.host,
    user: DB_CONFIG.user,
    password: DB_CONFIG.password,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4'
  });

  // Ensure tables
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      \`key\` VARCHAR(255) PRIMARY KEY,
      \`value\` TEXT NOT NULL
    ) ENGINE=InnoDB;
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS reviewers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      original_filename VARCHAR(255) NOT NULL,
      summary TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS flashcards (
      id INT AUTO_INCREMENT PRIMARY KEY,
      reviewer_id INT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reviewer_id) REFERENCES reviewers(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  await pool.execute(`
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
  `);

  return pool;
}

function getPool() {
  if (!pool) throw new Error('DB not initialized. Call init() first.');
  return pool;
}

module.exports = { init, getPool };
