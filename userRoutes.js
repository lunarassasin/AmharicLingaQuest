// routes/userRoutes.js
// --- IMPORTS ---
const express = require('express');
const bcrypt = require('bcryptjs'); // For hashing passwords
const jwt = require('jsonwebtoken'); // For creating JSON Web Tokens
const db = require('./db'); // Our database connection pool

// --- INITIALIZE ROUTER ---
const router = express.Router();

// --- SRS HELPER FUNCTION ---
// Calculates the next review date based on the SRS level.
const getNextReviewDate = (srsLevel) => {
    const now = new Date();
    // Intervals in days based on SRS level. Adjust as needed.
    // Level 0: New word, often reviewed within minutes/hours or same day.
    // Level 1: First successful review, next review after 1 day.
    // Level 2: Next review after 2 days from last.
    // Level 3: Next review after 7 days from last.
    // ... and so on.
    const daysToAdd = [0, 1, 2, 7, 14, 30, 90, 180, 365];
    const interval = daysToAdd[srsLevel] !== undefined ? daysToAdd[srsLevel] : 1; // Default to 1 day if level is out of bounds
    now.setDate(now.getDate() + interval);
    return now.toISOString().split('T')[0]; // Return date in YYYY-MM-DD format
};


// --- API ENDPOINT: POST /api/users/register ---
// Handles new user registration.
router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        // 1. Validation: Check if username and password are provided
        if (!username || !password) {
            return res.status(400).json({ msg: 'Please enter all fields' });
        }

        // 2. Check for existing user
        const [existingUsers] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        if (existingUsers.length > 0) {
            return res.status(400).json({ msg: 'User with this username already exists' });
        }

        // 3. Hash the password for security
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // 4. Insert the new user into the database
        const [newUserResult] = await db.query(
            'INSERT INTO users (username, password_hash) VALUES (?, ?)',
            [username, passwordHash]
        );

        const newUserId = newUserResult.insertId;

        // 5. Respond with success
        res.status(201).json({
            msg: 'User registered successfully!',
            userId: newUserId,
            username: username
        });

    } catch (err) {
        console.error('Error during user registration:', err.message);
        res.status(500).send('Server Error during registration');
    }
});


// --- API ENDPOINT: POST /api/users/login ---
// Handles user login.
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // 1. Validation
        if (!username || !password) {
            return res.status(400).json({ msg: 'Please enter all fields' });
        }

        // 2. Find the user in the database
        const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        const user = users[0];
        if (!user) {
            return res.status(400).json({ msg: 'Invalid credentials' });
        }

        // 3. Compare the provided password with the stored hash
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid credentials' });
        }

        // 4. Create a JSON Web Token (JWT)
        const payload = {
            user: {
                id: user.user_id
            }
        };

        // Ensure you have JWT_SECRET in your .env file!
        // e.g., JWT_SECRET=some_very_secret_random_string_here_12345
        jwt.sign(
            payload,
            process.env.JWT_SECRET || 'supersecretdefaultjwtkey', // Use a secret from .env file or a strong default
            { expiresIn: '3h' }, // Token expires in 3 hours
            (err, token) => {
                if (err) throw err;
                // 5. Send the token back to the client
                res.json({
                    token,
                    user: {
                        id: user.user_id,
                        username: user.username,
                        xp: user.xp,
                        level: user.level
                    }
                });
            }
        );

    } catch (err) {
        console.error('Error during user login:', err.message);
        res.status(500).send('Server Error during login');
    }
});

module.exports = router;
