const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

const authRoutes = require('./routes/auth');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas
app.use('/api', authRoutes);

// Servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
