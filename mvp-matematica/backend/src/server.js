import express from 'express';
import cors from 'cors';

import { router } from './routes.js';

const PORTA = Number(process.env.PORT) || 3001;

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', router);

app.get('/api/saude', (_req, res) => res.json({ ok: true }));

app.listen(PORTA, () => {
  console.log(`API do MVP rodando em http://localhost:${PORTA}/api`);
});
