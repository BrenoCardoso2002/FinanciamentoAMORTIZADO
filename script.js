/* ================================================================
   UTILITÁRIOS — FONTE ÚNICA
   (antes existiam 3 cópias de formatarMoeda/desformatarMoeda/
   formatarMesAno espalhadas pelo arquivo, e duas funções fazendo
   a mesma coisa: formatarNumero e formatarQuantidade. Agora só
   existe um lugar pra cada coisa.)
   ================================================================ */
const Utils = {
  moeda: {
    // Máscara de input tipo "centavos invertidos": digita 1234 -> R$ 12,34
    formatar(texto) {
      const numeros = String(texto).replace(/\D/g, '');
      if (!numeros) return 'R$ 0,00';
      const valor = parseFloat(numeros) / 100;
      return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    },
    // Converte "R$ 1.234,56" -> 1234.56 (number puro, pronto pra conta)
    desformatar(textoFormatado) {
      if (!textoFormatado) return 0;
      const limpo = String(textoFormatado).replace(/[^0-9,]/g, '').replace(',', '.');
      const numero = parseFloat(limpo);
      return isNaN(numero) ? 0 : numero;
    }
  },

  data: {
    // Digita 062026 -> mostra 06/2026
    formatarMesAno(texto) {
      const numeros = String(texto).replace(/\D/g, '').substring(0, 6);
      return numeros.length > 2 ? numeros.slice(0, 2) + '/' + numeros.slice(2) : numeros;
    }
  },

  numero: {
    // Inteiro positivo sem zero à esquerda. Usado em "quantidade de parcelas".
    formatarQuantidade(texto) {
      let numeros = String(texto).replace(/\D/g, '');
      if (numeros.startsWith('0')) numeros = numeros.replace(/^0+/, '');
      return numeros;
    },

    // Mesma lógica de máscara do campo de moeda (dígitos digitados =
    // casas decimais), só que termina em "%" em vez de começar com "R$".
    // Ex: digitar 1 -> "0,01%", digitar 100 -> "1,00%", digitar 150 -> "1,50%".
    formatarPercentual(texto) {
      const numeros = String(texto).replace(/\D/g, '');
      if (!numeros) return '';
      const valor = parseFloat(numeros) / 100;
      return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
    },

    // "1,50%" -> 0.015 (decimal pronto pra usar em Math.pow)
    percentualParaDecimal(texto) {
      if (!texto) return 0;
      const limpo = String(texto).replace(/[^0-9,]/g, '').replace(',', '.');
      const valor = parseFloat(limpo);
      return isNaN(valor) ? 0 : valor / 100;
    },

    // CORREÇÃO COMPOSTA: cada parcela = valorBase * (1 + taxa) ^ índice
    // Exemplo (valorBase=1000, taxa=0.01): 1000, 1010, 1020.1, 1030.301...
    // Isso é exatamente a conta que você descreveu no pedido.
    calcularSerieComposta(valorBase, taxaDecimal, quantidade) {
      const serie = [];
      for (let i = 0; i < quantidade; i++) {
        serie.push(valorBase * Math.pow(1 + taxaDecimal, i));
      }
      return serie;
    }
  }
};

/* ================================================================
   TERMOS DE USO — modal de aceite obrigatório
   (sem mudanças de lógica aqui, só mantido pra arquivo ficar completo)
   ================================================================ */
function iniciarTermos() {
  mostrarModalTermos();
}

function mostrarModalTermos() {
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
    allowOutsideClick: false,
    allowEscapeKey: false
  }).then((resultado) => {
    if (resultado.isConfirmed) {
      liberarSimulador();
    } else {
      bloquearSimulador();
    }
  });
}

function liberarSimulador() {
  document.getElementById('simulatorArea').classList.remove('locked');
  document.getElementById('blockedOverlay').classList.remove('show');
}

function bloquearSimulador() {
  document.getElementById('blockedOverlay').classList.add('show');
}

/* ================================================================
   01. DADOS DO IMÓVEL
   ================================================================ */
const camposCalculo = document.querySelectorAll("#valorImovel, #valorSubsidio");

camposCalculo.forEach(campo => {
  campo.addEventListener('input', (evento) => {
    evento.target.value = Utils.moeda.formatar(evento.target.value);
    syncFinanciado();
  });
});

// BUG CORRIGIDO: essa função (antes calculaValorFinanciadoBruto) escrevia
// o resultado em #valorFinanciado, mas o HTML reserva esse id pro valor
// LÍQUIDO (depois de abater a entrada) e tem um #valorBrutoFinanciado
// separado pro bruto. Além disso, o líquido nunca era calculado — o
// HTML já comentava esperar uma função chamada syncFinanciado().
function syncFinanciado() {
  const imovel = Utils.moeda.desformatar(document.getElementById("valorImovel")?.value);
  const subsidio = Utils.moeda.desformatar(document.getElementById("valorSubsidio")?.value);

  let bruto = imovel - subsidio;
  if (bruto < 0) bruto = 0; // subsídio maior que o imóvel não existe na prática

  const brutoInput = document.getElementById("valorBrutoFinanciado");
  if (brutoInput) brutoInput.value = Utils.moeda.formatar(bruto.toFixed(2));

  // Tudo que já foi pago de entrada abate o valor bruto financiado:
  // ato + fgts + extra + soma de cada parcela de entrada já gerada
  // (lidas direto da tela, então refletem edição manual do usuário).
  const ato = Utils.moeda.desformatar(document.getElementById("valorAto")?.value);
  const fgts = Utils.moeda.desformatar(document.getElementById("valorFgts")?.value);
  const extra = Utils.moeda.desformatar(document.getElementById("valorExtra")?.value);

  let somaParcelas = 0;
  document.querySelectorAll('.parcela-entrada-input').forEach((input) => {
    somaParcelas += Utils.moeda.desformatar(input.value);
  });

  const totalEntradaPaga = ato + fgts + extra + somaParcelas;

  let liquido = bruto - totalEntradaPaga;
  if (liquido < 0) liquido = 0; // entrada maior que o bruto não existe na prática

  const financiadoInput = document.getElementById("valorFinanciado");
  if (financiadoInput) financiadoInput.value = Utils.moeda.formatar(liquido.toFixed(2));

  // % entrada / % financiado em relação ao valor total do imóvel
  const infoEntrada = document.getElementById("infoEntrada");
  if (infoEntrada) {
    if (imovel > 0) {
      const pctEntrada = (totalEntradaPaga / imovel) * 100;
      const pctFinanciado = (liquido / imovel) * 100;
      infoEntrada.innerHTML =
        `Entrada: <span>${pctEntrada.toFixed(1)}%</span> do imóvel` +
        ` · Financiado: <span>${pctFinanciado.toFixed(1)}%</span> do imóvel`;
    } else {
      infoEntrada.innerHTML = '';
    }
  }
}

