// Desenvolvimento local: põe o app numa porta. Na Vercel quem roda é src/app.js.
import app from './app.js';

const PORTA = Number(process.env.PORT) || 3001;

app.listen(PORTA, () => {
  console.log(`API do MVP rodando em http://localhost:${PORTA}/api`);
});
