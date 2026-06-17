/* ============================================================
   SCRIPT.JS — Comportamento de interface (sem motor de cálculo)

   ESCOPO DESTE ARQUIVO:
     ✓ Modal de Termos de Uso + tela de bloqueio (SweetAlert2)
     ✓ Exibir/ocultar os blocos de campos que nascem escondidos
       (Parcelas da Entrada, Juros de Obra)
     ✓ Tabelas de Entrada / Obras / Obras+Entrada — são só o eco
       organizado do que já foi digitado nos cards de cima. A
       correção da Entrada segue a Cláusula 4.1 do contrato real
       (INCC-DI/FGV, com a defasagem de 2 meses) — você digita a
       variação mensal do índice, o resto é matemática simples,
       não é o motor de financiamento
     ✓ Abas da Tabela de Parcelas (Anexo III)
     ✓ Exportar PDF / Excel — leem o HTML já renderizado na tela,
       não dependem de nenhuma lógica de cálculo financeiro

   FORA DO ESCOPO (de propósito):
     ✗ Máscaras de digitação (R$ / % / data) — os inputs aceitam
       texto livre por enquanto.
     ✗ Sincronismo do "Valor Financiado" (Cláusula 1).
     ✗ Tabela "Financiamento" (Anexo III, aba 4) e calcular() —
       o motor PRICE/IPCA/correção anual. Fica um stub no fim do
       arquivo só pra não estourar erro no console.
   ============================================================ */


/* ------------------------------------------------------------
   1. TERMOS DE USO — modal de aceite obrigatório

   A página nasce com o simulador bloqueado (classe "locked" em
   #simulatorArea, já no HTML). O usuário só libera o uso
   aceitando o modal abaixo. Se recusar, a tela cheia
   #blockedOverlay aparece travando o acesso até ele decidir
   de novo (botão dela chama mostrarModalTermos() outra vez).
   ------------------------------------------------------------ */

// Dispara o modal automaticamente quando a página carrega
function iniciarTermos() {
  mostrarModalTermos();
}

// Também é chamada pelo botão dentro do #blockedOverlay
// (veja o onclick="mostrarModalTermos()" no HTML)
function mostrarModalTermos() {
  // Em vez de duplicar o texto dos termos aqui, puxa direto das
  // 5 seções já escritas no rodapé (.terms-footer) — assim só
  // existe um lugar pra editar o texto, e os dois ficam sempre
  // sincronizados
  const secoes = [...document.querySelectorAll('.terms-footer .terms-section')]
    .map((secao) => secao.outerHTML)
    .join('');

  Swal.fire({
    icon: 'warning',
    title: 'Termos de Uso',
    html: `
      <p>Este simulador é uma ferramenta de planejamento pessoal e os
      resultados são <strong>estimativas</strong> — não substituem
      consultoria profissional.</p>
      <hr style="border-color:var(--border);margin:1rem 0">
      ${secoes}
    `,
    showDenyButton: true,
    confirmButtonText: 'Aceito, continuar',
    denyButtonText: 'Não aceito',
    allowOutsideClick: false,   // obriga a escolher um dos botões
    allowEscapeKey: false
  }).then((resultado) => {
    if (resultado.isConfirmed) {
      liberarSimulador();
    } else {
      // "Não aceito" -> mantém travado e mostra a tela de bloqueio
      bloquearSimulador();
    }
  });
}

// Libera o simulador: remove a opacidade/travamento e some
// com a tela de bloqueio cheia, se estiver visível
function liberarSimulador() {
  document.getElementById('simulatorArea').classList.remove('locked');
  document.getElementById('blockedOverlay').classList.remove('show');
}

// Mostra a tela de bloqueio cheia (chamada quando o usuário
// recusa os termos)
function bloquearSimulador() {
  document.getElementById('blockedOverlay').classList.add('show');
}


/* ------------------------------------------------------------
   2. UTILITÁRIOS DE DATA E NÚMERO
   Usados tanto pela Entrada quanto pelos Juros de Obra — por
   isso ficam num lugar só, em vez de duplicados em cada seção.
   ------------------------------------------------------------ */

