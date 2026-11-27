/**
 * CONTAS-CONSUMO-01 C1 (Gabriel 27/11, mock aprovado) — a FATURA DE ENERGIA (NF3e, modelo 66) que chega na Caixa: a Caixa dizia "sem linha
 * digitável nem chave" e o Documentos "não parece um DANFE" (o leitor só conhecia o modelo 55). PURO: recebe as linhas de cada página (as
 * do `montarLinhas`, células por " | ") e devolve a `FaturaLida`.
 *
 * ⚠ A CHAVE MANDA: só é fatura de energia com a chave de 44 dígitos de modelo 66 e DV certo (a mesma régua da NF-e, `chaveValidaDoModelo`).
 *   Da chave saem o CNPJ da concessionária, o número e a série — nunca do texto solto.
 * ⚠ Do texto (a forma do DANF3E; ⚠ fatura real NUNCA no repo, teste ou log — os testes usam dados inventados):
 *   "<Mês> / <AAAA> | dd/mm/aaaa | R$ <valor>" = referência, vencimento e valor; "<dd/mm/aaaa> | <dd/mm/aaaa> | <dias> | <dd/mm/aaaa>" =
 *   leitura anterior, atual, dias e a próxima (a linha ANTES é o titular, a DEPOIS o endereço); "<medidor> | Energia ativa em kWh | … |
 *   <anterior> | <atual> | <constante> | <consumo>"; "… DÉBITO AUTOMÁTICO UTILIZANDO O CÓDIGO: <código>-<dv>" (o código é a unidade
 *   consumidora quando a fatura não traz o rótulo próprio); a concessionária é a linha depois do título.
 * ⚠ O que não for lido fica null ("—"), nunca inventado. O CPF/CNPJ do titular vem mascarado na fatura e fica assim.
 * Água e outras concessionárias: sem amostra hoje — entram quando chegar uma (C1b).
 */
import { chaveValidaDoModelo } from '@/lib/oc/leitura/chaveNFe';
import { valorDoRecibo } from '@/lib/folha/lerFolha';
import { acharBoletoNoTexto } from '@/lib/financeiro/linhaDigitavel';

export interface FaturaLida {
  tipo: 'energia';
  chave: string;
  concessionaria: { nome: string | null; cnpj: string };
  numero: string;
  serie: string;
  /** 'AAAA-MM' */
  referencia: string | null;
  /** 'AAAA-MM-DD' */
  vencimento: string | null;
  valor: number | null;
  /** a unidade consumidora (matrícula / instalação / código do cliente) */
  uc: string | null;
  medidor: string | null;
  titular: string | null;
  endereco: string | null;
  consumoKwh: number | null;
  leitura: { anterior: string; atual: string; dias: number } | null;
  debitoAutomatico: string | null;
  /** a linha digitável, quando a fatura traz boleto (arrecadação) */
  linhaDigitavel: string | null;
}
export type LeituraDaFatura = { ok: true; fatura: FaturaLida } | { ok: false; frase: string };
export const FRASE_NAO_E_FATURA = 'Não é uma fatura de energia que eu conheça.';

