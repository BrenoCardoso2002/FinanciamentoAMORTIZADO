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
    calculaValorFinanciadoBruto();
  });
});

function calculaValorFinanciadoBruto() {
  const imovel = Utils.moeda.desformatar(document.getElementById("valorImovel")?.value);
  const subsidio = Utils.moeda.desformatar(document.getElementById("valorSubsidio")?.value);

  let financiado = imovel - subsidio;
  if (financiado < 0) financiado = 0; // subsídio maior que o imóvel não existe na prática

  document.getElementById("valorFinanciado").value = Utils.moeda.formatar(financiado.toFixed(2));
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
    calculaValorFinanciado();
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
  }
}

function calculaValorFinanciado() {
  const ato = Utils.moeda.desformatar(document.getElementById("valorAto")?.value);
  const fgts = Utils.moeda.desformatar(document.getElementById("valorFgts")?.value);
  const extra = Utils.moeda.desformatar(document.getElementById("valorExtra")?.value);

  // ato/fgts/extra calculados mas sem destino — no código original também
  // não tinham. Se existir um campo de "total de entrada" no seu HTML,
  // descomenta e ajusta o id:
  // document.getElementById("totalEntrada").value =
  //   Utils.moeda.formatar((ato + fgts + extra).toFixed(2));
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
  // as parcelas seguintes (ver decisão de design no topo da seção).
  dom.gridParcelas.querySelectorAll('.parcela-entrada-input').forEach((input) => {
    input.addEventListener('input', (evento) => {
      evento.target.value = Utils.moeda.formatar(evento.target.value);
      if (typeof atualizarTudoEntrada === 'function') atualizarTudoEntrada();
    });
  });

  dom.wrapParcelas?.classList.add('visible');

  // Mantidas como chamadas condicionais. ATENÇÃO: no código que você
  // mandou, essas duas funções eram chamadas mas não existiam em
  // nenhum lugar. Se elas vivem em outro arquivo do projeto, ok.
  // Se não existem em lugar nenhum ainda, são as próximas a escrever.
  if (typeof preencherPadraoEntrada === 'function') preencherPadraoEntrada();
  if (typeof gerarInccInputs === 'function') gerarInccInputs();
}

/* ================================================================
   03. CONDICOES FINANCIAMENTO (PRICE)
   ================================================================ */
const mod = {
  camposPorcentagem: document.querySelectorAll("#jurosAno, #ipcaMensal")
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

// CALCULAR
/*
1. Calcula o saldo devedor
Que é o valor financiado da input #valorFinanciado ai tem que transformar em moeda
2. Saldo devedor deve ser corrigido mensalmente ai ve as options selecionado para ver se so começa correcao com IPCA MAIS A TAXA DE JUROS AO ANO ou se ela ja tem correcao durante assinatura do contrato (se puder colcoar campo pedindo data de assinatura do contrato que ai a correcao é desde assinatura ne) 
3. valor inicial da prestacao com mascara de valor
4. da parcela mensal que é contada como no pagamento, do valor da parcela ele considera 20% desse valor da parcela  descontar do saldo devedor
5. sobre o amort extra é um valor juntado todo mes, mas ai so é pago a cada intervalo de amortizacao que pode ser de no maximo 12 meses
6. ai o valor da amort extra é descontado 100% do saldo devedor
ai no resumo tem que falar todas informaçoes, valores, prazos, tempo econimizado, valor econimizado que é calculado pela subtracao do valor total que seria pago que seria valor da prestação vezes total de prazo pelo valor total pago ate quitar o saldo devedor e ai calcula o tempo economizado igual sabe
ai monta a tabelas com os valores que foram sendo calculados
e faz botoes de exportar os trem

*/

/* ================================================================
   INICIALIZAÇÃO
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  iniciarTermos();
});