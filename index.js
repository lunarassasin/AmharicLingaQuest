const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Serve static files from the current directory,
// explicitly setting index.html as the default file for root requests.
app.use(express.static(__dirname, { index: 'index.html' }));

// Remove or comment out this block:
// app.get('/', (req, res) => {
//     res.sendFile(path.join(__dirname, 'index.html'));
// });

// Start the server
app.listen(port, () => {
    console.log(`Amharic LinguaQuest app listening at http://localhost:${port}`);
});
