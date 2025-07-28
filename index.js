// index.js (Server)
require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise'); // Using promise-based MySQL client
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 3000;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Middleware to parse JSON bodies (if you add POST/PUT requests later)
app.use(express.json());

// --- Database Connection Pool ---
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'sql7.freesqldatabase.com', // Default to localhost if not set
    user: process.env.DB_USER || 'sql7792354',     // Default to root if not set
    password: process.env.DB_PASSWORD || 'pVdQIvqw3z', // Default to empty if not set
    database: process.env.DB_NAME || 'sql7792354', // Default DB name
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4'
});

// Test database connection on startup
pool.getConnection()
    .then(connection => {
        console.log('Successfully connected to the MySQL database!');
        connection.release(); // Release the connection immediately
    })
    .catch(err => {
        console.error('Failed to connect to the database:', err.message);
        console.error('Please ensure your MySQL server is running and .env variables (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME) are correct.');
        // Optionally exit the process if DB connection is critical
        // process.exit(1);
    });

app.get('/api/generate-ai-sentence', async (req, res) => {
    const { prompt } = req.query; // Expect a prompt from the client
    if (!prompt) {
        return res.status(400).json({ message: 'Prompt is required.' });
    }

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        res.json({ generatedText: text });
    } catch (error) {
        console.error('Error calling Gemini API:', error);
        res.status(500).json({ message: 'Failed to generate content with AI.', error: error.message });
    }
});


// --- API Endpoint to Fetch Vocabulary ---
app.get('/api/vocabulary', async (req, res) => {
    try {
        // Query all words from the vocabulary table
        const [rows] = await pool.query('SELECT amharic_word AS amharic, german_word AS german FROM vocabulary');

        // For now, sentences are hardcoded as you provided.
        // If you create a 'sentences' table in your DB, you'd fetch them similarly.
        const sentences = [
            { german: "Mein Name ist ____.", amharic: "ስሜ ____ ነው።", blank: "Name" },
            { german: "Ich trinke ____.", amharic: "እኔ ____ እጠጣለሁ።", blank: "Wasser" },
            { german: "Das ist mein ____.", amharic: "ይህ የኔ ____ ነው።", blank: "Haus" },
        ];

        res.json({ vocabulary: rows, sentences: sentences });
    } catch (error) {
        console.error('Error fetching vocabulary from database:', error);
        res.status(500).json({ message: 'Error fetching vocabulary data.' });
    }
});

// Serve static files from the current directory
// This will serve index.html, script.js, style.css, and any other static assets
app.use(express.static(__dirname));

// Catch-all to serve index.html for any other routes (SPA routing)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(port, () => {
    console.log(`Amharic LinguaQuest app listening at http://localhost:${port}`);
    console.log(`Open your browser at http://localhost:${port}`);
});
