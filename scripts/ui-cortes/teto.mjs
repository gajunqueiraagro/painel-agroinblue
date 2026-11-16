/* GATE-TELA-TETO-01 (OK do Gabriel 16/11) — o relógio do gate de tela, o MESMO no check-ui-cortes e no check-ui-desloca.
 *
 *   - Teto por MEDIÇÃO (cena × tamanho): 45 s. Estourou = a página é fechada (o contexto inteiro: derruba o `evaluate` pendurado), o gate
 *     registra o achado "teto" com o passo em que parou e segue. O teto REPROVA, como qualquer achado — nunca é pulo.
 *   - Espera padrão de 8 s (clique, `waitFor`) e 15 s de navegação: seletor que não existe custa 8 s, não os 30 s do Playwright.
 *   - Teto por RODADA: 8 min desde o início do processo. Antes de cada medição nova, se o gasto + a média passaria do teto, a rodada para
 *     e diz de onde continuar (`--de <cena>@<L>x<A>`). Saída 4 = INCOMPLETO: nunca verde.
 *   - `--fatia k/n`: as medições escolhidas em n partes iguais, em ordem; roda a parte k. "Completo" = todas as fatias verdes.
 *   - Uma linha por medição (`[i/N] cena@LxA 3,1 s`), no terminal e em `--log <arquivo>`.
 */
import fs from 'node:fs';

export const TETO_MEDICAO_MS = 45_000;
export const TETO_RODADA_MS = 8 * 60_000;
export const ESPERA_PADRAO_MS = 8_000;
export const ESPERA_NAVEGACAO_MS = 15_000;
export const SAIDA_PARCIAL = 4;

const valorDe = (argv, n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] ?? null : null; };

/** As opções da rodada, da linha de comando. Valor inválido = erro (nunca "roda tudo" por engano). */
export function lerOpcoesDaRodada(argv) {
  const de = valorDe(argv, '--de');
  const f = valorDe(argv, '--fatia');
  const min = valorDe(argv, '--teto-min');
  const log = valorDe(argv, '--log');
  let fatia = null;
  if (f !== null) {
    const m = /^(\d+)\/(\d+)$/.exec(f);
    if (!m || Number(m[2]) < 1 || Number(m[1]) < 1 || Number(m[1]) > Number(m[2])) throw new Error(`--fatia "${f}" inválida (use k/n, 1 <= k <= n)`);
    fatia = { k: Number(m[1]), n: Number(m[2]) };
  }
  let tetoRodadaMs = TETO_RODADA_MS;
  if (min !== null) {
    const v = Number(String(min).replace(',', '.'));
    if (!(v > 0)) throw new Error(`--teto-min "${min}" inválido`);
    tetoRodadaMs = Math.round(v * 60_000);
  }
  if (argv.includes('--de') && !de) throw new Error('--de sem a medição (use cena@LxA)');
  return { de, fatia, tetoRodadaMs, tetoMedicaoMs: TETO_MEDICAO_MS, log };
}

export const chaveDaMedicao = (nome, w, h) => `${nome}@${w}x${h}`;

/** O plano da rodada: (cena × tamanho) em ordem; a fatia primeiro, depois o `--de` (inclusive). `--de` que não está no plano = erro. */
export function planoDaRodada(escolhidos, tamanhosDe, { de = null, fatia = null } = {}) {
  let itens = escolhidos.flatMap((cen) => tamanhosDe(cen).map(([w, h]) => ({ cen, w, h, chave: chaveDaMedicao(cen.nome, w, h) })));
  if (fatia) {
    const tam = Math.ceil(itens.length / fatia.n);
    itens = itens.slice((fatia.k - 1) * tam, fatia.k * tam);
  }
  if (de) {
    const i = itens.findIndex((x) => x.chave === de);
    if (i < 0) throw new Error(`--de "${de}" não está nas medições desta rodada`);
    itens = itens.slice(i);
  }
  return itens;
}

/** Roda `corpo` contra o relógio. Estourou: chama `aoEstourar` (com 10 s de limite próprio) e devolve `{ ok: false, estourou: true }`;
 *  a rejeição tardia do corpo (a página fechada no meio) é engolida. Erro do corpo: `{ ok: false, erro }`. */
export function comTeto(ms, corpo, aoEstourar) {
  return new Promise((resolve) => {
    let fim = false;
    const relogio = setTimeout(async () => {
      if (fim) return; fim = true;
      try { await Promise.race([Promise.resolve().then(aoEstourar), new Promise((r) => setTimeout(r, 10_000))]); } catch { /* fechar não decide o veredito */ }
      resolve({ ok: false, estourou: true });
    }, ms);
    Promise.resolve().then(corpo).then(
      (valor) => { if (fim) return; fim = true; clearTimeout(relogio); resolve({ ok: true, valor }); },
      (erro) => { if (fim) return; fim = true; clearTimeout(relogio); resolve({ ok: false, erro }); },
    );
  });
}

/** Para antes da próxima medição? A primeira sempre roda (senão uma rodada lenta nunca anda). */
export function deveParar({ decorridoMs, feitas, gastoMs, tetoRodadaMs }) {
  if (feitas === 0) return false;
  return decorridoMs + 1.5 * (gastoMs / feitas) > tetoRodadaMs;
}

export const textoDoTeto = (tetoMs, passo) => `passou de ${Math.round(tetoMs / 1000)} s (parou em: ${passo})`;

const segundos = (ms) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
export function linhaDaMedicao({ i, total, chave, ms, achados, teto }) {
  return `[${i}/${total}] ${chave} ${segundos(ms)}${teto ? ' TETO' : achados ? ` ${achados} achado(s)` : ''}`;
}

export const fraseDoParcial = (script, feitas, total, proxima) =>
  `${script}: PARCIAL — ${feitas} de ${total} medições no teto da rodada; continue com --de ${proxima} (incompleto: não é verde)`;

/** Achado manda (1); sem achado, incompleto (4); só o completo sem achado é 0. */
export const codigoDaRodada = ({ achados, parcial }) => (achados > 0 ? 1 : parcial ? SAIDA_PARCIAL : 0);

/** A linha vai ao terminal e, com `--log`, ao arquivo (acrescenta; nada de `| tail`). */
export function criarRegistro(caminho) {
  return (linha) => { console.log(linha); if (caminho) fs.appendFileSync(caminho, `${linha}\n`); };
}

/** As páginas de UMA medição: toda página nasce com as esperas padrão; no estouro, o contexto de cada uma fecha (e a que nascer depois
 *  fecha na hora). `navegador.newPage` cria um contexto por página. */
export function paginasDaMedicao(navegador) {
  const abertas = new Set(); let encerrada = false;
  return {
    async nova(opcoes) {
      const pg = await navegador.newPage(opcoes);
      if (encerrada) { await pg.context().close().catch(() => {}); throw new Error('medição encerrada pelo teto'); }
      pg.setDefaultTimeout(ESPERA_PADRAO_MS); pg.setDefaultNavigationTimeout(ESPERA_NAVEGACAO_MS);
      abertas.add(pg); return pg;
    },
    async fecharTodas() { encerrada = true; await Promise.all([...abertas].map((pg) => pg.context().close().catch(() => {}))); },
  };
}
