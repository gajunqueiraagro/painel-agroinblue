/**
 * CUSTEIO-TXT-03 — o lote do custeio entra inteiro, pela chave quando há sugestão e sem classificação quando não há.
 *
 * ⚠ A TELA NÃO SE MONTA EM TESTE (depende do hub de importação, de quatro leituras ao banco e do arquivo lido): o
 * contrato é provado LENDO A FONTE. Cada detector se prova antes num trecho de mentira — a lei do auto-teste do
 * `check:tdz`: "nenhum" só vale quando a busca provou que sabe achar.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fonte = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const TELA = fonte('src/v2/pages/CusteioTxtImportTab.tsx');
const HOOK = fonte('src/hooks/useFinanceiroV2.ts');
const OUTRO_CHAMADOR = fonte('src/pages/FinanceiroV2Tab.tsx');

/** O trecho de `inicio` (inclusive) até `fim` (inclusive). Falha se uma das âncoras não existir ou se repetir. */
function trecho(texto: string, inicio: string, fim: string): string {
  const a = texto.indexOf(inicio);
  if (a < 0) throw new Error(`âncora de início não encontrada: ${inicio}`);
  if (texto.indexOf(inicio, a + 1) >= 0) throw new Error(`âncora de início repetida: ${inicio}`);
  const b = texto.indexOf(fim, a + inicio.length);
  if (b < 0) throw new Error(`âncora de fim não encontrada depois de "${inicio}": ${fim}`);
  return texto.slice(a, b + fim.length);
}
const elegivel = (t: string) => trecho(t, 'const elegivelAoLote = useCallback(', ']);');
const lancar = (t: string) => trecho(t, 'async function lancarLote() {', 'const motivoLoteBloqueado');
const motivo = (t: string) => trecho(t, 'const motivoLoteBloqueado = ', ': null;');
const contar = (t: string, agulha: string) => t.split(agulha).length - 1;

describe('auto-teste dos detectores (a busca sabe achar)', () => {
  const ANTIGO = `
  const elegivelAoLote = useCallback((linhaNum: number) => {
    if (!competencia || !contaBancariaId) return false;
    return !!sugestaoPorLinha.get(linhaNum)?.subcentro;
  }, [competencia, contaBancariaId, sugestaoPorLinha]);
  async function lancarLote() {
    const forms = itens.map(() => ({ fazenda_id: fazendaResolvidaId ?? '', subcentro: sug?.subcentro }));
  }
  const motivoLoteBloqueado = !auxLoaded ? 'x' : !contaBancariaId ? 'y' : null;
  return (<Alert><AlertTitle>t</AlertTitle></Alert>);`;

  it('acha a regra antiga da elegibilidade, o uuid vazio, a falta da condição de fazenda e os Alerts', () => {
    expect(elegivel(ANTIGO)).toContain('sugestaoPorLinha');
    expect(elegivel(ANTIGO)).toContain('subcentro');
    expect(lancar(ANTIGO)).toContain("fazendaResolvidaId ?? ''");
    expect(lancar(ANTIGO)).not.toContain('plano_conta_id: sug?.planoContaId');
    expect(motivo(ANTIGO)).not.toContain('!fazendaResolvidaId');
    expect(contar(ANTIGO, '<Alert')).toBe(2);
    expect(() => trecho(ANTIGO, 'não existe', 'x')).toThrow();
  });
});

