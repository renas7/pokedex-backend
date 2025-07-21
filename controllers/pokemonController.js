const db = require('../config/database');

exports.getAllPokemon = (req, res) => {
  const query = `
  SELECT 
    p.id, p.name, p.number, p.species, p.height, p.weight, p.generation,
    p.base_experience, p.capture_rate,
    pt.types,
    JSON_ARRAYAGG(JSON_OBJECT('game', d.game_version, 'text', d.description)) AS descriptions
  FROM pokemon p

  LEFT JOIN (
    SELECT 
      p.id AS pokemon_id,
      JSON_ARRAYAGG(t.name) AS types
    FROM pokemon p
    JOIN pokemon_types pt ON p.id = pt.pokemon_id
    JOIN types t ON pt.type_id = t.id
    GROUP BY p.id
  ) AS pt ON p.id = pt.pokemon_id

  LEFT JOIN descriptions d ON p.id = d.pokemon_id
  GROUP BY p.id;
  `;

db.query(query, (err, results) => {
  if (err) {
    console.error('❌ SQL Error:', err); // 👈 Add this
    return res.status(500).json({ error: 'Database error' });
  }
  res.json(results);
});
};
