// Configurações: a única tela do app que é página inteira, não modal. Ilha em
// #settings-root; renderiza também o botão ⚙️ flutuante (só na aba Plano), então
// "aberta ou fechada" é estado local daqui.
//
// O formulário é um rascunho (`ConfigDraft`) que só vira config ao Salvar. Mesmos
// ids/classes do markup antigo — CSS e smoke test dependem deles.

import { useEffect, useRef, useState } from 'react';
import { exportMyData } from '../../application/export';
import { clearSettingsRequest, saveSettings } from '../../application/settings';
import { restartTour } from '../../application/tutorial';
import { defaultDraft, draftFromConfig, normalizeConfig } from '../../domain/settings';
import type { ConfigDraft } from '../../domain/settings';
import { strings } from '../../shared/strings';
import { showToast } from '../../shared/toast';
import { state, useAppState } from '../../store/store';
import { ConfigPreview } from './ConfigPreview';
import { CancelSessionModal, DeleteAccountModal } from './DangerModals';
import { FitStudyModal } from './FitStudyModal';
import { CalendarImportSection } from './CalendarImportSection';
import { SiteBlockSection } from './SiteBlockSection';
import { StudyWindowsEditor, appendWindow } from './StudyWindowsEditor';
import { AvatarPicker } from './AvatarPicker';
import { ThemePicker } from './ThemePicker';

const t = strings.settings;
const th = strings.hardcore.settings;
type SettingsTab = 'day' | 'general';
type SettingsModal = 'none' | 'fit' | 'cancel' | 'delete';

function Switch({ id, checked, onChange }: { id: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="st-switch">
      <input type="checkbox" id={id} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="st-switch-track"><span className="st-switch-knob" /></span>
    </label>
  );
}

