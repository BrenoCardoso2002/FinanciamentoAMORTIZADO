# ============================================================
#  SIMULADOR FINANCEIRO — VIBRA PARQUE VILA SÔNIA (B0909)
#  Contrato assinado em 27/05/2026 — Cláusula 2ª §1 e §2
#
#  ESTRUTURA DE PAGAMENTOS (conforme contrato):
#  ┌─ PRÉ-CHAVES (durante a obra, ~24 meses) ──────────────┐
#  │  Sinal (ato):          R$ 5.000  → abate financiamento│
#  │  Entrada 25x R$1.000:  R$25.000  → abate financiamento│
#  │  Total entrada:        R$30.000                       │
#  │                                                       │
#  │  Juros de obra (24x):  R$24.894  → custo separado,   │
#  │    (valores reais da construtora, não abate nada)     │
#  └───────────────────────────────────────────────────────┘
#  ┌─ FINANCIAMENTO BANCÁRIO ──────────────────────────────┐
#  │  Saldo nominal (contrato): R$259.700                  │
#  │  Saldo corrigido na entrega das chaves: ~R$310.708    │
#  │    (INCC de 0,75%/mês por 24 meses = +19,64%)        │
#  │                                                       │
#  │  Pós-chaves: PRICE + IPCA mensal                      │
#  │    A cada mês:                                        │
#  │    1. IPCA corrije o saldo (Cláusula 2ª §2 e §6)     │
#  │    2. Juros de 12%aa incidem sobre saldo corrigido    │
#  │    3. Amortização = prestação − juros                 │
#  │    (pode ser negativa se IPCA alto → saldo cresce)    │
#  └───────────────────────────────────────────────────────┘
# ============================================================


# ─── JUROS DE OBRA REAIS ─────────────────────────────────────
# Valores mensais em R$ cobrados pela construtora durante a obra.
# Fonte: tabela da Vibra Parque Vila Sônia (24 meses / out2026→set2028).
# IMPORTANTE: esses valores NÃO abatam o saldo financiado —
# são cobranças separadas pelo "juros de obra" (Cláusula 2ª §1).
JUROS_OBRA = [
    390.89, 406.11, 436.56, 492.38, 555.81, 619.25, 682.68,
    746.11, 809.55, 872.98, 936.41, 999.85, 1063.28, 1126.71,
    1190.14, 1253.58, 1317.01, 1380.44, 1443.88, 1507.31,
    1570.74, 1634.18, 1697.61, 1761.04
]


# ─── CONFIGURAÇÕES DO CONTRATO ───────────────────────────────

# Preço total negociado (Quadro Resumo do contrato)
PRECO_TOTAL = 330_000.00

# Entrada — abate o saldo financiado
SINAL_ATO    = 5_000.00   # pago em 31/05/2026 (ato da assinatura)
ENTRADA_QTD  = 25         # 3 parcelas de sinal + 22 mensais
ENTRADA_VALOR = 1_000.00  # R$1.000 cada

# Total da entrada = sinal + parcelas mensais
TOTAL_ENTRADA = SINAL_ATO + (ENTRADA_QTD * ENTRADA_VALOR)  # R$30.000

# Saldo que vai para o banco (confirmado pelo contrato)
# = Preço total − entrada − parcela intermediária (R$40.200) − parcela única (R$100)
SALDO_FINANCIADO = 259_700.00


# ─── ÍNDICES ECONÔMICOS (PROJEÇÕES CONSERVADORAS) ────────────

# INCC: corrige o saldo do banco DURANTE A OBRA (Cláusula 2ª §1)
# 0,75%/mês ≈ 9,38% ao ano
INCC_MENSAL = 0.0075

# IPCA: corrije o saldo DEPOIS DAS CHAVES (Cláusula 2ª §2)
# 0,50%/mês ≈ 6,17% ao ano
# Se IPCA > (~0,35%/mês), o PRICE entra em amortização negativa.
IPCA_MENSAL = 0.0050

