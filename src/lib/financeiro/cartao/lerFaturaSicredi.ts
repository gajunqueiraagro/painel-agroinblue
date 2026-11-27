/**
 * CARTAO-FATURA-GRAVAR (25/11) — leitor da FATURA do cartão SICREDI (Mastercard, PDF com texto), sobre as LINHAS do PDF como a tela já
 * as monta (`montarLinhas`: células juntas por " | ", página por página). Devolve a MESMA `FaturaLida` do Ourocard: o resto da prévia
 * (casar, agrupar, gravar) não sabe de que banco veio. Função pura: nada grava.
 * A REGRA DA LEITURA (a forma, nunca o dado; ⚠ fatura real NUNCA no repo, teste ou log — os testes usam linhas inventadas):
 *  - cabeçalho: "Mastercard Black | final | 1234 | Total fatura de outubro | R$ …" (produto + final), "<nome> | Vencimento | dd/mm/aaaa",
 *    "Total da fatura anterior | …" (saldo anterior) e "Total desta Fatura | …" (total). O fechamento DESTA fatura não vem impresso
 *    (só o da próxima): fica nulo, nunca adivinhado;
 *  - ⚠ A FONTE DO PDF troca às vezes o ponto do milhar por "!" ("8!491,17") e chega a engolir o algarismo junto ("!491,17"): o "!" entre
 *    algarismos vale como ponto; o total do resumo que não se lê inteiro cede ao do cabeçalho ("Total fatura de novembro | R$ …") —
 *    os dois lidos e diferentes = aviso;
 *  - lançamentos: "dd/mmm hh:mm | [cidade |] [Online|Presencial |] descrição [| kk/nn] | [-]R$ valor", depois de "Data e hora | …";
 *    a linha sem descrição (a anuidade) leva o texto da linha de cima ("Anuidade Diferenc 06/12"); "kk/nn" antes do valor = a parcela;
 *  - o cartão de cada linha: "Cartão <nome> (final 1234)" e "Cartão adicional <nome> (final 5678)" acima das linhas;
 *  - a data da linha é a da COMPRA; o ano sai do vencimento (mês depois do mês do vencimento = ano anterior);
 *  - a soma confere: saldo anterior + Σ lançamentos (o pagamento entra negativo) = total desta fatura (o que não fecha vira aviso).
 */
import type { FaturaLida, TipoDaLinha } from './lerFaturaOurocard';

const MESES: Record<string, string> = { jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06', jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12' };
const RE_DATA = /^(\d{2})\/([a-zç]{3})\s+\d{2}:\d{2}$/i;
const RE_VALOR = /^(-?)R\$\s*([\d.]+,\d{2})$/;
const RE_PARCELA = /^(\d{1,2})\/(\d{1,2})$/;
const RE_CARTAO = /^Cartão\s+(?:adicional\s+)?(.+?)\s*\(final\s+(\d{4})\)$/i;

/** o "!" entre algarismos é o ponto do milhar (a fonte do PDF troca) */
const semExclamacao = (s: string) => s.replace(/(\d)!(\d{3})/g, '$1.$2');
const centavos = (s: string): number => {
  const neg = s.trim().startsWith('-');
  const [i, d] = s.replace('-', '').replace(/\./g, '').split(',');
  const v = Number(i) * 100 + Number(d);
  return neg ? -v : v;
};
const iso = (dmy: string) => { const [d, m, a] = dmy.split('/'); return `${a}-${m}-${d}`; };

/** "12/set" → a data da compra; o ano pelo vencimento (compra num mês depois do mês do vencimento = ano anterior) */
export function dataDaCompraSicredi(dia: string, mes: string, vencimento: string | null): string | null {
  const mm = MESES[mes.toLowerCase()];
  if (!mm || !vencimento) return null;
  const [va, vm] = vencimento.split('-').map(Number);
  const ano = Number(mm) > vm ? va - 1 : va;
  return `${ano}-${mm}-${dia}`;
}

function tipoDe(descricao: string, valorCent: number): TipoDaLinha {
  const d = descricao.toUpperCase();
  if (/^PAGAMENTO\b/.test(d)) return 'pagamento';
  if (/^CR[EÉ]DITO\s+ANUIDADE\b/.test(d)) return 'desconto_anuidade';
  if (/\bANUIDADE\b/.test(d)) return 'anuidade';
  if (/^IOF\b/.test(d)) return 'iof';
  if (valorCent < 0) return 'credito';
  return 'compra';
}

/** o PDF é uma fatura Sicredi? (o leitor só roda quando é) */
export const pareceFaturaSicredi = (linhas: readonly string[]) =>
  linhas.some((l) => /^Total desta Fatura\s*\|/i.test(l.trim())) && linhas.some((l) => RE_CARTAO.test(l.trim()));

