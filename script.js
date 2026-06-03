/* ============================================================
   SCRIPT.JS — Simulador PRICE — Financiamento Imobiliário

   Estrutura do arquivo:
   1.  Estado global e constantes
   2.  Inicialização (DOMContentLoaded)
   3.  Máscaras de input (money, decimal, int, mmaaaa)
   4.  Leitura de valores (unmask)
   5.  Aceite dos termos (toggle do simulador)
   6.  Sync do valor financiado
   7.  Parcelas de entrada (dinâmicas)
   8.  Juros de obra (inputs dinâmicos por período)
   9.  Tipo de amortização extra (valor fixo vs %)
   10. Utilitário de formatação
   11. CÁLCULO PRINCIPAL (PRICE + IPCA + Obra + Amort. Extra)
   12. Fator PRICE (PMT)
   13. Renderização: cards de estatísticas
   14. Renderização: gráfico canvas
   15. Renderização: tabela paginada
   ============================================================ */


/* ============================================================
   1. ESTADO GLOBAL E CONSTANTES
   ============================================================ */

// Quantas linhas mostrar por página na tabela de parcelas
const PAGE_SIZE = 15;

// Armazena todas as linhas calculadas (obra + financiamento)
// Preenchido por calcular(), lido por renderTable()
let allRows = [];

// Página atual da tabela (0-indexed)
let currentPage = 0;


/* ============================================================
   2. INICIALIZAÇÃO
   Executa assim que o DOM estiver pronto.
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  setupMasks();              // aplica máscaras em todos os inputs com data-mask
  setupSyncListeners();      // recalcula "valor financiado" quando campos mudam
  setupEntradaListener();    // observa qtd de parcelas de entrada
  setupObraListener();       // observa período de obra para gerar inputs
  setupAmortTypeListener();  // troca rótulo/máscara do campo de amort. extra
});


/* ============================================================
   3. MÁSCARAS DE INPUT
   Cada input com data-mask recebe formatação automática.
   ============================================================ */

/**
 * Percorre todos os inputs com [data-mask] e aplica o listener
 * de formatação no evento "input" (dispara a cada tecla).
 */
function setupMasks() {
  document.querySelectorAll('[data-mask]').forEach(input => {
    input.addEventListener('input', () => {
      const mask = input.dataset.mask;
      if (mask === 'money')   applyMoneyMask(input);   // R$ 1.234,56
      if (mask === 'decimal') applyDecimalMask(input); // 10,50
      if (mask === 'int')     applyIntMask(input);     // 360
      if (mask === 'mmaaaa')  applyMmAaaa(input);      // 06/2026
    });
  });
}

/**
 * Máscara de moeda: "R$ 1.234,56"
 * Remove tudo que não é dígito, divide por 100 para obter centavos,
 * e formata com o locale brasileiro.
 */
function applyMoneyMask(el) {
  let v = el.value.replace(/\D/g, '');    // só dígitos
  if (!v) { el.value = ''; return; }
  el.value = 'R$ ' + (parseFloat(v) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Máscara decimal: "10,50"
 * Usada para percentuais (taxa de juros, IPCA, amort. %).
 */
function applyDecimalMask(el) {
  let v = el.value.replace(/\D/g, '');
  if (!v) { el.value = ''; return; }
  el.value = (parseFloat(v) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2
  });
}

/**
 * Máscara inteira: só aceita dígitos.
 * Usada para prazo (meses) e quantidade de parcelas.
 */
function applyIntMask(el) {
  el.value = el.value.replace(/\D/g, '');
}

/**
 * Máscara de data MM/AAAA: "06/2026"
 * Limita a 6 dígitos e insere a barra após o mês.
 */
function applyMmAaaa(el) {
  let v = el.value.replace(/\D/g, '').slice(0, 6); // máx 6 dígitos
  if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2); // insere "/"
  el.value = v;
}


/* ============================================================
   4. LEITURA DE VALORES (Unmask)
   Converte o texto formatado de volta para número.
   ============================================================ */

/**
 * Extrai número de um campo formatado como moeda.
 * "R$ 1.500,00" → 1500.00
 * Remove tudo exceto dígitos e vírgula, troca vírgula por ponto.
 */
function unmaskMoney(str) {
  if (!str) return 0;
  const clean = str.replace(/[^\d,]/g, '').replace(',', '.');
  return parseFloat(clean) || 0;
}

/**
 * Extrai número de um campo decimal formatado.
 * "10,50" → 10.50
 */
function unmaskDecimal(str) {
  if (!str) return 0;
  return parseFloat(str.replace(',', '.')) || 0;
}


/* ============================================================
   2. INICIALIZAÇÃO
   Executa assim que o DOM estiver pronto.
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  setupMasks();
  setupSyncListeners();
  setupEntradaListener();
  setupObraListener();
  setupAmortTypeListener();

  // Se já aceitou nesta sessão (ex: F5), não pede de novo
  if (sessionStorage.getItem('termosAceitos') === '1') {
    document.getElementById('simulatorArea').classList.remove('locked');
  } else {
    mostrarModalTermos();
  }
});


/* ============================================================
   TRATAMENTO GLOBAL DE ERROS
   Captura qualquer erro JS não tratado e exibe um toast
   informando o usuário sem expor stack trace técnico.
   ============================================================ */
window.addEventListener('error', (e) => {
  console.error('[Simulador] Erro:', e.message, e.lineno);

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      toast: true,
      position: 'bottom-end',
      icon: 'error',
      title: 'Algo deu errado. Verifique os campos.',
      showConfirmButton: false,
      timer: 5000,
      timerProgressBar: true,
      background: '#161b22',
      color: '#e6edf3',
      iconColor: '#f43f5e',
    });
  }
});

