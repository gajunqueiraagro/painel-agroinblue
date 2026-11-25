/**
 * CARTAO-FATURA-GRAVAR — o "Gravar N prontas" e o "Desfazer gravação" da prévia da fatura (lote 118540). NADA GRAVA SEM O OK:
 *   Gravar N prontas → a PRÉVIA do banco (`p_simular`); a linha que o banco recusa ganha a frase NA TABELA e sai do pedido (D2: as outras
 *   seguem); a prévia limpa mostra "lança · move · ajusta · soma" → "Confirmar gravação" grava (tudo ou nada) → relê a fatura.
 *   Desfazer gravação → motivo (obrigatório) → a prévia ("N voltam · M ficam") → "Desfazer" → relê.
 */
import { useCallback, useState } from 'react';
import type { FaturaApi } from '@/lib/financeiro/cartao/faturaApi';
import {
  pedidoDoGravar, respostaDoDesfazer, respostaDoGravar, type Escolha, type ItemDoGravar, type PedidoDoGravar, type RecusaDaLinha,
  type RespostaDoDesfazer, type RespostaDoGravar,
} from '@/lib/financeiro/cartao/gravarDaFatura';
import type { FaturaLida } from '@/lib/financeiro/cartao/lerFaturaOurocard';
import type { GruposDaFatura } from '@/lib/financeiro/cartao/gruposDaFatura';

export type FaseDoGravar =
  | { k: 'parado' }
  | { k: 'conferindo' }
  | { k: 'confirmar'; resposta: RespostaDoGravar; itens: ItemDoGravar[] }
  | { k: 'gravando' }
  | { k: 'gravada'; resposta: RespostaDoGravar }
  | { k: 'motivo' }
  | { k: 'desfazer_conferindo' }
  | { k: 'desfazer_confirmar'; resposta: RespostaDoDesfazer; motivo: string }
  | { k: 'desfazendo' }
  | { k: 'desfeita'; resposta: RespostaDoDesfazer }
  | { k: 'erro'; frase: string };

export const FRASE_NAO_ENTENDI = 'O banco respondeu algo que não entendi. Nada foi gravado.';
/** quantas vezes a prévia tira as recusadas e confere de novo (a recusa de gatilho só aparece gravando) */
const VOLTAS = 3;

export function useGravarDaFatura(o: {
  clienteId: string; contaId: string; api: FaturaApi; aoMudou: () => void;
  pronta: { fatura: FaturaLida; grupos: GruposDaFatura; hash: string; arquivo: string; gravacao: { id: string } | null } | null;
  escolhas: ReadonlyMap<number, Escolha>;
  /** a fazenda que a conta FORÇA (a administrativa vai à fazenda Administrativo, a regra do `FazendaSelect`) */
  fazendaDaConta?: (planoContaId: string) => string | null;
}) {
  const { clienteId, contaId, api, aoMudou, pronta, escolhas, fazendaDaConta } = o;
  const [fase, setFase] = useState<FaseDoGravar>({ k: 'parado' });
  const [recusas, setRecusas] = useState<ReadonlyMap<number, RecusaDaLinha>>(new Map());
  const pedido = useCallback((fora: ReadonlySet<number>): PedidoDoGravar | null => (pronta
    ? pedidoDoGravar(pronta.fatura, pronta.grupos, { contaDaFatura: contaId, escolhas, hash: pronta.hash, arquivo: pronta.arquivo, fora, fazendaDaConta })
    : null), [pronta, contaId, escolhas, fazendaDaConta]);

  const conferir = useCallback(async () => {
    const fora = new Map(recusas);
    setFase({ k: 'conferindo' });
    for (let volta = 0; volta < VOLTAS; volta++) {
      const p = pedido(new Set(fora.keys()));
      if (!p || p.itens.length === 0) { setRecusas(fora); setFase({ k: 'erro', frase: 'Nenhuma linha pronta para gravar.' }); return; }
      const r = await api.gravar(clienteId, contaId, p.fatura, p.itens, true);
      if (r.ok === false) { setFase({ k: 'erro', frase: r.frase }); return; }
      const resp = respostaDoGravar(r.dados);
      if (!resp) { setFase({ k: 'erro', frase: FRASE_NAO_ENTENDI }); return; }
      if (resp.recusa) { setFase({ k: 'erro', frase: resp.recusa.frase }); return; }
      if (resp.ok) { setRecusas(fora); setFase({ k: 'confirmar', resposta: resp, itens: p.itens }); return; }
      if (resp.recusas.size === 0) { setFase({ k: 'erro', frase: FRASE_NAO_ENTENDI }); return; }
      for (const [ordem, rec] of resp.recusas) fora.set(ordem, rec);
    }
    setRecusas(fora);
    setFase({ k: 'erro', frase: 'O banco segue recusando linhas: veja a coluna "O que o sistema vai fazer".' });
  }, [recusas, pedido, api, clienteId, contaId]);

  const confirmar = useCallback(async () => {
    if (fase.k !== 'confirmar' || !pronta) return;
    const p = pedido(new Set(recusas.keys()));
    if (!p) return;
    setFase({ k: 'gravando' });
    const r = await api.gravar(clienteId, contaId, p.fatura, fase.itens, false);
    if (r.ok === false) { setFase({ k: 'erro', frase: r.frase }); return; }
    const resp = respostaDoGravar(r.dados);
    if (!resp || !resp.ok) { setFase({ k: 'erro', frase: FRASE_NAO_ENTENDI }); return; }
    setRecusas(new Map());
    setFase({ k: 'gravada', resposta: resp });
    aoMudou();
  }, [fase, pronta, pedido, recusas, api, clienteId, contaId, aoMudou]);

  const preverDesfazer = useCallback(async (motivo: string) => {
    if (!pronta?.gravacao) return;
    setFase({ k: 'desfazer_conferindo' });
    const r = await api.desfazer(pronta.gravacao.id, motivo, true);
    if (r.ok === false) { setFase({ k: 'erro', frase: r.frase }); return; }
    const resp = respostaDoDesfazer(r.dados);
    if (!resp) { setFase({ k: 'erro', frase: FRASE_NAO_ENTENDI }); return; }
    if (!resp.ok) { setFase({ k: 'erro', frase: resp.recusa?.frase ?? FRASE_NAO_ENTENDI }); return; }
    setFase({ k: 'desfazer_confirmar', resposta: resp, motivo });
  }, [pronta, api]);

  const desfazer = useCallback(async () => {
    if (fase.k !== 'desfazer_confirmar' || !pronta?.gravacao) return;
    const { motivo } = fase;
    setFase({ k: 'desfazendo' });
    const r = await api.desfazer(pronta.gravacao.id, motivo, false);
    if (r.ok === false) { setFase({ k: 'erro', frase: r.frase }); return; }
    const resp = respostaDoDesfazer(r.dados);
    if (!resp || !resp.ok) { setFase({ k: 'erro', frase: resp?.recusa?.frase ?? FRASE_NAO_ENTENDI }); return; }
    setFase({ k: 'desfeita', resposta: resp });
    aoMudou();
  }, [fase, pronta, api, aoMudou]);

  return {
    fase, recusas, pedido,
    conferir, confirmar, preverDesfazer, desfazer,
    abrirDesfazer: () => setFase({ k: 'motivo' }),
    voltar: () => setFase({ k: 'parado' }),
  };
}
