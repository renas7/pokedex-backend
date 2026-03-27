const axios = require('axios');
const mysql = require('mysql2/promise');

const START_ID = 151;
const END_ID = 160; // change as you go
const abilityCache = {};

const GAME_ORDER = [
  'Red', 'Blue', 'Yellow',
  'Gold', 'Silver', 'Crystal',
  'Ruby', 'Sapphire', 'Emerald',
  'FireRed', 'LeafGreen',
  'Diamond', 'Pearl', 'Platinum',
  'HeartGold', 'SoulSilver',
  'Black', 'White',
  'Black 2', 'White 2',
  'X', 'Y',
  'Omega Ruby', 'Alpha Sapphire',
  'Sun', 'Moon',
  'Ultra Sun', 'Ultra Moon',
  'Lets Go Pikachu', 'Lets Go Eevee',
  'Sword', 'Shield',
  'Brilliant Diamond', 'Shining Pearl',
  'Legends Arceus',
  'Scarlet', 'Violet'
];

const MERGEABLE_GROUPS = [
  ['Red', 'Blue'],
  ['Gold', 'Silver'],
  ['Ruby', 'Sapphire'],
  ['FireRed', 'LeafGreen'],
  ['Diamond', 'Pearl'],
  ['HeartGold', 'SoulSilver'],
  ['Black', 'White'],
  ['Black 2', 'White 2'],
  ['X', 'Y'],
  ['Omega Ruby', 'Alpha Sapphire'],
  ['Sun', 'Moon'],
  ['Ultra Sun', 'Ultra Moon'],
  ['Lets Go Pikachu', 'Lets Go Eevee'],
  ['Sword', 'Shield'],
  ['Brilliant Diamond', 'Shining Pearl'],
  ['Scarlet', 'Violet']
];

async function createConnection() {
  return mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'charles@6378',
    database: 'pokedex'
  });
}

async function fetchPokemonData(pokemonId) {
  const pokemonRes = await axios.get(`https://pokeapi.co/api/v2/pokemon/${pokemonId}`);
  const speciesRes = await axios.get(`https://pokeapi.co/api/v2/pokemon-species/${pokemonId}`);

  return {
    pokemon: pokemonRes.data,
    species: speciesRes.data
  };
}

async function pokemonExists(conn, number) {
  const [rows] = await conn.execute(
    'SELECT id FROM pokemon WHERE number = ? LIMIT 1',
    [number]
  );

  return rows.length > 0 ? rows[0] : null;
}

function getEnglishGenus(species) {
  const genusEntry = species.genera?.find(g => g.language.name === 'en');
  return genusEntry ? genusEntry.genus : species.name;
}

function mapGenerationToNumber(generationName) {
  const generationMap = {
    'generation-i': 1,
    'generation-ii': 2,
    'generation-iii': 3,
    'generation-iv': 4,
    'generation-v': 5,
    'generation-vi': 6,
    'generation-vii': 7,
    'generation-viii': 8,
    'generation-ix': 9
  };

  return generationMap[generationName] || null;
}

