/**
 * --- CONFIGURAÇÕES GLOBAIS ---
 */
const PAGE_SIZE = 12; 
let allRows = [];     
let currentPage = 0;  

document.addEventListener('DOMContentLoaded', () => {
    setupMasks();
    // Sincronização automática dos campos de entrada
    const inputs = ['valorImovel', 'valorEntrada', 'valorSubsidio'];
    inputs.forEach(id => {
        document.getElementById(id)?.addEventListener('input', syncFinanciado);
    });
});

/**
 * --- MÁSCARAS E FORMATAÇÃO ---
 */
function setupMasks() {
    document.querySelectorAll('[data-mask]').forEach(input => {
        input.addEventListener('input', () => {
            const mask = input.dataset.mask;
            if (mask === 'money') applyMoneyMask(input);
            if (mask === 'decimal') applyDecimalMask(input);
            if (mask === 'int') applyIntMask(input);
        });
    });
}

function centavosToStr(v) {
    return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function unmask(str) {
    if (!str) return 0;
    const clean = str.replace(/\D/g, '');
    return clean ? parseFloat(clean) / 100 : 0;
}

function applyMoneyMask(i) {
    let v = i.value.replace(/\D/g, '');
    if (!v) { i.value = ''; return; }
    i.value = 'R$ ' + centavosToStr(parseFloat(v) / 100);
}

function applyDecimalMask(i) {
    let v = i.value.replace(/\D/g, '');
    if (!v) { i.value = ''; return; }
    i.value = (parseFloat(v) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function applyIntMask(i) { i.value = i.value.replace(/\D/g, ''); }

/**
 * --- LÓGICA DE INTERFACE (CÁLCULO AUTOMÁTICO DE ENTRADA) ---
 */
function syncFinanciado() {
    const iv = unmask(document.getElementById('valorImovel').value);
    const en = unmask(document.getElementById('valorEntrada').value);
    const sub = unmask(document.getElementById('valorSubsidio').value);
    const fin = Math.max(0, iv - en - sub);

    const elFinanc = document.getElementById('valorFinanciado');
    if (elFinanc) elFinanc.value = fin > 0 ? 'R$ ' + centavosToStr(fin) : '';

    const info = document.getElementById('infoEntrada');
    if (iv > 0 && info) {
        const pctEn = ((en / iv) * 100).toFixed(1);
        const pctFin = ((fin / iv) * 100).toFixed(1);
        info.innerHTML = `Entrada: <span>${pctEn}%</span> · A Financiar: <span>${pctFin}%</span>`;
    }
}

/**
 * --- CÁLCULO PRINCIPAL (SISTEMA SAC) ---
 */
function calcular() {
    // Captura de valores
    const valorFinanciado = unmask(document.getElementById('valorFinanciado').value);
    const prazoTotal = parseInt(document.getElementById('prazo').value) || 0;
    const jurosAnoStr = document.getElementById('jurosAno').value.replace(',', '.');
    const jurosAno = parseFloat(jurosAnoStr) / 100;
    
    const v1Digitado = unmask(document.getElementById('valorPrimeiraParcela').value);
    const vExtraMensal = unmask(document.getElementById('valorMensalExtra').value);
    const intervalo = parseInt(document.getElementById('intervaloAmort').value) || 1;

    if (!valorFinanciado || !prazoTotal || !jurosAno) {
        alert("Preencha os campos obrigatórios: Valor Financiado, Prazo e Juros.");
        return;
    }

    // Cálculo da taxa mensal (Juros Compostos)
    const jurosMes = Math.pow(1 + jurosAno, 1/12) - 1;
    const amortBase = valorFinanciado / prazoTotal;

    // Localizar mês de início baseado na parcela digitada (Sistema SAC)
    let mesInicio = 1;
    if (v1Digitado > 0) {
        let menorDiff = Infinity;
        for (let i = 1; i <= prazoTotal; i++) {
            let saldoHipotetico = valorFinanciado - (amortBase * (i - 1));
            let parcelaHipotetica = amortBase + (saldoHipotetico * jurosMes);
            let diff = Math.abs(parcelaHipotetica - v1Digitado);
            if (diff < menorDiff) {
                menorDiff = diff;
                mesInicio = i;
            }
        }
    }

    // Simulação mês a mês
    let saldoDevedor = valorFinanciado - (amortBase * (mesInicio - 1));
    let acumuladoExtra = 0;
    let totalJuros = 0;
    let totalAmortExtra = 0;
    let totalPago = 0;
    let contadorMeses = 0;
    allRows = [];

    const prazoRestanteOriginal = (prazoTotal - mesInicio + 1);

    for (let m = mesInicio; m <= prazoTotal; m++) {
        if (saldoDevedor <= 0.1) break;

        const jurosDoMes = saldoDevedor * jurosMes;
        const amortDoMes = Math.min(amortBase, saldoDevedor);
        const parcelaNormal = amortDoMes + jurosDoMes;

        saldoDevedor -= amortDoMes;
        
        // Lógica de Amortização Extra: Junta todo mês e abate no intervalo X
        acumuladoExtra += vExtraMensal; 
        let amortExtraEfetiva = 0;
        
        if (vExtraMensal > 0 && (contadorMeses + 1) % intervalo === 0) {
            amortExtraEfetiva = Math.min(acumuladoExtra, saldoDevedor);
            saldoDevedor -= amortExtraEfetiva;
            totalAmortExtra += amortExtraEfetiva;
            acumuladoExtra = 0; // Zerou o "pote" guardado
        }

        totalJuros += jurosDoMes;
        totalPago += (parcelaNormal + amortExtraEfetiva);
        contadorMeses++;

        allRows.push({
            n: m,
            amort: amortDoMes,
            juros: jurosDoMes,
            parcela: parcelaNormal,
            amortExtra: amortExtraEfetiva,
            saldo: Math.max(0, saldoDevedor)
        });
    }

    // Renderização dos resultados
    const mesesEconomizados = prazoRestanteOriginal - contadorMeses;

    renderStats({
        parcelasEfetivas: contadorMeses,
        mesesEconomizados: mesesEconomizados,
        totalPago,
        totalJuros,
        totalAmortExtra,
        v1: allRows[0]?.parcela || 0,
        vLast: allRows[allRows.length - 1]?.parcela || 0,
        valorFinanciado
    });

    renderProgress(prazoRestanteOriginal, mesesEconomizados);
    
    currentPage = 0;
    renderTable();
    renderPagination();
    
    const resDiv = document.getElementById('results');
    resDiv.style.display = 'block';
    window.scrollTo({ top: resDiv.offsetTop - 20, behavior: 'smooth' });
}

function renderStats(s) {
    const grid = document.getElementById('statsGrid');
    const anos = Math.floor(s.parcelasEfetivas / 12);
    const meses = s.parcelasEfetivas % 12;
    const tempoStr = (anos > 0 ? `${anos}a ` : '') + `${meses}m`;

    const items = [
        { label: 'Tempo Restante', value: tempoStr, cls: 'accent' },
        { label: 'Meses Economizados', value: `${s.mesesEconomizados}m`, cls: 'accent' },
        { label: 'Total a Pagar', value: `R$ ${centavosToStr(s.totalPago)}`, cls: 'danger' },
        { label: 'Total em Juros', value: `R$ ${centavosToStr(s.totalJuros)}`, cls: 'warn' },
        { label: 'Total Amort. Extras', value: `R$ ${centavosToStr(s.totalAmortExtra)}`, cls: 'accent' },
        { label: 'Custo do Crédito', value: `${((s.totalJuros / s.valorFinanciado) * 100).toFixed(1)}%`, cls: '' },
        // Arredondado para bater com o que o usuário quer ver (sem centavos quebrados)
        { label: '1ª Parcela (Calc)', value: `R$ ${centavosToStr(Math.round(s.v1))}`, cls: '' },
        { label: 'Última Parcela', value: `R$ ${centavosToStr(s.vLast)}`, cls: '' }
    ];

    grid.innerHTML = items.map(i => `
        <div class="stat-card">
            <div class="stat-label">${i.label}</div>
            <div class="stat-value ${i.cls}">${i.value}</div>
        </div>
    `).join('');
}

function renderProgress(original, econ) {
    const pago = original - econ;
    const pctPago = (pago / original) * 100;
    const pctEcon = (econ / original) * 100;

    const bar = document.getElementById('progressBar');
    // A barra pintada mostra o que sobrou para pagar
    bar.style.width = pctPago.toFixed(1) + '%';
    
    document.getElementById('progressLabel').textContent = `${pctEcon.toFixed(1)}% de redução de tempo`;
    
    document.getElementById('progressLegend').innerHTML = `
        <div class="legend-item"><div class="legend-dot" style="background:var(--accent)"></div>Novo prazo: ${pago} meses</div>
        <div class="legend-item"><div class="legend-dot" style="background:#e2e8f0; border:1px solid #ccc"></div>Economia: ${econ} meses</div>
    `;
}

function renderTable() {
    const tbody = document.getElementById('tableBody');
    const start = currentPage * PAGE_SIZE;
    const slice = allRows.slice(start, start + PAGE_SIZE);

    tbody.innerHTML = slice.map(r => `
        <tr class="${r.amortExtra > 0 ? 'amort-row' : ''}">
            <td>${r.n}${r.amortExtra > 0 ? ' <span class="amort-badge">AMORT+</span>' : ''}</td>
            <td>R$ ${centavosToStr(r.amort)}</td>
            <td class="val-interest">R$ ${centavosToStr(r.juros)}</td>
            <td>R$ ${centavosToStr(r.parcela)}</td>
            <td class="val-amort">${r.amortExtra > 0 ? 'R$ ' + centavosToStr(r.amortExtra) : '—'}</td>
            <td>R$ ${centavosToStr(r.saldo)}</td>
        </tr>
    `).join('');
}

function renderPagination() {
    const totalPages = Math.ceil(allRows.length / PAGE_SIZE);
    const pag = document.getElementById('pagination');
    
    let html = `
        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-top:1rem">
            <button class="page-btn" onclick="goPage(${currentPage - 1})" ${currentPage === 0 ? 'disabled' : ''}>←</button>
            <span class="page-info">Página <strong>${currentPage + 1}</strong> de ${totalPages}</span>
            <button class="page-btn" onclick="goPage(${currentPage + 1})" ${currentPage === totalPages - 1 ? 'disabled' : ''}>→</button>
            <div style="margin-left:auto">
                Ir para: <input type="number" id="jumpPage" min="1" max="${totalPages}" 
                onchange="goPage(this.value - 1)" 
                style="width:60px; padding:6px; border:1px solid #ddd; border-radius:6px">
            </div>
        </div>
    `;
    pag.innerHTML = html;
}

window.goPage = (p) => {
    const totalPages = Math.ceil(allRows.length / PAGE_SIZE);
    if (p >= 0 && p < totalPages) {
        currentPage = p;
        renderTable();
        renderPagination();
    }
};

window.calcular = calcular;