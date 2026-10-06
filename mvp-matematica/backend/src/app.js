// O app Express, sem `listen`: a Vercel o detecta por este arquivo (src/app.js)
// e o roda como uma Vercel Function. Localmente, server.js o põe numa porta.

import express from 'express';
import cors from 'cors';

import { router } from './routes.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', router);

// Sem isto, o Express devolveria uma página HTML de erro e o front não saberia o motivo.
app.use((erro, _req, res, _next) => {
  console.error(erro);
  res.status(500).json({ erro: erro.publico ? erro.message : 'Erro interno no servidor' });
});

export default app;