const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const celulas = (linha: string) => linha.split('|').map((c) => c.trim()).filter((c) => c !== '');
const DATA = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const iso = (s: string): string | null => {
  const m = s.trim().match(DATA);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return d.getUTCDate() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

/** A 1ª chave de 44 dígitos de modelo 66 com DV certo (os grupos "5026 1115 …" juntos, inclusive quebrados em 2 linhas). */
export function chaveNF3e(texto: string): string | null {
  const digitos = texto.replace(/(\d)[ .\n]+(?=\d)/g, '$1');
  for (const m of digitos.matchAll(/\d{44,}/g)) {
    for (let i = 0; i + 44 <= m[0].length; i++) {
      const c = m[0].slice(i, i + 44);
      if (chaveValidaDoModelo(c, '66')) return c;
    }
  }
  return null;
}

export function lerFaturaConsumo(paginas: string[][]): LeituraDaFatura {
  const linhas = paginas.flat();
  const chave = chaveNF3e(linhas.join('\n'));
  if (!chave) return { ok: false, frase: FRASE_NAO_E_FATURA };
  const t = linhas.map((l) => semAcento(l).trim());

  const iTitulo = t.findIndex((l) => /^danf3e\b/.test(l));
  const nomeConc = iTitulo >= 0 && linhas[iTitulo + 1] ? celulas(linhas[iTitulo + 1]).join(' ') : null;

  let referencia: string | null = null; let vencimento: string | null = null; let valor: number | null = null;
  let leitura: FaturaLida['leitura'] = null; let titular: string | null = null; let endereco: string | null = null;
  let medidor: string | null = null; let consumoKwh: number | null = null; let debito: string | null = null; let uc: string | null = null;
  for (let i = 0; i < linhas.length; i++) {
    const c = celulas(linhas[i]);
    /* "Novembro / 2026 | 16/12/2026 | R$ 61,29" */
    const ref = semAcento(c[0] ?? '').match(/^([a-z]+)\s*\/\s*(\d{4})$/);
    if (!referencia && ref && MESES.includes(ref[1]) && iso(c[1] ?? '') && /^R\$/.test(c[2] ?? '')) {
      referencia = `${ref[2]}-${String(MESES.indexOf(ref[1]) + 1).padStart(2, '0')}`;
      vencimento = iso(c[1]);
      valor = valorDoRecibo((c[2] ?? '').replace(/^R\$\s*/, ''));
      continue;
    }
    /* a leitura: "24/10/2026 | 24/11/2026 | 31 | 22/12/2026"; o titular antes, o endereço depois */
    if (!leitura && c.length === 4 && iso(c[0]) && iso(c[1]) && /^\d{1,3}$/.test(c[2]) && iso(c[3])) {
      leitura = { anterior: iso(c[0]) ?? '', atual: iso(c[1]) ?? '', dias: Number(c[2]) };
      titular = i > 0 ? celulas(linhas[i - 1]).join(' ') || null : null;
      endereco = linhas[i + 1] ? celulas(linhas[i + 1]).join(' ') || null : null;
      continue;
    }
    /* "<medidor> | Energia ativa em kWh | … | anterior | atual | constante | consumo" */
    const iEnergia = c.findIndex((x) => /^energia ativa em kwh$/.test(semAcento(x)));
    if (!medidor && iEnergia === 1) {
      medidor = c[0];
      const nums = c.slice(2).filter((x) => /^\d+$/.test(x)).map(Number);
      consumoKwh = nums.length >= 4 ? nums[3] : null;
      continue;
    }
    const deb = semAcento(c.join(' ')).match(/debito automatico utilizando o codigo:?\s*(\d+)(?:-(\d))?/);
    if (!debito && deb) { debito = deb[2] ? `${deb[1]}-${deb[2]}` : deb[1]; continue; }
    const rot = semAcento(c.join(' ')).match(/(?:unidade consumidora|matricula|instalacao|codigo do cliente)\s*:?\s*(\d{4,})/);
    if (!uc && rot) uc = rot[1];
  }
  if (!uc && debito) uc = debito.split('-')[0];
  const boleto = acharBoletoNoTexto(linhas.join('\n'));
  return {
    ok: true,
    fatura: {
      tipo: 'energia', chave, concessionaria: { nome: nomeConc, cnpj: chave.slice(6, 20) }, numero: chave.slice(25, 34), serie: chave.slice(22, 25),
      referencia, vencimento, valor, uc, medidor, titular, endereco, consumoKwh, leitura, debitoAutomatico: debito,
      linhaDigitavel: boleto && boleto.tipo === 'arrecadacao' ? boleto.linha : null,
    },
  };
}