// Lê o total efetivamente pago de entrada (mesma soma de dentro de
// syncFinanciado) — reaproveitado pelo motor de cálculo e pela tabela
// "Entrada" mais abaixo, pra não duplicar essa conta em 3 lugares.
function obterTotalEntradaPaga() {
  const ato = Utils.moeda.desformatar(document.getElementById("valorAto")?.value);
  const fgts = Utils.moeda.desformatar(document.getElementById("valorFgts")?.value);
  const extra = Utils.moeda.desformatar(document.getElementById("valorExtra")?.value);

  let somaParcelas = 0;
  document.querySelectorAll('.parcela-entrada-input').forEach((input) => {
    somaParcelas += Utils.moeda.desformatar(input.value);
  });

  return ato + fgts + extra + somaParcelas;
}

// Lê o total de juros de obra já digitados (Cláusula 4) — reaproveitado
// pelo motor de cálculo e pela tabela "Obras".
function obterTotalJurosObra() {
  let total = 0;
  document.querySelectorAll('.juros-obra-input').forEach((input) => {
    total += Utils.moeda.desformatar(input.value);
  });
  return total;
}

/* ================================================================
   02. ENTRADA — campos e estado
   ================================================================ */
const dom = {
  camposMoeda: document.querySelectorAll("#valorAto, #valorFgts, #valorExtra, #valorInicialParcelaEntrada"),
  dataAssinatura: document.getElementById("dataAssinatura"),
  parcelasEntrada: document.getElementById("nParcelasEntrada"),
  valorInicial: document.getElementById("valorInicialParcelaEntrada"),
  wrapParcelas: document.getElementById('parcelasEntradaWrap'),
  gridParcelas: document.getElementById('parcelasEntradaGrid'),
  correcaoParcelas: document.getElementById('correcaoParcelas')
};

// DECISÃO DE DESIGN (não estava no seu pedido, tive que assumir):
// qualquer mudança em quantidade, valor inicial ou taxa REGENERA a série
// inteira, sobrescrevendo edições manuais feitas direto nos campos de
// parcela. Se isso for um problema, o ajuste fica em gerarParcelasEntrada():
// em vez de reescrever tudo, teria que guardar quais índices foram
// editados manualmente e recalcular só a partir do próximo índice não-editado.

dom.camposMoeda.forEach(campo => {
  campo.addEventListener('input', (evento) => {
    evento.target.value = Utils.moeda.formatar(evento.target.value);
    syncFinanciado();
    if (evento.target.id === 'valorInicialParcelaEntrada') {
      tentarGerarParcelas();
    }
  });
});

dom.dataAssinatura?.addEventListener('input', (evento) => {
  evento.target.value = Utils.data.formatarMesAno(evento.target.value);
});

dom.parcelasEntrada?.addEventListener('input', (evento) => {
  evento.target.value = Utils.numero.formatarQuantidade(evento.target.value);
  tentarGerarParcelas();
});

dom.correcaoParcelas?.addEventListener('input', (evento) => {
  evento.target.value = Utils.numero.formatarPercentual(evento.target.value);

  // Sem isso, o navegador joga o cursor pro final (depois do "%") sempre
  // que reescrevemos o value. Aí o Backspace apaga o "%" — que a máscara
  // recoloca na hora — e o dígito nunca é removido. Forçando o cursor pra
  // ficar antes do "%", o Backspace volta a apagar dígito por dígito.
  const posicaoAntesDoSimbolo = evento.target.value.length - 1;
  evento.target.setSelectionRange(posicaoAntesDoSimbolo, posicaoAntesDoSimbolo);

  tentarGerarParcelas();
});

// Único ponto que decide "tem condição de gerar parcelas ou não".
// Regra que você passou: precisa ter quantidade E valor inicial.
// Taxa é opcional — vazio = 0%.
function tentarGerarParcelas() {
  const temQtd = dom.parcelasEntrada?.value.trim() !== '';
  const temValorInicial = dom.valorInicial?.value.trim() !== '';

  if (temQtd && temValorInicial) {
    gerarParcelasEntrada();
  } else {
    dom.wrapParcelas?.classList.remove('visible');
    if (dom.gridParcelas) dom.gridParcelas.innerHTML = '';
    syncFinanciado();
  }
}

/* ================================================================
   GERAÇÃO DAS PARCELAS COM CORREÇÃO COMPOSTA
   ================================================================ */
function gerarParcelasEntrada() {
  const qtd = parseInt(dom.parcelasEntrada.value) || 0;
  const valorBase = Utils.moeda.desformatar(dom.valorInicial.value);
  const taxaDecimal = Utils.numero.percentualParaDecimal(dom.correcaoParcelas?.value || '0');

  if (qtd <= 0 || valorBase <= 0 || !dom.gridParcelas) {
    dom.wrapParcelas?.classList.remove('visible');
    if (dom.gridParcelas) dom.gridParcelas.innerHTML = '';
    return;
  }

  // Parcela 1 = valorBase. Parcela N = valorBase * (1+taxa)^(N-1).
  const serie = Utils.numero.calcularSerieComposta(valorBase, taxaDecimal, qtd);

  dom.gridParcelas.innerHTML = '';

  serie.forEach((valor, indice) => {
    const numeroParcela = indice + 1;
    const campo = document.createElement('div');
    campo.className = 'field';
    campo.innerHTML = `
      <label>Parcela ${numeroParcela}</label>
      <input type="text"
             class="parcela-entrada-input"
             id="parcelaEntrada_${numeroParcela}"
             value="${Utils.moeda.formatar(valor.toFixed(2))}">
    `;
    dom.gridParcelas.appendChild(campo);
  });

  // Campos ficam editáveis depois de gerados. Editar aqui NÃO recalcula
  // as parcelas seguintes (ver decisão de design no topo da seção), mas
  // atualiza o valor financiado líquido (a soma das parcelas mudou).
  dom.gridParcelas.querySelectorAll('.parcela-entrada-input').forEach((input) => {
    input.addEventListener('input', (evento) => {
      evento.target.value = Utils.moeda.formatar(evento.target.value);
      syncFinanciado();
    });
  });

  dom.wrapParcelas?.classList.add('visible');

  // Mantidas como chamadas condicionais. ATENÇÃO: no código que você
  // mandou, essas duas funções eram chamadas mas não existiam em
  // nenhum lugar. Se elas vivem em outro arquivo do projeto, ok.
  // Se não existem em lugar nenhum ainda, são as próximas a escrever.
  if (typeof preencherPadraoEntrada === 'function') preencherPadraoEntrada();
  if (typeof gerarInccInputs === 'function') gerarInccInputs();

  // A grade acabou de nascer com valores novos (a correção composta) —
  // o valor financiado líquido precisa refletir isso imediatamente, sem
  // esperar o usuário editar manualmente um campo.
  syncFinanciado();
}

