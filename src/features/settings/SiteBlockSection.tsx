// Configurações → Geral → "Bloqueio de sites". Duas coisas o usuário precisa
// ver aqui, e são as que faltavam quando isso morava dentro do hardcore:
//
// 1. **O que ele escreveu virou o quê.** Abaixo da caixa, um chip por domínio
//    entendido (com o apelido entre parênteses) e, separado, o que não deu pra
//    entender ("não entendi: chess"). Nada some em silêncio.
// 2. **Se está funcionando.** Três estados: extensão não encontrada (com o guia
//    de instalação de 3 passos), encontrada (com a versão), e bloqueando agora
//    (o que a própria extensão confirmou). Mais o "▶ Testar por 1 min", que arma
//    o bloqueio com a lista do rascunho — sem salvar, sem esperar um estudo.

import { blockingNow, startSiteBlockTest, stopSiteBlockTest } from '../../application/siteBlock';
import { aliasesOf, parseSites } from '../../domain/siteBlock';
import type { SiteBlockMode } from '../../domain/types';
import type { ConfigDraft } from '../../domain/settings';
import { extensionDetected, extensionVersion } from '../../infrastructure/extensionBridge';
import { strings } from '../../shared/strings';
import { showToast } from '../../shared/toast';
import { useAppState } from '../../store/store';
import { useSecondTick } from '../timer/useSecondTick';

const t = strings.siteBlock.settings;

const hhmm = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

interface Props {
  draft: ConfigDraft;
  patch: (p: Partial<ConfigDraft>) => void;
}

export function SiteBlockSection({ draft, patch }: Props) {
  const parsed = parseSites(draft.siteBlockSites || '');
  const ext = extensionDetected();
  const version = extensionVersion();
  // O ack da extensão e o teste vivem no store (`notify()` re-renderiza isto);
  // o relógio faz a contagem do teste andar.
  const testUntil = useAppState((_s, d) => d.siteBlock.test?.until ?? null);
  useSecondTick(testUntil !== null);
  const now = Date.now();
  const testing = testUntil !== null && testUntil > now;
  const live = blockingNow();

  const toggleTest = () => {
    if (testing) {
      stopSiteBlockTest();
      return;
    }
    const r = startSiteBlockTest(draft.siteBlockMode, parsed.sites);
    if (!r.ok) showToast(r.reason === 'no-extension' ? t.test.noExt : t.test.noSites);
  };

  return (
    <div className="st-section">
      <div className="st-section-head"><div className="st-section-title">{t.title}</div></div>
      <div className="st-section-desc">{t.desc}</div>
      <div className="st-card">
        <div className="st-toggle-row">
          <div>
            <div className="st-toggle-txt">{t.toggle}</div>
            <div className="st-toggle-sub">{t.toggleSub}</div>
          </div>
          <label className="st-switch">
            <input type="checkbox" id="cfg-siteblock" checked={draft.siteBlock} onChange={(e) => patch({ siteBlock: e.target.checked })} />
            <span className="st-switch-track"><span className="st-switch-knob" /></span>
          </label>
        </div>

        {draft.siteBlock && (
          <div id="siteblock-fields">
            <div className="st-divider" />
            <div className="st-field-label">{t.sitesLabel}</div>
            <div className="sb-mode" id="cfg-siteblock-mode" role="radiogroup">
              {(['blacklist', 'whitelist'] as const).map((m: SiteBlockMode) => (
                <button
                  type="button"
                  key={m}
                  role="radio"
                  aria-checked={draft.siteBlockMode === m}
                  className={'sb-mode-chip' + (draft.siteBlockMode === m ? ' active' : '')}
                  data-mode={m}
                  onClick={() => patch({ siteBlockMode: m })}
                >
                  {t.modes[m]}
                </button>
              ))}
            </div>
            <textarea
              id="cfg-siteblock-sites"
              className="sb-sites"
              rows={4}
              placeholder={t.sitesPlaceholder}
              value={draft.siteBlockSites}
              onChange={(e) => patch({ siteBlockSites: e.target.value })}
              spellCheck={false}
            />
            <div className="st-hint">{t.sitesHint}</div>

            <div className="sb-preview" id="siteblock-preview">
              {parsed.sites.length === 0 ? (
                <span className="sb-empty">{draft.siteBlockMode === 'whitelist' ? t.previewEmptyWhitelist : t.previewEmpty}</span>
              ) : (
                parsed.sites.map((s) => {
                  const alias = aliasesOf(s);
                  return (
                    <span className="sb-chip" key={s} data-site={s}>
                      {s}
                      {alias.length > 0 && <span className="sb-chip-alias">{t.alias(alias)}</span>}
                    </span>
                  );
                })
              )}
            </div>
            {parsed.invalid.length > 0 && (
              <div className="sb-invalid" id="siteblock-invalid">{t.invalid(parsed.invalid)}</div>
            )}

            <div className={'sb-ext-status' + (live ? ' blocking' : ext ? ' ok' : ' missing')} id="siteblock-ext-status">
              {live ? (
                <span className="sb-ext-line">{live.test ? t.ext.blockingTest(live.sites, hhmm(live.until)) : t.ext.blocking(live.sites, hhmm(live.until))}</span>
              ) : ext ? (
                <span className="sb-ext-line">{t.ext.ok(version)}</span>
              ) : (
                <>
                  <span className="sb-ext-line">{t.ext.missing}</span>
                  <ol className="sb-ext-steps">
                    {t.ext.steps.map((s) => <li key={s}>{s}</li>)}
                  </ol>
                  <span className="sb-ext-reload">{t.ext.reload}</span>
                  <span className="sb-ext-privacy">{t.ext.privacy}</span>
                </>
              )}
            </div>

            {ext && (
              <div className="sb-test-row">
                <button type="button" className={'st-action-btn' + (testing ? ' sb-testing' : '')} id="siteblock-test" onClick={toggleTest}>
                  {testing ? t.test.stop : t.test.start}
                </button>
                <div className="sb-test-hint">{testing && testUntil ? t.test.running(Math.max(0, Math.ceil((testUntil - now) / 1000))) : t.test.hint}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
