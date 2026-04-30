/**
 * --- CONFIGURAÇÕES GLOBAIS ---
 */
const PAGE_SIZE = 12; 
let allRows = [];     
let currentPage = 0;  

document.addEventListener('DOMContentLoaded', () => {
    setupMasks();
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

function applyIntMask(i) { 
    i.value = i.value.replace(/\D/g, ''); 
}

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
 * --- CÁLCULO DE FINANCIAMENTO ---
 */
function calcular() {
    const valorFinanciado = unmask(document.getElementById('valorFinanciado').value);
    const prazoTotal = parseInt(document.getElementById('prazo').value) || 0;
    const jurosAnoStr = document.getElementById('jurosAno').value.replace(',', '.');
    const jurosAno = parseFloat(jurosAnoStr) / 100;
    
    const v1Digitado = unmask(document.getElementById('valorPrimeiraParcela').value);
    const vExtraMensal = unmask(document.getElementById('valorMensalExtra').value);
    const intervalo = parseInt(document.getElementById('intervaloAmort').value) || 1;

    if (!valorFinanciado || !prazoTotal || !jurosAno) {
        alert("Preencha os campos obrigatórios.");
        return;
    }

    // MUDANÇA CRÍTICA: Conversão Simples (Padrão SAC CEF/Bancos)
    // 12% ao ano = 1% ao mês exato.
    const jurosMes = jurosAno / 12;
    const amortBase = Number((valorFinanciado / prazoTotal).toFixed(2));

    // Localizar o mês de início
    let mesInicio = 1;
    if (v1Digitado > 0) {
        let menorDiff = Infinity;
        for (let i = 1; i <= prazoTotal; i++) {
            let saldoSimulado = valorFinanciado - (amortBase * (i - 1));
            let parcelaSimulada = amortBase + (saldoSimulado * jurosMes);
            let diff = Math.abs(parcelaSimulada - v1Digitado);
            if (diff < menorDiff) {
                menorDiff = diff;
                mesInicio = i;
            }
        }
    }

    let saldoDevedor = valorFinanciado - (amortBase * (mesInicio - 1));
    let totalJuros = 0, totalAmortExtra = 0, totalPago = 0, contadorMeses = 0;
    let acumuladoExtra = 0;
    allRows = [];

    const prazoRestanteTeorico = (prazoTotal - mesInicio + 1);

    for (let m = mesInicio; m <= prazoTotal; m++) {
        if (saldoDevedor < 0.01) break;

        let jurosDoMes = Number((saldoDevedor * jurosMes).toFixed(2));
        let amortDoMes = Math.min(amortBase, saldoDevedor);
        let parcelaNormal = amortDoMes + jurosDoMes;

        saldoDevedor = Number((saldoDevedor - amortDoMes).toFixed(2));
        
        let amortExtraEfetiva = 0;
        acumuladoExtra += vExtraMensal; 
        
        if (vExtraMensal > 0 && (contadorMeses + 1) % intervalo === 0) {
            amortExtraEfetiva = Math.min(acumuladoExtra, saldoDevedor);
            saldoDevedor = Number((saldoDevedor - amortExtraEfetiva).toFixed(2));
            totalAmortExtra += amortExtraEfetiva;
            acumuladoExtra = 0; 
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
            saldo: saldoDevedor
        });
    }

    renderStats({
        parcelasEfetivas: contadorMeses,
        mesesEconomizados: prazoRestanteTeorico - contadorMeses,
        totalPago, totalJuros, totalAmortExtra,
        v1: allRows[0]?.parcela || 0,
        vLast: allRows[allRows.length - 1]?.parcela || 0,
        valorFinanciado
    });

    renderProgress(prazoRestanteTeorico, (prazoRestanteTeorico - contadorMeses));
    currentPage = 0;
    renderTable();
    renderPagination();
    
    const res = document.getElementById('results');
    if(res) { res.style.display = 'block'; res.scrollIntoView({behavior:'smooth'}); }
}

function renderStats(s) {
    const grid = document.getElementById('statsGrid');
    if (!grid) return;
    const anos = Math.floor(s.parcelasEfetivas / 12);
    const meses = s.parcelasEfetivas % 12;

    const items = [
        { label: 'TEMPO RESTANTE', value: `${anos > 0 ? anos+'a ' : ''}${meses}m`, cls: 'accent' },
        { label: 'ECONOMIA', value: `${s.mesesEconomizados} meses`, cls: 'accent' },
        { label: 'TOTAL A PAGAR', value: `R$ ${centavosToStr(s.totalPago)}`, cls: 'danger' },
        { label: 'TOTAL JUROS', value: `R$ ${centavosToStr(s.totalJuros)}`, cls: 'warn' },
        { label: '1ª PARCELA', value: `R$ ${centavosToStr(s.v1)}`, cls: '' },
        { label: 'ÚLTIMA PARCELA', value: `R$ ${centavosToStr(s.vLast)}`, cls: '' }
    ];

    grid.innerHTML = items.map(i => `
        <div class="stat-card">
            <div class="stat-label">${i.label}</div>
            <div class="stat-value ${i.cls}">${i.value}</div>
        </div>
    `).join('');
}

function renderTable() {
    const tbody = document.querySelector('table tbody');
    if (!tbody) return;
    const start = currentPage * PAGE_SIZE;
    const pageRows = allRows.slice(start, start + PAGE_SIZE);

    tbody.innerHTML = pageRows.map(r => `
        <tr class="${r.amortExtra > 0 ? 'row-amort' : ''}">
            <td>${r.n}</td>
            <td>R$ ${centavosToStr(r.amort)}</td>
            <td>R$ ${centavosToStr(r.juros)}</td>
            <td>R$ ${centavosToStr(r.parcela)}</td>
            <td class="val-amort">${r.amortExtra > 0 ? 'R$ '+centavosToStr(r.amortExtra) : '—'}</td>
            <td>R$ ${centavosToStr(r.saldo)}</td>
        </tr>
    `).join('');
}

function renderPagination() {
    const pag = document.getElementById('pagination');
    if (!pag) return;
    const totalPages = Math.ceil(allRows.length / PAGE_SIZE);
    if (totalPages <= 1) { pag.innerHTML = ''; return; }

    pag.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px; margin-top:1rem; justify-content:center">
            <button class="page-btn" onclick="goPage(${currentPage - 1})" ${currentPage === 0 ? 'disabled' : ''}>←</button>
            <span class="page-info">${currentPage + 1} / ${totalPages}</span>
            <button class="page-btn" onclick="goPage(${currentPage + 1})" ${currentPage === totalPages - 1 ? 'disabled' : ''}>→</button>
        </div>
    `;
}

function renderProgress(teorico, economia) {
    const bar = document.getElementById('progressBar');
    if (!bar || teorico <= 0) return;
    const pct = Math.min(100, (economia / teorico) * 100).toFixed(1);
    bar.style.width = pct + '%';
    document.getElementById('progressLabel').innerText = pct + '% de redução';
}

function goPage(p) { 
    currentPage = p; 
    renderTable(); 
    renderPagination(); 
}