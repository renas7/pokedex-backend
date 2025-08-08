//const mysql = require('mysql2');
// const mysql = require('mysql2/promise');

// const db = mysql.createConnection({
//   host: 'localhost',
//   user: 'root',
//   password: 'charles@6378',
//   database: 'pokedex'
// });

// db.connect((err) => {
//   if (err) throw err;
//   console.log('✅ MySQL connected.');
// });

// module.exports = db;
// const pool = mysql.createPool({
//   host: process.env.DB_HOST || 'localhost',
//   user: process.env.DB_USER || 'root',
//   password: process.env.DB_PASS || 'charles@6378',
//   database: process.env.DB_NAME || 'pokedex',
//   waitForConnections: true,
//   connectionLimit: 10,
//   queueLimit: 0
// });


// module.exports = pool;

const mysql = require('mysql2'); // <-- NOT 'mysql2/promise'

// const db = mysql.createPool({
//   host: process.env.DB_HOST || 'localhost',
//   user: process.env.DB_USER || 'root',
//   password: process.env.DB_PASS || 'charles@6378',
//   database: process.env.DB_NAME || 'pokedex',
//   waitForConnections: true,
//   connectionLimit: 10,
//   queueLimit: 0
// });

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'charles@6378',
  database: 'pokedex'
});

db.connect((err) => {
  if (err) throw err;
  console.log('✅ MySQL connected.');
});

module.exports = db; // exports a callback-style pool