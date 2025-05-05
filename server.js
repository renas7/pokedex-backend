const express = require('express');
const cors = require('cors');
const app = express();
const pokemonRoutes = require('./routes/pokemon');

app.use(cors());
app.use(express.json());
app.use('/api/pokemon', pokemonRoutes);

app.listen(3000, () => console.log('🚀 Server running on http://localhost:3000'));