// config/db.js
const mysql = require('mysql2/promise'); // Using the promise-based API
require('dotenv').config(); // Load environment variables

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'sql7.freesqldatabase.com',
    user: process.env.DB_USER || 'sql7792354',
    password: process.env.DB_PASSWORD || 'pVdQIvqw3z',
    database: process.env.DB_NAME || 'sql7792354',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4' // Ensure UTF-8 support
});

// Test the connection pool (optional, but good for debugging)
pool.getConnection()
    .then(connection => {
        console.log('MySQL Pool connected successfully!');
        connection.release();
    })
    .catch(err => {
        console.error('Failed to connect to MySQL Pool:', err.message);
        process.exit(1); // Exit process if database connection fails
    });


module.exports = pool;