window.addEventListener('unhandledrejection', () => {
  console.error('[Simulador] Promise rejeitada sem tratamento.');
});


/* ============================================================
   5. MODAL DE TERMOS — SweetAlert2
   Aparece na abertura. Bloqueio total até aceite.
   ============================================================ */

/**
 * Exibe o modal de termos de uso via SweetAlert2.
 * allowOutsideClick/allowEscapeKey: false → não fecha sem escolher.
 * showDenyButton → botão "Não aceito" que ativa overlay de bloqueio.
 */
function mostrarModalTermos() {
  Swal.fire({
    icon: 'warning',
    title: '⚠️ Antes de continuar',
    html: `
      <div style="text-align:left">
        <p style="margin-bottom:0.8rem">
          Este é um <strong style="color:#e6edf3">simulador de planejamento pessoal</strong>,
          desenvolvido de forma independente, sem vínculo com qualquer instituição financeira.
        </p>
        <p style="margin-bottom:0.5rem"><strong style="color:#e6edf3">Este simulador NÃO:</strong></p>
        <ul style="margin-bottom:0.8rem;padding-left:1.2rem">
          <li>Replica o sistema oficial de nenhuma instituição financeira.</li>
          <li>Garante que os valores correspondam ao seu contrato real.</li>
          <li>Constitui consultoria financeira ou jurídica.</li>
        </ul>
        <p style="margin-bottom:0.8rem">
          Os índices (IPCA, INCC, juros) são informados manualmente.
          Os resultados são <strong style="color:#e6edf3">estimativas indicativas</strong> para planejamento.
        </p>
        <p style="margin-bottom:0.5rem"><strong style="color:#e6edf3">Ao aceitar, você declara que:</strong></p>
        <ul style="padding-left:1.2rem">
          <li>Compreende que os resultados são apenas para planejamento pessoal.</li>
          <li>O desenvolvedor não se responsabiliza por decisões financeiras tomadas com base nesta ferramenta.</li>
          <li>O uso é de sua inteira responsabilidade.</li>
        </ul>
      </div>
    `,
    confirmButtonText: '✓ Li e aceito os termos',
    denyButtonText: 'Não aceito',
    showDenyButton: true,
    showCloseButton: false,
    allowOutsideClick: false,
    allowEscapeKey: false,
    reverseButtons: true,
  }).then((result) => {
    if (result.isConfirmed) {
      // Libera o simulador e salva na sessão
      document.getElementById('simulatorArea').classList.remove('locked');
      sessionStorage.setItem('termosAceitos', '1');

      // Toast de boas-vindas
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Termos aceitos. Bom planejamento!',
        showConfirmButton: false,
        timer: 2500,
        timerProgressBar: true,
        background: '#161b22',
        color: '#e6edf3',
        iconColor: '#00d4aa',
      });

    } else {
      // Recusou: mostra overlay de bloqueio permanente
      // (pode ter vindo do botão "Ver e aceitar" do overlay — então volta o overlay)
      document.getElementById('blockedOverlay').classList.add('show');
    }
  });
}

/**
 * Compatibilidade: chamada pelo botão "Ver e aceitar" do overlay de bloqueio.
 * Esconde o overlay ANTES de abrir o SweetAlert, senão o overlay fica na frente.
 */
function toggleSimulator() {
  document.getElementById('blockedOverlay').classList.remove('show');
  mostrarModalTermos();
}



/* ============================================================
   6. SYNC DO VALOR FINANCIADO
   Recalcula "Valor Financiado" em tempo real sempre que
   imóvel, subsídio ou ato mudam.
   Fórmula: Financiado = Imóvel − Subsídio − Ato − Σ parcelas entrada
   ============================================================ */

/**
 * Configura listeners nos campos que afetam o valor financiado.
 */
function setupSyncListeners() {
  ['valorImovel', 'valorSubsidio', 'valorAto'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', syncFinanciado);
  });
}

/**
 * Calcula e atualiza o campo "valorFinanciado" (readonly).
 * Também atualiza a linha de info com percentuais.
 */
function syncFinanciado() {
  const iv  = unmaskMoney(document.getElementById('valorImovel').value);
  const sub = unmaskMoney(document.getElementById('valorSubsidio').value);
  const ato = unmaskMoney(document.getElementById('valorAto').value);

  // Soma todas as parcelas de entrada digitadas
  const totalParcelasEntrada = somarParcelasEntrada();

  const totalEntrada = ato + totalParcelasEntrada;
  const fin = Math.max(0, iv - sub - totalEntrada);  // nunca negativo

  // Atualiza campo readonly
  const elFin = document.getElementById('valorFinanciado');
  elFin.value = fin > 0 ? formatMoney(fin) : '';

  // Linha de info: mostra percentuais de entrada e financiado
  const info = document.getElementById('infoEntrada');
  if (iv > 0 && info) {
    const pctEn  = ((totalEntrada / iv) * 100).toFixed(1);
    const pctFin = ((fin / iv) * 100).toFixed(1);
    info.innerHTML =
      `Entrada total: <span>${formatMoney(totalEntrada)}</span> (${pctEn}%)` +
      ` · Financiado: <span>${pctFin}%</span>`;
  }
}


/* ============================================================
   7. PARCELAS DE ENTRADA — DINÂMICAS
   Quando o usuário informa a quantidade de parcelas,
   gera inputs individuais para cada uma.
   ============================================================ */