/* ================================================================
   03. CONDICOES FINANCIAMENTO (PRICE)
   ================================================================ */
const mod = {
  // Antes selecionava só #jurosAno e #ipcaMensal por ID. O HTML já marca
  // os três (incluindo #inccTaxaPadrao) com data-mask="decimal", mas
  // inccTaxaPadrao tinha ficado de fora — sem máscara nenhuma. Seleção
  // genérica por atributo cobre os três e qualquer campo futuro igual.
  camposPorcentagem: document.querySelectorAll('[data-mask="decimal"]')
};

// ERRO ORIGINAL: addEventListener foi chamado direto em
// mod.camposPorcentagem, mas querySelectorAll devolve uma NodeList
// (lista de elementos), não um elemento único. NodeList não tem
// addEventListener — precisa percorrer com forEach e registrar o
// listener em cada elemento, igual já é feito em camposCalculo e
// dom.camposMoeda mais acima neste mesmo arquivo.
mod.camposPorcentagem.forEach(campo => {
  campo.addEventListener('input', (evento) => {
    evento.target.value = Utils.numero.formatarPercentual(evento.target.value);

    // Mesmo ajuste de cursor do campo correcaoParcelas: sem isso o
    // Backspace fica preso apagando e recolocando o "%" sem nunca
    // remover o dígito.
    const posicaoAntesDoSimbolo = evento.target.value.length - 1;
    evento.target.setSelectionRange(posicaoAntesDoSimbolo, posicaoAntesDoSimbolo);
  });
});

/* ================================================================
   04. AMORTIZAÇÃO EXTRA — alterna máscara conforme o tipo escolhido
   ================================================================ */
const tipoAmortSelect = document.getElementById('tipoAmort');
const valorAmortExtraInput = document.getElementById('valorAmortExtra');
const lblAmortExtra = document.getElementById('labelAmortExtra');

// DECISÃO DE DESIGN (precisa de confirmação sua): ao trocar o tipo,
// o campo é LIMPO em vez de tentar converter o número. "R$ 500"
// trocado pra modo "%" não tem conversão sensata — manter o número
// e só re-formatar ia virar "500,00%" do nada, o que é pior do que
// limpar. Se preferir manter o valor numérico bruto na troca (ex:
// 500 -> 500,00%), eu tiro a linha que zera o value.
function aplicarModoAmortExtra() {
  const modo = tipoAmortSelect?.value; // 'valor' ou 'pct'
  if (!valorAmortExtraInput) return;

  valorAmortExtraInput.value = '';
  valorAmortExtraInput.placeholder = modo === 'pct' ? '0,00%' : 'R$ 0,00';

  // Guarda explícita: lblAmortExtra?.innerHTML = ... não funciona —
  // optional chaining não pode ficar do lado esquerdo de uma
  // atribuição (é erro de sintaxe). Por isso o "if" em vez de "?.".
  if (lblAmortExtra) {
    lblAmortExtra.innerHTML = modo === 'pct' ? 'Amort. Extra (%)' : 'Amort. Extra (R$)';
  }
}

tipoAmortSelect?.addEventListener('change', aplicarModoAmortExtra);

valorAmortExtraInput?.addEventListener('input', (evento) => {
  const modo = tipoAmortSelect?.value;

  if (modo === 'pct') {
    evento.target.value = Utils.numero.formatarPercentual(evento.target.value);
    // mesmo ajuste de cursor dos outros campos percentuais, senão
    // o Backspace trava no "%"
    const posicaoAntesDoSimbolo = evento.target.value.length - 1;
    evento.target.setSelectionRange(posicaoAntesDoSimbolo, posicaoAntesDoSimbolo);
  } else {
    evento.target.value = Utils.moeda.formatar(evento.target.value);
  }
});

// Roda uma vez no carregamento pra garantir que o placeholder já
// nasce coerente com o que tá selecionado no <select>, em vez de
// só reagir depois que o usuário troca manualmente.
aplicarModoAmortExtra();

// Função de leitura pronta pra quem for usar esse valor em algum
// cálculo depois — já devolve o número desformatado e identifica
// se é valor fixo em reais ou percentual da prestação.
function obterValorAmortExtra() {
  const modo = tipoAmortSelect?.value;
  const valorBruto = valorAmortExtraInput?.value || '';

  if (modo === 'pct') {
    return { tipo: 'pct', valor: Utils.numero.percentualParaDecimal(valorBruto) };
  }
  return { tipo: 'valor', valor: Utils.moeda.desformatar(valorBruto) };
}

/* ================================================================
   05. CAMPOS NUMÉRICOS INTEIROS (prazo, intervaloAmort)
   ================================================================ */
// nParcelasEntrada já tinha essa máscara (seção 02). Faltava em prazo
// e intervaloAmort — adicionado aqui sem tocar no listener de
// nParcelasEntrada, que já faz mais coisa (dispara tentarGerarParcelas).
document.querySelectorAll('#prazo, #intervaloAmort').forEach(campo => {
  campo.addEventListener('input', (evento) => {
    evento.target.value = Utils.numero.formatarQuantidade(evento.target.value);
  });
});

/* ================================================================
   06. MÁSCARA GENÉRICA MM/AAAA (via atributo data-mask="mmaaaa")
   ================================================================ */
// O HTML que você mandou já marca obraInicio/obraFim com
// data-mask="mmaaaa". Em vez de cadastrar cada campo de data um por
// um (como dataAssinatura faz hoje), esse loop pega qualquer input
// com esse atributo — então um campo novo de MM/AAAA no futuro
// funciona só adicionando o atributo no HTML, sem tocar em JS.
// (dataAssinatura continua com o listener próprio que já existia;
// se ele também tiver esse atributo no seu HTML, não tem problema —
// a máscara é idempotente, só reformata o que já tá formatado.)
document.querySelectorAll('[data-mask="mmaaaa"]').forEach(campo => {
  campo.addEventListener('input', (evento) => {
    evento.target.value = Utils.data.formatarMesAno(evento.target.value);
  });
});

