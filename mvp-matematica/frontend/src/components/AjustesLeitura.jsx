import { useEffect, useRef } from 'react';

import { falaDisponivel } from '../lib/fala.js';
import { atributosDasPreferencias, PREFERENCIAS_PADRAO } from '../lib/preferencias.js';
import Icone from './Icone.jsx';

const TAMANHOS = [
  ['normal', 'Normal'],
  ['grande', 'Grande'],
  ['enorme', 'Enorme'],
];

const FONTES = [
  ['andika', 'Andika', 'Letras como as do caderno'],
  ['lexend', 'Lexend', 'Letras mais largas'],
  ['atkinson', 'Atkinson', 'Letras bem diferentes entre si'],
];

function Opcoes({ legenda, nome, opcoes, valor, aoMudar }) {
  return (
    <fieldset className="ajustes__grupo">
      <legend>{legenda}</legend>
      <div className="ajustes__opcoes">
        {opcoes.map(([id, rotulo, detalhe]) => (
          <label key={id} className="ajustes__opcao" data-fonte-amostra={nome === 'fonte' ? id : undefined}>
            <input
              type="radio"
              name={nome}
              value={id}
              checked={valor === id}
              onChange={() => aoMudar(id)}
            />
            <span className="ajustes__opcao-rotulo">{rotulo}</span>
            {detalhe && <span className="ajustes__opcao-detalhe">{detalhe}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Chave({ rotulo, detalhe, ligada, aoMudar }) {
  return (
    <label className="ajustes__chave">
      <span>
        <span className="ajustes__chave-rotulo">{rotulo}</span>
        <span className="ajustes__opcao-detalhe">{detalhe}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={ligada}
        onChange={(e) => aoMudar(e.target.checked)}
      />
    </label>
  );
}

/** Painel de ajustes de leitura, em <dialog> nativo (foco e Esc já resolvidos). */
export default function AjustesLeitura({ aberto, aoFechar, preferencias, alterar, nomeAluno }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (aberto && !dialogo.open) dialogo.showModal();
    if (!aberto && dialogo.open) dialogo.close();
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      className="ajustes"
      onClose={aoFechar}
      onClick={(e) => e.target === ref.current && aoFechar()}
      aria-labelledby="ajustes-titulo"
    >
      <div className="ajustes__conteudo">
        <header className="ajustes__topo">
          <h2 id="ajustes-titulo">Ajustes de leitura</h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar ajustes">
            <Icone nome="fechar" />
          </button>
        </header>
        <p className="ajustes__nota">
          {nomeAluno ? `Valem só para ${nomeAluno}, ` : 'Valem '}neste aparelho. Nada disso é
          enviado ao servidor.
        </p>

        <div className="ajustes__amostra" {...atributosDasPreferencias(preferencias)}>
          <p>Quantas fichas são 7 + 5?</p>
        </div>

        <Opcoes
          legenda="Tamanho das letras"
          nome="tamanho"
          opcoes={TAMANHOS}
          valor={preferencias.tamanho}
          aoMudar={(tamanho) => alterar({ tamanho })}
        />
        <Opcoes
          legenda="Tipo de letra"
          nome="fonte"
          opcoes={FONTES}
          valor={preferencias.fonte}
          aoMudar={(fonte) => alterar({ fonte })}
        />

        <div className="ajustes__chaves">
          <Chave
            rotulo="Mais espaço entre as letras"
            detalhe="Pode ajudar quem embaralha letras e números"
            ligada={preferencias.espacamento}
            aoMudar={(espacamento) => alterar({ espacamento })}
          />
          <Chave
            rotulo="Tela calma"
            detalhe="Sem animações, sem quadriculado e com cores mais suaves"
            ligada={preferencias.calmo}
            aoMudar={(calmo) => alterar({ calmo })}
          />
          {falaDisponivel && (
            <Chave
              rotulo="Ler as perguntas sozinho"
              detalhe="Cada questão nova é lida em voz alta"
              ligada={preferencias.lerSozinho}
              aoMudar={(lerSozinho) => alterar({ lerSozinho })}
            />
          )}
        </div>

        <footer className="ajustes__rodape">
          <button type="button" className="botao botao--leve" onClick={() => alterar(PREFERENCIAS_PADRAO)}>
            Voltar ao padrão
          </button>
          <button type="button" className="botao botao--principal" onClick={aoFechar}>
            Pronto
          </button>
        </footer>
      </div>
    </dialog>
  );
}