/**
 * Observa os campos de quantidade e valor padrão.
 */
function setupEntradaListener() {
  document.getElementById('nParcelasEntrada')
    .addEventListener('input', gerarParcelasEntrada);
  document.getElementById('valorPadraoParcelaEntrada')
    .addEventListener('input', preencherPadraoEntrada);
}

/**
 * Gera N inputs de parcela de entrada.
 * Preserva valores já digitados se o usuário só mudou a quantidade.
 */
function gerarParcelasEntrada() {
  const n    = parseInt(document.getElementById('nParcelasEntrada').value) || 0;
  const wrap = document.getElementById('parcelasEntradaWrap');
  const grid = document.getElementById('parcelasEntradaGrid');

  // Se N = 0, esconde a área e limpa o grid
  if (n <= 0) {
    wrap.classList.remove('visible');
    grid.innerHTML = '';
    syncFinanciado();
    return;
  }

  // Salva valores existentes para restaurar após re-render
  const existentes = Array.from(grid.querySelectorAll('input')).map(el => el.value);

  wrap.classList.add('visible');
  grid.innerHTML = '';  // limpa para re-renderizar

  const padrao = document.getElementById('valorPadraoParcelaEntrada').value;

  // Cria um campo por parcela
  for (let i = 1; i <= n; i++) {
    const field = document.createElement('div');
    field.className = 'field';

    const lbl = document.createElement('label');
    lbl.textContent = `Parcela ${i}`;

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.dataset.mask = 'money';
    inp.placeholder = padrao || 'R$ 0,00';

    // Restaura valor anterior se existia
    if (existentes[i - 1]) inp.value = existentes[i - 1];

    // A cada digitação: aplica máscara e recalcula financiado
    inp.addEventListener('input', () => {
      applyMoneyMask(inp);
      syncFinanciado();
      atualizarInfoEntrada();
    });

    field.appendChild(lbl);
    field.appendChild(inp);
    grid.appendChild(field);
  }

  syncFinanciado();
  atualizarInfoEntrada();
}

/**
 * Quando o usuário digita o valor padrão, aplica em TODOS os inputs
 * de parcela de entrada de uma vez.
 */
function preencherPadraoEntrada() {
  const padraoRaw = document.getElementById('valorPadraoParcelaEntrada').value;

  document.querySelectorAll('#parcelasEntradaGrid input').forEach(inp => {
    inp.value = padraoRaw;
    applyMoneyMask(inp);
    inp.placeholder = padraoRaw ? '' : 'R$ 0,00';
  });

  syncFinanciado();
  atualizarInfoEntrada();
}

/**
 * Retorna array com o valor numérico de cada parcela de entrada.
 * Se o campo estiver vazio, usa o valor padrão.
 */
function valoresParcelasEntrada() {
  const padrao = unmaskMoney(document.getElementById('valorPadraoParcelaEntrada').value);
  return Array.from(document.querySelectorAll('#parcelasEntradaGrid input')).map(inp => {
    const v = unmaskMoney(inp.value);
    return v > 0 ? v : padrao;  // fallback para o padrão
  });
}

/** Soma o total das parcelas de entrada. */
function somarParcelasEntrada() {
  return valoresParcelasEntrada().reduce((acc, v) => acc + v, 0);
}

/**
 * Atualiza a linha de info detalhando: ato + parcelas = total entrada.
 */
function atualizarInfoEntrada() {
  const total = somarParcelasEntrada();
  const ato   = unmaskMoney(document.getElementById('valorAto').value);
  const info  = document.getElementById('infoEntradaDetalhe');
  if (info) {
    info.innerHTML = total > 0
      ? `Ato: <span>${formatMoney(ato)}</span>` +
        ` + Parcelas: <span>${formatMoney(total)}</span>` +
        ` = Total Entrada: <span>${formatMoney(ato + total)}</span>`
      : '';
  }
}


/* ============================================================
   8. JUROS DE OBRA — INPUTS DINÂMICOS
   Gera um input de R$ por mês no período informado.
   O usuário copia os valores da curva teórica da construtora.
   ============================================================ */

/**
 * Observa os campos de data de início e fim da obra.
 */
function setupObraListener() {
  document.getElementById('obraInicio').addEventListener('input', gerarJurosObraInputs);
  document.getElementById('obraFim').addEventListener('input', gerarJurosObraInputs);
}

/**
 * Quando início e fim são válidos (MM/AAAA), gera um input por mês.
 * Cada input aceita o valor em R$ de juros daquele mês.
 */
