const express = require('express');
const router = express.Router();
const pokemonController = require('../controllers/pokemonController');

router.get('/pokemon', pokemonController.getAllPokemon);
router.get('/pokemon/:id', pokemonController.getPokemonById);

module.exports = router;
