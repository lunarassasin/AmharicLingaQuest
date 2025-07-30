// index.js (Server)
require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const path = require('path');
const moment = require('moment'); // IMPORT: moment.js for date manipulation

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
app.use(express.static(__dirname));

// --- HELPER FUNCTIONS FOR SRS ---

// Helper function for SRS logic (simplified SM-2 inspired)
// This function determines the next review interval and srs_level based on correctness.
function calculateSrsProgress(currentSrsLevel, isCorrect) {
    let newSrsLevel = currentSrsLevel;
    let nextIntervalDays;

    if (isCorrect) {
        newSrsLevel++; // Increment level on correct answer
        if (newSrsLevel === 1) {
            nextIntervalDays = 1; // 1 day after first correct
        } else if (newSrsLevel === 2) {
            nextIntervalDays = 6; // 6 days after second correct
        } else {
            // Exponentially increasing intervals for higher levels
            // You can adjust the multiplier (e.g., 2.5, 3.0) for faster/slower progression
            nextIntervalDays = Math.round(currentSrsLevel * 2.5);
            // Ensure interval keeps increasing for higher levels, even if calculation is small
            if (nextIntervalDays < currentSrsLevel + 1) nextIntervalDays = currentSrsLevel + 1;
        }
    } else {
        newSrsLevel = 0; // Reset level on incorrect answer
        nextIntervalDays = 0; // Immediate review (today)
    }

    // Ensure nextIntervalDays is at least 0 (for immediate review on incorrect)
    nextIntervalDays = Math.max(0, nextIntervalDays);

    const nextReviewDate = moment().add(nextIntervalDays, 'days').format('YYYY-MM-DD');
    const lastViewedAt = moment().format('YYYY-MM-DD HH:mm:ss'); // Current timestamp

    return {
        newSrsLevel,
        nextReviewDate,
        lastViewedAt
    };
}

// Helper function to parse Gemini's specific output format (kept from your original)
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

// --- ROUTES ---

// MOUNT: User authentication routes
app.use('/api/users', userRoutes);

// --- MODIFIED: API Endpoint to Generate AI Sentence ---
app.get('/api/generate-ai-sentence', async (req, res) => {
    try {
        // 1. Fetch a random word from the vocabulary table
        // We now need the vocabulary ID for SRS tracking if this word is used.
        const [vocabWords] = await db.query('SELECT id, amharic_word, german_word FROM vocabulary ORDER BY RAND() LIMIT 1');
        if (vocabWords.length === 0) {
            return res.status(404).json({ message: 'No vocabulary words found to generate a sentence.' });
        }
        const randomVocabWord = vocabWords[0];
        const { id, amharic_word, german_word } = randomVocabWord; // Get the ID here

        // 2. Construct a detailed prompt for Gemini
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

        // Add the vocabulary ID to the parsed sentence object before sending to frontend
        parsedSentence.vocabulary_id = id;

        res.json(parsedSentence); // Send the parsed structure to the frontend

    } catch (error) {
        console.error('Error in /api/generate-ai-sentence:', error);
        res.status(500).json({ message: 'Failed to generate content with AI.', error: error.message });
    }
});



/// **SRS, XP, and Daily Streak Management**
/// This new endpoint handles updating user progress for SRS, awarding XP, and managing the daily streak.


app.post('/api/vocabulary/update_srs', async (req, res) => {
    const { userId, vocabularyId, isCorrect } = req.body;
    if (!userId || vocabularyId === undefined || isCorrect === undefined) {
        return res.status(400).json({ message: 'Missing required parameters (userId, vocabularyId, isCorrect).' });
    }

    try {
        // 1. Fetch current progress for the word/user
        let [progressRows] = await db.query(
            'SELECT srs_level, next_review_date, last_viewed_at FROM user_vocabulary_progress WHERE user_id = ? AND vocabulary_id = ?',
            [userId, vocabularyId]
        );

        let currentSrsLevel = progressRows.length > 0 ? progressRows[0].srs_level : 0;

        // 2. Calculate new SRS parameters using the helper function
        const { newSrsLevel, nextReviewDate, lastViewedAt } = calculateSrsProgress(currentSrsLevel, isCorrect);

        // 3. Update or insert SRS progress for the vocabulary word
        await db.query(
            `INSERT INTO user_vocabulary_progress (user_id, vocabulary_id, srs_level, next_review_date, last_viewed_at)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                srs_level = VALUES(srs_level),
                next_review_date = VALUES(next_review_date),
                last_viewed_at = VALUES(last_viewed_at)`,
            [userId, vocabularyId, newSrsLevel, nextReviewDate, lastViewedAt]
        );

        // 4. Update XP for the user
        let xpAwarded = 0;
        if (isCorrect) {
            xpAwarded = 10; // Award 10 XP for a correct answer
            await db.query('UPDATE users SET xp = xp + ? WHERE id = ?', [xpAwarded, userId]);
        }

        // 5. Update Daily Streak Logic
        const today = moment().format('YYYY-MM-DD');
        let [userRows] = await db.query('SELECT daily_streak, last_learning_date, highest_streak FROM users WHERE id = ?', [userId]);
        let user = userRows[0];

        let newDailyStreak = user.daily_streak;
        let newHighestStreak = user.highest_streak;

        // Check if learning activity happened today
        if (!user.last_learning_date || moment(user.last_learning_date).isBefore(today, 'day')) {
            // If last learning was not today
            if (moment(user.last_learning_date).isSame(moment().subtract(1, 'day'), 'day')) {
                // If last learning was yesterday, increment streak
                newDailyStreak++;
            } else {
                // If not yesterday (or first learning activity), reset streak to 1
                newDailyStreak = 1;
            }
            // Update highest streak if current one is higher
            if (newDailyStreak > newHighestStreak) {
                newHighestStreak = newDailyStreak;
            }
            await db.query('UPDATE users SET daily_streak = ?, last_learning_date = ?, highest_streak = ? WHERE id = ?',
                [newDailyStreak, today, newHighestStreak, userId]);
        }
        // If last_learning_date is today, no change to streak or last_learning_date

        res.json({ success: true, xpAwarded, newDailyStreak, newHighestStreak });

    } catch (error) {
        console.error('Error updating SRS, XP or streak:', error);
        res.status(500).json({ message: 'Failed to update progress.', error: error.message });
    }
});