describe('CUSTEIO-TXT-03 — o lote entra inteiro', () => {
  it('(a) a elegibilidade não olha sugestão nem subcentro: competência, conta e não lançado', () => {
    const corpo = elegivel(TELA);
    expect(corpo).not.toContain('sugestaoPorLinha');
    expect(corpo).not.toContain('subcentro');
    expect(corpo).toContain('if (!competencia || !contaBancariaId) return false;');
    expect(corpo).toContain('lancadoPorHash.has(hash)');
  });

  it('(b) o form do lote manda a CHAVE do plano, nulo sem sugestão, e nunca o uuid vazio na fazenda', () => {
    const corpo = lancar(TELA);
    expect(contar(corpo, 'plano_conta_id: sug?.planoContaId || null,')).toBe(1);
    expect(corpo).toContain('subcentro: sug?.subcentro || null,');
    expect(corpo).not.toContain("fazendaResolvidaId ?? ''");
    expect(corpo).toContain('fazenda_id: fazendaResolvidaId,');
    // segunda tranca: sem fazenda resolvida a função sai antes de montar qualquer linha
    expect(corpo.indexOf('!fazendaResolvidaId')).toBeGreaterThan(0);
    expect(corpo.indexOf('!fazendaResolvidaId')).toBeLessThan(corpo.indexOf('const forms'));
    expect(contar(TELA, "?? ''")).toBe(0);
  });

  it('(c) o motivo do bloqueio tem a fazenda ANTES da conta, e o botão obedece ao motivo', () => {
    const corpo = motivo(TELA);
    const fazenda = corpo.indexOf('!fazendaResolvidaId');
    const conta = corpo.indexOf('!contaBancariaId');
    expect(fazenda).toBeGreaterThan(0);
    expect(conta).toBeGreaterThan(fazenda);
    expect(corpo).toContain('Fazenda do relatório não reconhecida no cadastro: lance item a item e escolha a fazenda no modal.');
    expect(TELA).toContain('disabled={motivoLoteBloqueado !== null || salvandoLote}');
  });

  it('(d) nenhum Alert do shadcn sobrou na tela, nem o import dele', () => {
    expect(contar(TELA, '<Alert')).toBe(0);
    expect(TELA).not.toContain("@/components/ui/alert'");
    for (const id of ['custeio-reconciliacao-status', 'custeio-divergencias', 'custeio-avisos', 'custeio-erro-leitura']) {
      expect(TELA, id).toContain(id);
    }
  });

  it('(e) a prévia tem o lugar reservado da recusa, o resumo e o selo "sem classificação"; a recusa não vira toast', () => {
    expect(contar(TELA, 'data-testid="lote-recusa"')).toBe(1);
    expect(contar(TELA, 'data-testid="lote-sem-classificacao"')).toBe(1);
    expect(contar(TELA, 'data-testid="lote-resumo"')).toBe(1);
    // o lugar da recusa existe sempre: não está atrás de uma condição
    expect(TELA).not.toMatch(/&&\s*\(?\s*<p data-testid="lote-recusa"/);
    expect(lancar(TELA)).toContain('{ aoRecusar: setRecusaDoLote }');
    // a tela não importa nem chama toast (a palavra só aparece em comentário)
    expect(TELA).not.toMatch(/\btoast(\.\w+)?\(/);
    expect(TELA).not.toContain("from 'sonner'");
  });

  it('o outro chamador do lote não conhece `aoRecusar`, e o hook só deixa de dar toast quando ele vem', () => {
    expect(OUTRO_CHAMADOR).toContain('onSaveBatch={hook.criarLancamentosEmLote}');
    expect(OUTRO_CHAMADOR).not.toContain('aoRecusar');
    expect(HOOK).toContain('opcoes?: { aoRecusar?: (frase: string) => void },');
    expect(contar(HOOK, "reportarErro(error, 'criarLancamentosEmLote', toast.error);")).toBe(1);
  });
});

describe('CUSTEIO-HASH-01 — o topo numa linha, o botão e a lista compactos, e o hash por arquivo', () => {
  const conferir = (t: string) => trecho(t, 'const conferirLancados = useCallback(async () => {', '}, [');

  it('auto-teste: os detectores acham o card antigo, o botão alto e o hash item a item', () => {
    const ANTIGO = `
    const conferirLancados = useCallback(async () => {
      const pares = await Promise.all(itens.map(async (it) => [it.linha_num, await hashItemCusteio({ clienteId })]));
    }, [itens]);
    <BlocoTopoAba itens={[]} /><Button size="sm" className="h-7 text-[11px]">Lançar</Button>`;
    expect(contar(ANTIGO, 'BlocoTopoAba')).toBe(1);
    expect(conferir(ANTIGO)).toContain('hashItemCusteio(');
    expect(conferir(ANTIGO)).not.toContain('hashesDoCusteio(');
    expect(ANTIGO).not.toContain('className="h-[22px] text-[10px]"');
  });

  it('o card do topo saiu do arquivo (nem import, nem uso)', () => {
    expect(contar(TELA, 'BlocoTopoAba')).toBe(0);
    expect(TELA).not.toContain("bloco-topo-aba'");
  });

  it('a linha do topo existe, com 18px, a fazenda do cadastro e os números que não cortam', () => {
    expect(contar(TELA, 'data-testid="custeio-linha-topo"')).toBe(1);
    const linha = trecho(TELA, '<p data-testid="custeio-linha-topo"', '</p>');
    expect(linha).toContain('h-[18px]');
    expect(linha).toContain('text-[10px]');
    expect(linha).toContain('{fazendaDoCadastro ?? resultado.fazenda_raw');
    expect(linha).toContain('fazenda não reconhecida no cadastro — lance item a item');
    expect(linha).toContain('mesCurto(resultado.ano_mes)');
    expect(contar(linha, 'text-[12px] font-medium tabular-nums')).toBe(2);
    // só o nome da fazenda corta; as outras três partes não encolhem
    expect(contar(linha, 'truncate')).toBe(1);
    expect(contar(linha, 'shrink-0')).toBe(3);
  });

  it('o botão do lote tem 22px / 10px; CONC-CUSTEIO-FONTE-01: a lista é a RÉGUA (linha 19px, colunas, cabeçalho preso com o mesmo colgroup)', () => {
    expect(contar(TELA, '<Button size="sm" className="h-[22px] text-[10px]"')).toBe(1);
    expect(TELA).not.toContain('className="h-7 text-[11px]"');
    const item = trecho(TELA, 'data-testid="custeio-item"', '</tr>');
    // uma linha por item, cada dado na sua célula da régua: ☐ · descrição · grupo › subgrupo · conta · valor · ação
    expect(contar(item, '<td className=')).toBe(6);
    expect(item).toContain('<td className={TD_REGUA_NUM}>{brl(it.valor)}</td>');
    expect(item).toContain('title={it.produto_raw}');
    expect(item).not.toContain('text-[12px]');
    expect(contar(item, 'text-[9.5px]')).toBe(2);
    // o cabeçalho é a régua navy dentro do bloco fixo, e o corpo usa o MESMO colgroup
    const cab = trecho(TELA, 'data-testid="custeio-cabecalho"', '</table>');
    expect(contar(cab, 'TH_REGUA')).toBe(6);
    expect(contar(TELA, '<ColunasDoCusteio />')).toBe(2);
    expect(TELA.indexOf('data-testid="custeio-cabecalho"')).toBeLessThan(TELA.indexOf('fim do topo fixo'));
    // nada abaixo de 9,5px na linha do item (o detector se prova num tamanho menor)
    expect(item).not.toMatch(/text-\[(?:[0-8](?:\.\d+)?|9(?:\.[0-4]\d*)?)px\]/);
    expect('text-[9px]').toMatch(/text-\[(?:[0-8](?:\.\d+)?|9(?:\.[0-4]\d*)?)px\]/);
  });

  it('CONC-CUSTEIO-FONTE-01: a divergência por escopo em colunas (Escopo · Itens · Impresso · Dif.), valores em células próprias', () => {
    const div = trecho(TELA, 'data-testid="custeio-divergencias"', '</table>');
    expect(div).toContain('{brl(d.soma_itens)}</td>');
    expect(div).toContain('{brl(d.subtotal_impresso)}</td>');
    expect(div).toContain('{brl(d.diferenca)}</td>');
    expect(TELA).not.toContain('itens ${brl(d.soma_itens)} × impresso');
  });

  it('a conferência dos lançados usa o hash do ARQUIVO (com a ocorrência), nunca o hash item a item', () => {
    const corpo = conferir(TELA);
    expect(corpo).toContain('await hashesDoCusteio(itens, clienteId, competencia)');
    expect(corpo).not.toContain('hashItemCusteio(');
    expect(TELA).not.toContain('hashItemCusteio(');
  });
});