/* ================================================================
   07. JUROS DE OBRA — gera 1 campo de R$ por mês de obra
   ================================================================ */
const domObra = {
  obraInicio: document.getElementById('obraInicio'),
  obraFim: document.getElementById('obraFim'),
  jurosObraWrap: document.getElementById('jurosObraWrap'),
  jurosObraGrid: document.getElementById('jurosObraGrid'),
  infoObraTotal: document.getElementById('infoObraTotal')
};

// "06/2026" -> { mes: 6, ano: 2026 }. Retorna null se não tiver os
// dois campos completos ou o mês for inválido (ex: "13/2026").
function parseMesAno(texto) {
  const match = /^(\d{2})\/(\d{4})$/.exec(String(texto || ''));
  if (!match) return null;
  const mes = parseInt(match[1], 10);
  const ano = parseInt(match[2], 10);
  if (mes < 1 || mes > 12) return null;
  return { mes, ano };
}

// Lista todo mês entre início e fim, incluindo os dois extremos.
// Ex: 11/2026 até 01/2027 -> [{11,2026}, {12,2026}, {1,2027}].
// Retorna [] se as datas estiverem incompletas/inválidas ou se
// fim vier antes de início.
function calcularMesesObra(inicioTexto, fimTexto) {
  const inicio = parseMesAno(inicioTexto);
  const fim = parseMesAno(fimTexto);
  if (!inicio || !fim) return [];

  const indiceInicio = inicio.ano * 12 + (inicio.mes - 1);
  const indiceFim = fim.ano * 12 + (fim.mes - 1);
  if (indiceFim < indiceInicio) return [];

  const meses = [];
  for (let i = indiceInicio; i <= indiceFim; i++) {
    meses.push({ mes: (i % 12) + 1, ano: Math.floor(i / 12) });
  }
  return meses;
}

// DECISÃO DE DESIGN (mesma lógica já usada nas parcelas de entrada):
// qualquer mudança em obraInicio/obraFim REGENERA a grade inteira,
// apagando valores de juros já digitados manualmente nos meses que
// sobrarem. Não tem como evitar isso sem guardar valor por mês/ano
// em vez de por posição — se isso for um problema na prática
// (ex: usuário ajusta o fim da obra em 1 mês depois de preencher 20
// campos), me avisa que mudo pra chave mês/ano em vez de índice.
function gerarJurosObraInputs() {
  const meses = calcularMesesObra(domObra.obraInicio?.value, domObra.obraFim?.value);

  if (meses.length === 0 || !domObra.jurosObraGrid) {
    domObra.jurosObraWrap?.classList.remove('visible');
    if (domObra.jurosObraGrid) domObra.jurosObraGrid.innerHTML = '';
    if (domObra.infoObraTotal) domObra.infoObraTotal.textContent = '';
    return;
  }

  domObra.jurosObraGrid.innerHTML = '';

  // Campos nascem vazios (placeholder "R$ 0,00") — diferente da
  // entrada, aqui não tem correção composta pra pré-calcular. O valor
  // de cada mês vem da curva teórica da construtora, que só o usuário
  // tem em mãos. Label mostra o mês/ano real (ex: "06/2026"), não
  // "Mês 1", pra facilitar bater com a tabela da construtora.
  meses.forEach(({ mes, ano }, indice) => {
    const mesFormatado = String(mes).padStart(2, '0');
    const campo = document.createElement('div');
    campo.className = 'field';
    campo.innerHTML = `
      <label>${mesFormatado}/${ano}</label>
      <input type="text"
             class="juros-obra-input"
             id="jurosObra_${indice + 1}"
             placeholder="R$ 0,00">
    `;
    domObra.jurosObraGrid.appendChild(campo);
  });

  domObra.jurosObraGrid.querySelectorAll('.juros-obra-input').forEach((input) => {
    input.addEventListener('input', (evento) => {
      evento.target.value = Utils.moeda.formatar(evento.target.value);
      atualizarInfoObraTotal();
    });
  });

  domObra.jurosObraWrap?.classList.add('visible');
  atualizarInfoObraTotal();
}

function atualizarInfoObraTotal() {
  if (!domObra.infoObraTotal || !domObra.jurosObraGrid) return;

  const inputs = domObra.jurosObraGrid.querySelectorAll('.juros-obra-input');
  let total = 0;
  inputs.forEach((input) => {
    total += Utils.moeda.desformatar(input.value);
  });

  const sufixoMes = inputs.length === 1 ? 'mês' : 'meses';
  domObra.infoObraTotal.textContent =
    `Total de juros de obra: ${Utils.moeda.formatar(total.toFixed(2))} (${inputs.length} ${sufixoMes})`;
}

// Registrado DEPOIS da máscara genérica MM/AAAA (seção 06) — assim,
// quando o input dispara, o valor já chega mascarado/formatado antes
// de calcularMesesObra tentar ler ele.
domObra.obraInicio?.addEventListener('input', gerarJurosObraInputs);
domObra.obraFim?.addEventListener('input', gerarJurosObraInputs);

/* ================================================================
   08. MOTOR DE CÁLCULO — helpers de data
   ================================================================ */

// {mes:6,ano:2026} + 3 -> {mes:9,ano:2026}. Mesma lógica de índice
// (ano*12+mes) já usada em calcularMesesObra, só que somando em vez
// de listar um intervalo.
function somarMeses({ mes, ano }, quantidadeMeses) {
  const indice = ano * 12 + (mes - 1) + quantidadeMeses;
  return { mes: (indice % 12) + 1, ano: Math.floor(indice / 12) };
}

// {mes:6,ano:2026} -> "06/2026"
function mesAnoTexto({ mes, ano }) {
  return `${String(mes).padStart(2, '0')}/${ano}`;
}