# Taxa de juros contratual (12% ao ano — Cláusula 2ª §2)
TAXA_JUROS_ANUAL = 0.12

# Taxa mensal equivalente: (1 + i_anual)^(1/12) - 1
# Para taxa efetiva anual (juros compostos).
TAXA_JUROS_MENSAL = (1 + TAXA_JUROS_ANUAL) ** (1/12) - 1


# ─── PRAZO ───────────────────────────────────────────────────

# Meses de obra = quantidade de parcelas de juros de obra fornecidas
MESES_OBRA = len(JUROS_OBRA)   # 24 meses

# Prazo máximo do financiamento pós-chaves (contrato: até 420 meses = 35 anos)
PRAZO_PRICE_MESES = 420


# ─── ESTRATÉGIA DE AMORTIZAÇÃO EXTRA (COFRINHO) ──────────────
# Guarda uma fração da prestação todo mês e aplica direto no saldo
# a cada INTERVALO_COFRINHO meses. Amortização extra = direta no
# saldo, sem pagar juros sobre esse valor.

USAR_COFRINHO      = True   # ativa/desativa o cofrinho
PERC_COFRINHO      = 0.25   # 25% da prestação guardada por mês
INTERVALO_COFRINHO = 4      # aplica o acumulado a cada 4 meses


# ════════════════════════════════════════════════════════════
#  FASE 1: PRÉ-CHAVES
#  Durante a obra, o saldo do banco cresce pelo INCC.
#  (Cláusula 2ª §1 e §6: reajuste mensal incide dia 1º)
# ════════════════════════════════════════════════════════════

# Aplica INCC mês a mês sobre o saldo nominal
saldo_na_entrega = SALDO_FINANCIADO
for _ in range(MESES_OBRA):
    saldo_na_entrega *= (1 + INCC_MENSAL)

# Total dos juros de obra (custo extra durante a construção)
total_juros_obra = sum(JUROS_OBRA)

# Total que sai do bolso antes das chaves
total_pago_pre = TOTAL_ENTRADA + total_juros_obra

# INCC acumulado para exibição no relatório
incc_acumulado = (1 + INCC_MENSAL) ** MESES_OBRA


# ════════════════════════════════════════════════════════════
#  FASE 2: PÓS-CHAVES — PRICE + IPCA
#
#  Prestação PRICE (PMT):
#  PMT = PV × [ i(1+i)^n ] / [ (1+i)^n − 1 ]
#  Onde:
#    PV = saldo na entrega das chaves (já corrigido pelo INCC)
#    i  = taxa mensal equivalente de 12% ao ano
#    n  = prazo máximo em meses
#
#  A cada mês:
#    1. IPCA corrije o saldo ANTES dos juros incidirem
#    2. Juros = saldo_corrigido × taxa_mensal
#    3. Amortização = PMT − juros
#       Se < 0 → amortização negativa (saldo cresce)
#    4. Cofrinho: guarda % do PMT, aplica no intervalo definido
# ════════════════════════════════════════════════════════════

i   = TAXA_JUROS_MENSAL   # taxa mensal (atalho para fórmulas)
PV  = saldo_na_entrega    # saldo inicial da fase PRICE

# Cálculo do PMT (prestação fixa)
PMT = PV * i / (1 - (1 + i) ** -PRAZO_PRICE_MESES)

# Acumuladores de resultado
saldo              = PV       # saldo devedor corrente (atualizado a cada mês)
total_pago_price   = 0.0      # total desembolsado na fase PRICE (prestações + extras)
total_juros_price  = 0.0      # total de juros + correção IPCA pagos
total_amort_reg    = 0.0      # total amortizado via prestação normal
total_amort_extra  = 0.0      # total amortizado via cofrinho
cofrinho           = 0.0      # valor acumulado no cofrinho
meses_pagos        = 0        # quantos meses efetivamente foram pagos
meses_amort_neg    = 0        # meses com amortização negativa (saldo cresceu)
historico          = []       # dados de cada mês para amostragem no relatório