// Converte "MM/AAAA" em {mes, ano}, ou null se o texto não
// fizer sentido (mês fora de 1–12, ano sem 4 dígitos, etc.)
function parseMmAaaa(texto) {
  const partes = (texto || '').split('/');
  if (partes.length !== 2) return null;

  const mes = parseInt(partes[0], 10);
  const ano = parseInt(partes[1], 10);

  if (!mes || !ano || mes < 1 || mes > 12 || partes[1].length !== 4) return null;

  return { mes, ano };
}

// Transforma {mes, ano} num índice absoluto de meses (ex: Jan/2024
// = 2024*12+0) — facilita somar/subtrair meses sem ficar tratando
// virada de ano na mão
function indiceAbsoluto(p) {
  return p.ano * 12 + (p.mes - 1);
}

// Caminho inverso: de um índice absoluto pro rótulo "Mar/2026"
const NOMES_MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
function rotuloMesAno(indice) {
  const ano = Math.floor(indice / 12);
  const mes = ((indice % 12) + 12) % 12; // protege contra índice negativo
  return `${NOMES_MESES[mes]}/${ano}`;
}

// Lê um texto e devolve número. Aceita "1500", "1500,50" ou
// "R$ 1.500,50" — remove tudo que não for dígito/vírgula antes
// de converter.
function parseValorSimples(texto) {
  if (!texto) return 0;
  const limpo = texto.replace(/[^\d,]/g, '').replace(',', '.');
  return parseFloat(limpo) || 0;
}

