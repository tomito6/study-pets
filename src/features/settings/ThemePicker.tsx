// O seletor de tema, na aba Geral das Configurações.
//
// Tema não é config do usuário (não vai pro Firestore): é preferência deste dispositivo, então
// aqui não há rascunho nem "Salvar" — clicar já troca, pra dar pra comparar os pacotes na hora.
// Usa as pills que o app já tem (`.weekday-chip` / `.selected`); o pouco de estilo próprio é
// inline, porque duas linhas dentro da pill pedem canto reto e texto à esquerda.

import { useState } from 'react';
import { strings } from '../../shared/strings';
import { TEMAS, applyTheme, readTheme } from '../../shared/theme';
import type { ThemeId } from '../../shared/theme';

const t = strings.settings.tema;

export function ThemePicker() {
  const [tema, setTema] = useState<ThemeId>(() => readTheme());

  const pick = (id: ThemeId) => {
    applyTheme(id);
    setTema(id);
  };

  return (
    <div className="st-section">
      <div className="st-section-head"><div className="st-section-title">{t.title}</div></div>
      <div className="st-section-desc">{t.desc}</div>
      <div className="st-card">
        <div
          className="weekday-row"
          role="radiogroup"
          aria-label={t.title}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
        >
          {TEMAS.map((opt) => (
            <button
              type="button"
              key={opt.id}
              role="radio"
              aria-checked={tema === opt.id}
              data-tema={opt.id}
              className={'weekday-chip' + (tema === opt.id ? ' selected' : '')}
              onClick={() => pick(opt.id)}
              style={{ borderRadius: 'var(--radius-sm)', textAlign: 'left', padding: '8px 10px' }}
            >
              <span style={{ display: 'block', fontWeight: 600, fontSize: '12px' }}>{opt.nome}</span>
              <span style={{ display: 'block', marginTop: '2px', fontSize: '10px', lineHeight: 1.4, opacity: 0.75 }}>
                {opt.descricao}
              </span>
            </button>
          ))}
        </div>
        <div className="st-hint">{t.hint}</div>
      </div>
    </div>
  );
}
