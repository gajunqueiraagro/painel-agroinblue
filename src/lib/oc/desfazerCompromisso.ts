/**
 * DESFAZER UM COMPROMISSO DA OC, UM MOTIVO SO' — OC-MOTIVO-UNICO-01.
 *
 * ⚠ NASCE DE TRES "erro" DIGITADOS EM 13 SEGUNDOS (8b211cae, 25/09/2026, compromisso 0fdec0eb):
 * estornar o titulo, cancelar a programacao e cancelar o compromisso eram tres dialogos, cada um de
 * duas etapas, cada um pedindo o motivo de novo — e cada evento saiu com um `estorno_id` diferente,
 * entao a trilha nem dizia que os tres eram um gesto so'.
 * ⚠ AS TRES RPCs NAO MUDAM, NEM AS GUARDAS DO BANCO. O que muda e' quem as chama: um gesto, na ordem
 * FOLHA -> RAIZ que o proprio banco impoe (a programacao recusa cancelar com titulo vivo; o
 * compromisso recusa com programacao ativa), com o MESMO motivo e o MESMO `p_estorno_id` — que as
 * tres ja' aceitavam e ninguem mandava.
 * ⚠ NAO E' TRANSACAO: cada RPC e' a sua. Por isso, antes de cada nivel, o estado e' RELIDO e o que ja'
 * esta' desfeito e' pulado — o mesmo botao retoma uma cadeia interrompida. E uma recusa do banco
 * (E3: titulo realizado, conciliado, liquidacao ativa) PARA a cadeia e diz o que ja' foi e o que falta.
 * Contornar a recusa nao e' opcao.
 */
import { supabase } from '@/integrations/supabase/client';

/** As tres mensagens de "ja' esta' desfeito" do banco (P0001, verbatim) — o mesmo teste do hook. */
export const REGEX_JA_DESFEITO = /j[áa] (est[áa] estornad|cancelad)/i;

export interface TituloADesfazer {
  programacaoId: string;
  parcelaId: string;
  sequencia: number;
  valor: number;
  vencimento: string | null;
}

/** O que existe hoje, relido do banco antes de cada nivel. */
export interface EstadoDoDesfazer {
  versao: number;
  titulos: TituloADesfazer[];
  programacaoAtivaId: string | null;
  compromissoCancelado: boolean;
}

export interface DepsDesfazer {
  lerEstado: () => Promise<EstadoDoDesfazer>;
  estornar: (v: number, programacaoId: string, parcelaId: string, motivo: string, estornoId: string) => Promise<number>;
  cancelarProgramacao: (v: number, programacaoId: string, motivo: string, estornoId: string) => Promise<number>;
  cancelarCompromisso: (v: number, compromissoId: string, motivo: string, estornoId: string) => Promise<number>;
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : 'sem vencimento');
export const rotuloTitulo = (t: Pick<TituloADesfazer, 'valor' | 'vencimento'>) =>
  `título de ${brl(t.valor)} (venc. ${dataBr(t.vencimento)})`;

/** O rol do que falta, a partir de um estado — o que a etapa 1 lista e o que a recusa diz que falta. */
export function rolDoEstado(e: Omit<EstadoDoDesfazer, 'versao'>): string[] {
  const rol = e.titulos.map(t => `estornar o ${rotuloTitulo(t)}`);
  if (e.programacaoAtivaId) rol.push('cancelar a programação');
  if (!e.compromissoCancelado) rol.push('cancelar o compromisso');
  return rol;
}

export class ErroDesfazer extends Error {
  constructor(message: string, public feito: string[], public falta: string[]) { super(message); this.name = 'ErroDesfazer'; }
}