export function lerFaturaSicredi(linhasDoPdf: readonly string[]): FaturaLida {
  const out: FaturaLida = { produto: null, finalCartao: null, titular: null, vencimento: null, fechamento: null, totalCent: null,
    saldoAnteriorCent: null, linhas: [], somaConfere: false, avisos: [] };
  const linhas = linhasDoPdf.map((l) => semExclamacao(l.trim())).filter((l) => l !== '');
  let totalDoCabecalho: number | null = null;

  for (const l of linhas) {
    let m = /^(Mastercard[^|]*?)\s*\|\s*final\s*\|\s*(\d{4})\b/i.exec(l);
    if (m && out.finalCartao == null) { out.produto = m[1].trim(); out.finalCartao = m[2]; }
    m = /\|\s*Vencimento\s*\|\s*(\d{2}\/\d{2}\/\d{4})$/i.exec(l);
    if (m && out.vencimento == null) out.vencimento = iso(m[1]);
    m = /^Total desta Fatura\s*\|\s*(-?\d[\d.]*,\d{2})$/i.exec(l);
    if (m) out.totalCent = centavos(m[1]);
    m = /\|\s*Total fatura de [a-zç]+\s*\|\s*R\$\s*(\d[\d.]*,\d{2})$/i.exec(l);
    if (m && totalDoCabecalho == null) totalDoCabecalho = centavos(m[1]);
    m = /^Total da fatura anterior\s*\|\s*(-?[\d.]+,\d{2})\b/i.exec(l);
    if (m && out.saldoAnteriorCent == null) out.saldoAnteriorCent = centavos(m[1]);
  }

  if (out.totalCent == null) out.totalCent = totalDoCabecalho;
  else if (totalDoCabecalho != null && totalDoCabecalho !== out.totalCent) {
    out.avisos.push(`O total do resumo (${out.totalCent}) e o do cabeçalho (${totalDoCabecalho}) diferem (centavos): confira o PDF.`);
  }

  const ini = linhas.findIndex((l) => /^Data e hora\s*\|/i.test(l));
  if (ini < 0) { out.avisos.push('Não achei a tabela "Transações" (o PDF é de outra fatura?).'); return out; }

  let titular: string | null = null; let finalAtual: string | null = out.finalCartao;
  /* o cartão de cada linha vem ANTES do cabeçalho da tabela na 1ª página ("Cartão <nome> (final 1234)" e depois "Data e hora | …") */
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    const tit = RE_CARTAO.exec(l);
    if (tit) {
      titular = tit[1].trim(); finalAtual = tit[2];
      if (out.titular == null && !/^Cartão\s+adicional\b/i.test(l)) out.titular = titular;
      continue;
    }
    if (i <= ini) continue;
    const cel = l.split('|').map((c) => c.trim()).filter((c) => c !== '');
    const data = RE_DATA.exec(cel[0] ?? '');
    if (!data) continue;
    const valor = RE_VALOR.exec(cel[cel.length - 1] ?? '');
    const dataCompra = dataDaCompraSicredi(data[1], data[2], out.vencimento);
    if (!valor || !dataCompra) { out.avisos.push(`Linha não lida: "${l}"`); continue; }
    let meio = cel.slice(1, -1);
    let parcela: { k: number; n: number } | null = null;
    const p = RE_PARCELA.exec(meio[meio.length - 1] ?? '');
    if (p && meio.length > 1) { parcela = { k: Number(p[1]), n: Number(p[2]) }; meio = meio.slice(0, -1); }
    /* "Online"/"Presencial" é a coluna Compra: o que vem antes é a cidade, o que vem depois é a descrição */
    const modo = meio.findIndex((c) => /^(online|presencial)$/i.test(c));
    if (modo >= 0) meio = meio.slice(modo + 1);
    let descricao = meio.join(' ').replace(/\s+/g, ' ').trim();
    if (!descricao) {
      const acima = linhas[i - 1] ?? '';
      if (!acima.includes('|') && !/^\d+$/.test(acima)) descricao = acima;
    }
    if (!descricao) { out.avisos.push(`Linha sem descrição: "${l}"`); continue; }
    const valorCent = centavos(`${valor[1]}${valor[2]}`);
    out.linhas.push({ ordem: out.linhas.length + 1, secao: '', dataCompra, descricao, pais: null, valorCent, parcela, exterior: null,
      tipo: tipoDe(descricao, valorCent), titular, finalCartao: finalAtual });
  }

  const soma = out.linhas.reduce((s, x) => s + x.valorCent, out.saldoAnteriorCent ?? 0);
  out.somaConfere = out.totalCent != null && soma === out.totalCent;
  if (out.totalCent != null && !out.somaConfere) out.avisos.push(`A soma não fecha: saldo anterior + lançamentos = ${soma}, total da fatura = ${out.totalCent} (centavos).`);
  if (!out.finalCartao) out.avisos.push('Não achei o final do cartão.');
  if (!out.vencimento) out.avisos.push('Não achei o vencimento.');
  return out;
}
