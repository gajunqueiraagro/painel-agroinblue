/**
 * BOLETO D3d — a regra da caixa por e-mail v2 (mock aprovado 18/11 07:50): grupos por e-mail, a nota XML + DANFE numa linha, um boleto por
 * linha (D7), o "antigo" (D4), "No sistema" em frase e os verbos de cada caso.
 */
import { describe, it, expect } from 'vitest';
import {
  contarAResolver, ehAntigo, fontesAntigas, fraseDoVencido, grupoDosGuardados, gruposDosEmails, linhaDaNota, linhaDoBoleto, linhasDasFontes,
  nomeDoRemetente, numeroDaNota, type BoletoLido, type FonteParaMontar, type Lido,
} from './caixaPorEmail';
import { entradaDaLinha } from './entradaEmailApi';
import { acharBoletosNoTexto } from '@/lib/financeiro/linhaDigitavel';
import { listaDaCaixa, respostaDeEntrar } from './caixaApi';

const HOJE = '2026-11-18';
const email = (id: string, m: Record<string, unknown> = {}) => entradaDaLinha({
  id, mensagem_id: '<m1@x>', remetente: 'Natalino Cavalli Junior ADM <c@hotmail.com>', assunto: 'ENC: Pontero - Nota fiscal e Boleto',
  recebido_em: '2026-11-17T19:27:02Z', arquivo_nome: `${id}.pdf`, tipo: 'pdf', storage_path: `cli/entrada/${id}.pdf`, estado: 'a_ler', ...m,
});
const NOTA = { chave: '5'.repeat(44), numero: '000122048', emitente: 'Pontero Nutrição Animal', valor: 6300, vencimento: '2026-12-20' };
const bol = (codigo: string, vencimento: string | null, valor = 2100): BoletoLido => ({ codigoBarras: codigo, linha: codigo, vencimento, valor, beneficiario: 'Pontero' });
const lanc = (id: string, descricao: string) => ({ id, descricao, valor: 2100, status: 'programado', cancelado: false, vencimento: '2026-12-20' });
const previa = (m: Record<string, unknown>) => respostaDeEntrar({
  ok: true, simulado: true, ja_existe: false, id: null, candidatos: [], avisos: [], situacao: { lancamentos: [], avisos: [] },
  boleto: { codigo_barras: '1'.repeat(44), situacao: 'novo' }, ...m,
});

describe('BOLETO D3d — a nota', () => {
  it('o XML e o DANFE da MESMA chave no mesmo e-mail = UMA linha "NF 122.048 · XML + PDF" (o PDF é o que se vê)', () => {
    const lidos: Record<string, Lido> = { x: { k: 'nota', nota: NOTA }, p: { k: 'nota', nota: { ...NOTA, emitente: 'PONTERO (do PDF)' } } };
    const g = gruposDosEmails([email('x', { tipo: 'xml', arquivo_nome: 'chave.xml' }), email('p', { arquivo_nome: 'DOC001.pdf' })], lidos,
      { [NOTA.chave]: null }, {}, HOJE, true, new Set());
    expect(g).toHaveLength(1);
    expect(g[0].linhas).toHaveLength(1);
    const l = g[0].linhas[0];
    expect(l.arquivo).toBe('NF 122.048 · XML + PDF');
    expect(l.fontes).toEqual(['p', 'x']);
    expect(l.emitente).toBe('Pontero Nutrição Animal');   // o XML manda sobre o PDF
    expect(l.noSistema.selo?.texto).toBe('não lançada');
    expect(l.acoes).toEqual(['lancar_nota', 'ignorar']);
  });
  it('já lançada (o documento com a chave): "Vincular"; consulta que falhou: "não verificada", nunca "não lançada" (P146)', () => {
    const ja = linhaDaNota('n', ['x'], ['xml'], NOTA, { lancamentoId: 'l1', descricao: 'Adensado 30 bs lote 70259 1/3', valor: 2100, vencimento: '2026-12-20' }, true);
    expect(ja.acoes).toEqual(['vincular_nota', 'ignorar']);
    expect(ja.noSistema.texto).toBe('Adensado 30 bs lote 70259 1/3 · 20/12/2026 · 2.100,00');
    const erro = linhaDaNota('n', ['x'], ['xml'], NOTA, 'erro', true);
    expect(erro.noSistema.selo?.texto).toBe('não verificada');
    expect(erro.acoes[0]).toBe('lancar_nota');
  });
  it('sem a tela de Lançamentos (a caixa do Editar lançamento): a nota não lança daqui, só ignora — e a frase diz onde', () => {
    const l = linhaDaNota('n', ['x'], ['xml'], NOTA, null, false);
    expect(l.acoes).toEqual(['ignorar']);
    expect(l.noSistema.titulo).toMatch(/\+ Novo › Da nota fiscal/);
  });
});