function gerarJurosObraInputs() {
  const inicioStr = document.getElementById('obraInicio').value;
  const fimStr    = document.getElementById('obraFim').value;
  const wrap = document.getElementById('jurosObraWrap');
  const grid = document.getElementById('jurosObraGrid');

  // Valida formato MM/AAAA
  const re = /^(\d{2})\/(\d{4})$/;
  if (!re.test(inicioStr) || !re.test(fimStr)) {
    wrap.classList.remove('visible');
    grid.innerHTML = '';
    return;
  }

  // Converte MM/AAAA para "meses totais desde o ano 0" para facilitar a iteração
  const [, mi, ai] = inicioStr.match(re).map((x, i) => i === 0 ? x : parseInt(x));
  const [, mf, af] = fimStr.match(re).map((x, i)   => i === 0 ? x : parseInt(x));

  const dInicio = ai * 12 + (mi - 1);
  const dFim    = af * 12 + (mf - 1);

  // Fim deve ser posterior ao início
  if (dFim <= dInicio) {
    wrap.classList.remove('visible');
    grid.innerHTML = '';
    return;
  }

  const nMeses = dFim - dInicio;
  wrap.classList.add('visible');

  // Preserva valores digitados anteriormente
  const existentes = Array.from(grid.querySelectorAll('input')).map(el => el.value);
  grid.innerHTML = '';

  const nomesMeses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  // Um input por mês de obra
  for (let i = 0; i < nMeses; i++) {
    const totalMeses = dInicio + i;
    const ano  = Math.floor(totalMeses / 12);
    const mes  = totalMeses % 12;

    const field = document.createElement('div');
    field.className = 'field';

    const lbl = document.createElement('label');
    lbl.textContent = `${nomesMeses[mes]}/${ano} — Juros (R$)`;

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.dataset.mask = 'money';
    inp.placeholder = 'R$ 0,00';
    inp.dataset.mesObra = i;  // índice do mês para referência

    if (existentes[i]) inp.value = existentes[i];

    inp.addEventListener('input', () => {
      applyMoneyMask(inp);
      atualizarInfoObra();
    });

    field.appendChild(lbl);
    field.appendChild(inp);
    grid.appendChild(field);
  }

  atualizarInfoObra();
}

/**
 * Atualiza a linha de info com o total de juros de obra digitados.
 */
function atualizarInfoObra() {
  const total = somarJurosObra();
  const info  = document.getElementById('infoObraTotal');
  if (!info) return;
  info.innerHTML =
    `Total juros de obra digitados: <span style="color:var(--accent)">${formatMoney(total)}</span>`;
}

/** Soma todos os juros de obra digitados. */
function somarJurosObra() {
  return Array.from(document.querySelectorAll('#jurosObraGrid input'))
    .reduce((acc, inp) => acc + unmaskMoney(inp.value), 0);
}

/**
 * Retorna array com os valores mensais de juros de obra em R$.
 * Usado diretamente no cálculo — valores já em reais, sem conversão.
 */
function jurosObraArray() {
  return Array.from(document.querySelectorAll('#jurosObraGrid input'))
    .map(inp => unmaskMoney(inp.value));
}

/**
 * UTILITÁRIO DE CONSOLE — preenche os juros de obra via código.
 * Cole no console do browser quando a área de obra já estiver visível.
 *
 * Exemplo (Vibra Parque Vila Sônia):
 *   setObraConsole([390.89, 406.11, 436.56, ...])
 *
 * @param {number[]} valores - Array de juros mensais em R$
 */
function setObraConsole(valores) {
  const inputs = document.querySelectorAll('#jurosObraGrid input');

  if (inputs.length === 0) {
    console.warn('[setObraConsole] Nenhum input de obra encontrado. Preencha o período primeiro.');
    return;
  }

  if (valores.length !== inputs.length) {
    console.warn(`[setObraConsole] ${valores.length} valores para ${inputs.length} meses.`);
  }

  // Formata cada número como "R$ 390,89" e insere no input
  inputs.forEach((inp, i) => {
    const v = valores[i] ?? 0;
    inp.value = 'R$ ' + v.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  });

  atualizarInfoObra();
  console.log(`[setObraConsole] OK. Total: ${formatMoney(somarJurosObra())}`);
}


/* ============================================================
   9. TIPO DE AMORTIZAÇÃO EXTRA
   Alterna entre valor fixo (R$) e percentual do saldo.
   ============================================================ */

/**
 * Quando o select de tipo muda, atualiza label e máscara do campo.
 */
function setupAmortTypeListener() {
  document.getElementById('tipoAmort').addEventListener('change', () => {
    const tipo = document.getElementById('tipoAmort').value;
    const lbl  = document.getElementById('labelAmortExtra');
    const inp  = document.getElementById('valorAmortExtra');

    if (tipo === 'pct') {
      lbl.textContent  = 'Amort. Extra Mensal (% do saldo)';
      inp.dataset.mask = 'decimal';  // formata como "1,00"
      inp.placeholder  = '1,00';
      inp.value        = '';
    } else {
      lbl.textContent  = 'Amort. Extra Mensal (R$)';
      inp.dataset.mask = 'money';    // formata como "R$ 500,00"
      inp.placeholder  = 'R$ 500,00';
      inp.value        = '';
    }
  });
}


/* ============================================================
   10. UTILITÁRIO DE FORMATAÇÃO
   ============================================================ */

/**
 * Formata número como moeda brasileira.
 * Ex: 1234.56 → "R$ 1.234,56"
 */
function formatMoney(v) {
  return 'R$ ' + v.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}


/* ============================================================
   11. CÁLCULO PRINCIPAL
   Ponto de entrada: chamado pelo botão "Simular Financiamento".

   FLUXO GERAL:
   ① Lê e valida todos os inputs
   ② Calcula taxa mensal equivalente
   ③ Calcula PMT (prestação PRICE)
   ④ FASE OBRA: registra juros mensais (sem amortização)
   ⑤ FASE FINANCIAMENTO: loop mês a mês com IPCA + amort. extra
   ⑥ Calcula estatísticas finais
   ⑦ Renderiza: stats, gráfico, barra de progresso, tabela
   ============================================================ */
