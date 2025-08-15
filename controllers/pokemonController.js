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
    GROUP BY p.number
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
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid Pokémon id' });
  }

  const mainQuery = `
    SELECT 
      p.id, p.name, p.number, p.species, p.height, p.weight, p.generation,
      p.base_experience, p.capture_rate, p.hatch_time, p.base_friendship,
      p.gender_male, p.gender_female,
      pt.types,
      JSON_ARRAYAGG(JSON_OBJECT('game', d.game_version, 'text', d.description)) AS descriptions
    FROM pokemon p
    LEFT JOIN (
      SELECT p2.id AS pokemon_id, JSON_ARRAYAGG(t.name) AS types
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

exports.createPokemon = (req, res) => {
  const db = require('../config/database'); // make sure it matches your setup
  const {
    name,
    number,
    species,
    height,
    weight,
    generation,
    base_experience,
    capture_rate,
    hatch_time,
    base_friendship,
    gender_male,
    gender_female,
    type_ids,
    abilities,
    egg_group_ids,
    stats,
    descriptions,
    evolutions,
    forms
  } = req.body;

  // Start transaction
  db.beginTransaction((err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Transaction start failed' });
    }

    // 1️⃣ Insert into pokemon
    db.query(
      `INSERT INTO pokemon
       (name, number, species, height, weight, generation,
        base_experience, capture_rate, hatch_time, base_friendship,
        gender_male, gender_female)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, number, species, height, weight, generation,
        base_experience, capture_rate, hatch_time, base_friendship,
        gender_male, gender_female
      ],
      (err, result) => {
        if (err) {
          return db.rollback(() => {
            console.error(err);
            res.status(400).json({ error: 'Failed insert: pokemon', detail: err.message });
          });
        }

        const pokemonId = result.insertId;

        // 2️⃣ Insert into pokemon_types
        if (Array.isArray(type_ids) && type_ids.length > 0) {
          const typeValues = type_ids.map(typeId => [pokemonId, typeId]);
          db.query(
            'INSERT INTO pokemon_types (pokemon_id, type_id) VALUES ?',
            [typeValues],
            (err) => {
              if (err) {
                return db.rollback(() => {
                  console.error(err);
                  res.status(400).json({ error: 'Failed insert: pokemon_types', detail: err.message });
                });
              }
            }
          );
        }

        // 3️⃣ Insert into pokemon_abilities
        if (Array.isArray(abilities) && abilities.length > 0) {
          const abilityValues = abilities.map(abilityId => [pokemonId, abilityId]);
          db.query(
            'INSERT INTO pokemon_abilities (pokemon_id, ability_id) VALUES ?',
            [abilityValues],
            (err) => {
              if (err) {
                return db.rollback(() => {
                  console.error(err);
                  res.status(400).json({ error: 'Failed insert: pokemon_abilities', detail: err.message });
                });
              }
            }
          );
        }

        // 4️⃣ Insert into pokemon_egg_groups
        if (Array.isArray(egg_group_ids) && egg_group_ids.length > 0) {
          const eggValues = egg_group_ids.map(eggId => [pokemonId, eggId]);
          db.query(
            'INSERT INTO pokemon_egg_groups (pokemon_id, egg_group_id) VALUES ?',
            [eggValues],
            (err) => {
              if (err) {
                return db.rollback(() => {
                  console.error(err);
                  res.status(400).json({ error: 'Failed insert: pokemon_egg_groups', detail: err.message });
                });
              }
            }
          );
        }

        // 5️⃣ Insert into pokemon_stats (column-based)
        if (stats && typeof stats === 'object') {
          db.query(
            `INSERT INTO pokemon_stats
              (pokemon_id, hp, attack, defense, sp_atk, sp_def, speed)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              pokemonId,
              stats.hp || null,
              stats.attack || null,
              stats.defense || null,
              stats.sp_atk || null,
              stats.sp_def || null,
              stats.speed || null
            ],
            (err) => {
              if (err) {
                return db.rollback(() => {
                  console.error(err);
                  res.status(400).json({ error: 'Failed insert: pokemon_stats', detail: err.message });
                });
              }
            }
          );
        }

        // 6️⃣ Insert into pokemon_descriptions
        if (Array.isArray(descriptions) && descriptions.length > 0) {
          const descValues = descriptions.map(d => [pokemonId, d.game, d.text]);
          db.query(
            'INSERT INTO pokemon_descriptions (pokemon_id, game_version, description) VALUES ?',
            [descValues],
            (err) => {
              if (err) {
                return db.rollback(() => {
                  console.error(err);
                  res.status(400).json({ error: 'Failed insert: pokemon_descriptions', detail: err.message });
                });
              }
            }
          );
        }

        // 7️⃣ Insert into pokemon_evolutions
        if (Array.isArray(evolutions) && evolutions.length > 0) {
          const evoValues = evolutions.map(e => [
            pokemonId,                 // from_pokemon_id (this new one)
            e.to_pokemon_id,
            e.method,
            e.level || null
          ]);
          db.query(
            'INSERT INTO pokemon_evolutions (from_pokemon_id, to_pokemon_id, method, level) VALUES ?',
            [evoValues],
            (err) => { /* same rollback as before */ }
          );
        }

        // 8️⃣ Insert into pokemon_forms
        if (Array.isArray(forms) && forms.length > 0) {
          const formValues = forms.map(f => [
            pokemonId, f.form_name, f.form_type
          ]);
          db.query(
            'INSERT INTO pokemon_forms (pokemon_id, form_name, form_type) VALUES ?',
            [formValues],
            (err) => {
              if (err) {
                return db.rollback(() => {
                  console.error(err);
                  res.status(400).json({ error: 'Failed insert: pokemon_forms', detail: err.message });
                });
              }
            }
          );
        }

        // ✅ Commit transaction
        db.commit((err) => {
          if (err) {
            return db.rollback(() => {
              console.error(err);
              res.status(500).json({ error: 'Transaction commit failed' });
            });
          }
          res.json({ message: 'Pokémon created successfully', id: pokemonId });
        });
      }
    );
  });
};


exports.getAllTypes = (req, res) => {
  db.query('SELECT id, name FROM types ORDER BY name', (err, rows) => {
    if (err) { console.error(err); return res.status(500).json({ error: 'Database error' }); }
    res.json(rows);
  });
};

exports.getAllAbilities = (req, res) => {
  db.query('SELECT id, name FROM abilities ORDER BY name', (err, rows) => {
    if (err) { console.error(err); return res.status(500).json({ error: 'Database error' }); }
    res.json(rows);
  });
};

exports.getAllEggGroups = (req, res) => {
  db.query('SELECT id, name FROM egg_groups ORDER BY name', (err, rows) => {
    if (err) { console.error(err); return res.status(500).json({ error: 'Database error' }); }
    res.json(rows);
  });
};

exports.getBasicPokemonList = (req, res) => {
  db.query('SELECT id, name, `number` FROM pokemon ORDER BY `number`', (err, rows) => {
    if (err) { 
      console.error('getBasicPokemonList error:', err);
      return res.status(500).json({ error: 'Database error' }); 
    }
    res.json(rows);
  });
};