for mes in range(1, PRAZO_PRICE_MESES + 1):
    # Para quando o saldo é praticamente zero (quitou antes do prazo)
    if saldo <= 0.01:
        break

    # ── Passo 1: IPCA corrije o saldo ──────────────────────
    # (Cláusula 2ª §6: correção incide no dia 1º de cada mês)
    saldo_corrigido = saldo * (1 + IPCA_MENSAL)

    # ── Passo 2: Juros sobre saldo já corrigido ─────────────
    juros_mes = saldo_corrigido * i

    # ── Passo 3: Amortização normal ─────────────────────────
    amort_reg = PMT - juros_mes

    # Percentual da prestação que efetivamente abate o saldo
    # (começa em ~1-20% dependendo do IPCA e taxa de juros)
    pct_amort = (amort_reg / PMT * 100) if PMT > 0 else 0

    if amort_reg < 0:
        # AMORTIZAÇÃO NEGATIVA: IPCA + juros superam o PMT.
        # O saldo CRESCE mesmo pagando a prestação inteira.
        # Isso ocorre porque o IPCA (0,50%/mês) é maior que
        # a margem de amortização do PRICE (~0,014% no mês 1).
        meses_amort_neg += 1
        saldo     = saldo_corrigido + abs(amort_reg)
        amort_reg = 0
    else:
        # Amortização positiva: abate do saldo normalmente
        saldo = saldo_corrigido - amort_reg

    total_pago_price  += PMT
    total_juros_price += juros_mes
    total_amort_reg   += amort_reg
    meses_pagos       += 1

    # ── Passo 4: Cofrinho ───────────────────────────────────
    # Guarda PERC_COFRINHO do PMT todo mês.
    # No mês do intervalo, aplica direto no saldo (sem pagar juros).
    amort_extra = 0
    if USAR_COFRINHO:
        cofrinho += PMT * PERC_COFRINHO

        if mes % INTERVALO_COFRINHO == 0 and saldo > 0.01:
            # Aplica o cofrinho (limitado ao saldo restante)
            amort_extra        = min(saldo, cofrinho)
            saldo             -= amort_extra
            total_amort_extra += amort_extra
            total_pago_price  += amort_extra   # também é dinheiro que sai
            cofrinho           = 0.0            # zera para acumular de novo

    # Garante que o saldo não fique negativo por arredondamento
    if saldo <= 0.01:
        saldo = 0.0

    # Salva dados deste mês para o relatório amostral
    historico.append((mes, saldo_corrigido, juros_mes, amort_reg, pct_amort, PMT, amort_extra, saldo))


# ─── PÓS-LOOP: cálculos derivados ────────────────────────────

anos_price  = meses_pagos // 12   # anos completos pagos
meses_resto = meses_pagos % 12    # meses restantes além dos anos

quitou      = saldo <= 0.01       # True = quitou dentro do prazo
economizado = PRAZO_PRICE_MESES - meses_pagos  # meses economizados

# Custo total: tudo que saiu do bolso (pré + pós-chaves)
custo_total = total_pago_pre + total_pago_price


# ════════════════════════════════════════════════════════════
#  RELATÓRIO
# ════════════════════════════════════════════════════════════

SEP  = "=" * 68
sep  = "-" * 68
THIN = "  " + "─" * 55

def fmt(v): return f"R$ {v:>14,.2f}"   # formata como moeda
def pct(v): return f"{v:>7.1f}%"       # formata como percentual


print(SEP)
print("    SIMULADOR FINANCEIRO — VIBRA PARQUE VILA SÔNIA B0909")
print(SEP)