function capitalizeFirstLetter(text) { // Helper to make pokemon name 1st letter upper case
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

async function insertPokemonStats(conn, pokemonId, pokemonData) {
  const [existing] = await conn.execute(
    'SELECT pokemon_id FROM pokemon_stats WHERE pokemon_id = ? LIMIT 1',
    [pokemonId]
  );

  if (existing.length > 0) {
    console.log(`  - Stats already exist for Pokémon DB id ${pokemonId}. Skipping stats.`);
    return;
  }

  const statMap = {};

  for (const statEntry of pokemonData.stats) {
    statMap[statEntry.stat.name] = statEntry.base_stat;
  }

  const hp = statMap['hp'] ?? 0;
  const attack = statMap['attack'] ?? 0;
  const defense = statMap['defense'] ?? 0;
  const spAtk = statMap['special-attack'] ?? 0;
  const spDef = statMap['special-defense'] ?? 0;
  const speed = statMap['speed'] ?? 0;

  const total = hp + attack + defense + spAtk + spDef + speed;

  await conn.execute(
    `
    INSERT INTO pokemon_stats (
      pokemon_id,
      hp,
      attack,
      defense,
      sp_atk,
      sp_def,
      speed,
      total
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      pokemonId,
      hp,
      attack,
      defense,
      spAtk,
      spDef,
      speed,
      total
    ]
  );

  console.log(`  - Stats inserted for Pokémon DB id ${pokemonId} (total: ${total}).`);
}

async function getTypeIdByName(conn, typeName) {
  const [rows] = await conn.execute(
    'SELECT id FROM types WHERE name = ? LIMIT 1',
    [typeName]
  );

  return rows.length > 0 ? rows[0].id : null;
}

async function getAbilityIdByName(conn, abilityName) {
  const [rows] = await conn.execute(
    'SELECT id FROM abilities WHERE name = ? LIMIT 1',
    [abilityName]
  );

  return rows.length > 0 ? rows[0].id : null;
}

async function insertPokemonAbilities(conn, pokemonId, pokemonData) {
  for (const abilityEntry of pokemonData.abilities) {
    const apiAbilityName = abilityEntry.ability.name;
    const formattedAbilityName = formatNameFromApi(apiAbilityName);
    const isHidden = abilityEntry.is_hidden ? 1 : 0;

    const abilityId = await createAbilityIfMissing(conn, apiAbilityName);

    const [existing] = await conn.execute(
      `
      SELECT pokemon_id
      FROM pokemon_abilities
      WHERE pokemon_id = ? AND ability_id = ?
      LIMIT 1
      `,
      [pokemonId, abilityId]
    );

    if (existing.length > 0) {
      console.log(`  - Ability "${formattedAbilityName}" already linked to Pokémon DB id ${pokemonId}.`);
      continue;
    }

    await conn.execute(
      `
      INSERT INTO pokemon_abilities (pokemon_id, ability_id, is_hidden)
      VALUES (?, ?, ?)
      `,
      [pokemonId, abilityId, isHidden]
    );

    console.log(`  - Ability "${formattedAbilityName}" inserted for Pokémon DB id ${pokemonId}.`);
  }
}

function mapEggGroupName(apiName) {
  const map = {
    monster: 'Monster',
    water1: 'Water 1',
    water2: 'Water 2',
    water3: 'Water 3',
    bug: 'Bug',
    flying: 'Flying',
    ground: 'Field', // IMPORTANT FIX
    fairy: 'Fairy',
    plant: 'Grass',
    humanshape: 'Human-Like',
    mineral: 'Mineral',
    indeterminate: 'Amorphous',
    ditto: 'Ditto',
    dragon: 'Dragon',
    no_eggs: 'Undiscovered'
  };

  return map[apiName] || apiName;
}

async function getEggGroupIdByName(conn, eggGroupName) {
  const [rows] = await conn.execute(
    'SELECT id FROM egg_groups WHERE name = ? LIMIT 1',
    [eggGroupName]
  );

  return rows.length > 0 ? rows[0].id : null;
}

async function insertPokemonEggGroups(conn, pokemonId, speciesData) {
  for (const eggGroupEntry of speciesData.egg_groups) {
    const eggGroupName = mapEggGroupName(eggGroupEntry.name);

    const eggGroupId = await getEggGroupIdByName(conn, eggGroupName);

    if (!eggGroupId) {
      console.log(`  - Egg group "${eggGroupName}" not found in egg_groups table. Skipping.`);
      continue;
    }

    const [existing] = await conn.execute(
      `
      SELECT pokemon_id
      FROM pokemon_egg_groups
      WHERE pokemon_id = ? AND egg_group_id = ?
      LIMIT 1
      `,
      [pokemonId, eggGroupId]
    );

    if (existing.length > 0) {
      console.log(`  - Egg group "${eggGroupName}" already linked to Pokémon DB id ${pokemonId}.`);
      continue;
    }

    await conn.execute(
      `
      INSERT INTO pokemon_egg_groups (pokemon_id, egg_group_id)
      VALUES (?, ?)
      `,
      [pokemonId, eggGroupId]
    );

    console.log(`  - Egg group "${eggGroupName}" inserted for Pokémon DB id ${pokemonId}.`);
  }
}

async function insertPokemonTypes(conn, pokemonId, pokemonData) {
  for (const typeEntry of pokemonData.types) {
    const typeName = typeEntry.type.name;
    const slot = typeEntry.slot;

    const typeId = await getTypeIdByName(conn, typeName);

    if (!typeId) {
      console.log(`  - Type "${typeName}" not found in types table. Skipping.`);
      continue;
    }

    const [existing] = await conn.execute(
      `
      SELECT pokemon_id
      FROM pokemon_types
      WHERE pokemon_id = ? AND type_id = ?
      LIMIT 1
      `,
      [pokemonId, typeId]
    );

    if (existing.length > 0) {
      console.log(`  - Type "${typeName}" already linked to Pokémon DB id ${pokemonId}.`);
      continue;
    }

    await conn.execute(
      `
      INSERT INTO pokemon_types (pokemon_id, type_id, slot)
      VALUES (?, ?, ?)
      `,
      [pokemonId, typeId, slot]
    );

    console.log(`  - Type "${typeName}" inserted for Pokémon DB id ${pokemonId}.`);
  }
}

function formatNameFromApi(name) {
  return name
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function mapGenerationToNumber(generationName) {
  const generationMap = {
    'generation-i': 1,
    'generation-ii': 2,
    'generation-iii': 3,
    'generation-iv': 4,
    'generation-v': 5,
    'generation-vi': 6,
    'generation-vii': 7,
    'generation-viii': 8,
    'generation-ix': 9
  };

  return generationMap[generationName] || null;
}

function getEnglishAbilityDescription(abilityData) {
  const entry = abilityData.effect_entries?.find(
    e => e.language.name === 'en'
  );

  return entry ? entry.short_effect : null;
}

async function createAbilityIfMissing(conn, apiAbilityName) {
  const formattedAbilityName = formatNameFromApi(apiAbilityName);

  if (abilityCache[apiAbilityName]) {
    return abilityCache[apiAbilityName];
  }

  const [existing] = await conn.execute(
    'SELECT id FROM abilities WHERE name = ? LIMIT 1',
    [formattedAbilityName]
  );

  if (existing.length > 0) {
    abilityCache[apiAbilityName] = existing[0].id;
    return existing[0].id;
  }

  const response = await axios.get(`https://pokeapi.co/api/v2/ability/${apiAbilityName}`);
  const abilityData = response.data;

  const description = getEnglishAbilityDescription(abilityData);
  const generation = mapGenerationToNumber(abilityData.generation?.name);

  const [result] = await conn.execute(
    `
    INSERT INTO abilities (name, description, generation)
    VALUES (?, ?, ?)
    `,
    [formattedAbilityName, description, generation]
  );

  abilityCache[apiAbilityName] = result.insertId;

  console.log(`  - Ability "${formattedAbilityName}" created in abilities table.`);

  return result.insertId;
}

function cleanDescriptionText(text) {
  if (!text) return text;

  return text
    .replace(/[\n\f\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatGameVersionName(versionName) {
  const specialNames = {
    red: 'Red',
    blue: 'Blue',
    yellow: 'Yellow',
    gold: 'Gold',
    silver: 'Silver',
    crystal: 'Crystal',
    ruby: 'Ruby',
    sapphire: 'Sapphire',
    emerald: 'Emerald',
    firered: 'FireRed',
    leafgreen: 'LeafGreen',
    diamond: 'Diamond',
    pearl: 'Pearl',
    platinum: 'Platinum',
    heartgold: 'HeartGold',
    soulsilver: 'SoulSilver',
    black: 'Black',
    white: 'White',
    'black-2': 'Black 2',
    'white-2': 'White 2',
    x: 'X',
    y: 'Y',
    'omega-ruby': 'Omega Ruby',
    'alpha-sapphire': 'Alpha Sapphire',
    sun: 'Sun',
    moon: 'Moon',
    'ultra-sun': 'Ultra Sun',
    'ultra-moon': 'Ultra Moon',
    'lets-go-pikachu': 'Lets Go Pikachu',
    'lets-go-eevee': 'Lets Go Eevee',
    sword: 'Sword',
    shield: 'Shield',
    'brilliant-diamond': 'Brilliant Diamond',
    'shining-pearl': 'Shining Pearl',
    'legends-arceus': 'Legends Arceus',
    scarlet: 'Scarlet',
    violet: 'Violet'
  };

  return specialNames[versionName] ||
    versionName
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
}

async function insertPokemonDescriptions(conn, pokemonId, speciesData) {
  const englishEntries = speciesData.flavor_text_entries
    .filter(entry => entry.language.name === 'en')
    .map(entry => ({
      version: formatGameVersionName(entry.version.name),
      description: cleanDescriptionText(entry.flavor_text)
    }));

  const uniqueByVersion = new Map();

  for (const entry of englishEntries) {
    if (!uniqueByVersion.has(entry.version)) {
      uniqueByVersion.set(entry.version, entry.description);
    }
  }

    const orderedVersions = sortGameVersions([...uniqueByVersion.keys()]);

    const orderedEntries = orderedVersions.map(version => ({
        version,
        description: uniqueByVersion.get(version)
    }));

  const finalEntries = [];

  for (const entry of orderedEntries) {
    const lastEntry = finalEntries[finalEntries.length - 1];

    if (
      lastEntry &&
      lastEntry.description === entry.description &&
      canMergeVersions(
        lastEntry.versionLabelParts[lastEntry.versionLabelParts.length - 1],
        entry.version
      )
    ) {
      lastEntry.versionLabelParts.push(entry.version);
    } else {
      finalEntries.push({
        versionLabelParts: [entry.version],
        description: entry.description
      });
    }
  }

  for (const entry of finalEntries) {
    const gameVersion = entry.versionLabelParts.join('/');

    const [existing] = await conn.execute(
      `
      SELECT pokemon_id
      FROM pokemon_descriptions
      WHERE pokemon_id = ? AND game_version = ?
      LIMIT 1
      `,
      [pokemonId, gameVersion]
    );

    if (existing.length > 0) {
      continue;
    }

    await conn.execute(
      `
      INSERT INTO pokemon_descriptions (pokemon_id, game_version, description)
      VALUES (?, ?, ?)
      `,
      [pokemonId, gameVersion, entry.description]
    );

    console.log(`  - Description inserted (${gameVersion}) for Pokémon ${pokemonId}`);
  }
}

async function fetchEvolutionChain(speciesData) {
  const evolutionUrl = speciesData.evolution_chain?.url;

  if (!evolutionUrl) {
    return null;
  }

  const response = await axios.get(evolutionUrl);
  return response.data;
}

async function getPokemonIdByName(conn, apiPokemonName) {
  const formattedName = capitalizeFirstLetter(apiPokemonName);

  const [rows] = await conn.execute(
    'SELECT id FROM pokemon WHERE name = ? LIMIT 1',
    [formattedName]
  );

  return rows.length > 0 ? rows[0].id : null;
}

function getEvolutionMethod(details) {
  if (!details) return { method: 'Unknown', level: null };

  if (details.min_level != null) {
    return { method: 'Level Up', level: details.min_level };
  }

  if (details.item?.name) {
    return { method: formatNameFromApi(details.item.name), level: null };
  }

  if (details.trigger?.name === 'trade') {
    return { method: 'Trade', level: null };
  }

  if (details.min_happiness != null) {
    return { method: 'Friendship', level: null };
  }

  if (details.trigger?.name) {
    return { method: formatNameFromApi(details.trigger.name), level: null };
  }

  return { method: 'Unknown', level: null };
}

async function insertEvolutionRow(conn, fromPokemonId, toPokemonId, method, level) {
  const [existing] = await conn.execute(
    `
    SELECT from_pokemon_id
    FROM pokemon_evolutions
    WHERE from_pokemon_id = ? AND to_pokemon_id = ?
    LIMIT 1
    `,
    [fromPokemonId, toPokemonId]
  );

  if (existing.length > 0) {
    console.log(`  - Evolution ${fromPokemonId} -> ${toPokemonId} already exists.`);
    return;
  }

  await conn.execute(
    `
    INSERT INTO pokemon_evolutions (from_pokemon_id, to_pokemon_id, method, level)
    VALUES (?, ?, ?, ?)
    `,
    [fromPokemonId, toPokemonId, method, level]
  );

  console.log(`  - Evolution inserted: ${fromPokemonId} -> ${toPokemonId} (${method}${level ? `, level ${level}` : ''}).`);
}

async function processEvolutionChainNode(conn, chainNode) {
  const fromPokemonId = await getPokemonIdByName(conn, chainNode.species.name);

  if (!fromPokemonId) {
    console.log(`  - Pokémon "${chainNode.species.name}" not found in DB. Skipping evolution source.`);
    return;
  }

  for (const evolvesToNode of chainNode.evolves_to) {
    const toPokemonId = await getPokemonIdByName(conn, evolvesToNode.species.name);

    if (!toPokemonId) {
      console.log(`  - Pokémon "${evolvesToNode.species.name}" not found in DB. Skipping evolution target.`);
      continue;
    }

    const details = evolvesToNode.evolution_details?.[0] || null;
    const { method, level } = getEvolutionMethod(details);

    await insertEvolutionRow(conn, fromPokemonId, toPokemonId, method, level);

    await processEvolutionChainNode(conn, evolvesToNode);
  }
}

async function insertPokemonEvolutions(conn, speciesData) {
  const evolutionChain = await fetchEvolutionChain(speciesData);

  if (!evolutionChain || !evolutionChain.chain) {
    console.log('  - No evolution chain found.');
    return;
  }

  await processEvolutionChainNode(conn, evolutionChain.chain);
}



function getGameOrderIndex(game) {
  const index = GAME_ORDER.indexOf(game);
  return index === -1 ? 999 : index;
}

function sortGameVersions(versions) {
  return versions.sort((a, b) => getGameOrderIndex(a) - getGameOrderIndex(b));
}

function canMergeVersions(versionA, versionB) {
  return MERGEABLE_GROUPS.some(group =>
    group.includes(versionA) && group.includes(versionB)
  );
}





/* MAIN BELOW */
async function insertPokemon(conn, pokemon, species) {
  const number = pokemon.id;
  const name = capitalizeFirstLetter(pokemon.name);
  const speciesName = getEnglishGenus(species);
  const height = pokemon.height;
  const weight = pokemon.weight;
  const generation = mapGenerationToNumber(species.generation?.name);
  const baseExperience = pokemon.base_experience ?? null;
  const captureRate = species.capture_rate ?? null;
  const hatchTime = species.hatch_counter ?? null;
  const baseFriendship = species.base_happiness ?? null;

  let genderMale = 0;
  let genderFemale = 0;

  if (species.gender_rate >= 0) {
    genderFemale = (species.gender_rate / 8) * 100;
    genderMale = 100 - genderFemale;
  }

  const [result] = await conn.execute(
    `
    INSERT INTO pokemon (
      number,
      name,
      species,
      height,
      weight,
      generation,
      base_experience,
      capture_rate,
      hatch_time,
      base_friendship,
      gender_male,
      gender_female
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      number,
      name,
      speciesName,
      height,
      weight,
      generation,
      baseExperience,
      captureRate,
      hatchTime,
      baseFriendship,
      genderMale,
      genderFemale
    ]
  );

  return result.insertId;
}

async function main() {
  const conn = await createConnection();

  try {
    for (let id = START_ID; id <= END_ID; id++) {
      console.log(`Checking Pokémon #${id}...`);

      try {
        const { pokemon, species } = await fetchPokemonData(id);

        const existing = await pokemonExists(conn, id);

        let dbPokemonId;

        if (existing) {
        dbPokemonId = existing.id;
        console.log(`- Pokémon #${id} already exists with DB id ${dbPokemonId}.`);
        } else {
        dbPokemonId = await insertPokemon(conn, pokemon, species);
        console.log(`- Inserted ${pokemon.name} with DB id ${dbPokemonId}`);
        }
        
        await insertPokemonStats(conn, dbPokemonId, pokemon);
        await insertPokemonTypes(conn, dbPokemonId, pokemon);
        await insertPokemonAbilities(conn, dbPokemonId, pokemon);
        await insertPokemonEggGroups(conn, dbPokemonId, species);
        await insertPokemonDescriptions(conn, dbPokemonId, species);
        await insertPokemonEvolutions(conn, species);

      } catch (err) {
        console.error(`- Failed on Pokémon #${id}:`, err.message);
      }
    }
  } finally {
    await conn.end();
  }
}

main();