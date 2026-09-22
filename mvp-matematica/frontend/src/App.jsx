import { NavLink, Navigate, Route, Routes } from 'react-router-dom';

import AlunoPage from './pages/AlunoPage.jsx';
import ProfessorPage from './pages/ProfessorPage.jsx';

export default function App() {
  return (
    <div className="app">
      <nav className="nav">
        <span className="nav-marca">➕ Matemática Adaptativa</span>
        <div className="nav-links">
          <NavLink to="/aluno">Aluno</NavLink>
          <NavLink to="/professor">Professor</NavLink>
        </div>
      </nav>

      <Routes>
        <Route path="/" element={<Navigate to="/aluno" replace />} />
        <Route path="/aluno" element={<AlunoPage />} />
        <Route path="/professor" element={<ProfessorPage />} />
      </Routes>
    </div>
  );
}
