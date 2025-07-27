const express = require('express');
const path = require('path');
const app = express();
const port = 3000;

// Serve static files from the current directory (where index.js resides)
// WARNING: This makes ALL files in your project directory publicly accessible.
// Be careful not to expose sensitive files (like node_modules, .env, etc.)
app.use(express.static(__dirname)); 

// Optionally, if you only want to serve index.html directly from the root
// and still have other files served via static middleware:
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(port, () => {
    console.log(`Amharic LinguaQuest app listening at http://localhost:${port}`);
});
