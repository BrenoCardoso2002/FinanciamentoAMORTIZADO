/* ============================================================
   PREENCHER-CONSOLE.JS — não faz parte do site.

   Isso aqui não é carregado pela página (não tem <script src="...">
   pra ele no Index.html). É só um script pra colar no console do
   navegador (F12 → Console) enquanto você testa, pra não ter que
   digitar tudo na mão de novo a cada reload.

   Como usar:
     1. Abre o Index.html no navegador
     2. Aceita os Termos de Uso (ou não — as funções rodam mesmo
        com o simulador "locked", já que manipulam o DOM direto,
        não dependem de clique de mouse)
     3. F12 → aba Console → cola o conteúdo deste arquivo → Enter
   ============================================================ */

(function preencherSimulador() {
  console.log("🚀 Iniciando preenchimento automático...");

  // Campos sem nenhum comportamento dinâmico associado ainda
  // (Cláusula 3 inteira é decorativa por enquanto — sem calcular() não reage a nada)
  const camposSimples = {
    valorImovel: '330.000,00',
    valorSubsidio: '0,00',
    prazo: '420',
    jurosAno: '12,00',
    ipcaMensal: '0,50',
    valorAmortExtra: '500,00',
    intervaloAmort: '3'
  };
  for (const [id, valor] of Object.entries(camposSimples)) {
    const input = document.getElementById(id);
    if (input) input.value = valor;
  }
  document.getElementById('tipoAmort').value = 'valor';

  // Entrada (Cláusula 2)
  document.getElementById('dataAssinatura').value = '05/2026';
  document.getElementById('valorAto').value = '5.000,00';
  document.getElementById('valorFgts').value = '9.375,21';
  document.getElementById('valorExtra').value = '0,00';
  document.getElementById('nParcelasEntrada').value = '25';
  gerarParcelasEntrada();   // já cria as 25 parcelas E o grid do INCC-DI junto

  document.getElementById('valorPadraoParcelaEntrada').value = '1.000,00';
  preencherPadraoEntrada();

  // Taxa padrão do INCC-DI — preenche o grid inteiro de uma vez
  // (no contrato real, o ideal é digitar mês a mês com o índice
  // publicado pela FGV, mas pra teste rápido um valor médio serve)
  document.getElementById('inccTaxaPadrao').value = '0,80';
  preencherPadraoIncc();

  // Juros de Obra (Cláusula 4)
  document.getElementById('obraInicio').value = '08/2026';
  document.getElementById('obraFim').value = '01/2027';
  gerarJurosObraInputs();
  document.querySelectorAll('.juros-obra-input').forEach((input, i) => {
    input.value = (390 + i * 60).toFixed(2).replace('.', ',');
  });
  atualizarTudoObras();

  console.log("✅ Campos preenchidos. Confira as abas Entrada/Obras/Obras+Entrada no Anexo III.");
})();