# ── Fase 1: Pré-chaves ────────────────────────────────────────
print()
print("▌ FASE 1 — PRÉ-CHAVES (24 meses de obra)")
print(sep)
print(f"  Preço total do imóvel:               {fmt(PRECO_TOTAL)}")
print(f"  Sinal (ato — 31/05/2026):            {fmt(SINAL_ATO)}")
print(f"  Entrada parcelada ({ENTRADA_QTD}x R$1.000):    {fmt(ENTRADA_QTD * ENTRADA_VALOR)}")
print(f"  Total entrada (abate financiamento): {fmt(TOTAL_ENTRADA)}")
print(THIN)
print(f"  Saldo financiado ao banco (nominal): {fmt(SALDO_FINANCIADO)}")
print(f"  INCC acumulado ({MESES_OBRA} meses / {(incc_acumulado-1)*100:.2f}%):  +{fmt(saldo_na_entrega - SALDO_FINANCIADO)}")
print(f"  Saldo na entrega das chaves (PV):    {fmt(saldo_na_entrega)}")
print()
print(f"  Juros de obra — 24 parcelas reais:   {fmt(total_juros_obra)}")
print(f"    ├─ Menor: {fmt(min(JUROS_OBRA))}  └─ Maior: {fmt(max(JUROS_OBRA))}")
print(THIN)
print(f"  💳 TOTAL SAINDO DO BOLSO PRÉ-CHAVES: {fmt(total_pago_pre)}")
print(f"     ├─ Entrada (sinal + parcelas):    {fmt(TOTAL_ENTRADA)}")
print(f"     └─ Juros de obra (custo extra):   {fmt(total_juros_obra)}")

# ── Fase 2: Pós-chaves ────────────────────────────────────────
print()
print("▌ FASE 2 — PÓS-CHAVES (PRICE + IPCA)")
print(sep)
print(f"  Saldo inicial (PV):                  {fmt(PV)}")
print(f"  IPCA mensal:                         {IPCA_MENSAL*100:.2f}% ≈ {((1+IPCA_MENSAL)**12-1)*100:.2f}% aa")
print(f"  Juros contratuais:                   12,00% aa ({i*100:.4f}%/mês)")
print(f"  Prestação PRICE mensal (PMT):        {fmt(PMT)}")
print()

# Decomposição do mês 1: mostra o "~20%" que o usuário mencionou
if historico:
    _, sd, jm, ar, pa, _, _, _ = historico[0]
    print(f"  Decomposição da prestação — Mês 1:")
    print(f"    ├─ Juros + IPCA:   {fmt(jm)}  ({100-pa:.1f}% da parcela)")
    print(f"    └─ Amortiza saldo: {fmt(ar)}  ({pa:.1f}% da parcela)")
    print(f"       ↑ Esse percentual melhora com o tempo no PRICE sem IPCA.")
    print(f"         Com IPCA alto, pode ficar negativo (saldo cresce).")

print()
print(f"  Total pago (prestações + cofrinho):  {fmt(total_pago_price)}")
print(f"    ├─ Amortizado via prestações:      {fmt(total_amort_reg)}")
print(f"    ├─ Amortizado via cofrinho:        {fmt(total_amort_extra)}")
print(f"    └─ Juros + correção IPCA pagos:    {fmt(total_juros_price)}")

# Alerta de amortização negativa
if meses_amort_neg > 0:
    print()
    print(f"  ⚠️  AMORTIZAÇÃO NEGATIVA: {meses_amort_neg}/{meses_pagos} meses")
    print(f"     IPCA ({IPCA_MENSAL*100:.2f}%/mês) supera a margem de amortização.")
    print(f"     O saldo CRESCE mesmo pagando a prestação inteira.")
    print(f"     Causa raiz: taxa mensal efetiva ({i*100:.4f}%) + IPCA ({IPCA_MENSAL*100:.2f}%)")
    print(f"     = custo total do saldo ({(i + IPCA_MENSAL)*100:.4f}%/mês) > PMT/saldo.")