function formatMoney(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Mesma ideia do parseValorSimples, mas pra campos de % (ex: "0,80"
// vira 0.008 em decimal — já pronto pra multiplicar em (1+variacao))
function parsePercentSimples(texto) {
  if (!texto) return 0;
  const limpo = texto.replace(/[^\d,]/g, '').replace(',', '.');
  return (parseFloat(limpo) || 0) / 100;
}

function formatPct(fator) {
  // fator = 1.02 -> "+2,0%"; fator = 1 -> "—"
  if (fator === 1) return '—';
  return `+${((fator - 1) * 100).toFixed(1)}%`;
}


/* ------------------------------------------------------------
   3. PARCELAS DA ENTRADA (Cláusula 2)

   Esses inputs não existem até o usuário informar quantas
   parcelas a entrada vai ter. A cada mudança em
   "nParcelasEntrada", o grid é reconstruído do zero — é a forma
   mais simples de manter a quantidade de campos sempre igual ao
   número digitado, sem ficar comparando "tinha 5, agora tem 3,
   remove 2"...

   A correção segue a Cláusula 4.1 do contrato real (INCC-DI/FGV,
   até o Habite-se): cada parcela usa a variação acumulada do
   índice entre o "índice-base" (2º mês anterior à assinatura) e
   o índice do 2º mês anterior ao vencimento da própria parcela.
   Isso é só a defasagem de 2 meses deslocando a janela — não tem
   nada além disso de "fórmula secreta". Como o índice-base não
   tem variação própria (é só o ponto de partida), a 1ª parcela
   nunca corrige (fator 1); a 2ª usa 1 mês de variação digitada,
   a 3ª usa 2 meses, e assim por diante — sempre os primeiros N
   valores do grid do INCC, na ordem em que foram digitados.

   SIMPLIFICAÇÃO ASSUMIDA: isso cobre só a fase INCC-DI. Se a
   entrada se estender além do Habite-se (pouco provável, já que
   entrada normalmente termina antes da obra acabar), faltaria
   trocar para IPCA — não implementado aqui.
   ------------------------------------------------------------ */

function setupEntradaListener() {
  document.getElementById('nParcelasEntrada')
    .addEventListener('input', gerarParcelasEntrada);

  // Quando o valor padrão muda, preenche os campos de parcela
  // que ainda estiverem vazios
  document.getElementById('valorPadraoParcelaEntrada')
    .addEventListener('input', preencherPadraoEntrada);

  // Mesma ideia, mas pra taxa de correção do INCC-DI — sem isso,
  // quem não digitar mês a mês fica com 0% e a correção nunca
  // aparece (foi exatamente o que confundiu no teste)
  document.getElementById('inccTaxaPadrao')
    .addEventListener('input', preencherPadraoIncc);

  // A Data de Assinatura também redefine a janela de meses do
  // grid do INCC-DI (ela é a referência do índice-base)
  document.getElementById('dataAssinatura')
    .addEventListener('input', gerarInccInputs);

  // Ato, FGTS e Extra só afetam o resumo/tabelas, não a estrutura
  ['valorAto', 'valorFgts', 'valorExtra'].forEach((id) => {
    document.getElementById(id).addEventListener('input', atualizarTudoEntrada);
  });
}

function gerarParcelasEntrada() {
  const qtd  = parseInt(document.getElementById('nParcelasEntrada').value) || 0;
  const wrap = document.getElementById('parcelasEntradaWrap');
  const grid = document.getElementById('parcelasEntradaGrid');

  // Sem quantidade válida -> esconde tudo e limpa o grid
  if (qtd <= 0) {
    wrap.classList.remove('visible');
    grid.innerHTML = '';
    gerarInccInputs();   // a janela do INCC depende da quantidade também
    return;
  }

  grid.innerHTML = '';
  for (let i = 1; i <= qtd; i++) {
    const campo = document.createElement('div');
    campo.className = 'field';
    campo.innerHTML = `
      <label>Parcela ${i}</label>
      <input type="text"
             class="parcela-entrada-input"
             id="parcelaEntrada_${i}"
             placeholder="R$ 0,00">
    `;
    grid.appendChild(campo);
  }

  // Cada parcela nova também atualiza o resumo/tabelas ao ser digitada
  grid.querySelectorAll('.parcela-entrada-input').forEach((input) => {
    input.addEventListener('input', atualizarTudoEntrada);
  });

  wrap.classList.add('visible');
  preencherPadraoEntrada();   // já aplica o valor padrão, se houver
  gerarInccInputs();          // reconstrói a janela de meses do INCC-DI
}

// Constrói o grid de variação mensal do INCC-DI. Precisa de qtd >= 2
// (com 1 parcela só, não existe variação de índice pra digitar — ela
// nunca corrige, é o próprio mês-base) e de uma Data de Assinatura
// válida pra saber os rótulos de mês/ano de cada campo.
function gerarInccInputs() {
  const assinatura = parseMmAaaa(document.getElementById('dataAssinatura').value);
  const qtd  = parseInt(document.getElementById('nParcelasEntrada').value) || 0;
  const wrap = document.getElementById('inccWrap');
  const grid = document.getElementById('inccGrid');

  if (!assinatura || qtd < 2) {
    wrap.classList.remove('visible');
    grid.innerHTML = '';
    atualizarTudoEntrada();
    return;
  }

  // Índice-base = 2º mês anterior à assinatura (cláusula 4.1.1.a).
  // A janela de campos vai de (índiceBase+1) até (índiceBase+qtd-1),
  // que são exatamente os meses usados pela última parcela.
  const indiceBase = indiceAbsoluto(assinatura) - 2;

  grid.innerHTML = '';
  for (let k = 0; k < qtd - 1; k++) {
    const mes = indiceBase + 1 + k;

    const campo = document.createElement('div');
    campo.className = 'field';
    campo.innerHTML = `
      <label>${rotuloMesAno(mes)}</label>
      <input type="text"
             class="incc-input"
             id="incc_${k}"
             placeholder="0,80">
    `;
    grid.appendChild(campo);
  }

  grid.querySelectorAll('.incc-input').forEach((input) => {
    input.addEventListener('input', atualizarTudoEntrada);
  });

  wrap.classList.add('visible');
  preencherPadraoIncc();      // já aplica a taxa padrão, se houver
  atualizarTudoEntrada();     // garante o refresh mesmo sem taxa padrão definida
}

// Preenche com a taxa padrão só os campos do INCC ainda vazios —
// igual ao preencherPadraoEntrada(), não sobrescreve o que já foi
// digitado mês a mês com o índice real
function preencherPadraoIncc() {
  const padrao = document.getElementById('inccTaxaPadrao').value;
  if (!padrao) return;

  document.querySelectorAll('.incc-input').forEach((input) => {
    if (!input.value) input.value = padrao;
  });

  atualizarTudoEntrada();
}

// Preenche com o valor padrão só as parcelas ainda vazias —
// não sobrescreve o que o usuário já digitou manualmente
function preencherPadraoEntrada() {
  const padrao = document.getElementById('valorPadraoParcelaEntrada').value;
  if (!padrao) return;

  document.querySelectorAll('.parcela-entrada-input').forEach((input) => {
    if (!input.value) input.value = padrao;
  });

  atualizarTudoEntrada();
}

// Atalho: tudo que precisa ser recalculado quando algo da
// Entrada muda — resumo em texto + as duas tabelas que dependem
// dela (Entrada e Obras+Entrada)
function atualizarTudoEntrada() {
  atualizarInfoEntradaDetalhe();
  renderizarTabelaEntrada();
  renderizarTabelaObrasEntrada();
}

// Soma Ato + FGTS + Extra + todas as parcelas digitadas (já
// corrigidas) e mostra o total na linha de informação — só
// exibição, sem abater nada de fato
function atualizarInfoEntradaDetalhe() {
  const info = document.getElementById('infoEntradaDetalhe');
  const itens = montarItensEntrada();

  if (itens.length === 0) {
    info.innerHTML = '';
    return;
  }

  const ato    = itens.find(i => i.tipo === 'Ato')?.corrigido    || 0;
  const fgts   = itens.find(i => i.tipo === 'FGTS')?.corrigido   || 0;
  const extra  = itens.find(i => i.tipo === 'Extra')?.corrigido  || 0;
  const parcelas = itens.filter(i => i.tipo === 'Parcela').reduce((s, i) => s + i.corrigido, 0);
  const total = itens.reduce((s, i) => s + i.corrigido, 0);

  info.innerHTML = `
    Ato: <span>${formatMoney(ato)}</span> ·
    FGTS: <span>${formatMoney(fgts)}</span> ·
    Extra: <span>${formatMoney(extra)}</span> ·
    Parcelas: <span>${formatMoney(parcelas)}</span> ·
    Total da entrada: <span>${formatMoney(total)}</span>
  `;
}

// Monta a lista de itens da entrada (ato/fgts/extra/parcelas) já
// com mês/ano e valor corrigido — usada pela tabela da aba
// "Entrada" e pelo resumo em texto, pra não calcular tudo 2x
function montarItensEntrada() {
  const assinatura = parseMmAaaa(document.getElementById('dataAssinatura').value);
  if (!assinatura) return []; // sem data de assinatura não dá pra datar nada

  const mesBase = indiceAbsoluto(assinatura);
  const itens = [];

  const ato   = parseValorSimples(document.getElementById('valorAto').value);
  const fgts  = parseValorSimples(document.getElementById('valorFgts').value);
  const extra = parseValorSimples(document.getElementById('valorExtra').value);

  // Pontuais: pagos no mês da assinatura, sem correção (fator 1)
  if (ato   > 0) itens.push({ tipo: 'Ato',   mes: mesBase, base: ato,   fator: 1, corrigido: ato });
  if (fgts  > 0) itens.push({ tipo: 'FGTS',  mes: mesBase, base: fgts,  fator: 1, corrigido: fgts });
  if (extra > 0) itens.push({ tipo: 'Extra', mes: mesBase, base: extra, fator: 1, corrigido: extra });

  // Parcelas: a 1ª cai no mês da assinatura (fator 1). Cada parcela
  // seguinte acumula mais um mês de variação do INCC-DI digitado —
  // a parcela N usa exatamente os primeiros (N-1) campos do grid,
  // na ordem em que aparecem (ver gerarInccInputs() pra entender
  // por que isso reproduz a defasagem de 2 meses do contrato).
  const variacoesIncc = [...document.querySelectorAll('.incc-input')]
    .map((input) => parsePercentSimples(input.value));

  document.querySelectorAll('.parcela-entrada-input').forEach((input, i) => {
    const base = parseValorSimples(input.value);

    let fator = 1;
    for (let k = 0; k < i; k++) {
      fator *= (1 + (variacoesIncc[k] || 0));
    }
    fator = Math.max(fator, 1); // cláusula 4.1.1.d — nunca deflaciona abaixo do original

    itens.push({
      tipo: 'Parcela',
      label: `Parcela ${i + 1}`,
      mes: mesBase + i,
      base,
      fator,
      corrigido: base * fator
    });
  });

  return itens;
}

// Preenche a aba "Entrada" do Anexo III com ato/fgts/extra/parcelas
function renderizarTabelaEntrada() {
  const tbody = document.getElementById('tableBodyEntrada');
  const itens = montarItensEntrada();

  if (itens.length === 0) {
    tbody.innerHTML = '';
    return;
  }

  let html = '';
  let total = 0;

  itens.forEach((item) => {
    total += item.corrigido;
    html += `
      <tr>
        <td>${item.label || item.tipo}</td>
        <td>${rotuloMesAno(item.mes)}</td>
        <td>${formatMoney(item.base)}</td>
        <td>${formatPct(item.fator)}</td>
        <td>${formatMoney(item.corrigido)}</td>
      </tr>
    `;
  });

  html += `
    <tr class="row-total">
      <td colspan="4">Total da Entrada</td>
      <td>${formatMoney(total)}</td>
    </tr>
  `;

  tbody.innerHTML = html;
}


/* ------------------------------------------------------------
   4. JUROS DE OBRA (Cláusula 4)

   Também nascem escondidos. Só aparecem quando Início e Fim da
   obra (MM/AAAA) formam um período válido — aí é gerado um
   input por mês dentro desse intervalo, com o rótulo já
   mostrando o mês/ano correspondente.
   ------------------------------------------------------------ */

function setupObraListener() {
  document.getElementById('obraInicio').addEventListener('input', gerarJurosObraInputs);
  document.getElementById('obraFim').addEventListener('input', gerarJurosObraInputs);
}

function gerarJurosObraInputs() {
  const inicio = parseMmAaaa(document.getElementById('obraInicio').value);
  const fim    = parseMmAaaa(document.getElementById('obraFim').value);
  const wrap   = document.getElementById('jurosObraWrap');
  const grid   = document.getElementById('jurosObraGrid');

  let totalMeses = 0;
  if (inicio && fim) {
    totalMeses = indiceAbsoluto(fim) - indiceAbsoluto(inicio) + 1;
  }

  // Período inválido, incompleto ou invertido -> esconde e limpa
  if (!inicio || !fim || totalMeses <= 0) {
    wrap.classList.remove('visible');
    grid.innerHTML = '';
    atualizarTudoObras();
    return;
  }

  grid.innerHTML = '';
  for (let i = 0; i < totalMeses; i++) {
    const indice = indiceAbsoluto(inicio) + i;

    const campo = document.createElement('div');
    campo.className = 'field';
    campo.innerHTML = `
      <label>${rotuloMesAno(indice)}</label>
      <input type="text"
             class="juros-obra-input"
             id="jurosObra_${i}"
             placeholder="R$ 0,00">
    `;
    grid.appendChild(campo);
  }

  grid.querySelectorAll('.juros-obra-input').forEach((input) => {
    input.addEventListener('input', atualizarTudoObras);
  });

  wrap.classList.add('visible');
  atualizarTudoObras();
}

// Atalho: tudo que precisa ser recalculado quando algo da Obra
// muda — resumo em texto + as duas tabelas que dependem dela
function atualizarTudoObras() {
  atualizarInfoObra();
  renderizarTabelaObras();
  renderizarTabelaObrasEntrada();
}

// Soma os juros de obra já digitados — de novo, só exibição
function atualizarInfoObra() {
  const info = document.getElementById('infoObraTotal');
  const itens = montarItensObra();

  if (itens.length === 0) {
    info.innerHTML = '';
    return;
  }

  const total = itens.reduce((s, i) => s + i.valor, 0);
  info.innerHTML = `Total de juros de obra informado: <span>${formatMoney(total)}</span>`;
}

// Monta a lista de meses de obra com valor digitado — usada pela
// tabela da aba "Obras" e pelo cruzamento "Obras+Entrada"
function montarItensObra() {
  const inicio = parseMmAaaa(document.getElementById('obraInicio').value);
  if (!inicio) return [];

  const mesBase = indiceAbsoluto(inicio);
  const itens = [];

  document.querySelectorAll('.juros-obra-input').forEach((input, i) => {
    const valor = parseValorSimples(input.value);
    if (valor > 0) {
      itens.push({ mes: mesBase + i, valor });
    }
  });

  return itens;
}

// Preenche a aba "Obras" do Anexo III com os juros mês a mês
function renderizarTabelaObras() {
  const tbody = document.getElementById('tableBodyObras');
  const itens = montarItensObra();

  if (itens.length === 0) {
    tbody.innerHTML = '';
    return;
  }

  let html = '';
  let acumulado = 0;

  itens.forEach((item) => {
    acumulado += item.valor;
    html += `
      <tr>
        <td>${rotuloMesAno(item.mes)}</td>
        <td>${formatMoney(item.valor)}</td>
        <td>${formatMoney(acumulado)}</td>
      </tr>
    `;
  });

  html += `
    <tr class="row-total">
      <td>Total</td>
      <td>${formatMoney(acumulado)}</td>
      <td></td>
    </tr>
  `;

  tbody.innerHTML = html;
}


/* ------------------------------------------------------------
   5. OBRAS + ENTRADA — cruzamento por mês (aba 3 do Anexo III)

   Pega os itens já calculados pela Entrada e pelos Juros de
   Obra e monta uma linha do tempo única, mês a mês, mostrando
   os dois lado a lado. Não inventa nenhuma conta nova — só
   organiza o que já existe nas duas seções anteriores.
   ------------------------------------------------------------ */

function renderizarTabelaObrasEntrada() {
  const tbody = document.getElementById('tableBodyObrasEntrada');

  const itensEntrada = montarItensEntrada(); // [{mes, corrigido, ...}]
  const itensObra    = montarItensObra();    // [{mes, valor}]

  if (itensEntrada.length === 0 && itensObra.length === 0) {
    tbody.innerHTML = '';
    return;
  }

  // Agrupa por mês absoluto, somando entrada e obra separadamente
  const porMes = new Map(); // mes -> { entrada, obra }

  itensEntrada.forEach((item) => {
    const atual = porMes.get(item.mes) || { entrada: 0, obra: 0 };
    atual.entrada += item.corrigido;
    porMes.set(item.mes, atual);
  });

  itensObra.forEach((item) => {
    const atual = porMes.get(item.mes) || { entrada: 0, obra: 0 };
    atual.obra += item.valor;
    porMes.set(item.mes, atual);
  });

  // Preenche os meses "vazios" no meio do intervalo, pra mostrar
  // a linha do tempo cheia, não só os meses com pagamento
  const meses = [...porMes.keys()];
  const min = Math.min(...meses);
  const max = Math.max(...meses);

  let html = '';
  let totalEntrada = 0;
  let totalObra = 0;

  for (let m = min; m <= max; m++) {
    const valores = porMes.get(m) || { entrada: 0, obra: 0 };
    const totalMes = valores.entrada + valores.obra;
    totalEntrada += valores.entrada;
    totalObra += valores.obra;

    html += `
      <tr>
        <td>${rotuloMesAno(m)}</td>
        <td>${valores.entrada > 0 ? formatMoney(valores.entrada) : '—'}</td>
        <td>${valores.obra > 0 ? formatMoney(valores.obra) : '—'}</td>
        <td>${formatMoney(totalMes)}</td>
      </tr>
    `;
  }

  html += `
    <tr class="row-total">
      <td>Total</td>
      <td>${formatMoney(totalEntrada)}</td>
      <td>${formatMoney(totalObra)}</td>
      <td>${formatMoney(totalEntrada + totalObra)}</td>
    </tr>
  `;

  tbody.innerHTML = html;
}


/* ------------------------------------------------------------
   6. ABAS DO ANEXO III
   Só troca qual <div class="tab-panel"> fica visível — quem
   preenche cada uma são as funções renderizar*() de cima
   (a aba "Financiamento" fica vazia até calcular() existir).
   ------------------------------------------------------------ */

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach((botao) => {
    botao.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.style.display = 'none');

      botao.classList.add('active');
      document.getElementById(botao.dataset.target).style.display = '';
    });
  });
}


