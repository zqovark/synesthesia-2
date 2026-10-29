# Mapa técnico

Uma trilha curta para estudar o instrumento que está executando:

1. **Parâmetros e tempo — `src/core/instrument.js`:** comece em `step`. Cada frame é reconstruído de baseline + deltas; áudio nunca altera permanentemente o valor manual. A suavização exponencial usa segundos, não uma fração fixa por frame. Experimente uma macro com delta negativo e acompanhe `sources`.
2. **PCM e FFT — `src/audio/dsp.js`:** uma amostra é um número no tempo. A janela de Hann reduz vazamento espectral, a FFT separa frequências e as bandas agregam bins. O Node lê float32 little-endian de `parec`; o navegador usa seu AnalyserNode. O arquivo de teste gera senos de frequências conhecidas.
3. **Batida e andamento — `PulseTracker` e `src/audio/clock.js`:** um onset detectado não é prova de BPM. Compare picos com uma média móvel, aplique período refratário e estime intervalos; o relógio manual é uma referência explícita. Testes de sinais sintéticos mostram os limites do algoritmo.
4. **GPU e GLSL — `src/visuals/shaders.js`:** um quad cobre a tela. O fragment shader transforma coordenadas UV, amostra duas texturas e combina cores. O túnel é uma ilusão produzida por coordenadas polares/logarítmicas. Comece alterando `spiral` ou a função `mirrorUV`.
5. **Recursos da GPU — `renderer.js`:** CPU decodifica imagens, limita resolução e envia textura para a GPU. Durante crossfade, mantém o par anterior. Tickets identificam a seleção mais recente; cargas pendentes precisam sobreviver ao descarte de pedidos antigos. Todo `createTexture` precisa de um `deleteTexture` correspondente.
6. **Entrada — `input/gamepad.js`:** polling, bordas de botão, zona morta e comandos relativos. Uma posição absoluta do analógico não deve sobrescrever seu baseline ao reconectar. Os testes simulam botões mantidos e desconexão; o dispositivo físico continua sendo outra camada de validação.
7. **Jobs e rede — `server/jobs.mjs` e `providers.mjs`:** a geração é assíncrona e separada do loop de animação. AbortController cancela a espera; não desfaz uma cobrança. Os contratos dos provedores retornam bytes e metadados, sem conhecer WebGL ou a interface.
8. **Persistência — `storage/library.js`:** Blobs sobrevivem à recarga em IndexedDB; object URLs não. URLs são apenas uma ponte transitória para imagens/GPU, precisam ser revogadas e não devem ser o conteúdo salvo de uma cena.

O código do Synesthesia original serviu como referência de conceitos e comportamento. Esta implementação não importa seu framework nem incorpora seus arquivos. A interface pode ser substituída sem reescrever FFT, arbitragem, gamepad ou adaptadores.
