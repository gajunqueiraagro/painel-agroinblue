/**
 * FAZENDA-CADASTRO-01 · F1a — a LISTA DE FAZENDAS (mock tela 1, P1): os números do topo e a tabela das fazendas, uma linha por fazenda,
 * com a situação, a área (matrícula × pastos e a diferença à mostra), os pastos, o rebanho e a lotação do último fechamento e as
 * pendências do cadastro (P5: avisa, nunca bloqueia). A composição da área por fazenda (o pivô de hoje) continua embaixo, no V2Fazendas.
 * A unidade administrativa (sem pasto, só nome e código) fica numa linha à parte, abaixo da tabela.
 */
import { useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThOrdenavel } from '@/components/ui/th-ordenavel';
import { QUADRO_REGUA, RODAPE_REGUA, TD_REGUA, TD_REGUA_NUM, TD_REGUA_TEXTO, TH_REGUA } from '@/components/ui/regua-tabela';
import { useOrdenacaoTabela, type ColunaOrdenavel } from '@/hooks/useOrdenacaoTabela';
import { useAlturaAteOFim } from '@/hooks/useAlturaAteOFim';
import { formatNum } from '@/lib/calculos/formatters';
import { mesCurtoDe, textosDaVariacao, variacaoNoAno, type LinhaDaFazenda, type TotaisDaLista } from '@/lib/fazendas/listaDeFazendas';
import { cn } from '@/lib/utils';

type Coluna = 'codigo' | 'nome' | 'local' | 'situacao' | 'atividades' | 'matricula' | 'pastosHa' | 'diferenca' | 'nPastos' | 'noMapa'
  | 'rebanho' | 'noAno' | 'lotacao' | 'pendencias';

const COLUNAS: readonly (ColunaOrdenavel<LinhaDaFazenda, Coluna> & { rotulo: string; largura?: number; direita?: boolean })[] = [
  { coluna: 'codigo', rotulo: 'Cód.', largura: 44, tipo: 'texto', valor: l => l.codigo },
  { coluna: 'nome', rotulo: 'Fazenda', tipo: 'texto', valor: l => l.nome },
  { coluna: 'local', rotulo: 'Município', largura: 112, tipo: 'texto', valor: l => l.local },
  { coluna: 'situacao', rotulo: 'Situação', largura: 58, tipo: 'texto', valor: l => l.situacao },
  { coluna: 'atividades', rotulo: 'Atividades', largura: 108, tipo: 'texto', valor: l => l.atividades.join(' · ') || null },
  { coluna: 'matricula', rotulo: 'Matrícula ha', largura: 72, direita: true, tipo: 'numero', valor: l => l.matriculaHa },
  { coluna: 'pastosHa', rotulo: 'Pastos ha', largura: 68, direita: true,
    tipo: 'numero', valor: l => l.pastosHa },
  { coluna: 'diferenca', rotulo: 'Diferença', largura: 62, direita: true, tipo: 'numero', valor: l => l.diferencaHa },
  { coluna: 'nPastos', rotulo: 'Pastos', largura: 50, direita: true, tipo: 'numero', valor: l => l.nPastos },
  { coluna: 'noMapa', rotulo: 'No mapa', largura: 60, direita: true, tipo: 'numero', valor: l => l.noMapa },
  { coluna: 'rebanho', rotulo: 'Rebanho', largura: 56, direita: true, tipo: 'numero', valor: l => l.rebanho },
  /* regra geral do rebanho (Gabriel 12/11 20:27): delta e % no ano contra o saldo inicial do ano, na coluna DELA (ALINHAMENTO SOBERANO) */
  { coluna: 'noAno', rotulo: 'No ano', largura: 84, direita: true, tipo: 'numero', valor: l => variacaoNoAno(l.rebanho, l.rebanhoInicioDoAno)?.pct ?? null },
  { coluna: 'lotacao', rotulo: 'UA/ha', largura: 46, direita: true, tipo: 'numero', valor: l => l.lotacao },
  { coluna: 'pendencias', rotulo: 'Pendências do cadastro', largura: 128, tipo: 'texto', valor: l => (l.ativa ? l.pendencias.length : -1) },
];

