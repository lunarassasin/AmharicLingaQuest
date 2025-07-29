// index.js (Server)
require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const path = require('path');

// IMPORT: Centralized database connection pool (assuming db.js is in the SAME directory)
const db = require('./db');

const { GoogleGenerativeAI } = require('@google/generative-ai');

// IMPORT: User routes (assuming userRoutes.js is in the SAME directory)
const userRoutes = require('./userRoutes');

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

// --- MODIFIED: API Endpoint to Generate AI Sentence ---
app.get('/api/generate-ai-sentence', async (req, res) => {
    try {
        // 1. Fetch a random word from the vocabulary table
        const [vocabWords] = await db.query('SELECT amharic_word, german_word FROM vocabulary ORDER BY RAND() LIMIT 1');
        if (vocabWords.length === 0) {
            return res.status(404).json({ message: 'No vocabulary words found to generate a sentence.' });
        }
        const randomVocabWord = vocabWords[0];
        const { amharic_word, german_word } = randomVocabWord;

        // 2. Construct a detailed prompt for Gemini
        // This prompt instructs Gemini on the desired sentence, translation, and output format.
        const prompt = `Create a short, simple Amharic sentence using the Amharic word "${amharic_word}".
        Provide the German translation of the sentence.
        Identify the German word that should be replaced with a blank in the sentence (this will be "${german_word}").
        The output should strictly follow this format:
        German: "..."
        Amharic: "..." (with blank placeholder '____' for the word "${amharic_word}")
        BlankWord: "${german_word}"
        
        Example (using 'water'):
        German: "I drink water."
        Amharic: "እኔ ____ እጠጣለሁ።"
        BlankWord: "water"

        Now, generate a sentence using "${amharic_word}" (German: "${german_word}"):`;

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // 3. Call Gemini API
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // 4. Parse Gemini's response to extract structured data
        const parsedSentence = parseGeminiSentenceOutput(text);

        if (!parsedSentence) {
            console.error("Failed to parse Gemini output:", text);
            return res.status(500).json({ message: 'Failed to parse AI generated sentence. Please try again.', raw: text });
        }

        res.json(parsedSentence); // Send the parsed structure to the frontend

    } catch (error) {
        console.error('Error in /api/generate-ai-sentence:', error);
        res.status(500).json({ message: 'Failed to generate content with AI.', error: error.message });
    }
});

// Helper function to parse Gemini's specific output format
// This function is crucial for extracting the structured data from Gemini's text response.
function parseGeminiSentenceOutput(text) {
    const germanMatch = text.match(/German: "(.*?)"/);
    const amharicMatch = text.match(/Amharic: "(.*?)"/);
    const blankWordMatch = text.match(/BlankWord: "(.*?)"/);

    if (germanMatch && amharicMatch && blankWordMatch) {
        return {
            german: germanMatch[1],
            amharic: amharicMatch[1],
            blank: blankWordMatch[1] // This is the German word that was intended to be the blank
        };
    }
    return null;
}


// --- MODIFIED: API Endpoint to Fetch Vocabulary ---
app.get('/api/vocabulary', async (req, res) => {
    try {
        // Query all words from the vocabulary table
        const [vocabularyRows] = await db.query('SELECT amharic_word AS amharic, german_word AS german FROM vocabulary');

        let sentencesRows = [];
        try {
            // Attempt to query sentences from a 'sentences' table if it exists
            // This is wrapped in a try-catch to prevent crashes if the table doesn't exist.
            [sentencesRows] = await db.query('SELECT german, amharic, blank FROM sentences');
        } catch (sentencesError) {
            console.warn("Warning: Table 'sentences' doesn't exist or is inaccessible. Returning empty sentences array.", sentencesError.message);
            // If the sentences table doesn't exist, sentencesRows will remain an empty array.
        }

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
