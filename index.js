const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000; // Use Render's port or default to 3000

// Serve static files from the current directory
// WARNING: This makes ALL files in your project directory publicly accessible.
// For production, a dedicated 'public' folder is highly recommended for security.
app.use(express.static(__dirname)); 

// Route for the home page (serves index.html from the current directory)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(port, () => {
    console.log(`Amharic LinguaQuest app listening at http://localhost:${port}`);
});
