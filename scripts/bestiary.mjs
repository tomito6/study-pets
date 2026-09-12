// O Bestiário: uma página só, com todo o elenco de pets, as evoluções e as skills.
//
//   node --import ./scripts/ts-loader.mjs scripts/bestiary.mjs
//
// Lê o catálogo DIRETO do domínio (`src/domain/pets.ts` e `progression.ts`) e os
// sprites de `public/idle/pets/`, e escreve `bestiario.html` na raiz — um arquivo só,
// sem rede, com os sprites embutidos em base64. Mudou o catálogo? Roda de novo.
//
// É por isso que a página não envelhece: ela não tem dados próprios. O que ela
// mostra é o que o app realmente faz.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EVOLVE_LEVELS, FORMS, PET_LIST, speciesForm } from '../src/domain/pets.ts';
import {
  SKILLS,
  SKILL_BONUS_BASE,
  SKILL_BONUS_MAX,
  SKILL_DAY_SHARE,
  SKILL_TIERS,
  skillBonus,
} from '../src/domain/progression.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'bestiario.html');

// ---------------------------------------------------------------- dados

const sprite = (form, i) => {
  const png = readFileSync(join(ROOT, 'public', 'idle', 'pets', form, `${i}.png`));
  return `data:image/png;base64,${png.toString('base64')}`;
};

/** Onde cada skill mora hoje. */
const formsWithSkill = (id) => Object.values(FORMS).filter((f) => f.skills.includes(id)).map((f) => f.id);

/** O nível mais alto em que uma forma aparece (0 = a base da espécie). */
const levelOfForm = {};
for (const s of PET_LIST) {
  levelOfForm[s.form] = 0;
  for (const p of s.paths) for (const st of p.stages) levelOfForm[st.form] = st.level;
}

const TIER_LABEL = {
  alta: { nome: 'Acompanha o dia', quando: 'umas 3 vezes num dia de 8 estudos' },
  media: { nome: 'Acontece às vezes', quando: 'uma ou duas vezes por dia' },
  baixa: { nome: 'Uma vez por dia', quando: 'um único bloco, sempre' },
};

const data = {
  geradoEm: new Date().toISOString().slice(0, 10),
  evolveLevels: [...EVOLVE_LEVELS],
  diaShare: SKILL_DAY_SHARE,
  tetoNivel: SKILL_BONUS_MAX,
  tiers: Object.fromEntries(
    Object.entries(SKILL_TIERS).map(([k, v]) => [k, { ...v, ...TIER_LABEL[k] }]),
  ),
  skills: Object.values(SKILLS).map((s) => ({
    id: s.id,
    name: s.name,
    desc: s.desc,
    tier: s.tier,
    rule: s.rule,
    pct: { 1: skillBonus(s, 1), 5: skillBonus(s, 5), 11: skillBonus(s, 11) },
    forms: formsWithSkill(s.id),
    vezes: Math.round(SKILL_TIERS[s.tier].share * 8 * 10) / 10,
  })),
  forms: Object.fromEntries(
    Object.values(FORMS).map((f) => [
      f.id,
      { id: f.id, name: f.name, emoji: f.emoji, skills: [...f.skills], level: levelOfForm[f.id] ?? null },
    ]),
  ),
  species: PET_LIST.map((s) => ({
    id: s.id,
    price: s.price,
    form: s.form,
    names: [...s.names],
    baseName: speciesForm(s).name,
    paths: s.paths.map((p) => ({ id: p.id, name: p.name, desc: p.desc, stages: p.stages.map((st) => ({ ...st })) })),
  })),
  sprites: Object.fromEntries(
    Object.values(FORMS).map((f) => [f.id, Array.from({ length: f.frames }, (_, i) => sprite(f.id, i))]),
  ),
};

// ---------------------------------------------------------------- página

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pct = (n) => `${Math.round(n * 100)}%`;

/** Um nó da árvore: sprite + nome + nível + as skills. */
const node = (formId, { base = false } = {}) => {
  const f = data.forms[formId];
  const lvl = base ? 'base' : `Lv.&nbsp;${f.level}`;
  return `<figure class="node${base ? ' node-base' : ''}" data-form="${formId}" tabindex="0">
      <span class="node-stage">${lvl}</span>
      <img class="pix" src="${data.sprites[formId][0]}" alt="" data-frames="${data.sprites[formId].length}">
      <figcaption>${esc(f.name)}</figcaption>
      <ul class="chips">${f.skills.map((id) => `<li><button class="chip t-${SKILLS[id].tier}" data-skill="${id}">${esc(SKILLS[id].name)}</button></li>`).join('')}</ul>
    </figure>`;
};