export function SettingsPage() {
  const tab = useAppState((s) => s.uiTab);
  // Durante o onboarding a engrenagem aparecia verde e viva por cima do escurecido:
  // não era clicável (o overlay cobre), mas convidava ao clique.
  const onboarding = useAppState((_s, d) => d.onboardingOpen);
  const [open, setOpen] = useState(false);
  const [stab, setStab] = useState<SettingsTab>('general');
  const [draft, setDraft] = useState<ConfigDraft>(() => draftFromConfig(state.config));
  const [modal, setModal] = useState<SettingsModal>('none');
  const scrollRef = useRef<HTMLDivElement>(null);

  const patch = (p: Partial<ConfigDraft>) => setDraft((d) => ({ ...d, ...p }));

  const openSettings = () => {
    setDraft(draftFromConfig(state.config));
    setStab('general'); // abre no Geral — a primeira aba; "Estrutura do dia" é a segunda
    setOpen(true);
  };
  const close = () => setOpen(false);
  // A barra do laptop (engrenagem, menu do avatar) pede pra abrir pelo store: atende com o mesmo openSettings.
  const settingsRequest = useAppState((_s, d) => d.settingsRequest);
  // Qual seção foi pedida (o "importe de um calendário" do Novo evento manda 'calendar').
  // Vive aqui e não no store porque só esta página precisa saber onde rolar.
  const [focus, setFocus] = useState<'calendar' | null>(null);
  useEffect(() => {
    if (!settingsRequest) return;
    const wanted = settingsRequest.focus;
    clearSettingsRequest();
    openSettings();
    setFocus(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsRequest]);

  // Rolar até a seção pedida depois que o Geral montou, e apagar o destaque em seguida.
  useEffect(() => {
    if (!open || !focus) return;
    const target = document.getElementById('ics-import-btn')?.closest('.st-section');
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const t = setTimeout(() => setFocus(null), 2400);
    return () => clearTimeout(t);
  }, [open, focus]);
  const switchTab = (next: SettingsTab) => {
    setStab(next);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };
  const save = () => {
    const r = saveSettings(draft);
    if (!r.ok) {
      showToast(t.incomplete);
      return;
    }
    close();
  };
  // "Ver o tour de novo": zera o visto e fecha — o ⚙️ só existe no Plano, então o balão 1/3 aparece embaixo.
  const restart = () => {
    restartTour();
    close();
  };

  const exportData = () => {
    showToast(exportMyData() ? t.data.done : t.data.failed);
  };

  const cfgPreview = normalizeConfig(draft, state.config.periodStart);
  const periodStart = state.config.periodStart || '';

  return (
    <>
      <button
        id="fab-config"
        className={'fab-config' + (tab !== 'plano' || onboarding ? ' hidden' : '')}
        onClick={openSettings}
        aria-label={t.fab}
      >
        ⚙️
      </button>

      <div className={'settings-page' + (open ? ' open' : '')} id="settings-panel">
        <div className="st-topbar">
          <button type="button" className="st-back" onClick={close}>{t.back}</button>
          <div className="st-title">{t.title}</div>
        </div>
        <div className="st-tabs-wrap">
          <div className="st-tabs">
            {(['general', 'day'] as const).map((k) => (
              <button
                type="button"
                key={k}
                className={'settings-tab' + (stab === k ? ' active' : '')}
                data-tab={k}
                onClick={() => switchTab(k)}
              >
                {t.tabs[k]}
              </button>
            ))}
          </div>
        </div>
        <div className="st-scroll" ref={scrollRef}>
          <div className="st-body">
            {/* ---------------- Estrutura do dia (id interno `day`, por compatibilidade) ---------------- */}
            <div className={'settings-tab-content' + (stab === 'day' ? ' active' : '')} data-tab-content="day">
              <div className="st-section">
                <div className="st-section-head">
                  <div className="st-section-title">{t.windows.title}</div>
                  <button type="button" className="add-block-btn" onClick={() => patch({ studyWindows: appendWindow(draft.studyWindows) })}>
                    {t.windows.add}
                  </button>
                </div>
                <div className="st-section-desc">{t.windows.desc}</div>
                <div className="st-card">
                  <StudyWindowsEditor windows={draft.studyWindows} onChange={(studyWindows) => patch({ studyWindows })} />
                </div>
              </div>

              <div className="st-section">
                <div className="st-section-head"><div className="st-section-title">{t.rhythm.title}</div></div>
                <div className="st-section-desc">{t.rhythm.desc}</div>
                <div className="st-card">
                  <div className="st-grid-3">
                    <div>
                      <div className="st-field-label">{t.rhythm.study}</div>
                      <input type="number" id="cfg-pomo" min="10" max="90" step="5" value={draft.pomo} onChange={(e) => patch({ pomo: e.target.value })} />
                    </div>
                    <div>
                      <div className="st-field-label">{t.rhythm.short}</div>
                      <input type="number" id="cfg-short" min="1" max="30" step="1" value={draft.shortBreak} onChange={(e) => patch({ shortBreak: e.target.value })} />
                    </div>
                    <div>
                      <div className="st-field-label">{t.rhythm.long}</div>
                      <input type="number" id="cfg-long" min="5" max="60" step="5" value={draft.longBreak} onChange={(e) => patch({ longBreak: e.target.value })} />
                    </div>
                  </div>
                  <div className="st-divider" />
                  <button type="button" className="fit-study-btn" onClick={() => setModal('fit')}>{t.rhythm.fit}</button>
                  <div className="st-hint">{t.rhythm.fitHint}</div>
                </div>
              </div>

              {/* Por último, como resultado do que está acima. */}
              <div className="st-section">
                <div className="st-section-head"><div className="st-section-title">{t.summary.title}</div></div>
                <div className="st-section-desc">{t.summary.desc}</div>
                <ConfigPreview cfg={cfgPreview} />
              </div>
            </div>

            {/* ---------------- Geral ---------------- */}
            <div className={'settings-tab-content' + (stab === 'general' ? ' active' : '')} data-tab-content="general">
              <div className="st-section">
                <div className="st-section-head"><div className="st-section-title">{t.period.title}</div></div>
                <div className="st-section-desc">{t.period.desc}</div>
                <div className="st-card">
                  <div className="st-grid-2">
                    <div>
                      <div className="st-field-label">{t.period.start}</div>
                      <input type="date" id="cfg-period-start" value={periodStart} disabled title={t.period.startFixed} readOnly />
                    </div>
                    <div>
                      <div className="st-field-label">{t.period.end}</div>
                      <input type="date" id="cfg-period-end" value={draft.periodEnd} onChange={(e) => patch({ periodEnd: e.target.value })} />
                    </div>
                  </div>
                  <div className="st-hint">{t.period.hint}</div>
                  <button type="button" className="ghost-btn" onClick={() => patch({ periodEnd: '' })}>{t.period.clearEnd}</button>
                  <div className="st-divider" />
                  <div className="st-toggle-row">
                    <div>
                      <div className="st-toggle-txt">{t.period.skipWeekends}</div>
                      <div className="st-toggle-sub">{t.period.skipWeekendsSub}</div>
                    </div>
                    <Switch id="cfg-skip-weekends" checked={draft.skipWeekends} onChange={(skipWeekends) => patch({ skipWeekends })} />
                  </div>
                </div>
              </div>

              <CalendarImportSection highlight={focus === 'calendar'} />

              <div className="st-section">
                <div className="st-section-head"><div className="st-section-title">{t.goal.title}</div></div>
                <div className="st-section-desc">{t.goal.desc}</div>
                <div className="st-card">
                  <div className="st-field-label">{t.goal.label}</div>
                  <input type="number" id="cfg-daily-study-min" min="15" max="240" step="15" value={draft.dailyStudyMin} onChange={(e) => patch({ dailyStudyMin: e.target.value })} />
                </div>
              </div>

              <SiteBlockSection draft={draft} patch={patch} />

              <div className="st-section">
                <div className="st-section-head"><div className="st-section-title">{th.title}</div></div>
                <div className="st-section-desc">{th.desc}</div>
                <div className="st-card">
                  <div className="st-toggle-row">
                    <div>
                      <div className="st-toggle-txt">{th.toggle}</div>
                      <div className="st-toggle-sub">{th.toggleSub}</div>
                    </div>
                    <Switch id="cfg-hardcore" checked={draft.hardcore} onChange={(hardcore) => patch({ hardcore })} />
                  </div>
                  <div className="st-hint" id="hardcore-site-note">{th.siteNote}</div>
                </div>
              </div>

              <AvatarPicker active={open && stab === 'general'} />

              <ThemePicker />

              <div className="st-section">
                <div className="st-section-head"><div className="st-section-title">{t.tour.title}</div></div>
                <div className="st-section-desc">{t.tour.desc}</div>
                <div className="st-card">
                  <div className="st-action-row">
                    <div>
                      <div className="ar-title">{t.tour.rowTitle}</div>
                      <div className="ar-desc">{t.tour.rowDesc}</div>
                    </div>
                    <button type="button" className="st-action-btn" id="tour-restart" onClick={restart}>{t.tour.button}</button>
                  </div>
                </div>
              </div>


              <div className="st-section">
                <div className="st-section-head"><div className="st-section-title">{t.data.title}</div></div>
                <div className="st-section-desc">{t.data.desc}</div>
                <div className="st-card">
                  <div className="st-action-row">
                    <div>
                      <div className="ar-title">{t.data.rowTitle}</div>
                      <div className="ar-desc">{t.data.rowDesc}</div>
                    </div>
                    <button type="button" className="st-action-btn" id="export-data-btn" onClick={exportData}>{t.data.button}</button>
                  </div>
                </div>
              </div>

              <div className="st-section">
                <div className="st-section-head"><div className="st-section-title danger">{t.danger.title}</div></div>
                <div className="st-card st-danger">
                  <div className="st-danger-row">
                    <div className="dr-txt">
                      <div className="dr-title">{t.danger.cancelTitle}</div>
                      <div className="dr-desc">{t.danger.cancelDesc}</div>
                    </div>
                    <button type="button" className="danger-btn" onClick={() => setModal('cancel')}>{t.danger.cancelBtn}</button>
                  </div>
                  <div className="st-divider" />
                  <div className="st-danger-row">
                    <div className="dr-txt">
                      <div className="dr-title">{t.danger.deleteTitle}</div>
                      <div className="dr-desc">{t.danger.deleteDesc}</div>
                    </div>
                    <button type="button" className="danger-btn" onClick={() => setModal('delete')}>{t.danger.deleteBtn}</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="st-actions">
          <div className="st-actions-inner">
            <button className="reset-btn" onClick={() => setDraft(defaultDraft())}>{t.reset}</button>
            <button className="save-btn" onClick={save}>{t.save}</button>
          </div>
        </div>
      </div>

      <FitStudyModal
        open={modal === 'fit'}
        cfgBase={cfgPreview}
        onApply={(pomo, short, long) => patch({ pomo: String(pomo), shortBreak: String(short), longBreak: String(long) })}
        onClose={() => setModal('none')}
      />
      <CancelSessionModal open={modal === 'cancel'} onClose={() => setModal('none')} onDone={close} />
      <DeleteAccountModal open={modal === 'delete'} onClose={() => setModal('none')} onDone={close} />
    </>
  );
}
