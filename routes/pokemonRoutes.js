const express = require('express');
const router = express.Router();
const pokemonController = require('../controllers/pokemonController');

router.get('/pokemon', pokemonController.getAllPokemon);
router.get('/pokemon/:id', pokemonController.getPokemonById);
router.get('/types', pokemonController.getAllTypes);
router.post('/pokemon', pokemonController.addPokemon);

module.exports = router;