/**
 * PERCORRE A CADEIA. Devolve o que foi feito; recusa do banco vira `ErroDesfazer` com feito e falta.
 *
 * ⚠ MOTIVO VAZIO NAO EXECUTA NADA — nem a leitura. Quem inicia o gesto continua obrigado a dizer por
 * que (auditoria); so' a repeticao some.
 * ⚠ VERSAO PELO RETORNO de cada escrita. So' quando o banco responde "ja' desfeito" (idempotencia, nao
 * erro) a versao e' relida, porque essa resposta nao a traz.
 */
export async function executarDesfazerCompromisso({ compromissoId, motivo, estornoId, deps }: {
  compromissoId: string; motivo: string; estornoId: string; deps: DepsDesfazer;
}): Promise<{ feito: string[] }> {
  const m = motivo.trim();
  if (m === '') throw new ErroDesfazer('Informe o motivo.', [], []);
  const feito: string[] = [];
  let est = await deps.lerEstado();
  let v = est.versao;

  const passo = async (rotulo: string, escrever: () => Promise<number>) => {
    try {
      v = await escrever();
      feito.push(rotulo);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (REGEX_JA_DESFEITO.test(msg)) { est = await deps.lerEstado(); v = est.versao; return; }
      const agora = await deps.lerEstado().catch(() => est);
      throw new ErroDesfazer(msg, feito, rolDoEstado(agora));
    }
  };

  /* 1. Cada titulo vivo, um por um. */
  for (const t of est.titulos) {
    await passo(`estornado o ${rotuloTitulo(t)}`,
      () => deps.estornar(v, t.programacaoId, t.parcelaId, m, estornoId));
  }
  /* 2. A programacao — relida: o estorno a deixa ativa, e ela pode ja' ter sido cancelada antes. */
  est = await deps.lerEstado();
  if (est.programacaoAtivaId) {
    const progId = est.programacaoAtivaId;
    await passo('cancelada a programação', () => deps.cancelarProgramacao(v, progId, m, estornoId));
  }
  /* 3. O compromisso. */
  est = await deps.lerEstado();
  if (!est.compromissoCancelado) {
    await passo('cancelado o compromisso', () => deps.cancelarCompromisso(v, compromissoId, m, estornoId));
  }
  return { feito };
}

/**
 * LE DO BANCO o que existe para desfazer — a versao da operacao, os titulos vivos (parcelas
 * materializadas ou pagas das programacoes ativas), a programacao ativa e o estado do compromisso.
 * ⚠ DIRETO DAS TABELAS, nao das views da tela: e' a mesma pergunta que as guardas das RPCs fazem, e
 * o retrato da tela pode estar um passo atras dentro da propria cadeia.
 */
export async function lerEstadoDoDesfazer(operacaoId: string, compromissoId: string): Promise<EstadoDoDesfazer> {
  const [op, comp, progs] = await Promise.all([
    supabase.from('zoo_operacoes_comerciais').select('versao').eq('id', operacaoId).single(),
    supabase.from('zoo_operacao_compromissos').select('status').eq('id', compromissoId).single(),
    supabase.from('zoo_operacao_programacoes').select('id').eq('compromisso_id', compromissoId).eq('status', 'ativa'),
  ]);
  if (op.error) throw op.error;
  if (comp.error) throw comp.error;
  if (progs.error) throw progs.error;
  const progIds = (progs.data ?? []).map(p => p.id);
  let titulos: TituloADesfazer[] = [];
  if (progIds.length > 0) {
    const parc = await supabase.from('zoo_operacao_parcelas_programacao')
      .select('id, programacao_id, sequencia, valor, vencimento, status')
      .in('programacao_id', progIds).in('status', ['materializada', 'paga']).order('sequencia');
    if (parc.error) throw parc.error;
    titulos = (parc.data ?? []).map(p => ({
      programacaoId: p.programacao_id, parcelaId: p.id, sequencia: p.sequencia,
      valor: Number(p.valor), vencimento: p.vencimento,
    }));
  }
  return {
    versao: op.data.versao,
    titulos,
    programacaoAtivaId: progIds[0] ?? null,
    compromissoCancelado: comp.data.status === 'cancelado',
  };
}