describe('BOLETO D3d — o boleto', () => {
  it('D7: o PDF com 2 boletos = 2 linhas ("1 de 2", "2 de 2"), cada uma com a sua prévia', () => {
    const f: FonteParaMontar = { chave: 'f', nome: 'NF721-3, 4.pdf', tipoDoArquivo: 'pdf', lido: { k: 'boletos', boletos: [bol('A', '2026-12-10'), bol('B', '2027-01-10')] } };
    const ls = linhasDasFontes([f], {}, { 'f#A': previa({}) }, HOJE, true, new Set());
    expect(ls.map((l) => l.arquivo)).toEqual(['NF721-3, 4.pdf · 1 de 2', 'NF721-3, 4.pdf · 2 de 2']);
    expect(ls[0].noSistema.selo?.texto).toBe('sem lançamento');
    expect(ls[1].noSistema.selo?.texto).toBe('procurando…');
  });
  it('candidato exato → "Vincular"; nenhum → "Guardar"; já ligado → "Vincular" (só marca); recusado pelo banco → só "Ignorar"', () => {
    const exato = linhaDoBoleto('k', ['f'], 'b.pdf', 'b.pdf', bol('A', '2026-12-20'),
      previa({ candidatos: [{ tipo: 'exato', soma: 2100, lancamentos: [lanc('l1', 'Adensado 1/3')] }] }), HOJE, null);
    expect(exato.acoes).toEqual(['vincular_boleto', 'ignorar']);
    expect(exato.noSistema.selo?.texto).toBe('exato');
    expect(linhaDoBoleto('k', ['f'], 'b', 'b', bol('A', '2026-12-20'), previa({}), HOJE, null).acoes).toEqual(['guardar', 'ignorar']);
    const ligado = linhaDoBoleto('k', ['f'], 'b', 'b', bol('A', '2026-12-20'),
      previa({ ja_existe: true, id: 'b9', situacao: { lancamentos: [lanc('l1', 'Adensado 1/3')], avisos: [] } }), HOJE, null);
    expect(ligado.acoes).toEqual(['vincular_boleto', 'ignorar']);
    expect(ligado.boletoGuardadoId).toBe('b9');
    expect(ligado.noSistema.selo?.texto).toBe('já ligado');
    const recusa = linhaDoBoleto('k', ['f'], 'b', 'b', bol('A', null), respostaDeEntrar({ ok: false, recusa: { frase: 'A linha não confere.' } }), HOJE, null);
    expect(recusa.acoes).toEqual(['ignorar']);
  });
  it('D4 antigo: mais de 60 dias vencido = selo vermelho "venceu há…" e "Ignorar" vira a 1ª ação (nunca sozinho)', () => {
    expect(ehAntigo('2026-09-19', HOJE)).toBe(false);   // 60 dias
    expect(ehAntigo('2026-09-18', HOJE)).toBe(true);    // 61
    expect(fraseDoVencido('2025-04-04', HOJE)).toBe('venceu há 1 ano e 7 meses');
    expect(fraseDoVencido('2026-08-01', HOJE)).toBe('venceu há 3 meses');
    const l = linhaDoBoleto('k', ['f'], 'NF939-2.pdf', 'NF939-2.pdf', bol('A', '2025-04-04'),
      previa({ candidatos: [{ tipo: 'exato', soma: 2100, lancamentos: [lanc('l1', 'x')] }] }), HOJE, null);
    expect(l.antigo).toBe(true);
    expect(l.noSistema.selo).toEqual({ texto: 'antigo', tom: 'vermelho' });
    expect(l.acoes).toEqual(['ignorar', 'vincular_boleto']);
  });
  it('"Ignorar os N antigos" só quando o grupo tem 2+ antigos, e só as fontes em que TUDO é antigo', () => {
    const f = (c: string, v: string[]): FonteParaMontar => ({ chave: c, nome: `${c}.pdf`, tipoDoArquivo: 'pdf', lido: { k: 'boletos', boletos: v.map((x, i) => bol(`${c}${i}`, x)) } });
    const ls = linhasDasFontes([f('a', ['2025-04-04']), f('b', ['2025-04-10', '2026-12-10']), f('c', ['2025-05-01'])], {}, {}, HOJE, true, new Set());
    expect(fontesAntigas(ls)).toEqual(['a', 'c']);
    expect(fontesAntigas(ls.slice(0, 1))).toEqual([]);
  });
  it('os guardados (novo / sem par) viram o grupo "Na caixa, sem lançamento"; o ligado e o descartado não', () => {
    const lista = listaDaCaixa({ contadores: {}, itens: [
      { id: 'g1', codigo_barras: '7'.repeat(44), situacao: 'novo', beneficiario_nome: 'F', valor: 10, vencimento: '2026-12-20' },
      { id: 'g2', codigo_barras: '8'.repeat(44), situacao: 'ligado', valor: 10 },
      { id: 'g3', codigo_barras: '9'.repeat(44), situacao: 'descartado', valor: 10 },
    ] });
    const g = grupoDosGuardados(lista.itens, {}, HOJE, new Set());
    expect(g?.titulo).toBe('Na caixa, sem lançamento');
    expect(g?.linhas.map((l) => l.boletoGuardadoId)).toEqual(['g1']);
    expect(grupoDosGuardados(lista.itens.slice(1), {}, HOJE, new Set())).toBeNull();
  });
});

