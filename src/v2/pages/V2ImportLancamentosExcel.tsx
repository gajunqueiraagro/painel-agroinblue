// ============================================================================
// V2ImportLancamentosExcel — PR-IMPORT-EXCEL-LANC-01. Porta de entrada de
// lançamentos por planilha, ao lado do OFX e do CSV.
//
// Quatro passos: ler o arquivo · mapear o de-para · conferir a prévia · confirmar.
// A confirmação é o ÚNICO ponto que grava, e só por ação explícita do operador.
//
// NÃO envolve conciliação bancária: nada é escrito em conciliacao_bancaria_itens
// nem em conciliado_em.
// ============================================================================
import { useMemo, useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { formatMoeda } from '@/lib/calculos/formatters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useImportLancamentosExcel } from '@/v2/hooks/useImportLancamentosExcel';
import { ImportLancDeParaPanel } from '@/v2/components/importacao/ImportLancDeParaPanel';
import { ImportLancPrevia } from '@/v2/components/importacao/ImportLancPrevia';
import { tipoPorContaPlano } from '@/v2/lib/importLanc/importLancamentosView';
import { baixarModeloPlanilha } from '@/v2/lib/importLanc/modeloPlanilha';
import { Download } from 'lucide-react';

export function V2ImportLancamentosExcel() {
  const {
    classificacoes, fornecedores, fazendas, contasBancarias, criarFornecedor,
    arquivo, parse, dePara, previa, pendentes, lendo, erro,
    exigeFazendaCabecalho, fazendaCabecalhoId, setFazendaCabecalhoId,
    lerArquivo, resolverManualmente, alternarDescarte, limpar,
    confirmarImportacao, gravando, resultado,
  } = useImportLancamentosExcel();
  const [confirmando, setConfirmando] = useState(false);

  const tipoPorTexto = useMemo(
    () => (parse ? tipoPorContaPlano(parse.rows) : {}),
    [parse],
  );

  // Fazenda do cabeçalho é obrigatória quando a planilha não traz a coluna.
  // '__global__' é sentinela de contexto, NUNCA uma fazenda — não entra na lista.
  const faltaFazendaCabecalho = exigeFazendaCabecalho && !fazendaCabecalhoId;

  const bloqueios: string[] = [];
  if (pendentes && pendentes.total > 0) bloqueios.push(`${pendentes.total} valor(es) do de-para ainda sem resolução`);
  if (faltaFazendaCabecalho) bloqueios.push('a planilha não traz Fazenda — escolha uma no cabeçalho');
  if (previa && previa.totais.entram.qtd === 0) bloqueios.push('nenhuma linha elegível para importar');

  return (
    <div className="space-y-1.5 p-2">
      {/* ── Passo 1 — arquivo. Cabeçalho congelado: com a lista longa de de-para,
             o operador perde o contexto do arquivo ao rolar. ── */}
      <div className="rounded-lg border bg-card p-2 space-y-1.5 sticky top-0 z-30">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[13px] font-semibold">Importar lançamentos por planilha</span>
          <span className="text-[10px] text-muted-foreground">
            Planilha no plano de contas do cliente · você mapeia cada conta uma vez · sem conciliação bancária
          </span>
        </div>

        <div className="flex items-end gap-2 flex-wrap">
          <div className="min-w-[220px]">
            <Label className="text-[10px]">Arquivo (.xlsx, .xls)</Label>
            <Input
              type="file"
              accept=".xlsx,.xls"
              className="h-8 text-xs"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void lerArquivo(f);
              }}
            />
          </div>

          <Button
            variant="outline"
            className="h-8 text-[11px] gap-1"
            onClick={baixarModeloPlanilha}
            title="Baixa a planilha modelo, com os cabeçalhos que esta tela lê e uma aba de instruções."
          >
            <Download className="h-3.5 w-3.5" /> Baixar modelo
          </Button>

          {exigeFazendaCabecalho && (
            <div className="min-w-[180px]">
              <Label className="text-[10px] text-amber-800">Fazenda (planilha não traz) *</Label>
              <Select value={fazendaCabecalhoId ?? ''} onValueChange={setFazendaCabecalhoId}>
                <SelectTrigger className="h-8 text-[11px]"><SelectValue placeholder="Escolher fazenda" /></SelectTrigger>
                <SelectContent>
                  {fazendas.filter((f) => f.id !== '__global__').map((f) => (
                    <SelectItem key={f.id} value={f.id} className="text-[11px]">{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {arquivo && (
            <Button variant="ghost" className="h-8 text-[11px]" onClick={limpar} disabled={lendo}>
              Limpar
            </Button>
          )}
        </div>

        {lendo && <div className="text-[10px] text-muted-foreground">Lendo a planilha…</div>}
        {erro && <div className="text-[10px] text-destructive">{erro}</div>}

        {/* Coluna de plano ausente: avisar em vez de deixar o operador descobrir pela
            prévia inteira em vermelho. Foi o sintoma da homologação. */}
        {/* Nenhuma linha de cabeçalho reconhecida no topo. Dizer QUANTAS foram testadas,
            para o operador saber onde procurar em vez de adivinhar. */}
        {parse && parse.linhaCabecalho === null && parse.linhasTestadas > 0 && (
          <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] text-amber-900">
            <strong>Nenhuma linha de cabeçalho foi reconhecida</strong> nas {parse.linhasTestadas} primeiras
            linhas da aba <span className="font-mono">{parse.nomeSheet}</span>. Confira se os títulos das
            colunas estão no topo da planilha — ou use o botão <b>Baixar modelo</b>.
          </div>
        )}

        {parse && parse.linhaCabecalho !== null && parse.linhasValidas > 0 && !parse.colunaPlanoDetectada && (
          <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] text-amber-900">
            <strong>Nenhuma coluna de plano de contas foi encontrada</strong> na linha {parse.linhaCabecalho},
            reconhecida como cabeçalho. Sem ela nenhuma linha pode ser importada. Renomeie a coluna para
            {' '}<span className="font-mono">Conta (plano do cliente)</span> — ou use o botão <b>Baixar modelo</b>.
            Atenção: uma coluna chamada apenas <span className="font-mono">Conta</span> com valores como
            {' '}<span className="font-mono">cc-001 | bradesco</span> é conta <b>bancária</b>, não plano de contas.
          </div>
        )}

        {parse && (
          <div className="text-[10px] text-muted-foreground flex gap-3 flex-wrap">
            <span>Aba: <span className="font-mono">{parse.nomeSheet ?? '—'}</span></span>
            <span>
              Cabeçalho: {parse.linhaCabecalho !== null
                ? <>linha <span className="font-mono">{parse.linhaCabecalho}</span></>
                : <span className="text-amber-700 font-semibold">não reconhecido</span>}
            </span>
            <span>{parse.linhasValidas} linha(s) lida(s)</span>
            <span>
              Plano de contas:{' '}
              {parse.colunaPlanoDetectada
                ? <span className="font-mono">{parse.colunaPlanoDetectada}</span>
                : <span className="text-amber-700 font-semibold">coluna não encontrada</span>}
            </span>
            {parse.linhasComErro > 0 && (
              <span className="text-red-700">{parse.linhasComErro} linha(s) ilegível(is)</span>
            )}
          </div>
        )}

        {parse && parse.erros.length > 0 && (
          <div className="rounded border border-red-200 bg-red-50 px-2 py-1 max-h-24 overflow-y-auto">
            {parse.erros.slice(0, 20).map((e) => (
              <div key={e.linha} className="text-[10px] text-red-800">
                Linha {e.linha}: {e.motivo}
              </div>
            ))}
            {parse.erros.length > 20 && (
              <div className="text-[10px] text-red-700">+{parse.erros.length - 20} outras</div>
            )}
          </div>
        )}
      </div>

      {/* ── Passo 2 — de-para ── */}
      {dePara && pendentes && (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-semibold">De-para</span>
            <span className={`text-[10px] font-semibold ${pendentes.total > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
              {pendentes.total > 0
                ? `${pendentes.total} valor(es) a resolver`
                : 'todos os valores resolvidos'}
            </span>
          </div>

          {/* PR-IMPORT-EXCEL-LANC-05 — blocos EMPILHADOS, cada um em largura total.
              Na grade 2x2 anterior cada bloco recebia metade da tela e todo texto
              truncava ("Pec/Mão de Obra/Sala…", "cc-001 | brades…"): o operador tinha
              de passar o mouse para ler o que estava mapeando. Mapear é comparar dois
              textos — se um deles está cortado, a tela não cumpre a função. */}
          <div className="space-y-1.5">
            <div>
              <ImportLancDeParaPanel
                titulo="Conta do plano do cliente → Subcentro"
                campo="subcentro"
                mapa={dePara.subcentro}
                pendentes={pendentes.subcentro}
                tipoPorTexto={tipoPorTexto}
                classificacoes={classificacoes}
                onResolver={resolverManualmente}
                onDescartar={alternarDescarte}
              />
            </div>
            <div>
              <ImportLancDeParaPanel
                titulo="Fazenda"
                campo="fazenda"
                mapa={dePara.fazenda}
                pendentes={pendentes.fazenda}
                fazendas={fazendas}
                onResolver={resolverManualmente}
                onDescartar={alternarDescarte}
              />
            </div>
            <div>
              <ImportLancDeParaPanel
                titulo="Fornecedor"
                campo="fornecedor"
                mapa={dePara.fornecedor}
                pendentes={pendentes.fornecedor}
                fornecedores={fornecedores}
                onResolver={resolverManualmente}
                onDescartar={alternarDescarte}
                onCriarFornecedor={criarFornecedor}
              />
            </div>
            <div>
              <ImportLancDeParaPanel
                titulo="Conta bancária / cartão"
                campo="conta"
                mapa={dePara.conta}
                pendentes={pendentes.conta}
                contas={contasBancarias}
                onResolver={resolverManualmente}
                onDescartar={alternarDescarte}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Passo 3 — prévia ── */}
      {previa && (
        <div className="space-y-1.5">
          <span className="text-[11px] font-semibold">Prévia</span>
          <ImportLancPrevia linhas={previa.linhas} totais={previa.totais} />

          <div className="flex items-center justify-end gap-2 flex-wrap">
            {bloqueios.length > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {bloqueios.join(' · ')}
              </span>
            )}
            <Button
              size="sm"
              disabled={bloqueios.length > 0 || gravando || resultado !== null}
              onClick={() => setConfirmando(true)}
            >
              {gravando ? 'Gravando…' : `Confirmar importação (${previa.totais.entram.qtd})`}
            </Button>
          </div>
        </div>
      )}

      {/* ── Resultado da gravação ── */}
      {resultado && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 space-y-1">
          <div className="text-[12px] font-semibold text-emerald-900">
            {resultado.criados} lançamento(s) criado(s)
            {resultado.falhas > 0 && ` · ${resultado.falhas} falha(s)`}
            {resultado.ignorados > 0 && ` · ${resultado.ignorados} fora da importação`}
          </div>
          <div className="text-[11px] text-emerald-800">
            Apelidos memorizados: {resultado.apelidos.subcentro} de conta do plano ·{' '}
            {resultado.apelidos.fornecedor} de fornecedor · {resultado.apelidos.conta} de conta bancária.
            Eles valem para as PRÓXIMAS importações — nada já lançado foi reclassificado.
          </div>
          {resultado.erros.length > 0 && (
            <div className="max-h-24 overflow-y-auto">
              {resultado.erros.slice(0, 20).map((e, i) => (
                <div key={i} className="text-[10px] text-red-800">{e}</div>
              ))}
            </div>
          )}
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={limpar}>
            Importar outra planilha
          </Button>
        </div>
      )}

      {/* ── Confirmação: o ponto sem volta ── */}
      <AlertDialog open={confirmando} onOpenChange={(v) => { if (!v) setConfirmando(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar a importação?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-[13px]">
                <div>
                  Serão criados <strong>{previa?.totais.entram.qtd ?? 0}</strong> lançamento(s),
                  somando <strong>{formatMoeda(previa?.totais.entram.valor ?? 0)}</strong>.
                </div>
                {(previa?.totais.ficamDeFora.qtd ?? 0) > 0 && (
                  <div className="text-muted-foreground">
                    {previa?.totais.ficamDeFora.qtd} linha(s) ficam de fora
                    ({formatMoeda(previa?.totais.ficamDeFora.valor ?? 0)}) pelos motivos listados na prévia.
                  </div>
                )}
                <div className="text-amber-800">
                  Os apelidos que você resolveu à mão ficam memorizados para as próximas
                  importações. <strong>Nenhum lançamento já existente é reclassificado.</strong>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={gravando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={gravando}
              onClick={() => {
                setConfirmando(false);
                void confirmarImportacao().then((r) => {
                  if (!r) return;
                  if (r.falhas > 0) toast.warning(`${r.criados} criado(s), ${r.falhas} falha(s).`);
                  else toast.success(`${r.criados} lançamento(s) criado(s).`);
                });
              }}
            >
              {gravando ? 'Gravando…' : 'Confirmar e criar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default V2ImportLancamentosExcel;
