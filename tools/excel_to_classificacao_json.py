#!/usr/bin/env python3
"""
Convert Excel referência (sheet EXPORT_APP_UNICO) → JSON for PR-M.

Dev tool. Sem UI no front nesta fase: o operador converte o XLSX local
uma vez e cola o resultado como argumento da RPC populate.

Uso:
    python3 tools/excel_to_classificacao_json.py \
      ~/Downloads/04.26_modelo_financeiro_referencia.xlsx > /tmp/rows.json

Depois, no Supabase Dashboard SQL Editor:
    SELECT fn_classificacao_populate_staging(
      gen_random_uuid(),
      '77d37bbf-a440-4fca-bf1a-eac60cf91bc4'::uuid,  -- Santa Rita
      $$ ...conteúdo de /tmp/rows.json... $$ ::jsonb
    );

Dependência: openpyxl (já instalado durante a Fase 0). Sem dependência
nova no package.json — é dev tool Python isolada.
"""
import json
import sys
from datetime import datetime, timedelta

try:
    import openpyxl
except ImportError:
    sys.stderr.write("Erro: openpyxl não instalado. Rodar: pip3 install openpyxl\n")
    sys.exit(1)


# Excel serial date (mac/win usa epoch 1899-12-30, sem bug 1900-leap-year).
EXCEL_EPOCH = datetime(1899, 12, 30)


def serial_to_iso(v):
    """Converte serial Excel (int/float) ou datetime para 'YYYY-MM-DD'."""
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, (int, float)):
        return (EXCEL_EPOCH + timedelta(days=int(v))).strftime("%Y-%m-%d")
    return None


def normalize_tipo(v):
    """Singular '3-Transferência' → plural '3-Transferências'. Resto passa direto."""
    if v == "3-Transferência":
        return "3-Transferências"
    return v


def trim_or_none(v):
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None


def main(xlsx_path):
    wb = openpyxl.load_workbook(xlsx_path, data_only=True, read_only=True)
    ws = wb["EXPORT_APP_UNICO"]
    rows = list(ws.iter_rows(values_only=True))
    headers = [str(h).strip() if h else "" for h in rows[0]]

    out = []
    for idx, raw in enumerate(rows[1:], start=2):  # 2 = primeira linha de dados no XLSX (1-based, header é 1)
        d = dict(zip(headers, raw))
        out.append({
            "linha": idx,
            "subcentro": trim_or_none(d.get("Subcentro")),
            "fornecedor": trim_or_none(d.get("Fornecedor")),
            "produto": trim_or_none(d.get("Produto")),
            "conta_origem": trim_or_none(d.get("Conta")),
            "conta_destino": trim_or_none(d.get("Conta_Destino")),
            "ano_mes": trim_or_none(d.get("AnoMes")) or (
                serial_to_iso(d.get("Data_Ref"))[:7] if d.get("Data_Ref") else None
            ),
            "data": serial_to_iso(d.get("Data_Ref")),
            "valor": float(d["Valor"]) if d.get("Valor") is not None else None,
            "tipo_operacao": normalize_tipo(trim_or_none(d.get("Tipo"))),
            "fazenda_codigo": trim_or_none(d.get("Fazenda")),
        })

    sys.stdout.write(json.dumps(out, ensure_ascii=False, indent=2))
    sys.stdout.write("\n")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.stderr.write("Uso: python3 excel_to_classificacao_json.py <arquivo.xlsx>\n")
        sys.exit(1)
    main(sys.argv[1])