// 14 -> "1 ano e 2 meses". 0 -> "0 meses".
function formatarAnosMeses(totalMeses) {
  const anos = Math.floor(totalMeses / 12);
  const meses = totalMeses % 12;
  if (anos === 0) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  if (meses === 0) return `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
  return `${anos} ${anos === 1 ? 'ano' : 'anos'} e ${meses} ${meses === 1 ? 'mês' : 'meses'}`;
}

/* ================================================================
   09. MOTOR DE CÁLCULO — PRICE + IPCA (+ INCC pré-obra) + cofrinho
   ================================================================ */

function calcularTaxaMensalEquivalente(taxaAnualDecimal) {
  return Math.pow(1 + taxaAnualDecimal, 1 / 12) - 1;
}

// PMT = PV × i(1+i)^n / [(1+i)^n − 1], na forma equivalente que evita
// estourar Math.pow com expoente positivo grande quando n é alto.
function calcularPMT(saldoInicial, taxaMensal, prazoMeses) {
  if (taxaMensal === 0) return saldoInicial / prazoMeses;
  return saldoInicial * taxaMensal / (1 - Math.pow(1 + taxaMensal, -prazoMeses));
}

// MOTOR VALIDADO: testado linha a linha contra Python.py (o simulador
// que você já tinha) com os parâmetros reais do contrato Vibra Parque
// Vila Sônia — PMT, total pago, meses de amortização negativa e saldo
// residual bateram exatos. Qualquer mudança aqui merece reconferir
// contra esse script antes de confiar no resultado.
function simularFinanciamento({
  saldoInicial,
  taxaMensal,
  ipcaMensal,
  prazoMeses,
  aplicarAmortExtra,
  tipoAmortExtra,        // 'valor' | 'pct'
  valorAmortExtraPorMes, // R$ fixo OU fração decimal da prestação
  intervaloAmortMeses
}) {
  const PMT = calcularPMT(saldoInicial, taxaMensal, prazoMeses);
  let saldo = saldoInicial;
  let totalPago = 0;
  let totalJuros = 0;
  let totalAmortReg = 0;
  let totalAmortExtra = 0;
  let mesesPagos = 0;
  let mesesAmortNeg = 0;
  let cofrinho = 0;
  const historico = [];

  for (let mes = 1; mes <= prazoMeses; mes++) {
    if (saldo <= 0.01) break;

    const saldoMesInicial = saldo;
    const saldoCorrigido = saldo * (1 + ipcaMensal);
    const juros = saldoCorrigido * taxaMensal;
    let amortReg = PMT - juros;
    const pctAmort = PMT > 0 ? (amortReg / PMT) * 100 : 0;

    if (amortReg < 0) {
      // Amortização negativa: IPCA + juros superam a prestação. O saldo
      // CRESCE mesmo com a parcela paga em dia — mesma regra do Python,
      // não é bug, é o financiamento indexado se comportando assim
      // quando o índice de correção é maior que a margem do PRICE.
      mesesAmortNeg++;
      saldo = saldoCorrigido + Math.abs(amortReg);
      amortReg = 0;
    } else {
      saldo = saldoCorrigido - amortReg;
    }

    totalPago += PMT;
    totalJuros += juros;
    totalAmortReg += amortReg;
    mesesPagos++;

    // Cofrinho: acumula a parcela/valor extra todo mês, aplica 100% no
    // saldo a cada intervaloAmortMeses (capado no que resta do saldo,
    // pra nunca pagar mais do que falta), zera o acumulador depois.
    let amortExtra = 0;
    if (aplicarAmortExtra) {
      const aporte = tipoAmortExtra === 'pct'
        ? PMT * valorAmortExtraPorMes
        : valorAmortExtraPorMes;
      cofrinho += aporte;

      if (mes % intervaloAmortMeses === 0 && saldo > 0.01) {
        amortExtra = Math.min(saldo, cofrinho);
        saldo -= amortExtra;
        totalAmortExtra += amortExtra;
        totalPago += amortExtra;
        cofrinho = 0;
      }
    }

    if (saldo <= 0.01) saldo = 0;

    historico.push({
      mes, saldoInicial: saldoMesInicial, saldoCorrigido, juros,
      amortReg, pctAmort, parcela: PMT, amortExtra, saldoFinal: saldo
    });
  }

  return {
    PMT,
    saldoInicial,
    prazoMeses,
    historico,
    mesesPagos,
    mesesAmortNeg,
    quitou: saldo <= 0.01,
    economizado: saldo <= 0.01 ? (prazoMeses - mesesPagos) : 0,
    totalPago, totalJuros, totalAmortReg, totalAmortExtra,
    saldoResidual: saldo
  };
}

/* ================================================================
   10. CALCULAR — ponto de entrada (botão "Simular Financiamento")
   ================================================================ */

// Guardados pra paginação e exportação reaproveitarem sem recalcular.
let ultimoResultado = null;
let ultimoResultadoSemExtra = null;
let paginaAtualFinanciamento = 1;
const LINHAS_POR_PAGINA_FINANCIAMENTO = 24;

function calcular() {
  const valorFinanciadoLiquido = Utils.moeda.desformatar(document.getElementById('valorFinanciado')?.value);
  const prazoMeses = parseInt(document.getElementById('prazo')?.value, 10) || 0;
  const jurosAnoDecimal = Utils.numero.percentualParaDecimal(document.getElementById('jurosAno')?.value || '0');
  const ipcaMensalDecimal = Utils.numero.percentualParaDecimal(document.getElementById('ipcaMensal')?.value || '0');
  const inccMensalDecimal = Utils.numero.percentualParaDecimal(document.getElementById('inccTaxaPadrao')?.value || '0');

  if (valorFinanciadoLiquido <= 0 || prazoMeses <= 0) {
    Swal.fire({
      icon: 'warning',
      title: 'Faltam dados',
      text: 'Preencha o Valor do Imóvel (Cláusula 1) e o Prazo Total (Cláusula 3) antes de simular.'
    });
    return;
  }

  // Saldo na entrega das chaves: só cresce por INCC durante a obra se
  // o radio "Com correção pré-obras" estiver marcado. Reaproveita a
  // mesma taxa do campo de correção das parcelas de entrada
  // (#inccTaxaPadrao) — não existe campo separado pra isso hoje.
  const corrigirPreObras = document.getElementById('corrigirObraSim')?.checked || false;
  const mesesObra = calcularMesesObra(
    document.getElementById('obraInicio')?.value,
    document.getElementById('obraFim')?.value
  ).length;

  const saldoNaEntrega = (corrigirPreObras && mesesObra > 0)
    ? valorFinanciadoLiquido * Math.pow(1 + inccMensalDecimal, mesesObra)
    : valorFinanciadoLiquido;

  const amortExtraInfo = obterValorAmortExtra(); // { tipo: 'valor'|'pct', valor }
  let intervaloAmortMeses = parseInt(document.getElementById('intervaloAmort')?.value, 10) || 1;
  intervaloAmortMeses = Math.min(Math.max(intervaloAmortMeses, 1), 12); // hint do HTML: máx 12 meses

  const taxaMensal = calcularTaxaMensalEquivalente(jurosAnoDecimal);

  const parametrosComuns = {
    saldoInicial: saldoNaEntrega,
    taxaMensal,
    ipcaMensal: ipcaMensalDecimal,
    prazoMeses,
    tipoAmortExtra: amortExtraInfo.tipo,
    valorAmortExtraPorMes: amortExtraInfo.valor,
    intervaloAmortMeses
  };

  // Roda duas vezes — com e sem amortização extra — só pra comparação
  // no gráfico e no card "Valor Economizado".
  ultimoResultado = simularFinanciamento({ ...parametrosComuns, aplicarAmortExtra: true });
  ultimoResultadoSemExtra = simularFinanciamento({ ...parametrosComuns, aplicarAmortExtra: false });

  const pmtInput = document.getElementById('pmtCalculado');
  if (pmtInput) pmtInput.value = Utils.moeda.formatar(ultimoResultado.PMT.toFixed(2));

  paginaAtualFinanciamento = 1;
  renderStats(ultimoResultado, { saldoNaEntrega, mesesObra, corrigirPreObras });
  renderGrafico(ultimoResultado, ultimoResultadoSemExtra);
  renderizarTabelaEntrada();
  renderizarTabelaObras();
  renderizarTabelaObrasEntrada();
  renderizarTabelaFinanciamento();

  const results = document.getElementById('results');
  if (results) {
    results.style.display = 'block';
    if (typeof results.scrollIntoView === 'function') {
      results.scrollIntoView({ behavior: 'smooth' });
    }
  }
}

/* ================================================================
   11. RESUMO (statsGrid + barra de progresso)
   ================================================================ */
function renderStats(resultado, contexto) {
  const grid = document.getElementById('statsGrid');
  if (!grid) return;

  // "Valor economizado" pela definição literal do seu pedido: o que
  // seria pago se a prestação corresse o prazo contratual inteiro,
  // menos o que realmente saiu do bolso até quitar (já incluindo o
  // que foi pago via cofrinho). Não é o mesmo número que "com extra
  // vs sem extra" do gráfico — esse aqui é contra o prazo cheio.
  const valorTotalSemEconomia = resultado.PMT * resultado.prazoMeses;
  const valorEconomizado = Math.max(0, valorTotalSemEconomia - resultado.totalPago);

  const custoTotalPreChaves = obterTotalEntradaPaga() + obterTotalJurosObra();
  const custoTotalGeral = custoTotalPreChaves + resultado.totalPago;

  const cards = [
    {
      label: contexto.corrigirPreObras ? 'Saldo na Entrega das Chaves' : 'Saldo Inicial do Financiamento',
      valor: Utils.moeda.formatar(contexto.saldoNaEntrega.toFixed(2)),
      cor: 'accent'
    },
    {
      label: 'Prestação PRICE (PMT)',
      valor: Utils.moeda.formatar(resultado.PMT.toFixed(2)),
      cor: 'accent'
    },
    {
      label: 'Prazo Simulado',
      valor: formatarAnosMeses(resultado.mesesPagos) + (resultado.quitou ? '' : ' — não quitou'),
      cor: resultado.quitou ? 'blue' : 'danger'
    },
    {
      label: 'Tempo Economizado',
      valor: resultado.economizado > 0 ? formatarAnosMeses(resultado.economizado) : '—',
      cor: resultado.economizado > 0 ? 'accent' : 'blue'
    },
    {
      label: 'Valor Economizado',
      valor: Utils.moeda.formatar(valorEconomizado.toFixed(2)),
      cor: valorEconomizado > 0 ? 'accent' : 'blue'
    },
    {
      label: 'Custo Total Geral (pré + pós-chaves)',
      valor: Utils.moeda.formatar(custoTotalGeral.toFixed(2)),
      cor: 'blue'
    },
    {
      label: 'Amortizado via Cofrinho',
      valor: Utils.moeda.formatar(resultado.totalAmortExtra.toFixed(2)),
      cor: 'blue'
    },
    {
      label: 'Meses com Amortização Negativa',
      valor: `${resultado.mesesAmortNeg} / ${resultado.mesesPagos}`,
      cor: resultado.mesesAmortNeg > 0 ? 'danger' : 'accent'
    }
  ];

  grid.innerHTML = cards.map((c) => `
    <div class="stat-card">
      <div class="stat-label">${c.label}</div>
      <div class="stat-value ${c.cor}">${c.valor}</div>
    </div>
  `).join('');

  const progressWrap = document.getElementById('progressWrap');
  if (progressWrap) {
    if (resultado.economizado > 0) {
      const percentual = (resultado.economizado / resultado.prazoMeses) * 100;
      const label = document.getElementById('progressLabel');
      const barra = document.getElementById('progressBar');
      if (label) label.textContent = `${formatarAnosMeses(resultado.economizado)} (${percentual.toFixed(1)}%)`;
      if (barra) barra.style.width = `${Math.min(percentual, 100)}%`;
      progressWrap.style.display = 'block';
    } else {
      progressWrap.style.display = 'none';
    }
  }
}

/* ================================================================
   12. GRÁFICO (canvas nativo, sem biblioteca)
   ================================================================ */

// Lê uma cor das variáveis CSS já usadas na legenda do HTML. Tem
// fallback pra não quebrar em ambiente sem getComputedStyle (ex:
// testes fora do navegador).
function corCSS(variavel, fallback) {
  try {
    const valor = getComputedStyle(document.documentElement).getPropertyValue(variavel).trim();
    return valor || fallback;
  } catch (e) {
    return fallback;
  }
}

function renderGrafico(resultadoComExtra, resultadoSemExtra) {
  const wrap = document.getElementById('graficoWrap');
  const canvas = document.getElementById('graficoSaldo');
  if (!wrap || !canvas || typeof canvas.getContext !== 'function') return;

  wrap.style.display = 'block';

  const dpr = window.devicePixelRatio || 1;
  const largura = canvas.clientWidth || 600;
  const altura = 280;
  canvas.width = largura * dpr;
  canvas.height = altura * dpr;

  const ctx = canvas.getContext('2d');
  if (!ctx) return; // navegador/ambiente sem suporte a canvas 2d
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, largura, altura);

  const historicoComExtra = resultadoComExtra.historico;
  const historicoSemExtra = resultadoSemExtra.historico;
  if (historicoComExtra.length === 0) return;

  // Juros acumulados (3ª linha) sobre o cenário COM amortização extra.
  let acumulado = 0;
  const jurosAcumulados = historicoComExtra.map((linha) => {
    acumulado += linha.juros;
    return acumulado;
  });

  const todosValores = [
    ...historicoComExtra.map((l) => l.saldoFinal),
    ...historicoSemExtra.map((l) => l.saldoFinal),
    ...jurosAcumulados
  ];
  const valorMax = Math.max(...todosValores, 1);
  const totalMeses = Math.max(historicoComExtra.length, historicoSemExtra.length);

  const margem = { topo: 16, baixo: 16, esquerda: 8, direita: 8 };
  const areaLargura = largura - margem.esquerda - margem.direita;
  const areaAltura = altura - margem.topo - margem.baixo;

  function pontoX(indice) {
    return margem.esquerda + (indice / (totalMeses - 1 || 1)) * areaLargura;
  }
  function pontoY(valor) {
    return margem.topo + areaAltura - (valor / valorMax) * areaAltura;
  }

  function desenharLinha(serie, cor, opacidade) {
    if (!serie || serie.length === 0) return;
    ctx.beginPath();
    ctx.strokeStyle = cor;
    ctx.globalAlpha = opacidade;
    ctx.lineWidth = 2;
    serie.forEach((valor, indice) => {
      const x = pontoX(indice);
      const y = pontoY(valor);
      if (indice === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Cores batem com a legenda já escrita no HTML (Anexo II).
  desenharLinha(historicoSemExtra.map((l) => l.saldoFinal), corCSS('--stamp', '#b5524a'), 0.7);
  desenharLinha(jurosAcumulados, corCSS('--blue', '#3b6ea5'), 0.7);
  desenharLinha(historicoComExtra.map((l) => l.saldoFinal), corCSS('--brass', '#b08d57'), 1);
}

/* ================================================================
   13. TABELA — ENTRADA (Cláusula 2)
   ================================================================ */
function renderizarTabelaEntrada() {
  const tbody = document.getElementById('tableBodyEntrada');
  if (!tbody) return;

  const dataBase = parseMesAno(document.getElementById('dataAssinatura')?.value);
  const linhas = [];

  function linhaPagamentoUnico(nomeItem, valorTexto) {
    const valor = Utils.moeda.desformatar(valorTexto);
    if (valor <= 0) return; // não lista item que não foi usado
    linhas.push({
      item: nomeItem,
      mesAno: dataBase ? mesAnoTexto(dataBase) : '—',
      valorBase: valor,
      correcaoTexto: '—',
      valorCorrigido: valor
    });
  }

  linhaPagamentoUnico('Ato (sinal)', document.getElementById('valorAto')?.value);
  linhaPagamentoUnico('FGTS', document.getElementById('valorFgts')?.value);
  linhaPagamentoUnico('Valor Extra', document.getElementById('valorExtra')?.value);

  const valorBaseParcela = Utils.moeda.desformatar(document.getElementById('valorInicialParcelaEntrada')?.value);
  const taxaDecimal = Utils.numero.percentualParaDecimal(document.getElementById('correcaoParcelas')?.value || '0');

  document.querySelectorAll('.parcela-entrada-input').forEach((input, indice) => {
    const valorCorrigido = Utils.moeda.desformatar(input.value);
    const mesAno = dataBase ? mesAnoTexto(somarMeses(dataBase, indice)) : '—';
    const correcaoAcumulada = (Math.pow(1 + taxaDecimal, indice) - 1) * 100;
    linhas.push({
      item: `Parcela ${indice + 1}`,
      mesAno,
      valorBase: valorBaseParcela,
      correcaoTexto: indice === 0 ? '—' : `${correcaoAcumulada.toFixed(2)}%`,
      valorCorrigido
    });
  });

  tbody.innerHTML = linhas.length === 0
    ? '<tr><td colspan="5" style="text-align:center;color:var(--muted)">Nenhum valor de entrada informado</td></tr>'
    : linhas.map((l) => `
        <tr>
          <td>${l.item}</td>
          <td>${l.mesAno}</td>
          <td>${Utils.moeda.formatar(l.valorBase.toFixed(2))}</td>
          <td>${l.correcaoTexto}</td>
          <td>${Utils.moeda.formatar(l.valorCorrigido.toFixed(2))}</td>
        </tr>
      `).join('');
}

/* ================================================================
   14. TABELA — OBRAS (Cláusula 4)
   ================================================================ */
function renderizarTabelaObras() {
  const tbody = document.getElementById('tableBodyObras');
  if (!tbody) return;

  const inputs = document.querySelectorAll('.juros-obra-input');
  if (inputs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--muted)">Nenhum período de obra informado</td></tr>';
    return;
  }

  let acumulado = 0;
  const linhasHTML = [];
  inputs.forEach((input) => {
    // Reaproveita o label "MM/AAAA" já escrito por gerarJurosObraInputs()
    // em vez de recalcular a data de novo aqui.
    const mesAno = input.closest('.field')?.querySelector('label')?.textContent || '—';
    const valor = Utils.moeda.desformatar(input.value);
    acumulado += valor;
    linhasHTML.push(`
      <tr>
        <td>${mesAno}</td>
        <td>${Utils.moeda.formatar(valor.toFixed(2))}</td>
        <td>${Utils.moeda.formatar(acumulado.toFixed(2))}</td>
      </tr>
    `);
  });

  tbody.innerHTML = linhasHTML.join('');
}

/* ================================================================
   15. TABELA — OBRAS + ENTRADA (cruzada por mês)
   ================================================================ */
function renderizarTabelaObrasEntrada() {
  const tbody = document.getElementById('tableBodyObrasEntrada');
  if (!tbody) return;

  const porMes = new Map(); // chave "ano-mes" -> { mes, ano, parcela, obra }
  const dataBase = parseMesAno(document.getElementById('dataAssinatura')?.value);

  if (dataBase) {
    document.querySelectorAll('.parcela-entrada-input').forEach((input, indice) => {
      const { mes, ano } = somarMeses(dataBase, indice);
      const chave = `${ano}-${mes}`;
      const atual = porMes.get(chave) || { mes, ano, parcela: 0, obra: 0 };
      atual.parcela += Utils.moeda.desformatar(input.value);
      porMes.set(chave, atual);
    });
  }

  const mesesObraArray = calcularMesesObra(
    document.getElementById('obraInicio')?.value,
    document.getElementById('obraFim')?.value
  );
  document.querySelectorAll('.juros-obra-input').forEach((input, indice) => {
    const referencia = mesesObraArray[indice];
    if (!referencia) return;
    const chave = `${referencia.ano}-${referencia.mes}`;
    const atual = porMes.get(chave) || { mes: referencia.mes, ano: referencia.ano, parcela: 0, obra: 0 };
    atual.obra += Utils.moeda.desformatar(input.value);
    porMes.set(chave, atual);
  });

  const linhas = [...porMes.values()].sort((a, b) => (a.ano * 12 + a.mes) - (b.ano * 12 + b.mes));

  tbody.innerHTML = linhas.length === 0
    ? '<tr><td colspan="4" style="text-align:center;color:var(--muted)">Sem dados de entrada ou obra informados</td></tr>'
    : linhas.map((l) => `
        <tr>
          <td>${mesAnoTexto(l)}</td>
          <td>${Utils.moeda.formatar(l.parcela.toFixed(2))}</td>
          <td>${Utils.moeda.formatar(l.obra.toFixed(2))}</td>
          <td>${Utils.moeda.formatar((l.parcela + l.obra).toFixed(2))}</td>
        </tr>
      `).join('');
}

/* ================================================================
   16. TABELA — FINANCIAMENTO (motor PRICE) + PAGINAÇÃO
   ================================================================ */
function linhaFinanciamentoHTML(l) {
  return `
    <tr>
      <td>${l.mes}</td>
      <td>${Utils.moeda.formatar(l.saldoInicial.toFixed(2))}</td>
      <td>${Utils.moeda.formatar(l.juros.toFixed(2))}</td>
      <td>${Utils.moeda.formatar(l.amortReg.toFixed(2))}</td>
      <td>${Utils.moeda.formatar(l.parcela.toFixed(2))}</td>
      <td>${Utils.moeda.formatar(l.amortExtra.toFixed(2))}</td>
      <td>${Utils.moeda.formatar(l.saldoFinal.toFixed(2))}</td>
    </tr>`;
}

function renderizarTabelaFinanciamento() {
  const tbody = document.getElementById('tableBodyFinanciamento');
  if (!tbody || !ultimoResultado) return;

  const historico = ultimoResultado.historico;
  const totalPaginas = Math.max(1, Math.ceil(historico.length / LINHAS_POR_PAGINA_FINANCIAMENTO));
  paginaAtualFinanciamento = Math.min(Math.max(paginaAtualFinanciamento, 1), totalPaginas);

  const inicio = (paginaAtualFinanciamento - 1) * LINHAS_POR_PAGINA_FINANCIAMENTO;
  const pagina = historico.slice(inicio, inicio + LINHAS_POR_PAGINA_FINANCIAMENTO);

  tbody.innerHTML = pagina.map(linhaFinanciamentoHTML).join('');
  renderPagination(totalPaginas);
}

function renderPagination(totalPaginas) {
  const container = document.getElementById('paginationFinanciamento');
  if (!container) return;

  function botaoHTML(texto, pagina, desabilitado) {
    return `<button class="page-btn" ${desabilitado ? 'disabled' : ''} data-pagina="${pagina}">${texto}</button>`;
  }

  container.innerHTML =
    botaoHTML('‹ Anterior', paginaAtualFinanciamento - 1, paginaAtualFinanciamento <= 1) +
    `<span style="padding:0 0.6rem;color:var(--muted);font-size:0.85rem">Página ${paginaAtualFinanciamento} de ${totalPaginas}</span>` +
    botaoHTML('Próxima ›', paginaAtualFinanciamento + 1, paginaAtualFinanciamento >= totalPaginas);

  container.querySelectorAll('.page-btn').forEach((botao) => {
    botao.addEventListener('click', () => {
      const pagina = parseInt(botao.dataset.pagina, 10);
      if (!isNaN(pagina)) {
        paginaAtualFinanciamento = pagina;
        renderizarTabelaFinanciamento();
      }
    });
  });
}

/* ================================================================
   17. ABAS (Anexo III — troca de visualização das tabelas)
   ================================================================ */
document.querySelectorAll('.tab-btn').forEach((botao) => {
  botao.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((painel) => { painel.style.display = 'none'; });

    botao.classList.add('active');
    const destino = document.getElementById(botao.dataset.target);
    if (destino) destino.style.display = 'block';
  });
});

/* ================================================================
   18. EXPORTAÇÃO — PDF do resumo e Excel das tabelas
   ================================================================ */
function exportarResumoPDF() {
  if (typeof window.jspdf === 'undefined') {
    Swal.fire({ icon: 'error', title: 'jsPDF não carregou', text: 'Verifique sua conexão e tente novamente.' });
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(14);
  doc.text('Resumo da Simulação — Financiamento Amortizado', 14, 16);

  let y = 28;
  doc.setFontSize(10);
  document.querySelectorAll('#statsGrid .stat-card').forEach((card) => {
    const label = card.querySelector('.stat-label')?.textContent || '';
    const valor = card.querySelector('.stat-value')?.textContent || '';
    doc.text(`${label}: ${valor}`, 14, y);
    y += 7;
  });

  doc.save('resumo-financiamento.pdf');
}

function exportarTabelas() {
  if (typeof XLSX === 'undefined') {
    Swal.fire({ icon: 'error', title: 'Biblioteca de planilha não carregou', text: 'Verifique sua conexão e tente novamente.' });
    return;
  }

  // A tabela de Financiamento na tela só mostra a página atual. Pra
  // exportar todos os meses, renderiza a tabela inteira temporariamente,
  // exporta, e devolve pra paginação normal no final.
  const paginaSalva = paginaAtualFinanciamento;
  const tbodyFinanciamento = document.getElementById('tableBodyFinanciamento');
  if (ultimoResultado && tbodyFinanciamento) {
    tbodyFinanciamento.innerHTML = ultimoResultado.historico.map(linhaFinanciamentoHTML).join('');
  }

  const workbook = XLSX.utils.book_new();
  const tabelas = [
    { id: 'tableEntrada', nome: 'Entrada' },
    { id: 'tableObras', nome: 'Obras' },
    { id: 'tableObrasEntrada', nome: 'Obras+Entrada' },
    { id: 'tableFinanciamento', nome: 'Financiamento' }
  ];

  tabelas.forEach(({ id, nome }) => {
    const tabela = document.getElementById(id);
    if (!tabela) return;
    const planilha = XLSX.utils.table_to_sheet(tabela);
    XLSX.utils.book_append_sheet(workbook, planilha, nome);
  });

  XLSX.writeFile(workbook, 'tabelas-financiamento.xlsx');

  paginaAtualFinanciamento = paginaSalva;
  renderizarTabelaFinanciamento();
}

/* ================================================================
   INICIALIZAÇÃO
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  iniciarTermos();
  syncFinanciado();
});