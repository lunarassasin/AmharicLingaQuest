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
app.use(express.static(__dirname));

// --- HELPER FUNCTIONS FOR SRS ---

// Helper function for SRS logic (simplified SM-2 inspired)
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
            nextIntervalDays = Math.round(currentSrsLevel * 2.5);
            // Ensure interval keeps increasing for higher levels, even if calculation is small
            if (nextIntervalDays < currentSrsLevel + 1) nextIntervalDays = currentSrsLevel + 1;
        }
    } else {
        newSrsLevel = 0; // Reset level on incorrect answer
        nextIntervalDays = 0; // Immediate review (today)
    }

    nextIntervalDays = Math.max(0, nextIntervalDays);

    const nextReviewDate = moment().add(nextIntervalDays, 'days').format('YYYY-MM-DD');
    const lastReviewedAt = moment().format('YYYY-MM-DD HH:mm:ss'); // Current timestamp for last_reviewed_at

    return {
        newSrsLevel,
        nextReviewDate,
        lastReviewedAt
    };
}

// Helper function to parse Gemini's specific output format dynamically based on sourceLanguage
function parseGeminiSentenceOutput(text, sourceLanguage) {
    const sourceLanguageLabel = sourceLanguage.charAt(0).toUpperCase() + sourceLanguage.slice(1); // Capitalize first letter
    const sourceLanguageSentenceMatch = text.match(new RegExp(`${sourceLanguageLabel}: "(.*?)"`)); // Dynamic regex
    const amharicMatch = text.match(/Amharic: "(.*?)"/);
    const blankWordMatch = text.match(/BlankWord: "(.*?)"/);

    if (sourceLanguageSentenceMatch && amharicMatch && blankWordMatch) {
        return {
            sourceLanguageSentence: sourceLanguageSentenceMatch[1],
            amharic: amharicMatch[1],
            blank: blankWordMatch[1]
        };
    }
    return null;
}

// --- ROUTES ---

// MOUNT: User authentication routes
app.use('/api/users', userRoutes);

// --- API Endpoint to Generate AI Sentence ---
// Now accepts sourceLanguage as a query parameter
app.get('/api/generate-ai-sentence', async (req, res) => {
    const { sourceLanguage } = req.query; // Get the selected source language
    const sourceWordColumn = `${sourceLanguage}_word`; // e.g., 'english_word'

    // Basic validation for sourceLanguage
    if (!['german', 'english', 'french', 'spanish'].includes(sourceLanguage)) {
        return res.status(400).json({ message: 'Invalid source language provided.' });
    }

    try {
        // 1. Fetch a random word from the vocabulary table, ensuring it has a translation in the selected source language
        // Select all source language columns to pass to the prompt
        const [vocabWords] = await db.query(
            `SELECT id, amharic_word, german_word, english_word, french_word, spanish_word FROM vocabulary WHERE ${sourceWordColumn} IS NOT NULL ORDER BY RAND() LIMIT 1`
        );
        if (vocabWords.length === 0) {
            return res.status(404).json({ message: `No vocabulary words found for ${sourceLanguage} to generate a sentence.` });
        }
        const randomVocabWord = vocabWords[0];
        const vocabId = randomVocabWord.id;
        const amharic_word = randomVocabWord.amharic_word;
        const source_word = randomVocabWord[sourceWordColumn]; // Get the word in the selected source language

        // 2. Construct a detailed prompt for Gemini
        // The prompt is now dynamic based on the sourceLanguage
        const prompt = `Create a short, simple Amharic sentence using the Amharic word "${amharic_word}".
        Provide the ${sourceLanguage} translation of the sentence.
        Identify the ${sourceLanguage} word that should be replaced with a blank in the sentence (this will be "${source_word}").
        The output should strictly follow this format:
        ${sourceLanguage.charAt(0).toUpperCase() + sourceLanguage.slice(1)}: "..."
        Amharic: "..." (with blank placeholder '____' for the word "${amharic_word}")
        BlankWord: "${source_word}"
        
        Example (using 'water' in English):
        English: "I drink water."
        Amharic: "እኔ ____ እጠጣለሁ።"
        BlankWord: "water"

        Now, generate a sentence using "${amharic_word}" (${sourceLanguage}: "${source_word}"):`;

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // 3. Call Gemini API
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // 4. Parse Gemini's response to extract structured data
        const parsedSentence = parseGeminiSentenceOutput(text, sourceLanguage); // Pass sourceLanguage here

        if (!parsedSentence) {
            console.error("Failed to parse Gemini output:", text);
            return res.status(500).json({ message: 'Failed to parse AI generated sentence. Please try again.', raw: text });
        }

        // The 'sourceLanguageSentence' property in parsedSentence holds the sentence in the selected source language
        const finalSentenceData = {
            [sourceLanguage]: parsedSentence.sourceLanguageSentence, // The sentence in the selected source language
            amharic: parsedSentence.amharic,
            blank: parsedSentence.blank, // The blank word in the selected source language
            vocabulary_id: vocabId
        };

        res.json(finalSentenceData);

    } catch (error) {
        console.error('Error in /api/generate-ai-sentence:', error);
        res.status(500).json({ message: 'Failed to generate content with AI.', error: error.message });
    }
});

