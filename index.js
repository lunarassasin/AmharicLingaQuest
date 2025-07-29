// index.js (Server)
require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const path = require('path');

// IMPORT: Centralized database connection pool (assuming db.js is in the SAME directory)
const db = require('./db');

const { GoogleGenerativeAI } = require('@google/generative-ai');

// IMPORT: User routes (assuming userRoutes.js is in the SAME directory)
const userRoutes = require('./userRoutes'); // Changed path

const app = express();
const port = process.env.PORT || 3000;

// --- MIDDLEWARE ---
app.use(express.json()); // Middleware to parse JSON bodies for POST/PUT requests

// Serve static files from the current directory (where index.js resides)
// IMPORTANT: This means index.html, script.js, style.css, etc., should be in this folder.
app.use(express.static(__dirname)); // Changed static file serving to __dirname

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
// If index.html is in the same directory, path.join(__dirname, 'index.html') is correct.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- START SERVER ---
app.listen(port, () => {
    console.log(`Amharic LinguaQuest app listening at http://localhost:${port}`);
    console.log(`Open your browser at http://localhost:${port}`);
});
