// index.js (Server)
require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const path = require('path');
// const mysql = require('mysql2/promise'); // REMOVED: db connection is now centralized
const db = require('./config/db'); // IMPORTED: Centralized database connection pool

const { GoogleGenerativeAI } = require('@google/generative-ai');

// IMPORT: User routes
const userRoutes = require('./routes/userRoutes');

const app = express();
const port = process.env.PORT || 3000;

// --- MIDDLEWARE ---
app.use(express.json()); // Middleware to parse JSON bodies for POST/PUT requests

// Serve static files from the 'public' directory
// IMPORTANT: Ensure your index.html, script.js, style.css are inside a 'public' folder
app.use(express.static(path.join(__dirname, 'public')));


// --- Database Connection Test (Now handled directly in config/db.js upon import) ---
// The db.js file itself will log connection status and exit if it fails.
// So, you don't need this block here anymore.
/*
pool.getConnection()
    .then(connection => {
        console.log('Successfully connected to the MySQL database!');
        connection.release();
    })
    .catch(err => {
        console.error('Failed to connect to the database:', err.message);
        console.error('Please ensure your MySQL server is running and .env variables (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME) are correct.');
    });
*/


// --- ROUTES ---

// MOUNT: User authentication routes
app.use('/api/users', userRoutes);

// --- API Endpoint: Generate AI Sentence ---
app.get('/api/generate-ai-sentence', async (req, res) => {
    const { prompt } = req.query; // Expect a prompt from the client
    if (!prompt) {
        return res.status(400).json({ message: 'Prompt is required.' });
    }

    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); // Initialize here to ensure key is available
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Use the flash model

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        res.json({ generatedText: text });
    } catch (error) {
        console.error('Error calling Gemini API:', error);
        res.status(500).json({ message: 'Failed to generate content with AI.', error: error.message });
    }
});


// --- API Endpoint: Fetch Vocabulary ---
app.get('/api/vocabulary', async (req, res) => {
    try {
        // Query all words from the vocabulary table
        const [vocabularyRows] = await db.query('SELECT amharic_word AS amharic, german_word AS german FROM vocabulary');

        // Query sentences from a 'sentences' table if it exists
        // If you don't have a 'sentences' table, you might remove this or keep hardcoded if needed elsewhere
        const [sentencesRows] = await db.query('SELECT german, amharic, blank FROM sentences');

        res.json({ vocabulary: vocabularyRows, sentences: sentencesRows });
    } catch (error) {
        console.error('Error fetching vocabulary from database:', error.message);
        res.status(500).json({ message: 'Error fetching vocabulary data.' });
    }
});


// Catch-all to serve index.html for any other routes (SPA routing)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- START SERVER ---
app.listen(port, () => {
    console.log(`Amharic LinguaQuest app listening at http://localhost:${port}`);
    console.log(`Open your browser at http://localhost:${port}`);
});