describe('BOLETO D3d — os grupos', () => {
  it('um grupo por e-mail, o mais novo primeiro; sem anexo / gmail / recusado entram com "Ignorar"; resolvidos e ignorados ficam fora', () => {
    const es = [
      email('a', { mensagem_id: '<velho>', recebido_em: '2026-11-17T19:00:00Z' }),
      email('b', { mensagem_id: '<novo>', recebido_em: '2026-11-17T20:00:00Z', arquivo_nome: null, tipo: null, storage_path: null, estado: 'sem_anexo' }),
      email('c', { mensagem_id: '<novo>', recebido_em: '2026-11-17T20:00:00Z', estado: 'dispensado', ignorado_motivo: 'antigo' }),
      email('d', { mensagem_id: '<outro>', estado: 'nota' }),
    ];
    const g = gruposDosEmails(es, { a: { k: 'nada', frase: 'Sem linha.' } }, {}, {}, HOJE, true, new Set());
    expect(g.map((x) => x.chave)).toEqual(['email:<novo>', 'email:<velho>']);
    expect(g[0].linhas.map((l) => [l.tipo, l.acoes])).toEqual([['sem_anexo', ['ignorar']]]);
    expect(g[1].linhas[0].tipo).toBe('nada');
    expect(g[1].titulo).toMatch(/^17\/11\/2026 \d\d:\d\d · Natalino Cavalli Junior ADM$/);
    expect(contarAResolver(g)).toBe(2);
  });
  it('o arquivo ainda lendo não conta como "a resolver" (sem ação); o feito nesta sessão também não', () => {
    const f: FonteParaMontar = { chave: 'f', nome: 'b.pdf', tipoDoArquivo: 'pdf', lido: { k: 'boletos', boletos: [bol('A', '2026-12-10')] } };
    const lendo: FonteParaMontar = { chave: 'g', nome: 'c.pdf', tipoDoArquivo: 'pdf', lido: { k: 'lendo' } };
    const ls = linhasDasFontes([f, lendo], {}, { 'f#A': previa({}) }, HOJE, true, new Set(['f#A']));
    expect(ls.map((l) => [l.feito, l.acoes.length])).toEqual([[true, 0], [false, 0]]);
  });
  it('o nome do remetente sem o endereço; o número da nota com milhar', () => {
    expect(nomeDoRemetente('Natalino Cavalli Junior ADM <cavalli@hotmail.com>')).toBe('Natalino Cavalli Junior ADM');
    expect(nomeDoRemetente('<so@endereco.com>')).toBe('so@endereco.com');
    expect(nomeDoRemetente(null)).toBe('—');
    expect(numeroDaNota('000122048')).toBe('122.048');
  });
});

describe('BOLETO D3d (D7) — todos os boletos do texto', () => {
  it('acha as 2 fichas (DV conferido), sem repetir a do recibo, na ordem do texto', () => {
    const a = '34191.09008 04881.820049 19646.100008 8 16110000300650';
    const b = '34191.09008 04882.240049 19646.100008 6 17370000300650';
    const r = acharBoletosNoTexto(`Recibo ${a} ... Ficha ${a} ... Recibo ${b} Ficha ${b} lixo 34191.09008 04881.820049 19646.100008 9 16110000300650`);
    expect(r.map((x) => x.vencimento)).toEqual(['2026-10-26', '2027-03-01']);
  });
});