// --- NEW API Endpoint for Text-to-Speech (TTS) ---
app.post('/api/synthesize-amharic-speech', async (req, res) => {
    const { text, lang } = req.body; // Expect text and language (e.g., 'am-ET')

    if (!text || !lang) {
        return res.status(400).json({ message: 'Missing text or language for speech synthesis.' });
    }

    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-tts" });

        const payload = {
            contents: [{
                parts: [{ text: text }]
            }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: "Kore" } // Using 'Kore' voice for Amharic
                    }
                }
            },
            model: "gemini-2.5-flash-preview-tts"
        };

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${process.env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini TTS API error:', response.status, errorText);
            throw new Error(`Gemini TTS API responded with status ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        const part = result?.candidates?.[0]?.content?.parts?.[0];
        const audioData = part?.inlineData?.data;
        const mimeType = part?.inlineData?.mimeType;

        if (audioData && mimeType && mimeType.startsWith("audio/L16")) {
            // Extract sample rate from mimeType, e.g., "audio/L16;rate=16000"
            const sampleRateMatch = mimeType.match(/rate=(\d+)/);
            const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1], 10) : 16000; // Default to 16000 if not found

            res.json({ audioData, mimeType, sampleRate });
        } else {
            console.error("Invalid audio data structure from Gemini TTS:", result);
            res.status(500).json({ message: 'Failed to retrieve valid audio data from TTS API.' });
        }

    } catch (error) {
        console.error('Error in /api/synthesize-amharic-speech:', error);
        res.status(500).json({ message: 'Failed to synthesize speech.', error: error.message });
    }
});


// --- SRS Update (per question) ---
app.post('/api/vocabulary/update_srs', async (req, res) => {
    const { userId, vocabularyId, isCorrect } = req.body;
    if (!userId || vocabularyId === undefined || isCorrect === undefined) {
        return res.status(400).json({ message: 'Missing required parameters (userId, vocabularyId, isCorrect).' });
    }

    try {
        // 1. Fetch current progress for the word/user
        let [progressRows] = await db.query(
            'SELECT srs_level, next_review_date, last_reviewed_at FROM user_vocabulary_progress WHERE user_id = ? AND vocabulary_id = ?',
            [userId, vocabularyId]
        );

        let currentSrsLevel = progressRows.length > 0 ? progressRows[0].srs_level : 0;

        // 2. Calculate new SRS parameters using the helper function
        const { newSrsLevel, nextReviewDate, lastReviewedAt } = calculateSrsProgress(currentSrsLevel, isCorrect);

        // 3. Update or insert SRS progress for the vocabulary word
        await db.query(
            `INSERT INTO user_vocabulary_progress (user_id, vocabulary_id, srs_level, next_review_date, last_reviewed_at)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                 srs_level = VALUES(srs_level),
                 next_review_date = VALUES(next_review_date),
                 last_reviewed_at = VALUES(last_reviewed_at)`,
            [userId, vocabularyId, newSrsLevel, nextReviewDate, lastReviewedAt]
        );

        res.json({ success: true, message: 'SRS progress updated.' });

    } catch (error) {
        console.error('Error updating SRS progress:', error);
        res.status(500).json({ message: 'Failed to update SRS progress.', error: error.message });
    }
});


// --- Exercise Completion Endpoint (for XP and Daily Streak) ---
app.post('/api/exercise/complete', async (req, res) => {
    const { userId, exerciseMode, score, totalQuestions } = req.body;
    if (!userId || !exerciseMode) {
        return res.status(400).json({ message: 'Missing required parameters (userId, exerciseMode).' });
    }

    try {
        const xpAwardedForExercise = 50; // Fixed XP for completing an exercise

        // 1. Update XP for the user
        await db.query('UPDATE users SET xp = xp + ? WHERE user_id = ?', [xpAwardedForExercise, userId]);

        // 2. Update Daily Streak Logic
        const today = moment().format('YYYY-MM-DD');
        let [userRows] = await db.query('SELECT daily_streak, last_learning_date, highest_streak FROM users WHERE user_id = ?', [userId]);
        let user = userRows[0];

        let newDailyStreak = user.daily_streak;
        let newHighestStreak = user.highest_streak;
        let streakIncreased = false;

        // Check if learning activity happened today
        if (!user.last_learning_date || moment(user.last_learning_date).isBefore(today, 'day')) {
            // If last learning was not today
            if (user.last_learning_date && moment(user.last_learning_date).isSame(moment().subtract(1, 'day'), 'day')) {
                // If last learning was yesterday, increment streak
                newDailyStreak++;
                streakIncreased = true;
            } else {
                // If not yesterday (or first learning activity), reset streak to 1
                newDailyStreak = 1;
                streakIncreased = true; // Streak is "new" or "reset", counts as an activity for today
            }
            // Update highest streak if current one is higher
            if (newDailyStreak > newHighestStreak) {
                newHighestStreak = newDailyStreak;
            }
            // Update last_learning_date only if streak was increased or reset for today
            await db.query('UPDATE users SET daily_streak = ?, last_learning_date = ?, highest_streak = ? WHERE user_id = ?',
                [newDailyStreak, today, newHighestStreak, userId]);
        }
        // If last_learning_date is today, no change to streak or last_learning_date,
        // but XP is still awarded.

        // 3. Fetch the *current* total XP after update to send back
        const [updatedUserRows] = await db.query('SELECT xp, daily_streak, highest_streak FROM users WHERE user_id = ?', [userId]);
        const updatedUser = updatedUserRows[0];

        res.json({
            success: true,
            xpAwarded: xpAwardedForExercise, // XP awarded for this specific exercise
            totalXp: updatedUser.xp,       // User's total XP
            newDailyStreak: updatedUser.daily_streak,
            newHighestStreak: updatedUser.highest_streak,
            streakIncreasedToday: streakIncreased // Indicate if streak was affected today
        });

    } catch (error) {
        console.error('Error completing exercise and updating XP/streak:', error);
        res.status(500).json({ message: 'Failed to complete exercise and update progress.', error: error.message });
    }
});


// --- User Profile Endpoint ---
app.get('/api/user/profile/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        // Also fetch preferred_source_language
        const [userRows] = await db.query('SELECT username, xp, daily_streak, highest_streak, preferred_source_language FROM users WHERE user_id = ?', [userId]);
        if (userRows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }
        res.json(userRows[0]);
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ message: 'Failed to fetch user profile.', error: error.message });
    }
});

// --- NEW: API Endpoint to update user's preferred source language ---
app.post('/api/user/update_language', async (req, res) => {
    const { userId, language } = req.body;
    if (!userId || !language) {
        return res.status(400).json({ message: 'Missing userId or language.' });
    }
    if (!['german', 'english', 'french', 'spanish'].includes(language)) {
        return res.status(400).json({ message: 'Invalid language provided.' });
    }

    try {
        await db.query('UPDATE users SET preferred_source_language = ? WHERE user_id = ?', [language, userId]);
        res.json({ success: true, message: 'Preferred language updated successfully.' });
    } catch (error) {
        console.error('Error updating preferred language:', error);
        res.status(500).json({ message: 'Failed to update preferred language.', error: error.message });
    }
});


// --- NEW: API Endpoint to Fetch All Lessons ---
app.get('/api/lessons', async (req, res) => {
    try {
        const [lessons] = await db.query('SELECT id, name, description FROM lessons ORDER BY name ASC');
        res.json(lessons);
    } catch (error) {
        console.error('Error fetching lessons:', error);
        res.status(500).json({ message: 'Failed to fetch lessons.', error: error.message });
    }
});


// --- UPDATED: API Endpoint to Fetch Vocabulary (with SRS logic, dynamic language, and optional lesson filter) ---
app.get('/api/vocabulary', async (req, res) => {
    const userId = req.query.userId;
    const sourceLanguage = req.query.sourceLanguage || 'english'; // Default to ENGLISH if not provided
    const lessonId = req.query.lessonId; // NEW: Get lessonId from query parameters

    const sourceWordColumn = `${sourceLanguage}_word`; // e.g., 'english_word'
    // No sourceSentenceColumn needed as sentences are AI generated

    // Basic validation for sourceLanguage
    if (!['german', 'english', 'french', 'spanish'].includes(sourceLanguage)) {
        return res.status(400).json({ message: 'Invalid source language provided.' });
    }

    try {
        // Fetch vocabulary based on the selected source language
        // Select all source language columns for flexibility on frontend
        let vocabQuery = `
            SELECT v.id AS vocabulary_id, v.amharic_word AS amharic,
                   v.german_word AS german_word, v.english_word AS english_word,
                   v.french_word AS french_word, v.spanish_word AS spanish_word,
                   COALESCE(uvp.srs_level, 0) AS srs_level,
                   COALESCE(uvp.next_review_date, '1970-01-01') AS next_review_date
            FROM vocabulary v
            LEFT JOIN user_vocabulary_progress uvp ON v.id = uvp.vocabulary_id AND uvp.user_id = ?
            WHERE v.${sourceWordColumn} IS NOT NULL`; // Only fetch words that have a translation in the selected source language
        
        const queryParams = [userId];

        // NEW: Add lesson filter if lessonId is provided
        if (lessonId) {
            vocabQuery += ` AND v.lesson_id = ?`;
            queryParams.push(lessonId);
        }

        vocabQuery += `
             AND (uvp.next_review_date IS NULL OR uvp.next_review_date <= CURDATE())
             ORDER BY (uvp.next_review_date IS NULL) DESC, uvp.next_review_date ASC, RAND()
             LIMIT 20;
         `;
        const [vocabulary] = await db.query(vocabQuery, queryParams); // Pass queryParams array

        // Sentences array will be empty as they are AI generated on demand for fill-blank
        let sentences = [];

        res.json({ vocabulary, sentences, sourceLanguage }); // Also send back the sourceLanguage for frontend confirmation
    } catch (error) {
        console.error('Error fetching vocabulary:', error);
        res.status(500).json({ message: 'Failed to fetch vocabulary.', error: error.message });
    }
});


// --- CATCH-ALL ROUTE for Frontend Routing (MUST BE THE LAST ROUTE!) ---
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- START THE SERVER ---
app.listen(port, () => {
    console.log(`Amharic LinguaQuest app listening at http://localhost:${port}`);
    console.log(`Open your browser at http://localhost:${port}`);
});