const area = (v: number | null) => (v == null ? '—' : formatNum(v, 2));
const inteiro = (v: number | null) => (v == null ? '—' : formatNum(v, 0));
const dif = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${formatNum(v, 2)}`);
const corDoSinal = (s: -1 | 0 | 1 | undefined) => (s === 1 ? 'text-emerald-700' : s === -1 ? 'text-red-700' : 'text-muted-foreground');
const textoDaPendencia = (l: LinhaDaFazenda) => (!l.ativa ? l.situacao.toLowerCase() : l.pendencias.length === 0 ? 'completo' : l.pendencias.join(' · '));

function Numero({ valor, rotulo, nota, cor, testid, variacao }: {
  valor: string; rotulo: string; nota: string; cor?: string; testid: string;
  /** a linha da variação no ano (verde/vermelho), acima da nota; o title leva o saldo inicial */
  variacao?: ReturnType<typeof textosDaVariacao>;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-2 py-1" data-testid={testid}>
      <p className="text-[9.5px] text-muted-foreground">{rotulo}</p>
      <p className={cn('text-[13px] font-semibold tabular-nums leading-tight whitespace-nowrap', cor)}>{valor}</p>
      {variacao !== undefined && (
        <p className={cn('h-[13px] whitespace-nowrap text-[9.5px] leading-[13px] tabular-nums', corDoSinal(variacao?.sinal))} title={variacao?.inteiro}
          data-testid={`${testid}-no-ano`}>
          {variacao?.nota ?? 'sem saldo inicial do ano'}
        </p>
      )}
      {/* a nota quebra em até 2 linhas, com a altura reservada (fora de tabela nada de "…") */}
      <p className="h-[26px] overflow-hidden text-[9.5px] leading-[13px] text-muted-foreground">{nota}</p>
    </div>
  );
}

export interface ListaDeFazendasProps {
  linhas: readonly LinhaDaFazenda[];
  totais: TotaisDaLista;
  administrativa: { id: string; nome: string; codigo: string | null } | null;
  erro: string | null;
  carregando: boolean;
  onAbrir: (fazendaId: string) => void;
}

export function ListaDeFazendas({ linhas, totais, administrativa, erro, carregando, onAbrir }: ListaDeFazendasProps) {
  const { ordem, alternar, ordenadas } = useOrdenacaoTabela(linhas, COLUNAS, { coluna: 'codigo', direcao: 'asc' });
  const quadro = useAlturaAteOFim({ folga: 16, minimo: 160 });

  const colgroup = useMemo(() => (
    <colgroup>{COLUNAS.map(c => <col key={c.coluna} style={c.largura ? { width: c.largura } : undefined} />)}</colgroup>
  ), []);
  const th = cn(TH_REGUA, 'sticky top-0 z-10 bg-primary');

  const exportar = () => {
    const cab = ['Código', 'Fazenda', 'Município', 'Situação', 'Atividades', 'Matrícula (ha)', 'Pastos (ha)', 'Diferença (ha)', 'Pastos', 'No mapa',
      'Rebanho (cab)', 'Rebanho no ano (cab)', 'Rebanho no ano (%)', 'Saldo inicial do ano (cab)', 'Último fechamento', 'Lotação UA/ha (própria)', 'Pendências do cadastro'];
    const linhasXls = ordenadas.map(l => [l.codigo ?? '', l.nome, l.local ?? '', l.situacao, l.atividades.join(' · '), l.matriculaHa, l.pastosHa,
      l.diferencaHa, l.nPastos, l.noMapa, l.rebanho, variacaoNoAno(l.rebanho, l.rebanhoInicioDoAno)?.delta ?? null,
      (() => { const p = variacaoNoAno(l.rebanho, l.rebanhoInicioDoAno)?.pct; return p == null ? null : Math.round(p * 10) / 10; })(), l.rebanhoInicioDoAno,
      l.mesDoFechamento ? mesCurtoDe(l.mesDoFechamento) : '',
      l.lotacao == null ? null : Math.round(l.lotacao * 100) / 100, textoDaPendencia(l)]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cab, ...linhasXls]), 'Fazendas');
    XLSX.writeFile(wb, 'fazendas.xlsx');
  };

  const pecuariaPct = totais.pecuariaHa != null && totais.pastosHa ? `${formatNum((totais.pecuariaHa / totais.pastosHa) * 100, 1)}% da área dos pastos` : '—';
  const semDesenho = totais.nPastos - totais.noMapa;

  return (
    <div className="space-y-2" data-testid="lista-de-fazendas">
      <div className="grid grid-cols-6 gap-2">
        <Numero testid="kpi-matricula" rotulo="Área total (matrícula)" valor={totais.matriculaHa == null ? '—' : `${area(totais.matriculaHa)} ha`}
          nota={`${totais.fazendas} fazenda${totais.fazendas === 1 ? '' : 's'}`} />
        <Numero testid="kpi-pastos" rotulo="Soma dos pastos" valor={totais.pastosHa == null ? '—' : `${area(totais.pastosHa)} ha`}
          nota={totais.fazendasComDiferenca === 0 ? 'bate com as matrículas'
            : `diferença ${dif(totais.diferencaHa)} ha em ${totais.fazendasComDiferenca} fazenda${totais.fazendasComDiferenca === 1 ? '' : 's'}`}
          cor={totais.fazendasComDiferenca > 0 ? 'text-amber-700' : undefined} />
        <Numero testid="kpi-pecuaria" rotulo="Área de pecuária" valor={totais.pecuariaHa == null ? '—' : `${area(totais.pecuariaHa)} ha`} nota={pecuariaPct} />
        <Numero testid="kpi-vigentes" rotulo="Pastos vigentes" valor={inteiro(totais.nPastos)}
          nota={semDesenho > 0 ? `${semDesenho} sem desenho no mapa` : 'todos desenhados no mapa'} cor={semDesenho > 0 ? 'text-amber-700' : undefined} />
        <Numero testid="kpi-rebanho" rotulo="Rebanho" valor={totais.rebanho == null ? '—' : `${inteiro(totais.rebanho)} cab`}
          variacao={textosDaVariacao(variacaoNoAno(totais.rebanhoComInicio, totais.rebanhoInicioDoAno))}
          nota={totais.ultimoFechamento ? `último fechamento: ${mesCurtoDe(totais.ultimoFechamento)}` : 'sem fechamento no último ano'} />
        <Numero testid="kpi-pendencias" rotulo="Cadastros com pendência" valor={`${totais.comPendencia} de ${totais.ativas}`}
          nota="ativas · documento ou rebanho inicial" cor={totais.comPendencia > 0 ? 'text-amber-700' : undefined} />
      </div>

      <div className="flex h-5 items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-[10px] text-red-700" title={erro ?? undefined} data-testid="lista-de-fazendas-erro">{erro ?? ''}</span>
        <span className="flex-none text-[10px] text-muted-foreground">{carregando ? 'Lendo os fechamentos…' : 'clique no cabeçalho para ordenar · na fazenda para abrir'}</span>
        <Button variant="outline" size="sm" className="h-6 flex-none px-2 text-[10px]" onClick={exportar} disabled={linhas.length === 0} data-testid="fazendas-exportar">
          <Download className="mr-1 h-3 w-3" /> Exportar
        </Button>
      </div>

      <div ref={quadro.ref} className={QUADRO_REGUA} style={{ height: quadro.altura }} data-testid="quadro-fazendas">
        <div className="min-h-0 flex-1 overflow-auto" style={{ scrollbarGutter: 'stable' }} data-tabela-que-rola="">
          <table className="w-full table-fixed border-collapse" data-testid="tabela-fazendas">
            {colgroup}
            <thead>
              <tr>
                {COLUNAS.map(c => (
                  <ThOrdenavel key={c.coluna} coluna={c.coluna} rotulo={c.rotulo} ordem={ordem} onOrdenar={alternar} className={th}
                    alinhaDireita={c.direita} />
                ))}
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((l, i) => (
                <tr key={l.id} data-testid="fazenda-linha" onClick={() => onAbrir(l.id)} title={`Abrir ${l.nome}`}
                  className={cn('cursor-pointer border-b last:border-b-0 hover:bg-muted/50', i % 2 ? 'bg-muted/30' : '', !l.ativa && 'text-muted-foreground')}>
                  <td className={cn(TD_REGUA_TEXTO, 'font-medium')} title={l.codigo ?? undefined}>{l.codigo ?? '—'}</td>
                  <td className={cn(TD_REGUA_TEXTO, 'font-medium')} title={l.nome}>{l.nome}</td>
                  <td className={TD_REGUA_TEXTO} title={l.local ?? undefined}>{l.local ?? '—'}</td>
                  <td className={cn(TD_REGUA_TEXTO, l.ativa ? '' : 'text-amber-700')} title={l.situacao}>{l.situacao}</td>
                  <td className={TD_REGUA_TEXTO} title={l.atividades.join(' · ') || undefined}>{l.atividades.join(' · ') || '—'}</td>
                  <td className={TD_REGUA_NUM}>{area(l.matriculaHa)}</td>
                  <td className={TD_REGUA_NUM}>{area(l.pastosHa)}</td>
                  <td className={cn(TD_REGUA_NUM, l.diferencaHa != null && Math.abs(l.diferencaHa) >= 0.01 && 'text-amber-700')}>{dif(l.diferencaHa)}</td>
                  <td className={TD_REGUA_NUM}>{l.pastosHa == null ? '—' : l.nPastos}</td>
                  <td className={cn(TD_REGUA_NUM, l.noMapa < l.nPastos && 'text-amber-700')}>{l.pastosHa == null ? '—' : l.noMapa}</td>
                  <td className={TD_REGUA_NUM} title={l.mesDoFechamento ? `fechamento de ${mesCurtoDe(l.mesDoFechamento)}` : 'sem fechamento no último ano'}>
                    {inteiro(l.rebanho)}
                  </td>
                  {(() => {
                    const v = textosDaVariacao(variacaoNoAno(l.rebanho, l.rebanhoInicioDoAno));
                    return <td className={cn(TD_REGUA_NUM, corDoSinal(v?.sinal))} title={v?.inteiro} data-testid="fazenda-no-ano">{v?.curto ?? '—'}</td>;
                  })()}
                  <td className={TD_REGUA_NUM} title={l.mesDoFechamento ? `${mesCurtoDe(l.mesDoFechamento)} · área própria` : undefined}>
                    {l.lotacao == null ? '—' : formatNum(l.lotacao, 2)}
                  </td>
                  <td className={cn(TD_REGUA_TEXTO, l.ativa && l.pendencias.length > 0 ? 'text-amber-700' : 'text-muted-foreground')} title={textoDaPendencia(l)}>
                    {textoDaPendencia(l)}
                  </td>
                </tr>
              ))}
              {ordenadas.length === 0 && (
                <tr><td colSpan={COLUNAS.length} className={cn(TD_REGUA, 'h-8 text-center text-muted-foreground')}>Nenhuma fazenda cadastrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className={RODAPE_REGUA} style={{ scrollbarGutter: 'stable' }}>
          <table className="w-full table-fixed border-collapse">
            {colgroup}
            <tbody>
              <tr data-testid="fazendas-rodape">
                <td className={cn(TD_REGUA_TEXTO, 'font-semibold')} colSpan={5}>Total · {totais.fazendas} fazenda{totais.fazendas === 1 ? '' : 's'}</td>
                <td className={cn(TD_REGUA_NUM, 'font-semibold')}>{area(totais.matriculaHa)}</td>
                <td className={cn(TD_REGUA_NUM, 'font-semibold')}>{area(totais.pastosHa)}</td>
                <td className={cn(TD_REGUA_NUM, 'font-semibold')}>{dif(totais.diferencaHa)}</td>
                <td className={cn(TD_REGUA_NUM, 'font-semibold')}>{totais.nPastos}</td>
                <td className={cn(TD_REGUA_NUM, 'font-semibold')}>{totais.noMapa}</td>
                <td className={cn(TD_REGUA_NUM, 'font-semibold')}>{inteiro(totais.rebanho)}</td>
                {(() => {
                  const v = textosDaVariacao(variacaoNoAno(totais.rebanhoComInicio, totais.rebanhoInicioDoAno));
                  return <td className={cn(TD_REGUA_NUM, 'font-semibold')} title={v?.inteiro} data-testid="fazendas-rodape-no-ano">{v?.curto ?? '—'}</td>;
                })()}
                <td className={cn(TD_REGUA_NUM, 'font-semibold')} title="média ponderada pela área própria">{totais.lotacao == null ? '—' : formatNum(totais.lotacao, 2)}</td>
                <td className={TD_REGUA} />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {administrativa && (
        <p className="text-[10px] text-muted-foreground" data-testid="fazenda-administrativa">
          Unidade sem pasto:{' '}
          <button type="button" onClick={() => onAbrir(administrativa.id)} title={`Abrir ${administrativa.nome}`}
            className="underline underline-offset-2 hover:text-foreground">
            {administrativa.nome}{administrativa.codigo ? ` (${administrativa.codigo})` : ''}
          </button>
          {' '}· só nome e código
        </p>
      )}
    </div>
  );
}
