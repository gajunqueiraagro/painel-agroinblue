/**
 * NOTAS-RECEITA-A1-01 · F2 — a aba "Certificado" da ficha do produtor (desenho de segurança aprovado pelo Gabriel 13/11; Chat 10:45).
 *  · mostra SÓ metadados (situação, validade com aviso de 30 dias, emissor, impressão digital curta) e a trilha — lidos pela RLS do cliente;
 *  · "Subir certificado" (só admin AgroinBlue e gestor do cliente — D2): o arquivo e a senha vão DIRETO à borda `fiscal-certificado-subir`;
 *    o navegador não lê o certificado; a recusa da borda fica ESCRITA junto do botão (nunca em toast);
 *  · a frase fixa explica que A3 (cartão/token) não serve aqui (Chat 10:45);
 *  · "Revogar" pela `fn_fiscal_certificado_revogar`: simula (a frase do banco) → motivo → revoga.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AreaDeArquivo } from '@/components/ui/area-de-arquivo';
import { BlocoFormulario, Rotulo, REGUA_CAMPO, GRADE_FORMULARIO } from '@/components/ui/bloco-formulario';
import { usePermissions } from '@/hooks/usePermissions';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { dataBR } from '@/lib/datas/dataBR';
import { cn } from '@/lib/utils';
import type { RegraDeAceite } from '@/lib/arquivo/aceitarArquivo';
import {
  certificadoDaFicha, estadoDaValidade, FRASE_A3_NAO_SERVE, fraseDoPasso, impressaoCurta, lerCertificados, lerRespostaDoSubir, lerTrilha,
  ROTULO_DA_SITUACAO,
} from '@/lib/fiscal/certificadoTela';

const REGRA_DO_CERTIFICADO: RegraDeAceite = { tipos: ['pfx'], tamanhoMaxBytes: 64 * 1024 };
const CAIXA = cn(REGUA_CAMPO, 'flex items-center rounded-md border bg-muted/60 px-2');

export function CertificadoDoProdutor({ titularId }: { titularId: string }) {
  const qc = useQueryClient();
  const { isManager } = usePermissions();
  const chave = ['fiscal-certificado', titularId];
  const leitura = useQuery({
    queryKey: chave,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabelas novas fora dos tipos gerados
      const db = supabase as any;
      const [c, t] = await Promise.all([
        db.from('fiscal_certificados').select('id, situacao, documento, emissor, numero_serie, impressao_digital, valido_de, valido_ate, enviado_em')
          .eq('titular_id', titularId).order('enviado_em', { ascending: false }),
        db.from('fiscal_certificados_trilha').select('id, acao, em, motivo').eq('titular_id', titularId).order('em', { ascending: false }).limit(8),
      ]);
      if (c.error || t.error) throw new Error('Não consegui ler o certificado.');
      return { certificados: lerCertificados(c.data), trilha: lerTrilha(t.data) };
    },
  });
  const cert = certificadoDaFicha(leitura.data?.certificados ?? []);
  const validade = cert && cert.situacao === 'ativo' ? estadoDaValidade(cert.validoAte, hojeLocal()) : null;

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [recado, setRecado] = useState<{ tom: 'erro' | 'ok'; frase: string } | null>(null);
  const [revogando, setRevogando] = useState<{ frase: string; motivo: string } | null>(null);

  async function subir() {
    if (!arquivo || !senha) { setRecado({ tom: 'erro', frase: !arquivo ? 'Escolha o arquivo .pfx ou .p12.' : 'Digite a senha do certificado.' }); return; }
    setEnviando(true); setRecado(null);
    const corpo = new FormData();
    corpo.append('titular_id', titularId); corpo.append('senha', senha); corpo.append('arquivo', arquivo);
    const r = await lerRespostaDoSubir(await supabase.functions.invoke('fiscal-certificado-subir', { body: corpo }));
    setEnviando(false);
    if (r.ok === false) { setRecado({ tom: 'erro', frase: r.frase }); return; }
    setArquivo(null); setSenha('');
    setRecado({ tom: 'ok', frase: [r.acao === 'trocou' ? 'Certificado trocado (o anterior ficou substituído).' : 'Certificado guardado.', ...r.avisos].join(' ') });
    await qc.invalidateQueries({ queryKey: chave });
  }

  async function revogar(simular: boolean) {
    if (!cert) return;
    setRecado(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova fora dos tipos gerados
    const { data, error } = await (supabase as any).rpc('fn_fiscal_certificado_revogar', { p_certificado_id: cert.id, p_motivo: revogando?.motivo ?? 'prévia', p_simular: simular });
    if (error) { setRecado({ tom: 'erro', frase: typeof error.message === 'string' && error.message ? error.message : 'Não consegui revogar.' }); return; }
    if (simular) { setRevogando({ frase: typeof data?.frase === 'string' ? data.frase : '', motivo: '' }); return; }
    setRevogando(null); setRecado({ tom: 'ok', frase: 'Certificado revogado.' });
    await qc.invalidateQueries({ queryKey: chave });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5" data-testid="produtor-aba-certificado">
      <BlocoFormulario titulo="Certificado digital A1">
        <div className={cn(GRADE_FORMULARIO, 'grid-cols-4')}>
          <div><Rotulo texto="Situação" />
            <div className={cn(CAIXA, cert?.situacao === 'ativo' ? '' : 'text-muted-foreground')} data-testid="certificado-situacao">
              {leitura.isLoading ? '…' : cert ? ROTULO_DA_SITUACAO[cert.situacao] : 'não cadastrado'}</div></div>
          <div><Rotulo texto="Validade" />
            <div className={cn(CAIXA, 'tabular-nums', validade?.tom === 'vencido' ? 'text-destructive' : validade?.tom === 'aviso' ? 'text-amber-700' : '')}
              data-testid="certificado-validade">{validade ? validade.frase : cert ? `até ${dataBR(cert.validoAte.slice(0, 10))}` : '—'}</div></div>
          <div><Rotulo texto="Emissor" /><div className={cn(CAIXA, 'uma-linha-que-rola')} title={cert?.emissor ?? undefined}>{cert?.emissor ?? '—'}</div></div>
          <div><Rotulo texto="Impressão digital" />
            <div className={cn(CAIXA, 'font-mono text-[10px]')} title={cert?.impressaoDigital || undefined} data-testid="certificado-impressao">
              {cert ? impressaoCurta(cert.impressaoDigital) : '—'}</div></div>
        </div>
      </BlocoFormulario>

      {isManager && (
        <BlocoFormulario titulo={cert?.situacao === 'ativo' ? 'Trocar o certificado' : 'Subir o certificado'}>
          <p className="text-[10px] text-muted-foreground" data-testid="certificado-a3-explicacao">{FRASE_A3_NAO_SERVE}</p>
          <div className={cn(GRADE_FORMULARIO, 'grid-cols-[1fr_200px_auto] items-end')}>
            <AreaDeArquivo regra={REGRA_DO_CERTIFICADO} onArquivos={(a) => { setArquivo(a[0] ?? null); setRecado(null); }}
              convite="Arraste o arquivo .pfx ou .p12, ou clique" fixo={arquivo?.name} onRemover={() => setArquivo(null)} testId="certificado-arquivo" />
            <div><Rotulo texto="Senha do certificado" />
              <Input type="password" autoComplete="off" value={senha} onChange={(e) => { setSenha(e.target.value); setRecado(null); }} className={REGUA_CAMPO}
                data-testid="certificado-senha" /></div>
            <Button size="sm" className="h-[28px]" disabled={enviando} onClick={() => void subir()} data-testid="certificado-subir">
              {enviando ? 'Enviando…' : 'Subir certificado'}</Button>
          </div>
          {cert?.situacao === 'ativo' && !revogando && (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" className="h-[24px] text-[10px]" onClick={() => void revogar(true)} data-testid="certificado-revogar">Revogar</Button>
            </div>
          )}
          {revogando && (
            <div className="flex items-end gap-2" data-testid="certificado-revogar-previa">
              <p className="min-w-0 flex-1 text-[10px]">{revogando.frase}</p>
              <div className="w-[220px]"><Rotulo texto="Motivo" />
                <Input value={revogando.motivo} onChange={(e) => setRevogando({ ...revogando, motivo: e.target.value })} className={REGUA_CAMPO} data-testid="certificado-revogar-motivo" /></div>
              <Button variant="outline" size="sm" className="h-[28px]" onClick={() => setRevogando(null)}>Cancelar</Button>
              <Button variant="destructive" size="sm" className="h-[28px]" disabled={!revogando.motivo.trim()} onClick={() => void revogar(false)}
                data-testid="certificado-revogar-confirmar">Revogar</Button>
            </div>
          )}
          <p className={cn('min-h-[26px] text-[10px]', recado?.tom === 'erro' ? 'text-destructive' : 'text-emerald-700')} data-testid="certificado-recado">{recado?.frase ?? ''}</p>
        </BlocoFormulario>
      )}

      <BlocoFormulario titulo="Histórico">
        {(leitura.data?.trilha ?? []).length === 0
          ? <p className="text-[10px] text-muted-foreground">Nenhum envio ainda.</p>
          : <ul className="text-[10px]" data-testid="certificado-trilha">
            {(leitura.data?.trilha ?? []).map((p) => (
              <li key={p.id} className="flex gap-2"><span className="w-[72px] shrink-0 tabular-nums text-muted-foreground">{dataBR(p.em.slice(0, 10))}</span><span>{fraseDoPasso(p)}</span></li>
            ))}
          </ul>}
      </BlocoFormulario>
    </div>
  );
}
