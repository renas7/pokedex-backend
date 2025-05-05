const express = require('express');
const router = express.Router();
const { getAllPokemon } = require('../controllers/pokemonController');

router.get('/', getAllPokemon);

module.exports = router;
