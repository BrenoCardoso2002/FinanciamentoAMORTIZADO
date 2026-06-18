/* ============================================================
   PREENCHER-CONSOLE.JS — não faz parte do site.

   Isso aqui não é carregado pela página (não tem <script src="...">
   pra ele no Index.html). É só um script pra colar no console do
   navegador (F12 → Console) enquanto você testa, pra não ter que
   digitar tudo na mão de novo a cada reload.

   CORRIGIDO: a versão anterior quebrava na hora — chamava
   getElementById('valorPadraoParcelaEntrada'), que nunca existiu
   (o id real é valorInicialParcelaEntrada), e em seguida chamava
   preencherPadraoEntrada(), preencherPadraoIncc() e
   atualizarTudoObras(), três funções que nunca foram escritas em
   nenhum lugar do script.js. Resultado: travava ali, 0 parcelas
   geradas, #valorFinanciado nunca calculado, calcular() teria
   recusado com "Faltam dados" se você tivesse clicado no botão.

   Como usar:
     1. Abre o Index.html no navegador
     2. Aceita os Termos de Uso (ou não — o preenchimento funciona
        igual, já que manipula o DOM direto, não depende de clique)
     3. F12 → aba Console → cola o conteúdo deste arquivo → Enter
     4. Já roda calcular() no final — os resultados aparecem direto
   ============================================================ */

(function preencherSimulador() {
  console.log("🚀 Iniciando preenchimento automático...");

  // ── Cláusula 1 — Dados do Imóvel ───────────────────────────────
  document.getElementById('valorImovel').value = '330.000,00';
  document.getElementById('valorSubsidio').value = '0,00';

  // ── Cláusula 2 — Entrada ────────────────────────────────────────
  document.getElementById('dataAssinatura').value = '05/2026';
  document.getElementById('valorAto').value = '5.000,00';
  document.getElementById('valorFgts').value = '9.375,21';
  document.getElementById('valorExtra').value = '0,00';

  // gerarParcelasEntrada() lê nParcelasEntrada + valorInicialParcelaEntrada
  // direto do DOM, então os dois precisam estar preenchidos ANTES de
  // chamar a função (a versão anterior chamava antes de preencher e
  // a função não gerava nada).
  document.getElementById('nParcelasEntrada').value = '25';
  document.getElementById('valorInicialParcelaEntrada').value = '1.000,00';
  document.getElementById('correcaoParcelas').value = '0,50%';
  gerarParcelasEntrada(); // já chama syncFinanciado() no final

  // ── Cláusula 3 — Condições do Financiamento (PRICE) ─────────────
  document.getElementById('prazo').value = '420';
  document.getElementById('jurosAno').value = '12,00%';
  document.getElementById('ipcaMensal').value = '0,50%';
  document.getElementById('inccTaxaPadrao').value = '0,80%'; // reaproveitado pro saldo na obra

  document.getElementById('tipoAmort').value = 'valor';
  if (typeof aplicarModoAmortExtra === 'function') aplicarModoAmortExtra();
  document.getElementById('valorAmortExtra').value = '500,00';
  document.getElementById('intervaloAmort').value = '3';

  // Contrato real tem correção do saldo durante a obra (igual ao
  // Python.py) — marca "Com correção pré-obras". Se quiser testar
  // sem essa correção, troca pra corrigirObraNao.
  document.getElementById('corrigirObraSim').checked = true;
  document.getElementById('corrigirObraNao').checked = false;

  // ── Cláusula 4 — Juros de Obra ───────────────────────────────────
  document.getElementById('obraInicio').value = '08/2026';
  document.getElementById('obraFim').value = '01/2027';
  gerarJurosObraInputs(); // cria os campos do período — precisa vir
                          // depois de obraInicio/obraFim preenchidos
  document.querySelectorAll('.juros-obra-input').forEach((input, i) => {
    input.value = (390 + i * 60).toFixed(2).replace('.', ',');
  });

  console.log("✅ Campos preenchidos. Calculando...");
  calcular();
  console.log("✅ Pronto. Resultados na tela (Resumo, Gráfico e as 4 abas de tabela).");
})();