const speciesBlock = (s) => `
  <article class="species" id="sp-${s.id}">
    <header class="species-head">
      <img class="pix pix-sm" src="${data.sprites[s.form][0]}" alt="" data-frames="${data.sprites[s.form].length}">
      <div>
        <h3>${esc(s.baseName)}</h3>
        <p class="species-meta">${s.price} 🪙 na loja · nomes sugeridos: ${esc(s.names.slice(0, 4).join(', '))}…</p>
      </div>
    </header>
    <div class="tree">
      <div class="tree-base">${node(s.form, { base: true })}</div>
      <div class="tree-paths">
        ${s.paths.map((p) => `
          <div class="path">
            <div class="path-label"><b>${esc(p.name)}</b><span>${esc(p.desc)}</span></div>
            <div class="path-stages">
              ${p.stages.map((st) => node(st.form)).join('<span class="arrow" aria-hidden="true"></span>')}
            </div>
          </div>`).join('')}
      </div>
    </div>
  </article>`;

const skillRow = (s) => `
  <li class="skill" data-skill-row="${s.id}">
    <button class="skill-hit" data-skill="${s.id}">
      <span class="skill-name">${esc(s.name)}</span>
      <span class="skill-pct">+${pct(s.pct[1])}<em>→ +${pct(s.pct[11])}</em></span>
    </button>
    <p class="skill-desc">${esc(s.desc)}</p>
    <p class="skill-where">${s.vezes === 1 ? '1 vez' : `~${String(s.vezes).replace('.', ',')} vezes`} por dia · em ${s.forms.length} ${s.forms.length === 1 ? 'forma' : 'formas'}: ${s.forms.map((f) => esc(data.forms[f].name)).join(', ')}</p>
  </li>`;

const tierColumn = (key) => {
  const t = data.tiers[key];
  const list = data.skills.filter((s) => s.tier === key);
  return `
  <section class="tier t-${key}">
    <header class="tier-head">
      <h3>${esc(t.nome)}</h3>
      <p class="tier-math"><span>acontece ${esc(t.quando)}</span><span>paga <b>×${t.weight}</b></span></p>
    </header>
    <ul class="skill-list">${list.map(skillRow).join('')}</ul>
  </section>`;
};

