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

// tiny helper so JSON strings from DB don't crash the server
function parseJSON(str, fallback) {
  try { return str ? JSON.parse(str) : fallback; } catch { return fallback; }
}

// GET /pokemon
exports.getAllPokemon = (req, res) => {
  const mainQuery = `
    SELECT 
      p.id, p.name, p.number, p.species, p.height, p.weight, p.generation,
      p.base_experience, p.capture_rate, p.hatch_time, p.base_friendship,
      p.gender_male, p.gender_female
    FROM pokemon p
    GROUP BY p.id
    ORDER BY p.number;
  `;

  db.query(mainQuery, (err, rows) => {
    if (err) {
      console.error('getAllPokemon mainQuery error:', err);
      return res.status(500).json({ error: 'Database error (mainQuery)' });
    }

    const pokes = rows;

    // Types (ordered by slot)
    const typesQuery = `
      SELECT pt.pokemon_id, t.name, pt.slot
      FROM pokemon_types pt
      JOIN types t ON t.id = pt.type_id
      ORDER BY pt.pokemon_id, pt.slot
    `;
    db.query(typesQuery, (errT, typeRows) => {
      if (errT) {
        console.error('getAllPokemon types error:', errT);
        return res.status(500).json({ error: 'Database error (types)' });
      }
      const typesMap = new Map(); // id -> [type names]
      for (const r of typeRows) {
        if (!typesMap.has(r.pokemon_id)) typesMap.set(r.pokemon_id, []);
        typesMap.get(r.pokemon_id).push(r.name);
      }

      // Descriptions (ordered by game_version)
      const descQuery = `
        SELECT d.pokemon_id, d.game_version AS game, d.description AS text
        FROM pokemon_descriptions d
        ORDER BY d.pokemon_id, d.game_version
      `;
      db.query(descQuery, (errD, descRows) => {
        if (errD) {
          console.error('getAllPokemon descriptions error:', errD);
          return res.status(500).json({ error: 'Database error (descriptions)' });
        }
        const descMap = new Map(); // id -> [{game,text}]
        for (const r of descRows) {
          if (!descMap.has(r.pokemon_id)) descMap.set(r.pokemon_id, []);
          descMap.get(r.pokemon_id).push({ game: r.game, text: r.text });
        }

        // Abilities
        const abilitiesQuery = `
          SELECT pa.pokemon_id, a.name, a.description, pa.is_hidden
          FROM pokemon_abilities pa
          JOIN abilities a ON pa.ability_id = a.id
        `;
        db.query(abilitiesQuery, (errA, abilities) => {
          if (errA) {
            console.error('getAllPokemon abilities error:', errA);
            return res.status(500).json({ error: 'Database error (abilities)' });
          }

          // Evolutions (raw edges)
          const evoQuery = `
            SELECT from_pokemon_id, to_pokemon_id, method, level
            FROM pokemon_evolutions
          `;
          db.query(evoQuery, (errE, evos) => {
            if (errE) {
              console.error('getAllPokemon evolutions error:', errE);
              return res.status(500).json({ error: 'Database error (evolutions)' });
            }

            // Egg groups
            const eggQuery = `
              SELECT peg.pokemon_id, eg.name
              FROM pokemon_egg_groups peg
              JOIN egg_groups eg ON peg.egg_group_id = eg.id
            `;
            db.query(eggQuery, (errG, eggs) => {
              if (errG) {
                console.error('getAllPokemon egg groups error:', errG);
                return res.status(500).json({ error: 'Database error (egg groups)' });
              }
              const eggMap = new Map();
              for (const r of eggs) {
                if (!eggMap.has(r.pokemon_id)) eggMap.set(r.pokemon_id, []);
                eggMap.get(r.pokemon_id).push(r.name);
              }

              // Stitch everything
              for (const p of pokes) {
                p.types = typesMap.get(p.id) || [];
                p.descriptions = descMap.get(p.id) || [];
                p.abilities = abilities.filter(a => a.pokemon_id === p.id);
                p.evolutions = evos.filter(e => e.from_pokemon_id === p.id);
                p.egg_groups = eggMap.get(p.id) || [];
              }

              res.json(pokes);
            });
          });
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
      s.hp, s.attack, s.defense, s.sp_atk, s.sp_def, s.speed
    FROM pokemon p
    LEFT JOIN pokemon_stats s ON s.pokemon_id = p.id
    WHERE p.id = ?
    LIMIT 1
  `;

  db.query(mainQuery, [id], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!results.length) return res.status(404).json({ error: 'Pokémon not found' });

    const pokemon = results[0];
    if (pokemon.hp != null) {
      pokemon.stats = {
        hp: Number(pokemon.hp),
        attack: Number(pokemon.attack),
        defense: Number(pokemon.defense),
        sp_atk: Number(pokemon.sp_atk),
        sp_def: Number(pokemon.sp_def),
        speed: Number(pokemon.speed),
      };
      delete pokemon.hp; delete pokemon.attack; delete pokemon.defense;
      delete pokemon.sp_atk; delete pokemon.sp_def; delete pokemon.speed;
    }

    // Types in slot order
    const typesQuery = `
      SELECT t.name, pt.slot
      FROM pokemon_types pt
      JOIN types t ON t.id = pt.type_id
      WHERE pt.pokemon_id = ?
      ORDER BY pt.slot
    `;
    db.query(typesQuery, [id], (errT, trows) => {
      if (errT) {
        console.error(errT);
        return res.status(500).json({ error: 'Database error (types)' });
      }
      pokemon.types = trows.map(r => r.name);

      // Descriptions ordered
      const descQuery = `
        SELECT d.game_version AS game, d.description AS text
        FROM pokemon_descriptions d
        WHERE d.pokemon_id = ?
        ORDER BY d.game_version
      `;
      db.query(descQuery, [id], (errD, drows) => {
        if (errD) {
          console.error(errD);
          return res.status(500).json({ error: 'Database error (descriptions)' });
        }
        pokemon.descriptions = drows;

        // Abilities
        const abilitiesQuery = `
          SELECT a.name, a.description, pa.is_hidden
          FROM pokemon_abilities pa
          JOIN abilities a ON pa.ability_id = a.id
          WHERE pa.pokemon_id = ?
        `;
        db.query(abilitiesQuery, [id], (errA, arows) => {
          if (errA) {
            console.error(errA);
            return res.status(500).json({ error: 'Database error (abilities)' });
          }
          pokemon.abilities = arows;

          // Evolutions (your CTE, pass ONE param)
          const evoQuery = `
            WITH RECURSIVE chain(id) AS (
              SELECT ? 
              UNION DISTINCT
              SELECT e.from_pokemon_id FROM pokemon_evolutions e JOIN chain c ON e.to_pokemon_id = c.id
              UNION DISTINCT
              SELECT e.to_pokemon_id   FROM pokemon_evolutions e JOIN chain c ON e.from_pokemon_id = c.id
            )
            SELECT DISTINCT
              e.from_pokemon_id,
              p_from.name AS from_pokemon_name,
              e.to_pokemon_id,
              p_to.name   AS to_pokemon_name,
              e.method,
              e.level
            FROM pokemon_evolutions e
            JOIN chain c ON (e.from_pokemon_id = c.id OR e.to_pokemon_id = c.id)
            JOIN pokemon p_from ON p_from.id = e.from_pokemon_id
            JOIN pokemon p_to   ON p_to.id   = e.to_pokemon_id
            ORDER BY e.from_pokemon_id, e.to_pokemon_id;
          `;
          db.query(evoQuery, [id], (errE, erows) => {
            if (errE) {
              console.error(errE);
              return res.status(500).json({ error: 'Database error (evolutions)' });
            }
            pokemon.evolutions = erows;

            // Egg groups
            const eggQuery = `
              SELECT eg.name
              FROM pokemon_egg_groups peg
              JOIN egg_groups eg ON peg.egg_group_id = eg.id
              WHERE peg.pokemon_id = ?
            `;
            db.query(eggQuery, [id], (errG, grows) => {
              if (errG) {
                console.error(errG);
                return res.status(500).json({ error: 'Database error (egg groups)' });
              }
              pokemon.egg_groups = grows.map(e => e.name);

              res.json(pokemon);
            });
          });
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

        // 2️⃣ Insert into pokemon_types WITH SLOTS from legacy type_ids
        if (Array.isArray(type_ids) && type_ids.length > 0) {
          const ids = type_ids.map(Number).filter(Boolean);
          const type1 = ids[0] ?? null;
          const type2 = ids[1] ?? null;

          if (!type1) {
            return db.rollback(() => res.status(400).json({ error: 'Type 1 is required' }));
          }

          db.query(
            'INSERT INTO pokemon_types (pokemon_id, type_id, slot) VALUES (?, ?, 1)',
            [pokemonId, type1],
            (err) => {
              if (err) {
                return db.rollback(() => {
                  console.error(err);
                  res.status(400).json({ error: 'Failed insert: pokemon_types slot 1', detail: err.message });
                });
              }
              if (type2 && type2 !== type1) {
                db.query(
                  'INSERT INTO pokemon_types (pokemon_id, type_id, slot) VALUES (?, ?, 2)',
                  [pokemonId, type2],
                  (err2) => {
                    if (err2) {
                      return db.rollback(() => {
                        console.error(err2);
                        res.status(400).json({ error: 'Failed insert: pokemon_types slot 2', detail: err2.message });
                      });
                    }
                  }
                );
              }
            }
          );
        }


        // 3️⃣ Insert into pokemon_abilities (existing flat array)
        if (Array.isArray(abilities) && abilities.length > 0) {
          const abilityValues = abilities.map(aid => [pokemonId, Number(aid), 0]);
          db.query(
            'INSERT INTO pokemon_abilities (pokemon_id, ability_id, is_hidden) VALUES ?',
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

        // Optional hidden ability (if client sends hidden_ability_id)
        const hiddenId = req.body.hidden_ability_id ? Number(req.body.hidden_ability_id) : null;
        if (hiddenId) {
          db.query(
            `INSERT INTO pokemon_abilities (pokemon_id, ability_id, is_hidden)
            VALUES (?, ?, 1)`,
            [pokemonId, hiddenId],
            (err) => {
              if (err) {
                return db.rollback(() => {
                  console.error(err);
                  res.status(400).json({ error: 'Failed insert: hidden ability', detail: err.message });
                });
              }
            }
          );
        }


        // 4️⃣ Insert into pokemon_egg_groups
        if (Array.isArray(egg_group_ids) && egg_group_ids.length > 0) {
          const trimmed = egg_group_ids.map(Number).filter(Boolean).slice(0, 2);
          if (trimmed.length) {
            const eggValues = trimmed.map(eggId => [pokemonId, eggId]);
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

        // 7️⃣ Insert into pokemon_evolutions (allow to_number)
        if (Array.isArray(evolutions) && evolutions.length > 0) {
          const insertEdge = (toId, e, cb) => {
            if (!toId) return cb(); // skip if we couldn't resolve
            db.query(
              'INSERT INTO pokemon_evolutions (from_pokemon_id, to_pokemon_id, method, level) VALUES (?, ?, ?, ?)',
              [pokemonId, toId, e.method || 'Level Up', e.level ?? null],
              cb
            );
          };

          const processNext = (i = 0) => {
            if (i >= evolutions.length) return; // done, carry on

            const e = evolutions[i];
            let toId = e.to_pokemon_id ? Number(e.to_pokemon_id) : null;

            const next = (err) => {
              if (err) {
                return db.rollback(() => {
                  console.error(err);
                  res.status(400).json({ error: 'Failed insert: pokemon_evolutions', detail: err.message });
                });
              }
              processNext(i + 1);
            };

            if (toId) return insertEdge(toId, e, next);

            // fallback by number if provided
            const toNum = e.to_number ? Number(e.to_number) : null;
            if (!toNum) return next(); // nothing to insert

            db.query('SELECT id FROM pokemon WHERE number = ? LIMIT 1', [toNum], (err2, rows) => {
              if (err2) {
                return db.rollback(() => {
                  console.error(err2);
                  res.status(400).json({ error: 'Lookup failed for to_number', detail: err2.message });
                });
              }
              toId = rows?.[0]?.id || null;
              insertEdge(toId, e, next);
            });
          };

          processNext(0);
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