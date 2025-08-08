const express = require('express');
const router = express.Router();
const pokemonController = require('../controllers/pokemonController');

router.get('/pokemon', pokemonController.getAllPokemon);
router.get('/pokemon/basic', pokemonController.getBasicPokemonList);
router.get('/pokemon/:id', pokemonController.getPokemonById);
router.get('/types', pokemonController.getAllTypes);
router.get('/abilities', pokemonController.getAllAbilities);
router.get('/egg-groups', pokemonController.getAllEggGroups);

// POST create:
router.post('/pokemon', pokemonController.createPokemon);

module.exports = router;