function calcular() {

  /* ① LEITURA DOS INPUTS ------------------------------------ */
  const valorFinanciado = unmaskMoney(document.getElementById('valorFinanciado').value);
  const prazoTotal      = parseInt(document.getElementById('prazo').value) || 0;
  const jurosAnoStr     = document.getElementById('jurosAno').value.replace(',', '.');
  const jurosAno        = parseFloat(jurosAnoStr) / 100;

  // IPCA mensal: 0 = sem correção (prefixado), > 0 = indexado
  const ipcaMensalStr   = document.getElementById('ipcaMensal').value.replace(',', '.');
  const ipcaMensal      = parseFloat(ipcaMensalStr) / 100 || 0;

  // Tipo e valor da amortização extra
  const tipoAmort       = document.getElementById('tipoAmort').value;
  const amortExtraInput = document.getElementById('valorAmortExtra').value;
  const amortExtraFixo  = tipoAmort === 'valor' ? unmaskMoney(amortExtraInput) : 0;
  const amortExtraPct   = tipoAmort === 'pct'   ? unmaskDecimal(amortExtraInput) / 100 : 0;

  // Intervalo de aplicação da amortização extra (mínimo 1)
  const intervaloAmort  = Math.max(1, parseInt(document.getElementById('intervaloAmort').value) || 1);

  /* Validação básica: campos obrigatórios */
  if (!valorFinanciado || !prazoTotal || !jurosAno) {
    alert('Preencha: Valor Financiado, Prazo e Taxa de Juros.');
    return;
  }

  /* ② TAXA MENSAL EQUIVALENTE --------------------------------
     Fórmula: i_mensal = (1 + i_anual)^(1/12) − 1
     Para taxa efetiva anual (juros compostos).
     Se o contrato usar taxa nominal: substitua por jurosAno / 12. */
  const jurosMes = Math.pow(1 + jurosAno, 1 / 12) - 1;

  /* ③ PRESTAÇÃO PRICE (PMT) ---------------------------------
     PMT = PV × [ i(1+i)^n ] / [ (1+i)^n − 1 ]
     Calculada sobre o valor financiado inicial.
     PRICE = prestação CONSTANTE. O IPCA e a amort. extra
     mudam o saldo, mas não alteram o PMT. */
  const fatorPrice    = calcularFatorPrice(jurosMes, prazoTotal);
  const prestacaoFixa = valorFinanciado * fatorPrice;

  /* Dados de juros de obra (se área visível e preenchida) */
  const obraAtiva  = document.getElementById('jurosObraWrap').classList.contains('visible');
  const jurosObra  = obraAtiva ? jurosObraArray() : [];
  const nMesesObra = jurosObra.length;

  /* Array de resultados: uma entrada por mês (obra + financiamento) */
  allRows = [];

  let saldo          = valorFinanciado;
  let totalJuros     = 0;      // juros pagos na fase de financiamento
  let totalAmortEx   = 0;      // total amortizado via extra
  let totalPago      = 0;      // tudo que saiu do bolso (obra + prestações + extras)
  let totalJurosObra = 0;      // total de juros de obra
  let mesesAmortNeg  = 0;      // quantos meses tiveram amortização negativa

  /* ④ FASE OBRA ----------------------------------------------
     Durante a obra o banco cobra só juros sobre o saldo liberado.
     O usuário informa o valor em R$ de cada mês (da curva da construtora).
     Reconstruímos o saldo implícito: saldo = juros / taxa. */
  if (obraAtiva && nMesesObra > 0) {
    let saldoObraAnterior = 0;

    for (let i = 0; i < nMesesObra; i++) {
      const jurosDoMesObra = jurosObra[i];  // R$ conforme tabela da construtora

      // Saldo implícito neste mês: se juros=0, mantém o anterior
      const saldoObraAtual = jurosDoMesObra > 0
        ? jurosDoMesObra / jurosMes
        : saldoObraAnterior;

      // Liberação do mês = diferença entre saldo atual e anterior
      const liberado = Math.max(0, saldoObraAtual - saldoObraAnterior);

      totalJurosObra += jurosDoMesObra;
      totalPago      += jurosDoMesObra;

      // Registra linha na tabela
      allRows.push({
        n:          i + 1,
        fase:       'obra',
        saldoIni:   saldoObraAnterior,
        amort:      0,             // sem amortização na obra
        liberado:   liberado,      // crédito liberado este mês
        juros:      jurosDoMesObra,
        parcela:    jurosDoMesObra, // na obra, parcela = só juros
        amortExtra: 0,
        saldo:      saldoObraAtual
      });

      saldoObraAnterior = saldoObraAtual;
    }

    // Após a obra, saldo = total liberado (usado como PV do PRICE)
    saldo = saldoObraAnterior;
  }

  /* ⑤ FASE FINANCIAMENTO (PRICE + IPCA) --------------------
     A cada mês:
     1. IPCA corrije o saldo (incide antes dos juros — contrato Cláusula 2ª §6)
     2. Juros incidem sobre o saldo já corrigido
     3. Amortização = PMT − juros (pode ser negativa se IPCA alto)
     4. Se negativa: saldo cresce (amortização negativa)
     5. Amortização extra é ACUMULADA e aplicada no intervalo definido */

  const inicioFinanc  = nMesesObra;
  let acumuladoExtra  = 0;   // valor acumulado entre aplicações de amort. extra

  // Saldo paralelo sem amortização extra: usado apenas no gráfico
  let saldoSemExtra   = saldo;
  const saldosSemExtra = [];

  for (let m = 0; m < prazoTotal; m++) {
    if (saldo < 0.01) break;  // saldo zerado antes do prazo → quitou

    const saldoIni = saldo;

    /* 1. IPCA corrije o saldo antes dos juros */
    const saldoCorrigido = saldo * (1 + ipcaMensal);

    /* 2. Juros sobre saldo já corrigido */
    const jurosDoMes = saldoCorrigido * jurosMes;

    /* 3. Amortização normal = PMT − juros */
    let amortNormal = prestacaoFixa - jurosDoMes;
    const amortNeg  = amortNormal < 0;  // flag de amortização negativa

    if (amortNeg) {
      /* Amortização negativa: saldo cresce além do que a prestação paga.
         Ocorre quando IPCA é alto e o PMT não cobre nem os juros corrigidos.
         Registramos o mês como 0 amortização e o saldo cresce. */
      saldo = saldoCorrigido + Math.abs(amortNormal);
      amortNormal = 0;
      mesesAmortNeg++;
    } else {
      /* Amortização positiva: limita ao saldo para não ir negativo */
      amortNormal = Math.min(amortNormal, saldoCorrigido);
      saldo = Math.max(0, saldoCorrigido - amortNormal);
    }

    /* Parcela do mês = amortização + juros */
    const parcelaMes = amortNormal + jurosDoMes;

    /* Acumula amortização extra */
    if (amortExtraFixo > 0)   acumuladoExtra += amortExtraFixo;
    else if (amortExtraPct > 0) acumuladoExtra += saldoIni * amortExtraPct;

    /* 5. Aplica acumulado no mês do intervalo */
    let amortExtra = 0;
    if (acumuladoExtra > 0 && ((m + 1) % intervaloAmort === 0)) {
      amortExtra       = Math.min(acumuladoExtra, saldo); // não passa do saldo
      saldo           -= amortExtra;
      totalAmortEx    += amortExtra;
      acumuladoExtra   = 0;  // zera o cofrinho
    }

    saldo = Math.max(0, Number(saldo.toFixed(2)));

    totalJuros += jurosDoMes;
    totalPago  += parcelaMes + amortExtra;

    // Registra linha na tabela
    allRows.push({
      n:          inicioFinanc + m + 1,
      fase:       'financ',
      saldoIni:   saldoIni,
      amort:      amortNormal,
      liberado:   0,
      juros:      jurosDoMes,
      parcela:    parcelaMes,
      amortExtra: amortExtra,
      saldo:      saldo
    });

    /* Saldo paralelo (sem amort. extra) — também aplica IPCA */
    const saldoSemCorr = saldoSemExtra * (1 + ipcaMensal);
    const jSemExtra    = saldoSemCorr * jurosMes;
    let   aNSemExtra   = Math.min(prestacaoFixa - jSemExtra, saldoSemCorr);
    if (aNSemExtra < 0) aNSemExtra = 0;  // amort. negativa no paralelo também
    saldoSemExtra = Math.max(0, Number((saldoSemCorr - aNSemExtra).toFixed(2)));
    saldosSemExtra.push(saldoSemExtra);

    if (saldo <= 0.01) break;  // quitou com amort. extra
  }

  /* ⑥ ESTATÍSTICAS FINAIS ----------------------------------- */
  const rowsFinanc        = allRows.filter(r => r.fase === 'financ');
  const parcelasEfetivas  = rowsFinanc.length;
  const mesesEconomizados = prazoTotal - parcelasEfetivas;

  /* ⑦ RENDERIZAÇÃO ------------------------------------------ */
  renderStats({
    parcelasEfetivas,
    mesesEconomizados,
    totalPago,
    totalJuros,
    totalJurosObra,
    totalAmortEx,
    prestacaoInicial: rowsFinanc[0]?.parcela || 0,
    valorFinanciado,
    temObra:     obraAtiva && nMesesObra > 0,
    ipcaMensal,
    mesesAmortNeg
  });

  renderGrafico(rowsFinanc, saldosSemExtra, valorFinanciado);

  // Barra de progresso (só se economizou meses)
  const progressWrap = document.getElementById('progressWrap');
  if (mesesEconomizados > 0 && prazoTotal > 0) {
    progressWrap.style.display = 'block';
    const pct = Math.min(100, (mesesEconomizados / prazoTotal) * 100).toFixed(1);
    document.getElementById('progressBar').style.width   = pct + '%';
    document.getElementById('progressLabel').innerText   = `${pct}% de redução (${mesesEconomizados} meses)`;
  } else {
    progressWrap.style.display = 'none';
  }

  // Reseta paginação e renderiza primeira página
  currentPage = 0;
  renderTable();
  renderPagination();

  // Mostra área de resultados e scrolla até ela
  const res = document.getElementById('results');
  if (res) {
    res.style.display = 'block';
    res.scrollIntoView({ behavior: 'smooth' });
  }
}


