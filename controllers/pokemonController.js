//const db = require('../config/database');

// exports.getAllPokemon = (req, res) => {
//   const query = `
//   SELECT 
//     p.id, p.name, p.number, p.species, p.height, p.weight, p.generation,
//     p.base_experience, p.capture_rate,
//     pt.types,
//     JSON_ARRAYAGG(JSON_OBJECT('game', d.game_version, 'text', d.description)) AS descriptions
//   FROM pokemon p

//   LEFT JOIN (
//     SELECT 
//       p.id AS pokemon_id,
//       JSON_ARRAYAGG(t.name) AS types
//     FROM pokemon p
//     JOIN pokemon_types pt ON p.id = pt.pokemon_id
//     JOIN types t ON pt.type_id = t.id
//     GROUP BY p.id
//   ) AS pt ON p.id = pt.pokemon_id

//   LEFT JOIN descriptions d ON p.id = d.pokemon_id
//   GROUP BY p.id;
//   `;

// db.query(query, (err, results) => {
//   if (err) {
//     console.error('❌ SQL Error:', err); // 👈 Add this
//     return res.status(500).json({ error: 'Database error' });
//   }
//   res.json(results);
// });
// };

const db = require('../config/database');

// GET /pokemon
exports.getAllPokemon = (req, res) => {
  const mainQuery = `
    SELECT 
      p.id, p.name, p.number, p.species, p.height, p.weight, p.generation,
      p.base_experience, p.capture_rate, p.hatch_time, p.base_friendship,
      p.gender_male, p.gender_female,
      pt.types,
      JSON_ARRAYAGG(
        JSON_OBJECT('game', d.game_version, 'text', d.description)
      ) AS descriptions
    FROM pokemon p
    -- Subquery to aggregate types separately (avoids duplicates)
    LEFT JOIN (
      SELECT p2.id AS pokemon_id,
             JSON_ARRAYAGG(t.name) AS types
      FROM pokemon p2
      JOIN pokemon_types pt2 ON p2.id = pt2.pokemon_id
      JOIN types t ON pt2.type_id = t.id
      GROUP BY p2.id
    ) AS pt ON p.id = pt.pokemon_id
    LEFT JOIN pokemon_descriptions d ON p.id = d.pokemon_id
    GROUP BY p.id
  `;

  db.query(mainQuery, (err, results) => {
    if (err) {
      console.error(err); // log full error in terminal
      return res.status(500).json({ error: 'Database error' });
    }

    const pokemonList = results;

    // Fetch abilities
    const abilitiesQuery = `
      SELECT pa.pokemon_id, a.name, a.description, pa.is_hidden
      FROM pokemon_abilities pa
      JOIN abilities a ON pa.ability_id = a.id
    `;
    db.query(abilitiesQuery, (err, abilities) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
      }

      pokemonList.forEach(poke => {
        poke.abilities = abilities.filter(a => a.pokemon_id === poke.id);
      });

      // Fetch evolutions
      const evoQuery = `
        SELECT from_pokemon_id, to_pokemon_id, method, level
        FROM pokemon_evolutions
      `;
      db.query(evoQuery, (err, evolutions) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Database error' });
        }

        pokemonList.forEach(poke => {
          poke.evolutions = evolutions.filter(e => e.from_pokemon_id === poke.id);
        });

        // Fetch egg groups
        const eggQuery = `
          SELECT peg.pokemon_id, eg.name
          FROM pokemon_egg_groups peg
          JOIN egg_groups eg ON peg.egg_group_id = eg.id
        `;
        db.query(eggQuery, (err, eggs) => {
          if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
          }

          pokemonList.forEach(poke => {
            poke.egg_groups = eggs
              .filter(e => e.pokemon_id === poke.id)
              .map(e => e.name);
          });

          // Send combined JSON
          res.json(pokemonList);
        });
      });
    });
  });
};


exports.getPokemonById = (req, res) => {
  const id = parseInt(req.params.id, 10);

  const mainQuery = `
    SELECT 
      p.id, p.name, p.number, p.species, p.height, p.weight, p.generation,
      p.base_experience, p.capture_rate, p.hatch_time, p.base_friendship,
      p.gender_male, p.gender_female,
      pt.types,
      JSON_ARRAYAGG(
        JSON_OBJECT('game', d.game_version, 'text', d.description)
      ) AS descriptions
    FROM pokemon p
    LEFT JOIN (
      SELECT p2.id AS pokemon_id,
             JSON_ARRAYAGG(t.name) AS types
      FROM pokemon p2
      JOIN pokemon_types pt2 ON p2.id = pt2.pokemon_id
      JOIN types t ON pt2.type_id = t.id
      GROUP BY p2.id
    ) AS pt ON p.id = pt.pokemon_id
    LEFT JOIN pokemon_descriptions d ON p.id = d.pokemon_id
    WHERE p.id = ?
    GROUP BY p.id
  `;

  db.query(mainQuery, [id], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Pokémon not found' });
    }

    const pokemon = results[0];

    // Fetch abilities
    const abilitiesQuery = `
      SELECT pa.pokemon_id, a.name, a.description, pa.is_hidden
      FROM pokemon_abilities pa
      JOIN abilities a ON pa.ability_id = a.id
      WHERE pa.pokemon_id = ?
    `;
    db.query(abilitiesQuery, [id], (err, abilities) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
      }

      pokemon.abilities = abilities;

      // Fetch evolutions
      const evoQuery = `
        SELECT e.from_pokemon_id,
              p_from.name AS from_pokemon_name,
              e.to_pokemon_id,
              p_to.name AS to_pokemon_name,
              e.method,
              e.level
        FROM pokemon_evolutions e
        JOIN pokemon p_from ON e.from_pokemon_id = p_from.id
        JOIN pokemon p_to ON e.to_pokemon_id = p_to.id
      `;
      db.query(evoQuery, [id, id], (err, evolutions) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Database error' });
        }

        pokemon.evolutions = evolutions;

        // Fetch egg groups
        const eggQuery = `
          SELECT eg.name
          FROM pokemon_egg_groups peg
          JOIN egg_groups eg ON peg.egg_group_id = eg.id
          WHERE peg.pokemon_id = ?
        `;
        db.query(eggQuery, [id], (err, eggs) => {
          if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
          }

          pokemon.egg_groups = eggs.map(e => e.name);

          res.json(pokemon);
        });
      });
    });
  });
};


exports.getAllTypes = (req, res) => {
  db.query('SELECT id, name FROM types', (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
};

exports.addPokemon = (req, res) => {
  const { name, number, species, height, weight, type_ids } = req.body;

  db.query(
    'INSERT INTO pokemon (name, number, species, height, weight) VALUES (?, ?, ?, ?, ?)',
    [name, number, species, height, weight],
    (err, result) => {
      if (err) return res.status(500).json({ error: 'Insert error' });

      const pokemonId = result.insertId;
      if (!type_ids?.length) return res.json({ success: true });

      const typeValues = type_ids.map(id => [pokemonId, id]);
      db.query('INSERT INTO pokemon_types (pokemon_id, type_id) VALUES ?', [typeValues], (err) => {
        if (err) return res.status(500).json({ error: 'Type insert error' });
        res.json({ success: true });
      });
    }
  );
};