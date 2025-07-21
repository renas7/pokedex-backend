const express = require('express');
const cors = require('cors');
const app = express();
const pokemonRoutes = require('./routes/pokemonRoutes');

app.use(cors());
app.use(express.json());

// This line connects your route to /pokemon
app.use('/pokemon', pokemonRoutes);

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});
