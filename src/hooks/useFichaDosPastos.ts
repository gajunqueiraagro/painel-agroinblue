/**
 * PASTO-FICHA-01 PR B — o que a LISTA dos pastos mostra além do cadastro, lido de uma vez para a fazenda inteira.
 *
 * As fontes são as do banco, uma por coluna (nada calculado aqui que já tenha dono):
 *   · Forrageira  → `pastos.forrageira_principal_id` + o nome em `catalogo_itens` (lista `forrageira`, 117230);
 *   · Avaliação e Degradação → a avaliação de campo mais recente NÃO cancelada (`pasto_condicoes`, a mesma "última" da ficha);
 *   · Suporte     → `fn_pastos_potencial_no_mes` (117240, a leitura ÚNICA do potencial: época, sistema, confinamento);
 *   · Lotação     → `fn_lotacao_do_mes` (a do Fechamento) no ÚLTIMO MÊS FECHADO da fazenda (todo card do mês fechado);
 *   · Reforma     → `fn_pasto_reformas` (Patrimônio), só nos pastos que têm bem ligado (`patrimonio_bem_pastos` vivo);
 *   · Idade       → anos desde a implantação da forrageira; sem ela, desde a última reforma.
 * O suporte é lido NO MESMO MÊS da lotação: a comparação "acima do suporte" é de um mês só.
 * ⚠ ERRO NÃO VIRA VAZIO: se uma leitura falha, `erro` diz qual; a lista mostra "—" e a faixa avisa (P146), nunca zeros.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  anosDesde, ehDegradacao, FICHA_VAZIA, type FichaNaLista,
} from '@/lib/pastos/listaDosPastos';

export interface PastoDaFicha {
  id: string;
  forrageira_principal_id?: string | null;
  forrageira_implantada_em?: string | null;
}

export interface FichaDosPastos {
  ficha: ReadonlyMap<string, FichaNaLista>;
  /** o último mês com todo card fechado ('AAAA-MM'), o da coluna de lotação; nulo = nenhum */
  mesFechado: string | null;
  carregando: boolean;
  erro: string | null;
}

const ehObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v
  : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const par = <A, B>(a: A, b: B): [A, B] => [a, b];
const linhas = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(ehObj) : []);

/** O último mês em que TODOS os cards da fazenda estão fechados (nenhum aberto/rascunho), até o mês de hoje. */
export function ultimoMesFechado(cards: ReadonlyArray<{ ano_mes: string; status: string }>, mesDeHoje: string): string | null {
  const abertos = new Set<string>(); const meses = new Set<string>();
  for (const c of cards) {
    if (c.ano_mes > mesDeHoje) continue;
    meses.add(c.ano_mes);
    if (c.status !== 'fechado') abertos.add(c.ano_mes);
  }
  const fechados = [...meses].filter(m => !abertos.has(m)).sort();
  return fechados.length ? fechados[fechados.length - 1] : null;
}

const doisDigitos = (n: number) => String(n).padStart(2, '0');
export function mesesAntes(anoMes: string, n: number): string {
  const [a, m] = anoMes.split('-').map(Number);
  const t = a * 12 + (m - 1) - n;
  return `${Math.floor(t / 12)}-${doisDigitos((t % 12) + 1)}`;
}