# ── Tabela amostral ───────────────────────────────────────────
# Mostra meses 1, 2, 3 + anos 5, 10, 15, 20, 25, 30, 35
print()
print("▌ AMOSTRA — EVOLUÇÃO DA DECOMPOSIÇÃO DA PARCELA")
print(sep)
print(f"  {'Mês':>5}  {'Saldo Devedor':>16}  {'Juros+IPCA':>14}  {'Amort.':>14}  {'%Amort':>8}")
print(f"  {'─'*5}  {'─'*16}  {'─'*14}  {'─'*14}  {'─'*8}")

# Índices dos meses a exibir (0-indexed dentro do historico[])
marcos = [0, 1, 2] + [m*12-1 for m in [5,10,15,20,25,30,35] if m*12-1 < len(historico)]
marcos = sorted(set(marcos))

for idx in marcos:
    if idx < len(historico):
        mes, sd, jm, ar, pa, _, _, sf = historico[idx]
        print(f"  {mes:>5}  {fmt(sd)}  {fmt(jm)}  {fmt(ar)}  {pct(pa)}")

# ── Cronograma ────────────────────────────────────────────────
print()
print("▌ CRONOGRAMA")
print(sep)
print(f"  Prazo máximo contratual:             35 anos (420 meses)")
print(f"  Prazo simulado:                      {anos_price} anos e {meses_resto} meses ({meses_pagos} meses)")
if quitou and economizado > 0:
    ae = economizado // 12
    me = economizado % 12
    print(f"  ✅ Quitou! Economizou:               {ae} anos e {me} meses ({economizado} meses)")
else:
    print(f"  ❌ NÃO quitou no prazo máximo")
    print(f"     Saldo residual após 35 anos:      {fmt(saldo)}")
    print(f"     Isso indica que o IPCA projetado é alto demais para")
    print(f"     esse financiamento. Na prática, seria necessário refinanciar")
    print(f"     na entrega das chaves (CEF/SBPE com taxa prefixada).")

# ── Custo total ───────────────────────────────────────────────
print()
print("▌ CUSTO TOTAL")
print(sep)
print(f"  Pré-chaves:")
print(f"    ├─ Entrada (sinal + 25 parcelas):  {fmt(TOTAL_ENTRADA)}")
print(f"    └─ Juros de obra (24 meses):       {fmt(total_juros_obra)}")
print(f"  Pós-chaves (PRICE + cofrinho):       {fmt(total_pago_price)}")
print(THIN)
print(f"  💸 CUSTO TOTAL GERAL:                {fmt(custo_total)}")
print(f"  📋 Preço contrato (nominal):         {fmt(PRECO_TOTAL)}")
print(f"  📈 Custo adicional (correção+juros): {fmt(custo_total - PRECO_TOTAL)}")

# ── Parâmetros ────────────────────────────────────────────────
print()
print("▌ PARÂMETROS UTILIZADOS")
print(sep)
print(f"  INCC mensal (pré-chaves):            {INCC_MENSAL*100:.2f}% ≈ {((1+INCC_MENSAL)**12-1)*100:.2f}% aa")
print(f"  IPCA mensal (pós-chaves):            {IPCA_MENSAL*100:.2f}% ≈ {((1+IPCA_MENSAL)**12-1)*100:.2f}% aa")
print(f"  Taxa juros contratual:               12,00% aa ({i*100:.4f}%/mês)")
print(f"  Cofrinho ativo:                      {'SIM' if USAR_COFRINHO else 'NÃO'}")
if USAR_COFRINHO:
    print(f"    ├─ % da prestação guardada:      {int(PERC_COFRINHO*100)}%")
    print(f"    └─ Intervalo de aplicação:       a cada {INTERVALO_COFRINHO} meses")
print(SEP)
print("  ⚠️  Simulação com índices FIXOS projetados.")
print("  Valores reais variam conforme INCC (FGV) e IPCA (IBGE).")
print("  Este script é para planejamento — não substitui análise")
print("  profissional do seu contrato.")
print(SEP)
