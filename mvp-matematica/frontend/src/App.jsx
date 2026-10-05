import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import AlunoPage from './pages/AlunoPage.jsx';
import InicioPage from './pages/InicioPage.jsx';
import ProfessorPage from './pages/ProfessorPage.jsx';
import { MARCA } from './lib/textos.js';

const TITULOS = {
  '/': `${MARCA}: matemática no passo de cada criança`,
  '/aluno': `Praticar | ${MARCA}`,
  '/professor': `Painel do professor | ${MARCA}`,
};

export default function App() {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = TITULOS[pathname] ?? MARCA;
  }, [pathname]);

  return (
    <Routes>
      <Route path="/" element={<InicioPage />} />
      <Route path="/aluno" element={<AlunoPage />} />
      <Route path="/professor" element={<ProfessorPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
