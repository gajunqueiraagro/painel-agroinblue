"""
CALCULADORA-RTC-CONFERIR-01 — gera `src/lib/financeiro/nfe/cClassTribRtc.ts` (a tabela de cClassTrib da calculadora oficial da Receita).

Uso (o banco SQLite da calculadora, montado dos SQL do repositório, MIT):
  1. baixar de github.com/ReceitaFederal/calculadora-rtc-regime-regular: flyway/sql/criacao/B0001__sistema_tributario_completo.sql e
     flyway/sql/manutencao/V*.sql (todos);
  2. sqlite3 rtc.db < B0001__sistema_tributario_completo.sql; depois cada V*.sql em ordem de versão (sort -V);
  3. python3 -I scripts/gerar-cclasstrib-rtc.py rtc.db /tmp/cclasstrib.json src/lib/financeiro/nfe/cClassTribRtc.ts
A regra de cada classificação sai das EXPRESSÕES do tratamento (nunca do id, que as migrações de manutenção renumeram).
"""
import sqlite3, json, sys
from collections import Counter
db = sqlite3.connect(sys.argv[1])
BASE = 'baseCalculoInformada-impostoSeletivoInformado+impostoSeletivoCalculado'
EFET = 'aliquota*(1-percentualReducao)*(1-pRedutorCompraGov/100)'
rows = db.execute("""
select c.CLTR_CD, s.SITR_CD, c.CLTR_TIPO_ALIQUOTA, tt.TRTR_DESCRICAO, tt.TRTR_EXPRESSAO_ALIQUOTA, tt.TRTR_EXPRESSAO_ALIQUOTA_EFETIVA,
  tt.TRTR_EXPRESSAO_BASE_CALCULO, tt.TRTR_EXPRESSAO_TRIBUTO_CALCULADO, tt.TRTR_EXPRESSAO_TRIBUTO_DEVIDO, tt.TRTR_EXPRESSAO_PERCENTUAL_DIFERIMENTO, c.CLTR_ID
from CLASSIFICACAO_TRIBUTARIA c join SITUACAO_TRIBUTARIA s on s.SITR_ID=c.CLTR_SITR_ID
join TRATAMENTO_CLASSIFICACAO tc on tc.TRCL_CLTR_ID=c.CLTR_ID and tc.TRCL_FIM_VIGENCIA is null
join TRATAMENTO_TRIBUTARIO tt on tt.TRTR_ID=tc.TRCL_TRTR_ID
where c.CLTR_FIM_VIGENCIA is null and tt.TRTR_DESCRICAO not like '%Imposto Seletivo%'
order by c.CLTR_CD""").fetchall()
out = {}
for cd, cst, tipo, desc, aliq, efet, base, calc, dev, dif, cid in rows:
    red = {sig: round(v, 4) for sig, v in db.execute("""select t.TBTO_SIGLA, p.PERE_VALOR from PERCENTUAL_REDUCAO p join TRIBUTO t on t.TBTO_ID=p.PERE_TBTO_ID
      where p.PERE_CLTR_ID=? and p.PERE_FIM_VIGENCIA is null and t.TBTO_SIGLA in ('CBS','IBSUF','IBSMun') order by 1""", (cid,))}
    # isenção/imunidade (o zero vem da desoneração, não da alíquota) e transferência/ajustes de crédito: não se refazem pela base escrita
    desonera = desc in ('Isenção', 'Imunidade e não incidência', 'Transferência de crédito', 'Ajustes', 'Ajuste de IBS na ZFM')
    padrao = not desonera and base == BASE and efet == EFET and calc == 'baseCalculo*aliquotaEfetiva' and dev == 'tributoCalculado' and tipo not in ('Fixa', 'Uniforme setorial', 'Alíquotas Combinadas (Ad Valorem e Ad Rem)')
    if not padrao: e = {'cst': cst, 'regra': 'fora'}
    elif aliq == '0': e = {'cst': cst, 'regra': 'zero'}
    else:
        e = {'cst': cst, 'regra': 'conta'}
        if red: e['pRed'] = red
        if dif: e['pDif'] = round(float(dif) * 100, 4)
    e['tratamento'] = desc
    if cd in out and out[cd] != e: raise SystemExit(f'cClassTrib {cd} com dois tratamentos vigentes: {out[cd]} x {e}')
    out[cd] = e
v = db.execute("select VRBD_VERSAO_BASE_DADO, VRBD_DESCRICAO from VERSAO_BASE_DADO where VRBD_VERSAO_BASE_DADO GLOB 'V[0-9]*' order by VRBD_VERSAO_BASE_DADO desc limit 1").fetchone()
doc = {'_fonte': f'ReceitaFederal/calculadora-rtc-regime-regular, licenca MIT (Copyright (c) 2026 Receita Federal do Brasil): flyway/sql/criacao/B0001 + flyway/sql/manutencao ate {v[0]} ({v[1]}). So as classificacoes e tratamentos vigentes, sem o Imposto Seletivo.',
       '_regra': "conta: aliquota efetiva = arred4(aliquota x (1 - pRed/100)), calculado = arred2(arred2(vBC) x efetiva / 100), vDif = arred2(vBC x efetiva / 100 x pDif / 100), devido = calculado - vDif; zero: aliquota 0; fora: a conta nao se refaz pela base e pela aliquota escritas (base por quantidade, base reduzida, aliquota fixa ou setorial, monofasica, isencao/imunidade, transferencia e ajustes de credito) — nao se confere.",
       'classificacoes': out}
json.dump(doc, open(sys.argv[2], 'w'), ensure_ascii=False, indent=1)
print(len(out), Counter(e['regra'] for e in out.values()))
for k in ['000001','515001','200038','200009','200020','510002','011002','620006','410999','200032','200002']: print(k, out.get(k))

# o módulo TS (tipado, sem cast) — o que o código importa
if len(sys.argv) > 3:
    linhas = []
    for cd, e in sorted(out.items()):
        partes = [f"cst: '{e['cst']}'", f"regra: '{e['regra']}'"]
        if 'pRed' in e: partes.append('pRed: { ' + ', '.join(f"{k}: {e['pRed'].get(k, 0):g}" for k in ('CBS', 'IBSUF', 'IBSMun')) + ' }')
        if 'pDif' in e: partes.append(f"pDif: {e['pDif']:g}")
        linhas.append(f"  '{cd}': {{ {', '.join(partes)} }}, // {e['tratamento']}")
    ts = f"""/**
 * GERADO por `scripts/gerar-cclasstrib-rtc.py` — não editar à mão (CALCULADORA-RTC-CONFERIR-01, Gabriel 22/11).
 * Fonte: {doc['_fonte']}
 * Regra: {doc['_regra']}
 */
export type RegraDaClassificacao = {{
  cst: string;
  regra: 'conta' | 'zero' | 'fora';
  /** percentual de redução da alíquota (0–100) por tributo */
  pRed?: {{ CBS: number; IBSUF: number; IBSMun: number }};
  /** percentual do diferimento (0–100) */
  pDif?: number;
}};

export const CCLASSTRIB_RTC: Readonly<Record<string, RegraDaClassificacao>> = {{
""" + '\n'.join(linhas) + "\n};\n"
    open(sys.argv[3], 'w').write(ts)