// O gráfico do equilíbrio: largura = quantas vezes acontece, altura = quanto paga.
// Os três retângulos têm a MESMA área — e os cantos caem todos na curva x·y = 0,375.
function balanceChart() {
  const W = 620, H = 340, L = 62, R = 26, T = 26, B = 52;
  const xMax = 0.45, yMax = 3.4;
  const x = (v) => L + (v / xMax) * (W - L - R);
  const y = (v) => H - B - (v / yMax) * (H - T - B);
  const curve = [];
  for (let i = 0; i <= 120; i++) {
    const vx = 0.11 + (i / 120) * (xMax - 0.115);
    const vy = SKILL_DAY_SHARE / vx;
    if (vy <= yMax) curve.push(`${i && curve.length ? 'L' : 'M'}${x(vx).toFixed(1)},${y(vy).toFixed(1)}`);
  }
  const rects = ['baixa', 'media', 'alta'].map((k) => {
    const t = data.tiers[k];
    return `<rect class="bar b-${k}" x="${x(0)}" y="${y(t.weight)}" width="${(x(t.share) - x(0)).toFixed(1)}" height="${(y(0) - y(t.weight)).toFixed(1)}" rx="2"></rect>
      <text class="bar-tag tag-${k}" x="${(x(t.share) - 8).toFixed(1)}" y="${(y(t.weight) + 18).toFixed(1)}" text-anchor="end">${esc(t.nome)}</text>`;
  }).join('');
  const xt = [0.125, 0.1875, 0.375].map((v) => `<line class="tick" x1="${x(v)}" y1="${y(0)}" x2="${x(v)}" y2="${y(0) + 5}"></line>
    <text class="axis-num" x="${x(v)}" y="${y(0) + 19}" text-anchor="middle">${String(Math.round(v * 8 * 10) / 10).replace('.', ',')}</text>`).join('');
  const yt = [1, 2, 3].map((v) => `<line class="tick" x1="${L - 5}" y1="${y(v)}" x2="${L}" y2="${y(v)}"></line>
    <text class="axis-num" x="${L - 10}" y="${y(v) + 4}" text-anchor="end">×${v}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Três retângulos de mesma área: quanto mais raro, mais paga.">
    ${rects}
    <path class="hyper" d="${curve.join('')}"></path>
    <line class="axis" x1="${L}" y1="${T}" x2="${L}" y2="${y(0)}"></line>
    <line class="axis" x1="${L}" y1="${y(0)}" x2="${W - R}" y2="${y(0)}"></line>
    ${xt}${yt}
    <text class="axis-lab" x="${(L + W - R) / 2}" y="${H - 8}" text-anchor="middle">vezes por dia (num dia de 8 estudos)</text>
    <text class="axis-lab" x="-${(T + y(0)) / 2}" y="15" transform="rotate(-90)" text-anchor="middle">quanto paga</text>
  </svg>`;
}

const CSS = `
:root{
  --ground:#f6efe3; --paper:#fffdf7; --sunk:#f2ead9;
  --ink:#40382e; --ink-soft:#5d5346; --muted:#6e6455;
  --line:#d8cdbb; --line-soft:rgba(64,56,46,.08);
  --accent:#486244; --accent-wash:rgba(72,98,68,.10);
  --alta:#6b7a3f; --alta-wash:rgba(107,122,63,.13);
  --media:#3f6b7a; --media-wash:rgba(63,107,122,.13);
  --baixa:#7a4162; --baixa-wash:rgba(122,65,98,.13);
  --shadow:rgba(64,56,46,.10);
  --stage:radial-gradient(ellipse 62% 50% at 50% 74%,rgba(179,118,85,.20) 0%,rgba(179,118,85,.07) 50%,rgba(179,118,85,0) 74%);
  --font-d:'Lora',Georgia,serif; --font-b:'DM Sans',system-ui,sans-serif; --font-m:'DM Mono',ui-monospace,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --ground:#0e0e0f; --paper:#18181b; --sunk:#232328;
  --ink:#f0f0f0; --ink-soft:#c9c9cf; --muted:#8d8d95;
  --line:#2e2e35; --line-soft:rgba(255,255,255,.06);
  --accent:#a3e635; --accent-wash:rgba(163,230,53,.12);
  --alta:#b4c96e; --alta-wash:rgba(180,201,110,.14);
  --media:#78b6c9; --media-wash:rgba(120,182,201,.14);
  --baixa:#d18aae; --baixa-wash:rgba(209,138,174,.14);
  --shadow:rgba(0,0,0,.5);
  --stage:radial-gradient(ellipse 62% 50% at 50% 74%,rgba(163,230,53,.10) 0%,rgba(163,230,53,0) 72%);
}}
:root[data-theme="dark"]{
  --ground:#0e0e0f; --paper:#18181b; --sunk:#232328;
  --ink:#f0f0f0; --ink-soft:#c9c9cf; --muted:#8d8d95;
  --line:#2e2e35; --line-soft:rgba(255,255,255,.06);
  --accent:#a3e635; --accent-wash:rgba(163,230,53,.12);
  --alta:#b4c96e; --alta-wash:rgba(180,201,110,.14);
  --media:#78b6c9; --media-wash:rgba(120,182,201,.14);
  --baixa:#d18aae; --baixa-wash:rgba(209,138,174,.14);
  --shadow:rgba(0,0,0,.5);
  --stage:radial-gradient(ellipse 62% 50% at 50% 74%,rgba(163,230,53,.10) 0%,rgba(163,230,53,0) 72%);
}

*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--font-b);font-size:15px;line-height:1.6;-webkit-font-smoothing:antialiased}
.wrap{max-width:1080px;margin:0 auto;padding:0 24px 96px}
h1,h2,h3{font-family:var(--font-d);font-weight:600;text-wrap:balance;margin:0}
a{color:var(--accent)}
.pix{image-rendering:pixelated;width:72px;height:72px;display:block}
.pix-sm{width:44px;height:44px}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}

/* ── masthead ───────────────────────────────────────────────── */
.mast{padding:52px 0 28px;border-bottom:1px solid var(--line)}
.eyebrow{font-family:var(--font-m);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}
.mast h1{font-size:clamp(38px,6vw,60px);line-height:1.02;letter-spacing:-.02em}
.lede{max-width:60ch;font-size:17px;color:var(--ink-soft);margin:16px 0 0}
.counts{display:flex;flex-wrap:wrap;gap:28px;margin:26px 0 0;padding:0;list-style:none}
.counts b{display:block;font-family:var(--font-m);font-size:26px;font-variant-numeric:tabular-nums;line-height:1.1}
.counts span{font-size:12px;color:var(--muted);letter-spacing:.03em}

/* ── barra de filtro ────────────────────────────────────────── */
.rail{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:12px;flex-wrap:wrap;
  padding:11px 24px;margin:0 -24px;background:color-mix(in srgb,var(--ground) 92%,transparent);
  backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.rail nav{display:flex;gap:2px;flex-wrap:wrap}
.rail nav a{font-size:13px;color:var(--muted);text-decoration:none;padding:4px 9px;border-radius:5px}
.rail nav a:hover{color:var(--ink);background:var(--line-soft)}
.rail-state{margin-left:auto;display:flex;align-items:center;gap:10px;font-size:13px;color:var(--muted)}
.rail-state[hidden]{display:none}
#clear{font:inherit;font-size:12px;border:1px solid var(--line);background:var(--paper);color:var(--ink);
  padding:3px 10px;border-radius:999px;cursor:pointer}
#clear:hover{border-color:var(--accent);color:var(--accent)}

/* ── seções ─────────────────────────────────────────────────── */
section.band{padding:56px 0 0;scroll-margin-top:60px}
.band > h2{font-size:30px;letter-spacing:-.01em}
.band > .sub{max-width:62ch;color:var(--muted);margin:8px 0 0}

/* ── elenco ─────────────────────────────────────────────────── */
.species{margin-top:34px;padding-top:26px;border-top:1px solid var(--line)}
.species-head{display:flex;align-items:center;gap:14px}
.species-head h3{font-size:22px}
.species-meta{margin:1px 0 0;font-size:12.5px;color:var(--muted)}
.tree{display:grid;grid-template-columns:auto 1fr;gap:22px;align-items:center;margin-top:18px}
.tree-paths{display:grid;gap:14px}
.path{display:grid;grid-template-columns:150px 1fr;gap:16px;align-items:center;
  padding:12px 14px;background:var(--paper);border:1px solid var(--line);border-radius:10px}
.path-label b{display:block;font-family:var(--font-d);font-size:15px}
.path-label span{display:block;font-size:11.5px;line-height:1.45;color:var(--muted);margin-top:2px}
.path-stages{display:flex;align-items:flex-start;gap:6px}
.arrow{flex:0 0 26px;height:1px;background:var(--line);position:relative;margin-top:44px}
.arrow::after{content:"";position:absolute;right:0;top:-3px;border:3.5px solid transparent;border-left-color:var(--line)}

.node{margin:0;display:flex;flex-direction:column;align-items:center;gap:5px;width:132px;
  padding:9px 7px 10px;border-radius:9px;border:1px solid transparent;cursor:pointer;
  transition:border-color .15s,background .15s,opacity .15s}
.node:hover,.node:focus-visible{border-color:var(--line);background:var(--sunk);outline:none}
.node .pix{background:var(--stage)}
.node figcaption{font-family:var(--font-d);font-size:13.5px;text-align:center;line-height:1.25}
.node-stage{font-family:var(--font-m);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.node-base{background:var(--paper);border-color:var(--line)}
.chips{list-style:none;display:flex;flex-wrap:wrap;gap:3px;justify-content:center;margin:2px 0 0;padding:0}
.chip{font:inherit;font-size:10.5px;line-height:1;padding:3.5px 7px;border-radius:999px;cursor:pointer;
  border:1px solid;background:transparent;transition:background .15s}
.chip.t-alta{color:var(--alta);border-color:var(--alta)}
.chip.t-media{color:var(--media);border-color:var(--media)}
.chip.t-baixa{color:var(--baixa);border-color:var(--baixa)}
.chip.t-alta:hover,.chip.t-alta.on{background:var(--alta-wash)}
.chip.t-media:hover,.chip.t-media.on{background:var(--media-wash)}
.chip.t-baixa:hover,.chip.t-baixa.on{background:var(--baixa-wash)}
.chip.on{font-weight:600}

body.filtering .node{opacity:.26}
body.filtering .node.hit{opacity:1;border-color:var(--accent);background:var(--accent-wash)}
body.filtering .skill{opacity:.3}
body.filtering .skill.hit{opacity:1}

/* ── skills ─────────────────────────────────────────────────── */
.tiers{display:grid;grid-template-columns:repeat(auto-fit,minmax(285px,1fr));gap:20px;margin-top:26px;align-items:start}
.tier{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:18px 18px 8px}
.tier-head{padding-bottom:12px;border-bottom:1px solid var(--line)}
.tier-head h3{font-size:17px}
.tier.t-alta .tier-head h3{color:var(--alta)}
.tier.t-media .tier-head h3{color:var(--media)}
.tier.t-baixa .tier-head h3{color:var(--baixa)}
.tier-math{display:flex;justify-content:space-between;gap:10px;margin:5px 0 0;font-size:12px;color:var(--muted)}
.tier-math b{font-family:var(--font-m);color:var(--ink)}
.skill-list{list-style:none;margin:0;padding:0}
.skill{padding:13px 0;border-bottom:1px solid var(--line-soft);transition:opacity .15s}
.skill:last-child{border-bottom:0}
.skill-hit{display:flex;width:100%;align-items:baseline;justify-content:space-between;gap:10px;
  font:inherit;text-align:left;background:none;border:0;padding:0;cursor:pointer;color:inherit}
.skill-name{font-family:var(--font-d);font-size:15.5px;font-weight:600}
.skill-hit:hover .skill-name{text-decoration:underline;text-underline-offset:3px}
.skill-pct{font-family:var(--font-m);font-size:13px;font-variant-numeric:tabular-nums;white-space:nowrap}
.skill-pct em{font-style:normal;color:var(--muted);font-size:11.5px;margin-left:5px}
.t-alta .skill-pct{color:var(--alta)} .t-media .skill-pct{color:var(--media)} .t-baixa .skill-pct{color:var(--baixa)}
.skill-desc{margin:3px 0 0;font-size:13.5px;color:var(--ink-soft)}
.skill-where{margin:5px 0 0;font-size:11.5px;color:var(--muted)}

/* ── equilíbrio ─────────────────────────────────────────────── */
.balance{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:34px;align-items:center;margin-top:26px}
.balance figure{margin:0;background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:14px;overflow-x:auto}
.balance svg{width:100%;height:auto;display:block;min-width:420px}
.bar{stroke-width:1.5;fill-opacity:1}
.b-alta{fill:var(--alta-wash);stroke:var(--alta)}
.b-media{fill:var(--media-wash);stroke:var(--media)}
.b-baixa{fill:var(--baixa-wash);stroke:var(--baixa)}
.bar-tag{font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600}
.tag-alta{fill:var(--alta)} .tag-media{fill:var(--media)} .tag-baixa{fill:var(--baixa)}
.hyper{fill:none;stroke:var(--ink);stroke-width:1.2;stroke-dasharray:3 4;opacity:.45}
.axis{stroke:var(--ink);stroke-width:1;opacity:.5}
.tick{stroke:var(--ink);stroke-width:1;opacity:.4}
.axis-num{font-family:'DM Mono',monospace;font-size:10.5px;fill:var(--muted)}
.axis-lab{font-family:'DM Sans',sans-serif;font-size:11px;fill:var(--muted)}
.balance p{margin:0 0 14px;color:var(--ink-soft)}
.balance p:last-child{margin-bottom:0}
.balance .rule{font-family:var(--font-d);font-size:19px;line-height:1.45;color:var(--ink);
  border-left:3px solid var(--accent);padding-left:15px}

/* ── editor ─────────────────────────────────────────────────── */
.editor{margin-top:24px;background:var(--paper);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.ed-top{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:14px 18px;border-bottom:1px solid var(--line)}
.ed-top label{font-size:13px;color:var(--muted)}
select,.btn{font:inherit;font-size:13px;padding:6px 11px;border-radius:7px;border:1px solid var(--line);
  background:var(--ground);color:var(--ink);cursor:pointer}
select:focus-visible,.btn:focus-visible,.chip:focus-visible,.skill-hit:focus-visible,#clear:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.btn:hover{border-color:var(--accent);color:var(--accent)}
.btn-go{background:var(--accent);color:var(--ground);border-color:var(--accent);font-weight:600}
.btn-go:hover{filter:brightness(1.08);color:var(--ground)}
.ed-body{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0}
.ed-pick{padding:16px 18px;border-right:1px solid var(--line)}
.ed-pick h4,.ed-out h4{margin:0 0 10px;font-family:var(--font-d);font-size:14px}
.ed-grid{display:flex;flex-wrap:wrap;gap:5px;margin:0 0 16px;padding:0;list-style:none}
.ed-note{font-size:12.5px;color:var(--muted);margin:0}
.ed-out{padding:16px 18px;min-width:0}
pre{margin:0;background:var(--sunk);border:1px solid var(--line);border-radius:8px;padding:12px;
  overflow-x:auto;font-family:var(--font-m);font-size:11.5px;line-height:1.55;max-height:330px}
.warns{list-style:none;margin:0 0 12px;padding:0;font-size:12.5px}
.warns li{padding:6px 10px;border-radius:6px;margin-bottom:5px;border-left:3px solid}
.warns li.bad{background:var(--baixa-wash);border-color:var(--baixa)}
.warns li.ok{background:var(--accent-wash);border-color:var(--accent);color:var(--ink-soft)}

/* ── manutenção ─────────────────────────────────────────────── */
.howto{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;margin-top:24px}
.howto section{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:18px}
.howto h3{font-size:16px;margin-bottom:8px}
.howto ol,.howto ul{margin:0;padding-left:18px;font-size:13.5px;color:var(--ink-soft)}
.howto li{margin-bottom:6px}
code{font-family:var(--font-m);font-size:12.5px;background:var(--sunk);padding:1px 5px;border-radius:4px}
.foot{margin-top:56px;padding-top:20px;border-top:1px solid var(--line);font-size:12.5px;color:var(--muted)}

@media (max-width:820px){
  .tree{grid-template-columns:1fr}
  .path{grid-template-columns:1fr}
  .balance,.ed-body{grid-template-columns:1fr}
  .ed-pick{border-right:0;border-bottom:1px solid var(--line)}
  .path-stages{flex-wrap:wrap}
}
`;

const JS = `
const D = __DATA__;

// Sprites animados: um tick só pra página inteira, no ritmo do app (180 ms).
const imgs = [...document.querySelectorAll('.pix')];
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  let f = 0;
  setInterval(() => {
    f++;
    for (const img of imgs) {
      const form = img.closest('[data-form]')?.dataset.form || img.dataset.form;
      const frames = D.sprites[form];
      if (frames) img.src = frames[f % frames.length];
    }
  }, 180);
}
for (const img of imgs) {
  const form = img.closest('[data-form]')?.dataset.form;
  if (form) img.dataset.form = form;
}

// ── filtro: clicar numa skill acende quem a tem, na página toda ──────────
let filtro = null;
const railState = document.getElementById('rail-state');
const railName = document.getElementById('rail-name');

function aplicar() {
  document.body.classList.toggle('filtering', !!filtro);
  railState.hidden = !filtro;
  if (filtro) railName.textContent = D.skills.find((s) => s.id === filtro)?.name ?? filtro;
  for (const el of document.querySelectorAll('.node')) {
    el.classList.toggle('hit', !!filtro && (D.forms[el.dataset.form]?.skills || []).includes(filtro));
  }
  for (const el of document.querySelectorAll('.skill')) {
    el.classList.toggle('hit', el.dataset.skillRow === filtro);
  }
  for (const el of document.querySelectorAll('.chip')) {
    el.classList.toggle('on', el.dataset.skill === filtro);
  }
}
document.addEventListener('click', (e) => {
  const alvo = e.target.closest('[data-skill]');
  if (alvo) { filtro = filtro === alvo.dataset.skill ? null : alvo.dataset.skill; aplicar(); return; }
  if (e.target.closest('#clear')) { filtro = null; aplicar(); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && filtro) { filtro = null; aplicar(); } });

// ── editor: mexer no elenco e sair com o TypeScript pronto ───────────────
const rascunho = Object.fromEntries(Object.entries(D.forms).map(([id, f]) => [id, [...f.skills]]));
const sel = document.getElementById('ed-form');
const grid = document.getElementById('ed-grid');
const out = document.getElementById('ed-out');
const warns = document.getElementById('ed-warns');
const ordemForms = Object.keys(D.forms);

/** Quantas skills a forma deve ter: base 1, escolha do Lv. 5 duas, avanço três. */
const alvoDe = (id) => (D.forms[id].level === 0 ? 1 : D.forms[id].level === D.evolveLevels[0] ? 2 : 3);

/** O estágio anterior no mesmo caminho — o avanço tem que herdar dele. */
function anterior(formId) {
  for (const s of D.species) {
    for (const p of s.paths) {
      const i = p.stages.findIndex((st) => st.form === formId);
      if (i === 1) return p.stages[0].form;
      if (i === 0) return s.form;
    }
  }
  return null;
}

function checar() {
  const problemas = [];
  const vistos = new Map();
  for (const id of ordemForms) {
    const skills = rascunho[id];
    const nome = D.forms[id].name;
    if (skills.length !== alvoDe(id)) problemas.push(\`\${nome} tem \${skills.length} skill(s); a escada pede \${alvoDe(id)}.\`);
    const chave = [...skills].sort().join('+');
    if (skills.length && vistos.has(chave)) problemas.push(\`\${nome} tem exatamente as skills de \${vistos.get(chave)}.\`);
    else vistos.set(chave, nome);
    const ant = anterior(id);
    if (ant && D.forms[id].level === D.evolveLevels[1]) {
      const faltando = rascunho[ant].filter((s) => !skills.includes(s));
      if (faltando.length) problemas.push(\`\${nome} perdeu \${faltando.join(', ')} — o avanço do Lv. 15 só acrescenta.\`);
    }
  }
  const usadas = new Set(Object.values(rascunho).flat());
  for (const s of D.skills) if (!usadas.has(s.id)) problemas.push(\`\${s.name} não está em forma nenhuma.\`);
  warns.innerHTML = problemas.length
    ? problemas.map((p) => \`<li class="bad">\${p}</li>\`).join('')
    : '<li class="ok">Bate com todas as regras que os testes cobram.</li>';
}

function ts() {
  const linhas = [];
  const porEspecie = new Map();
  for (const s of D.species) {
    porEspecie.set(s.form, s.baseName);
    for (const p of s.paths) for (const st of p.stages) porEspecie.set(st.form, s.baseName);
  }
  let atual = null;
  for (const id of ordemForms) {
    const dono = porEspecie.get(id);
    if (dono !== atual) { linhas.push(\`  // \${dono.toLowerCase()}\`); atual = dono; }
    const f = D.forms[id];
    const chave = /^[a-z][a-zA-Z0-9]*$/.test(id) ? id : \`'\${id}'\`;
    const skills = rascunho[id].map((s) => \`'\${s}'\`).join(', ');
    linhas.push(\`  \${chave}: form('\${id}', '\${f.name}', '\${f.emoji}', [\${skills}]),\`);
  }
  return 'export const FORMS: Record<FormId, PetForm> = {\\n' + linhas.join('\\n') + '\\n};';
}

function pintar() {
  const id = sel.value;
  grid.innerHTML = D.skills.map((s) => {
    const on = rascunho[id].includes(s.id) ? ' on' : '';
    return \`<li><button class="chip t-\${s.tier}\${on}" data-toggle="\${s.id}">\${s.name}</button></li>\`;
  }).join('');
  out.textContent = ts();
  checar();
}

sel.innerHTML = ordemForms.map((id) => {
  const f = D.forms[id];
  const nivel = f.level === 0 ? 'base' : 'Lv. ' + f.level;
  return \`<option value="\${id}">\${f.name} — \${nivel}</option>\`;
}).join('');
sel.addEventListener('change', pintar);

grid.addEventListener('click', (e) => {
  const b = e.target.closest('[data-toggle]');
  if (!b) return;
  e.stopPropagation();
  const id = sel.value;
  const s = b.dataset.toggle;
  const i = rascunho[id].indexOf(s);
  if (i >= 0) rascunho[id].splice(i, 1); else rascunho[id].push(s);
  pintar();
});

document.getElementById('ed-reset').addEventListener('click', () => {
  for (const id of ordemForms) rascunho[id] = [...D.forms[id].skills];
  pintar();
});
document.getElementById('ed-copy').addEventListener('click', async (e) => {
  const b = e.currentTarget;
  try { await navigator.clipboard.writeText(ts()); b.textContent = 'Copiado ✓'; }
  catch { b.textContent = 'Selecione e copie'; }
  setTimeout(() => { b.textContent = 'Copiar o TypeScript'; }, 1800);
});

pintar();
`;

const nSkills = data.skills.length;
// O `<meta charset>` é obrigatório: sem ele o navegador chuta a codificação (e
// chuta windows-1252 quando um servidor entrega o arquivo sem charset no header),
// o que transforma "Bestiário" em "BestiÃ¡rio". Como a página é feita pra abrir
// com dois cliques, offline, daqui a anos, ela declara o documento inteiro.
const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bestiário Study Pets</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,500;0,600;1,500&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap">
<style>${CSS}</style>
</head>
<body>

<div class="wrap">
  <header class="mast">
    <p class="eyebrow">Study Pets · catálogo do jogo</p>
    <h1>Bestiário</h1>
    <p class="lede">Cinco espécies, ${Object.keys(data.forms).length} formas, ${nSkills} habilidades. Cada pet é um <em>jeito de estudar</em> — a faixa do dia em que você rende, o bloco em que é difícil voltar, o dia em que você reaparece depois de sumir. Esta página é gerada a partir do código: o que está aqui é o que o app faz.</p>
    <ul class="counts">
      <li><b>${data.species.length}</b><span>espécies na loja</span></li>
      <li><b>${Object.keys(data.forms).length}</b><span>formas na tela</span></li>
      <li><b>${nSkills}</b><span>habilidades</span></li>
      <li><b>${data.species.length * 2}</b><span>caminhos de evolução</span></li>
      <li><b>Lv.&nbsp;${data.evolveLevels.join(' e ')}</b><span>onde o bicho muda</span></li>
    </ul>
  </header>
</div>

<div class="wrap">
  <div class="rail">
    <nav>
      <a href="#elenco">Elenco</a>
      <a href="#habilidades">Habilidades</a>
      <a href="#equilibrio">Equilíbrio</a>
      <a href="#editor">Mexer</a>
      <a href="#manutencao">Manutenção</a>
    </nav>
    <div class="rail-state" id="rail-state" hidden>
      mostrando quem tem <b id="rail-name"></b>
      <button id="clear" type="button">limpar</button>
    </div>
  </div>

  <section class="band" id="elenco">
    <h2>O elenco</h2>
    <p class="sub">Toda espécie nasce com uma habilidade e escolhe um caminho no <b>Lv.&nbsp;${data.evolveLevels[0]}</b>; o caminho avança de novo no <b>Lv.&nbsp;${data.evolveLevels[1]}</b>. O caminho de companhia <em>cresce</em> (mantém a habilidade da base); o selvagem <em>transforma</em> (pode largar). Toque numa habilidade pra ver quem mais a tem.</p>
    ${data.species.map(speciesBlock).join('')}
  </section>

  <section class="band" id="habilidades">
    <h2>As habilidades</h2>
    <p class="sub">Cada uma vale um bônus de XP que cresce com o nível do pet — de <b>+${pct(SKILL_BONUS_BASE)}</b> no Lv.&nbsp;1 a <b>+${pct(SKILL_BONUS_MAX)}</b> no Lv.&nbsp;11, vezes o peso da coluna. Só uma fica ativa por pet, e ela precisa estar ligada <em>antes</em> do bloco começar.</p>
    <div class="tiers">
      ${['alta', 'media', 'baixa'].map(tierColumn).join('')}
    </div>
  </section>

  <section class="band" id="equilibrio">
    <h2>Por que todas valem o mesmo</h2>
    <p class="sub">O problema de um catálogo de habilidades é que a mais frequente vence sempre. Aqui a frequência é o preço: quanto mais raro o momento, mais aquele bloco paga.</p>
    <div class="balance">
      <figure>${balanceChart()}</figure>
      <div>
        <p class="rule">Uma habilidade rara acontece um terço das vezes e paga o triplo. Os três retângulos têm a mesma área.</p>
        <p>A largura é quantas vezes a habilidade acontece num dia de 8 estudos, pra quem ela combina; a altura é o multiplicador. A curva tracejada é <code>vezes × paga = ${String(data.diaShare).replace('.', ',')}</code> — os cantos caem todos nela.</p>
        <p>Na prática: uma habilidade rende ~2% do XP do dia no Lv.&nbsp;1 e ~6% no teto. É reconhecimento, não obrigação — ninguém precisa ter o pet certo pra estudar.</p>
        <p>O que <em>não</em> é igual, de propósito: se a sua rotina não combina com a habilidade, ela não acontece. Um madrugador com a Noturno ganha zero. Escolher é o jogo.</p>
      </div>
    </div>
  </section>

  <section class="band" id="editor">
    <h2>Mexer no elenco</h2>
    <p class="sub">Mude quem tem o quê aqui, veja se as regras continuam de pé, e leve o TypeScript pronto pra <code>src/domain/pets.ts</code>. As mesmas regras que os testes cobram são checadas ao vivo.</p>
    <div class="editor">
      <div class="ed-top">
        <label for="ed-form">Forma</label>
        <select id="ed-form"></select>
        <button class="btn" id="ed-reset" type="button">Voltar ao catálogo atual</button>
        <button class="btn btn-go" id="ed-copy" type="button">Copiar o TypeScript</button>
      </div>
      <div class="ed-body">
        <div class="ed-pick">
          <h4>Habilidades desta forma</h4>
          <ul class="ed-grid" id="ed-grid"></ul>
          <p class="ed-note">A cor do chip é o tier: <b>verde</b> acompanha o dia, <b>azul</b> acontece às vezes, <b>vinho</b> uma vez por dia.</p>
        </div>
        <div class="ed-out">
          <h4>O que ainda não fecha</h4>
          <ul class="warns" id="ed-warns"></ul>
          <h4>Pra colar em <code>pets.ts</code></h4>
          <pre id="ed-out"></pre>
        </div>
      </div>
    </div>
  </section>

  <section class="band" id="manutencao">
    <h2>Como isto se mantém vivo</h2>
    <p class="sub">A página não guarda dados: ela é gerada do código. Mexeu no catálogo, roda de novo e ela conta a verdade nova.</p>
    <div class="howto">
      <section>
        <h3>Regerar</h3>
        <ol>
          <li>Edite <code>src/domain/pets.ts</code> ou <code>progression.ts</code>.</li>
          <li><code>npm test</code> — os testes cobram a escada 1→2→3, a herança do Lv.&nbsp;${data.evolveLevels[1]} e a área igual dos tiers.</li>
          <li><code>node --import ./scripts/ts-loader.mjs scripts/bestiary.mjs</code></li>
        </ol>
      </section>
      <section>
        <h3>Pet novo</h3>
        <ol>
          <li>Sprites em <code>public/idle/pets/{forma}/</code> — 4 PNGs de 32×32 (o padrão é <code>scripts/pixel-sprites.mjs</code>).</li>
          <li>Uma entrada em <code>FORMS</code> por forma; uma em <code>PETS</code> pela espécie, com dois caminhos de dois estágios.</li>
          <li>Escada de habilidades: 1 na base, 2 no Lv.&nbsp;${data.evolveLevels[0]}, 3 no Lv.&nbsp;${data.evolveLevels[1]}.</li>
        </ol>
      </section>
      <section>
        <h3>Habilidade nova</h3>
        <ol>
          <li>Responda primeiro: <b>quantas vezes ela acontece num dia de 8 estudos</b>, pra quem ela combina? A resposta é o tier.</li>
          <li>Entrada em <code>SKILLS</code> com <code>tier</code> e <code>rule</code>; se a regra é inédita, um <code>kind</code> novo em <code>SkillRule</code>, o caso em <code>skillEligible</code> e o campo em <code>SkillContext</code>.</li>
          <li>O contexto é montado em <code>src/application/checks.ts</code> — só do que o plano do dia já sabe. Nada de campo novo no documento salvo.</li>
          <li>Ponha a habilidade em pelo menos uma forma, senão o teste reclama.</li>
        </ol>
      </section>
      <section>
        <h3>O que ficou de fora</h3>
        <ul>
          <li>Habilidade que paga em <b>moedas</b> — outra moeda, outro equilíbrio. Precisa de campo novo no check.</li>
          <li>Habilidade por <b>sequência de dias</b>: pagaria por streak e transformaria falhar em perda. O app não faz isso.</li>
          <li>Habilidade por <b>usar o modo foco</b>: puniria quem estuda longe do computador e marca depois.</li>
        </ul>
      </section>
    </div>
    <p class="foot">Gerado de <code>src/domain/pets.ts</code> e <code>src/domain/progression.ts</code> em ${data.geradoEm} por <code>scripts/bestiary.mjs</code>. Sprites embutidos — a página abre offline, sem rede.</p>
  </section>
</div>

<script>${JS.replace('__DATA__', () => JSON.stringify(data))}</script>
</body>
</html>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
console.log(`bestiário: ${Object.keys(data.forms).length} formas, ${nSkills} skills → ${OUT} (${Math.round(html.length / 1024)} KB)`);