export function useFichaDosPastos({ fazendaId, clienteId, pastos, hoje, mes, versao = 0 }: {
  fazendaId: string | null;
  clienteId: string | null;
  pastos: readonly PastoDaFicha[];
  /** 'AAAA-MM-DD' (`hojeLocal()`) */
  hoje: string;
  /** PASTOS-CAD-02 — o mês ESCOLHIDO na lista ('AAAA-MM'): a lotação, o suporte e o mapa são dele. Sem ele, o último mês fechado. */
  mes?: string | null;
  /** muda quando alguém grava (relê) */
  versao?: number;
}): FichaDosPastos {
  const [estado, setEstado] = useState<FichaDosPastos>({ ficha: new Map(), mesFechado: null, carregando: false, erro: null });
  /* a chave das leituras: os ids e as forrageiras (mudar outro campo do pasto não relê) */
  const chave = useMemo(() => pastos.map(p => `${p.id}:${p.forrageira_principal_id ?? ''}:${p.forrageira_implantada_em ?? ''}`).join('|'), [pastos]);

  useEffect(() => {
    if (!fazendaId || !clienteId || pastos.length === 0) { setEstado({ ficha: new Map(), mesFechado: null, carregando: false, erro: null }); return; }
    let vivo = true;
    const semTipo = supabase as any;
    const mesDeHoje = hoje.slice(0, 7);
    setEstado(e => ({ ...e, carregando: true }));
    void (async () => {
      const falhas: string[] = [];
      /* 1 · o último mês fechado (os cards dos últimos 13 meses) */
      const cardsRes = await supabase.from('fechamento_pastos').select('ano_mes, status')
        .eq('fazenda_id', fazendaId).gte('ano_mes', mesesAntes(mesDeHoje, 13)).lte('ano_mes', mesDeHoje);
      if (cardsRes.error) falhas.push('o mês fechado');
      const mesFechado = mes ?? ultimoMesFechado(linhas(cardsRes.data).flatMap(c => {
        const am = txt(c.ano_mes); const st = txt(c.status);
        return am && st ? [{ ano_mes: am, status: st }] : [];
      }), mesDeHoje);

      const ids = new Set(pastos.map(p => p.id));
      const forrageiras = [...new Set(pastos.map(p => p.forrageira_principal_id).filter((x): x is string => !!x))];
      const [catRes, avRes, potRes, lotRes, bensRes, mapaRes] = await Promise.all([
        forrageiras.length ? semTipo.from('catalogo_itens').select('id, nome').in('id', forrageiras) : Promise.resolve({ data: [], error: null }),
        semTipo.from('pasto_condicoes').select('pasto_id, data_avaliacao, degradacao')
          .eq('fazenda_id', fazendaId).eq('cancelado', false).order('data_avaliacao', { ascending: false }),
        semTipo.rpc('fn_pastos_potencial_no_mes', { p_cliente: clienteId, p_ano_mes: mesFechado ?? mesDeHoje, p_fazenda: fazendaId }),
        mesFechado ? semTipo.rpc('fn_lotacao_do_mes', { p_fazenda_id: fazendaId, p_ano_mes: mesFechado }) : Promise.resolve({ data: [], error: null }),
        semTipo.from('patrimonio_bem_pastos').select('pasto_id').eq('cliente_id', clienteId).is('desligado_em', null),
        /* o desenho no mapa (nº de polígonos), pela MESMA leitura da aba Áreas */
        semTipo.rpc('fn_pastos_area_comparar', { p_fazenda: fazendaId, p_ano_mes: mesFechado ?? mesDeHoje }),
      ]);
      if (catRes.error) falhas.push('as forrageiras');
      if (avRes.error) falhas.push('as avaliações');
      if (potRes.error) falhas.push('o suporte');
      if (lotRes.error) falhas.push('a lotação');
      if (bensRes.error) falhas.push('as reformas');
      if (mapaRes.error) falhas.push('o mapa');
      const poligonos = new Map(linhas(mapaRes.data).flatMap(r => { const p = txt(r.pasto_id); return p ? [par(p, num(r.n_poligonos))] : []; }));

      const nomeDoItem = new Map(linhas(catRes.data).flatMap(c => { const id = txt(c.id); const n = txt(c.nome); return id && n ? [par(id, n)] : []; }));
      const ultimaAv = new Map<string, { data: string; degradacao: string | null }>();
      for (const a of linhas(avRes.data)) {
        const p = txt(a.pasto_id); const d = txt(a.data_avaliacao);
        if (p && d && !ultimaAv.has(p)) ultimaAv.set(p, { data: d, degradacao: txt(a.degradacao) });
      }
      const suporte = new Map(linhas(potRes.data).flatMap(r => { const p = txt(r.pasto_id); return p ? [par(p, num(r.potencial_ua_ha))] : []; }));
      const lotacao = new Map(linhas(lotRes.data).flatMap(r => { const p = txt(r.pasto_id); return p ? [par(p, num(r.ua_ha))] : []; }));

      /* a reforma: só nos pastos COM bem ligado (hoje são poucos), pela leitura oficial da ficha */
      const comBem = [...new Set(linhas(bensRes.data).map(b => txt(b.pasto_id)).filter((x): x is string => !!x && ids.has(x)))];
      const reformas = new Map<string, string | null>();
      const res = await Promise.all(comBem.map(id => semTipo.rpc('fn_pasto_reformas', { p_pasto: id }).then((r: { data: unknown; error: unknown }) => ({ id, r }))));
      for (const { id, r } of res) {
        if (r.error) { falhas.push('as reformas'); continue; }
        reformas.set(id, txt(linhas(r.data)[0]?.data));
      }

      const ficha = new Map<string, FichaNaLista>();
      for (const p of pastos) {
        const av = ultimaAv.get(p.id);
        const reforma = reformas.get(p.id) ?? null;
        ficha.set(p.id, {
          ...FICHA_VAZIA,
          forrageira: p.forrageira_principal_id ? (nomeDoItem.get(p.forrageira_principal_id) ?? null) : null,
          reformaAno: reforma ? Number(reforma.slice(0, 4)) : null,
          idadeAnos: anosDesde(p.forrageira_implantada_em ?? reforma, hoje),
          degradacao: av && ehDegradacao(av.degradacao) ? av.degradacao : null,
          suporte: suporte.get(p.id) ?? null,
          lotacao: lotacao.get(p.id) ?? null,
          avaliadoEm: av?.data ?? null,
          poligonos: mapaRes.error ? null : (poligonos.get(p.id) ?? 0),
        });
      }
      if (!vivo) return;
      if (falhas.length) console.error('useFichaDosPastos: não li', falhas);
      setEstado({
        ficha, mesFechado, carregando: false,
        erro: falhas.length ? `Não consegui ler ${[...new Set(falhas)].join(', ')}. Mostro "—" nessas colunas.` : null,
      });
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fazendaId, clienteId, chave, hoje, mes, versao]);

  return estado;
}