/* ------------------------------------------------------------
   7. EXPORTAÇÃO (PDF / Excel)
   Os dois leem o HTML já renderizado na tela — não dependem de
   nenhuma lógica de cálculo financeiro, só do que já está nos
   cards e nas tabelas no momento do clique.
   ------------------------------------------------------------ */

// Lê os cards do Anexo I (Resumo) e gera um PDF simples com
// "label: valor" linha a linha
function exportarResumoPDF() {
  if (!window.jspdf) {
    console.warn('jsPDF não carregou — verifique a conexão com o CDN.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 20;

  doc.setFontSize(16);
  doc.text('Resumo da Simulação — Financiamento Imobiliário', 14, y);
  y += 8;

  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 14, y);
  y += 12;

  doc.setTextColor(20);
  doc.setFontSize(12);

  const cards = document.querySelectorAll('#statsGrid .stat-card');

  if (cards.length === 0) {
    doc.text('Nenhum resultado calculado ainda.', 14, y);
  } else {
    cards.forEach((card) => {
      const label = card.querySelector('.stat-label')?.textContent.trim() || '';
      const value = card.querySelector('.stat-value')?.textContent.trim() || '';
      doc.text(`${label}: ${value}`, 14, y);
      y += 8;
      if (y > 280) { doc.addPage(); y = 20; } // pula de página se não couber
    });
  }

  doc.save('resumo-simulacao.pdf');
}

// Exporta as 4 tabelas do Anexo III num único Excel, cada uma
// numa planilha. table_to_sheet lê o <table> direto do DOM,
// funciona mesmo com a aba escondida (display:none)
function exportarTabelas() {
  if (!window.XLSX) {
    console.warn('SheetJS não carregou — verifique a conexão com o CDN.');
    return;
  }

  const abas = [
    { id: 'tableEntrada',       nome: 'Entrada' },
    { id: 'tableObras',         nome: 'Obras' },
    { id: 'tableObrasEntrada',  nome: 'Obras+Entrada' },
    { id: 'tableFinanciamento', nome: 'Financiamento' }
  ];

  const wb = XLSX.utils.book_new();

  abas.forEach(({ id, nome }) => {
    const tabela = document.getElementById(id);
    const ws = XLSX.utils.table_to_sheet(tabela);
    XLSX.utils.book_append_sheet(wb, ws, nome);
  });

  XLSX.writeFile(wb, 'tabelas-financiamento.xlsx');
}


/* ------------------------------------------------------------
   8. CALCULAR() — propositalmente vazio
   O motor de cálculo (PRICE, correção anual em janeiro, juros
   compostos, amortização extra etc.) é a parte que você vai
   escrever. Esse stub só evita erro no console quando "Simular
   Financiamento →" for clicado, e também não preenche a aba
   "Financiamento" do Anexo III.
   ------------------------------------------------------------ */
function calcular() {
  console.warn('calcular() ainda não foi implementado — esse é o motor que você vai escrever.');
}


/* ------------------------------------------------------------
   9. INICIALIZAÇÃO
   ------------------------------------------------------------ */
document.addEventListener('DOMContentLoaded', () => {
  iniciarTermos();
  setupEntradaListener();
  setupObraListener();
  setupTabs();
});