/* ============================================================
   12. FATOR PRICE (PMT/PV)
   ============================================================ */

/**
 * Calcula o coeficiente de financiamento PRICE.
 * Representa quanto de PMT por unidade de PV.
 * PMT = PV × calcularFatorPrice(i, n)
 *
 * Fórmula: i(1+i)^n / [(1+i)^n − 1]
 *
 * @param {number} i - taxa mensal (ex: 0.009489 para 12% aa)
 * @param {number} n - número de parcelas (ex: 420 para 35 anos)
 * @returns {number} fator multiplicador
 */
function calcularFatorPrice(i, n) {
  // Casos degenerados: sem taxa ou sem prazo
  if (n <= 0 || i <= 0) return 1 / Math.max(n, 1);
  const fator = Math.pow(1 + i, n);  // (1+i)^n
  return (i * fator) / (fator - 1);
}


/* ============================================================
   13. RENDERIZAÇÃO — CARDS DE ESTATÍSTICAS
   ============================================================ */

/**
 * Preenche o grid #statsGrid com cards de resumo.
 * Cada card tem um label e um valor colorido.
 *
 * @param {Object} s - objeto com todas as estatísticas calculadas
 */
function renderStats(s) {
  const grid = document.getElementById('statsGrid');
  if (!grid) return;

  const anos  = Math.floor(s.parcelasEfetivas / 12);
  const meses = s.parcelasEfetivas % 12;

  // Define os cards a exibir (condicionais para obra, IPCA e amort. negativa)
  const items = [
    { label: 'TEMPO FINANCIAMENTO', value: `${anos > 0 ? anos + 'a ' : ''}${meses}m`, cls: 'accent' },
    { label: 'MESES ECONOMIZADOS',  value: `${s.mesesEconomizados} meses`,             cls: 'accent' },
    { label: 'PRESTAÇÃO INICIAL',   value: formatMoney(s.prestacaoInicial),            cls: 'blue'   },
    { label: 'TOTAL A PAGAR',       value: formatMoney(s.totalPago),                   cls: 'danger' },
    { label: 'JUROS FINANCIAMENTO', value: formatMoney(s.totalJuros),                  cls: 'warn'   },

    // Card de juros de obra: só aparece se houver obra configurada
    ...(s.temObra
      ? [{ label: 'JUROS DE OBRA', value: formatMoney(s.totalJurosObra), cls: 'warn' }]
      : []),

    { label: 'TOTAL AMORT. EXTRAS', value: formatMoney(s.totalAmortEx),    cls: 'accent' },
    { label: 'VALOR FINANCIADO',    value: formatMoney(s.valorFinanciado), cls: ''       },

    // Card de IPCA: só aparece se IPCA > 0
    ...(s.ipcaMensal > 0
      ? [{ label: 'IPCA MENSAL APLICADO', value: (s.ipcaMensal * 100).toFixed(2) + '%', cls: 'warn' }]
      : []),

    // Card de amortização negativa: alerta em vermelho se ocorreu
    ...(s.mesesAmortNeg > 0
      ? [{ label: '⚠️ AMORT. NEGATIVA', value: `${s.mesesAmortNeg} meses`, cls: 'danger' }]
      : []),
  ];

  // Renderiza cada card como HTML
  grid.innerHTML = items.map(item => `
    <div class="stat-card">
      <div class="stat-label">${item.label}</div>
      <div class="stat-value ${item.cls}">${item.value}</div>
    </div>
  `).join('');
}


