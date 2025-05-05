const db = require('../config/db');

exports.getAllPokemon = (req, res) => {
  db.query('SELECT * FROM pokemon', (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(results);
  });
};
