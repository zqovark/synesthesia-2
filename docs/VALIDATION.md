# Registro de validação

29/10/2026. Não confundir teste automatizado, simulação e operação real de hardware/provedor.

## Executado no ambiente de desenvolvimento

- Testes Node: arbitragem aditiva e limites; retorno ao baseline; troca de cena; entradas inválidas; inversão de macros; FFT com sinais sintéticos; detector de batidas; zona morta; botões mantidos e reconexão; contratos OpenAI e Gemini com HTTP simulado; erros de provedor; consentimento; concorrência, cancelamento e timeout de jobs; isolamento HTTP/origem/token; relógio manual; identidade das matérias procedurais; descarte de texturas em carregamentos concorrentes e após destruição.
- `npm run check`: todos os módulos JavaScript analisados pelo Node.
- `python scripts/check-gpu.py`: shaders reais compilados e vinculados; frame renderizado com OpenGL ES 3.2 / Mesa 25.2.8; saída não vazia/opaca; zoom e simetria alteraram pixels; nenhum erro OpenGL. É integração gráfica real por Mesa, sem navegador. Não mede desempenho na RTX 3050.

## Navegador

O ambiente local não contém navegador e o download do Chromium retornou arquivo inválido. A validação foi executada no Chromium do GitHub Actions: [execução aprovada](https://github.com/zqovark/synesthesia-2/actions/runs/40931913149), incluindo Node 22 e 24. O teste percorreu boot WebGL, macro nova, cena salva/recarregada com valor fracionário, upload e persistência de imagem, decodificação de WAV e análise Web Audio, gamepad Xbox simulado, confirmação e geração HTTP simulada, capturas desktop/mobile e overflow horizontal. As duas capturas foram abertas e inspecionadas: controles legíveis, palco central, composição responsiva e sem overflow horizontal. As validações posteriores a essa execução ficam registradas na aba Actions.

As capturas do CI são evidências para revisão visual; o teste de overflow sozinho não garante qualidade visual. Não houve medição de FPS no hardware do usuário. O estado efetivo de cada execução está na aba Actions do repositório.

## Pendente em hardware / serviços reais

1. Linux/Omarchy: tocar música fora do app, iniciar “Computador”, verificar bandas e latência. Desligar som e confirmar retorno ao baseline. Trocar saída, parar/reiniciar a captura. Ausência de `parec`, servidor Pulse ou monitor deve informar erro e manter composição operável.
2. Xbox físico: conectar em repouso e com gatilho pressionado; testar neutralização, deriva, botões, navegação completa dos painéis e reconexão. Testar mapeamentos no navegador efetivamente utilizado.
3. Provedores hospedados (OpenAI, Gemini): com credencial própria, confirmar acesso, formato real da resposta, cancelamento, limites e uma imagem gerada. Não realizado nesta sessão; não há credencial disponível nem chamadas pagas autorizadas implicitamente pela implementação.
4. AUTOMATIC1111: confirmar checkpoint real e API local, seed retornada e efeito da concorrência sobre a GPU. Cancelar a requisição não interrompe necessariamente o processo remoto.
5. Nitro V15: duas texturas 2048 px, viewport 1920×1080, sessão de 20 minutos; registrar FPS do HUD, memória e estabilidade de recursos enquanto importa/exclui matérias e troca cenas. Meta: 60 FPS; medir antes de afirmar.
6. Renderizador: trocar matérias rapidamente, provocar perda/restauração de contexto com ferramentas do navegador, reselecionar imagens após restauração e verificar descartes. Comparar antes/depois com GPU profiler.
7. Persistência: exportar cena com imagens, limpar dados do navegador e reimportar; comparar imagens, metadados, macros e associações. Arquivos de áudio são abertos novamente por escolha do usuário.
8. Acessibilidade: teclado, foco visível e contido nos painéis, 390 px de largura, zoom do navegador e redução de movimento. Luminosidade e pulso devem ser independentes.

## Limites conhecidos

- Duas camadas visuais simultâneas; efeitos são transformações de textura 2D. Não há mundo 3D nem reconstrução de profundidade.
- Áudio nativo de sistema apenas no Linux e na saída padrão do momento em que se inicia a captura.
- Detecção de BPM por intervalos de onsets é heurística; pode errar em música complexa. Ajuste manual/TAP está disponível e alimenta o relógio de batidas.
- A biblioteca depende dos dados deste navegador. Faça exportações para backup; limpar dados do site apaga a biblioteca local.
- O aplicativo registra modelo/seed/parâmetros, mas não inventa uma versão imutável do modelo que o provedor não expõe.
- Geração fornece estado real e espera indeterminada; não inventa percentual. Sem credencial configurada, oferece erro claro.
