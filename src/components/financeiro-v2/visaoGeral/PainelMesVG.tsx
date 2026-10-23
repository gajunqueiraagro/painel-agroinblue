/**
 * P90 (Gabriel 23/10/2026 11h05) — o PAINEL DO MÊS ao lado do gráfico ampliado: o mês escolhido em texto — entradas, saídas e resultado
 * do mês; o ACUMULADO do período até ele; a MÉDIA mensal do mesmo intervalo; o saldo inicial e o final. Clicar numa coluna troca o mês.
 * Tudo do banco (`fn_vg_tela`: `valores`, `valores_acum`, `valores_media` e as linhas de saldo) — o painel só escreve.
 */
import { AVISO_SEM_SALDO } from './CardVG';
import { COR, brl, corSinal, rotuloMes, type LinhaVG, type TelaVG } from '@/lib/financeiro/visaoGeral';

const MESES_EXT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function PainelMesVG({ tela, sel }: { tela: TelaVG; sel: string }) {
  const k = tela.meses.findIndex((m) => m.am === sel);
  const mes = tela.meses[k];
  const ent = tela.linhas.find((l) => l.tipo === 'total' && l.lado === 'entrada');
  const sai = tela.linhas.find((l) => l.tipo === 'total' && l.lado === 'saida');
  const res = tela.linhas.find((l) => l.chave === 'resultado');
  const si = tela.linhas.find((l) => l.chave === 'saldo_inicial');
  const sf = tela.linhas.find((l) => l.chave === 'saldo_final');
  const de = tela.meses[0]?.am ?? sel;
  const em = (l: LinhaVG | undefined, s: 'valores' | 'valores_acum' | 'valores_media') => (l && k >= 0 ? (l[s]?.[k] ?? null) : null);
  if (k < 0) return null;
  const Linha = ({ rotulo, v, cor, testid }: { rotulo: string; v: number | null; cor: string; testid: string }) => (
    <div className="flex h-[15px] items-center justify-between gap-3 text-[10px]">
      <span className="text-[#3a4655]">{rotulo}</span>
      <b className="whitespace-nowrap tabular-nums" style={{ color: cor }} data-testid={testid}>{brl(v)}</b>
    </div>
  );
  const Bloco = ({ titulo, s, id }: { titulo: string; s: 'valores' | 'valores_acum' | 'valores_media'; id: string }) => (
    <section className="flex flex-col border-t border-[#e3e7ec] pt-1.5" data-testid={`painel-bloco-${id}`}>
      <h4 className="text-[8.5px] font-semibold uppercase leading-[13px] tracking-[0.05em] text-muted-foreground">{titulo}</h4>
      <Linha rotulo="Entradas" v={em(ent, s)} cor={COR.entrada} testid={`painel-${id}-entradas`} />
      <Linha rotulo="Saídas" v={em(sai, s)} cor={COR.saida} testid={`painel-${id}-saidas`} />
      <Linha rotulo="Resultado" v={em(res, s)} cor={corSinal(em(res, s))} testid={`painel-${id}-resultado`} />
    </section>
  );
  return (
    <aside className="flex w-[250px] shrink-0 flex-col gap-1.5 rounded-md border border-[#dfe4ea] bg-white px-3.5 py-2.5" data-testid="painel-mes">
      <header>
        <div className="text-[14px] font-bold leading-[18px] text-[#1b2430]" data-testid="painel-mes-titulo">{MESES_EXT[Number(sel.slice(5, 7)) - 1]} {sel.slice(0, 4)}</div>
        <div className="text-[9.5px] text-muted-foreground">{mes?.previsto ? 'mês previsto' : mes?.vigente ? 'mês corrente (realizado + previsto)' : 'mês realizado'} · clique numa coluna para trocar</div>
      </header>
      <Bloco titulo="No mês" s="valores" id="mes" />
      <Bloco titulo={`Acumulado ${rotuloMes(de)}–${rotuloMes(sel)}`} s="valores_acum" id="acum" />
      <Bloco titulo={`Média mensal ${rotuloMes(de)}–${rotuloMes(sel)}`} s="valores_media" id="media" />
      <section className="flex flex-col border-t border-[#e3e7ec] pt-1.5" data-testid="painel-saldo">
        <h4 className="text-[8.5px] font-semibold uppercase leading-[13px] tracking-[0.05em] text-muted-foreground">Saldo · fluxo de caixa</h4>
        {tela.sem_saldo ? <p className="text-[10px] text-amber-800">{AVISO_SEM_SALDO}</p> : (
          <>
            <Linha rotulo={`Inicial (1º/${rotuloMes(sel)})`} v={em(si, 'valores')} cor={corSinal(em(si, 'valores'))} testid="painel-saldo-inicial" />
            <Linha rotulo={`Final${mes?.previsto || mes?.vigente ? ' previsto' : ''}`} v={em(sf, 'valores')} cor={corSinal(em(sf, 'valores'))} testid="painel-saldo-final" />
          </>
        )}
      </section>
    </aside>
  );
}