/* ============================================================
   14. RENDERIZAÇÃO — GRÁFICO CANVAS
   Canvas nativo, sem bibliotecas externas.

   Plota 3 linhas:
   - Verde (#00d4aa): saldo COM amortização extra
   - Vermelho tracejado: saldo SEM amortização extra (só se diferente)
   - Amarelo: juros acumulados pagos
   ============================================================ */
function renderGrafico(rowsFinanc, saldosSemExtra, valorInicial) {
  const wrap   = document.getElementById('graficoWrap');
  const canvas = document.getElementById('graficoSaldo');
  if (!wrap || !canvas || rowsFinanc.length === 0) return;

  wrap.style.display = 'block';

  // Aguarda o browser calcular o layout para obter a largura real do canvas
  requestAnimationFrame(() => {
    const dpr = window.devicePixelRatio || 1;  // DPR para telas retina
    const W   = canvas.offsetWidth || 800;
    const H   = 280;

    // Define tamanho físico do canvas (multiplicado pelo DPR)
    canvas.style.height = H + 'px';
    canvas.width        = W * dpr;
    canvas.height       = H * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);  // escala o contexto para DPR

    // Padding interno (espaço para labels dos eixos)
    const pad = { top: 20, right: 20, bottom: 40, left: 75 };
    const gW  = W - pad.left - pad.right;    // largura útil do gráfico
    const gH  = H - pad.top  - pad.bottom;  // altura útil do gráfico

    // Séries de dados
    const saldosComExtra = rowsFinanc.map(r => r.saldo);

    // Só desenha linha SEM extra se houver diferença real entre elas
    const temExtra = saldosSemExtra.length > 0 &&
      saldosSemExtra.some((v, i) => Math.abs(v - (saldosComExtra[i] || 0)) > 1);

    // Juros acumulados mês a mês (soma progressiva)
    const jurosAcum = rowsFinanc.reduce((acc, r, i) => {
      acc.push((acc[i - 1] || 0) + r.juros);
      return acc;
    }, []);

    const nPontos  = Math.max(saldosComExtra.length, saldosSemExtra.length);
    const maxJuros = jurosAcum[jurosAcum.length - 1] || 0;
    const maxY     = Math.max(valorInicial, maxJuros);  // referência do eixo Y

    // Funções de escala: converte valor → coordenada em pixels
    const xScale = i => pad.left + (i / Math.max(nPontos - 1, 1)) * gW;
    const yScale = v => pad.top  + gH - (Math.max(0, v) / maxY) * gH;

    /* FUNDO do gráfico */
    ctx.fillStyle = 'rgba(26,34,53,0.5)';
    ctx.fillRect(pad.left, pad.top, gW, gH);

    /* GRID HORIZONTAL — 5 linhas com labels de valor */
    for (let i = 0; i <= 4; i++) {
      const y   = pad.top + (gH / 4) * i;
      const val = maxY - (maxY / 4) * i;

      // Linha de grade
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth   = 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + gW, y);
      ctx.stroke();

      // Label do eixo Y (simplificado: "k" para milhares)
      ctx.fillStyle = 'rgba(100,116,139,0.9)';
      ctx.font      = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(
        'R$' + (val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val.toFixed(0)),
        pad.left - 6,
        y + 4
      );
    }

    /* Função auxiliar para desenhar uma linha no canvas */
    function linha(dados, cor, tracejado, espessura) {
      if (!dados || dados.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = cor;
      ctx.lineWidth   = espessura || 2;
      ctx.setLineDash(tracejado ? [6, 4] : []);
      dados.forEach((v, i) => {
        const x = xScale(i), y = yScale(v);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);  // reseta o traço
    }

    /* ÁREA PREENCHIDA sob a linha de saldo com extra */
    ctx.beginPath();
    saldosComExtra.forEach((v, i) => {
      const x = xScale(i), y = yScale(v);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(xScale(saldosComExtra.length - 1), pad.top + gH);
    ctx.lineTo(xScale(0), pad.top + gH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,212,170,0.07)';
    ctx.fill();

    /* LINHA SEM EXTRA (tracejada, vermelho) — só se houver diferença */
    if (temExtra) {
      linha(saldosSemExtra, 'rgba(244,63,94,0.55)', true, 1.5);
    }

    /* LINHA DE JUROS ACUMULADOS (amarelo) */
    linha(jurosAcum, 'rgba(245,158,11,0.65)', false, 1.5);

    /* LINHA DE SALDO COM EXTRA (verde, mais grossa, por cima de tudo) */
    linha(saldosComExtra, '#00d4aa', false, 2.5);

    /* LABELS DO EIXO X (meses) */
    ctx.fillStyle = 'rgba(100,116,139,0.9)';
    ctx.textAlign = 'center';
    ctx.font      = '10px JetBrains Mono, monospace';
    const step = Math.max(1, Math.ceil(nPontos / 6));  // no máx. 6 labels
    for (let i = 0; i < nPontos; i += step) {
      ctx.fillText(i + 'm', xScale(i), pad.top + gH + 16);
    }
    // Sempre mostra o último mês
    if ((nPontos - 1) % step !== 0) {
      ctx.fillText(nPontos + 'm', xScale(nPontos - 1), pad.top + gH + 16);
    }
  });
}


/* ============================================================
   15. RENDERIZAÇÃO — TABELA PAGINADA
   Exibe PAGE_SIZE linhas por página.
   ============================================================ */

/**
 * Renderiza a página atual da tabela de parcelas.
 * Lê allRows[] e exibe apenas o slice da página atual.
 */
function renderTable() {
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;

  const start    = currentPage * PAGE_SIZE;
  const pageRows = allRows.slice(start, start + PAGE_SIZE);

  tbody.innerHTML = pageRows.map(r => {
    const isObra = r.fase === 'obra';

    // Classe da linha: obra (fundo amarelado) ou amort. extra (fundo verde)
    const rowCls = isObra
      ? 'row-obra'
      : (r.amortExtra > 0 ? 'row-amort' : '');

    // Badge de fase
    const faseBadge = isObra
      ? '<span class="phase-tag obra">OBRA</span>'
      : '<span class="phase-tag financ">FINANC.</span>';

    // Na fase obra, a coluna "Amortização" mostra o crédito liberado
    const amortCell = isObra
      ? `<span style="color:var(--warn)">${formatMoney(r.liberado)}</span>`
      : formatMoney(r.amort);

    return `
      <tr class="${rowCls}">
        <td>${r.n}</td>
        <td>${faseBadge}</td>
        <td>${formatMoney(r.saldoIni)}</td>
        <td>${amortCell}</td>
        <td class="val-interest">${formatMoney(r.juros)}</td>
        <td>${formatMoney(r.parcela)}</td>
        <td class="val-amort">${r.amortExtra > 0 ? formatMoney(r.amortExtra) : '—'}</td>
        <td>${formatMoney(r.saldo)}</td>
      </tr>
    `;
  }).join('');
}

/**
 * Renderiza os botões de navegação entre páginas.
 * Botões «/‹ para voltar, ›/» para avançar.
 */
function renderPagination() {
  const pag = document.getElementById('pagination');
  if (!pag) return;

  const totalPages = Math.ceil(allRows.length / PAGE_SIZE);
  if (totalPages <= 1) { pag.innerHTML = ''; return; }

  pag.innerHTML = `
    <button class="page-btn" onclick="goPage(0)"
      ${currentPage === 0 ? 'disabled' : ''}>«</button>
    <button class="page-btn" onclick="goPage(${currentPage - 1})"
      ${currentPage === 0 ? 'disabled' : ''}>‹</button>
    <span class="page-info">${currentPage + 1} / ${totalPages}</span>
    <button class="page-btn" onclick="goPage(${currentPage + 1})"
      ${currentPage === totalPages - 1 ? 'disabled' : ''}>›</button>
    <button class="page-btn" onclick="goPage(${totalPages - 1})"
      ${currentPage === totalPages - 1 ? 'disabled' : ''}>»</button>
  `;
}

/**
 * Navega para uma página específica e re-renderiza tabela + paginação.
 * @param {number} p - índice da página (0-indexed)
 */
function goPage(p) {
  const totalPages = Math.ceil(allRows.length / PAGE_SIZE);
  if (p < 0 || p >= totalPages) return;
  currentPage = p;
  renderTable();
  renderPagination();
}