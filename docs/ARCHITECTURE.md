# Synesthesia 2 — decisão de arquitetura

Inspeção em 29/10/2026: Synesthesia `4970bfd5fbbf8e02db1b9b3c5c1ec2a56f4e44b7`, EXOGRAMMAR v9.3. Foram lidos AudioGraph, bands, beat, tempo, renderer, shaders/pipeline, modulation, texturePool e useTexturePool. O original usa Next/Three, quad com GLSL, FFT em quatro bandas, kick por energia e autocorrelação de andamento. Uploads usam URLs temporárias e não sobrevivem ao reload; Unsplash domina a biblioteca. O novo código é uma implementação independente; nenhum arquivo do original é copiado (o repositório não declara licença).

## Opções

| Opção | Áudio do sistema Linux | GPU / gamepad | Distribuição / aprendizado |
| --- | --- | --- | --- |
| Navegador puro | getDisplayMedia depende do navegador e fonte; não garantido | WebGL e Gamepad API | Simples, mas captura inconsistente |
| Interface web + serviço local Node | Monitor real de saída via parec / pipewire-pulse | WebGL explícito e Gamepad API | Node 22+, sem dependências npm; permite estudar PCM, FFT, GLSL e eventos |
| Electron | Exige validar loopback Linux; o empacotamento não resolve por si | Chromium previsível | Binário maior, manutenção e permissões extras |
| Rust + wgpu / cpal | Controle nativo, integração PipeWire a construir | GPU/input nativos | Maior complexidade de distribuição e tempo para validar o produto |

Escolha: interface web local + Node. A aplicação inicia em localhost, sem CDN. O núcleo puro é independente de DOM. O servidor cuida de credenciais, jobs e captura; imagens, cenas e configurações ficam no IndexedDB. A interface é substituível. A captura do monitor envia apenas características espectrais por SSE, sem reproduzir o som novamente. Arquivos são tocados e analisados localmente no Web Audio.

## Fluxos

1. Abrir: composição procedural local já funciona. Importar imagens, selecionar A/B e transformar na GPU.
2. Arquivo ou monitor de saída → FFT → bandas / onsets → modulações limitadas e suavizadas → uniforms.
3. Imagens + parâmetros + macros + associações → cena persistida; trocas interpolam valores e texturas.
4. Preset editável + seed → pedido explícito → job assíncrono → biblioteca local → composição.
5. Gamepad → comandos do mesmo instrumento; modificador LB seleciona macro/efeito; eixos são relativos, não absolutos.

## Arbitragem

Em cada frame: `clamp(base manual + soma de macros + soma de áudio, limites do parâmetro)`, seguido de suavização temporal. Nunca acumular áudio no baseline. Cada macro interpola o delta mínimo/máximo pela curva e multiplica pela intensidade (intensidade zero é neutra). Deltas negativos invertem o movimento. A UI expõe contribuição manual/macro/áudio. Valores efetivos são preservados na troca de cena para interpolar; modificações não dependem do FPS.

## Forma

Palco dominante como abertura monumental. Anéis mostram a intensidade de macros; imagem é a superfície manipulável; fita inferior reúne as matérias visuais. Obsidiana/índigo, marfim e ouro envelhecido; serif nos nomes, mono nos instrumentos. A iconografia de rodas e firmamento descreve movimento e relações, sem versículos inventados nem alegações canônicas. Modo performance recolhe os controles; opções independentes de luminosidade, pulso e movimento da interface.

## Blocos verificáveis

1. Núcleo, contratos, arbitragem e testes puros.
2. Renderizador WebGL, biblioteca local, análise de arquivos e monitor Linux.
3. Macros editáveis, cenas, persistência, gamepad configurável e interface.
4. Provedores substituíveis, presets, geração cancelável e falhas isoladas.
5. Testes de integração, navegador, documentação e roteiro com hardware.

## Fontes técnicas

- https://github.com/zqovark/synesthesia/tree/4970bfd5fbbf8e02db1b9b3c5c1ec2a56f4e44b7/src
- https://github.com/holasoyneto/codex/blob/main/EXOGRAMMAR.md
- https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia (áudio opcional, dependente de navegador e sistema)
- https://www.freedesktop.org/software/pulseaudio/doxygen/sample.html (PCM float32)
- https://docs.api.nvidia.com/nim/reference/stabilityai-stable-diffusion-xl-infer (SDXL gera imagens, não interpreta imagens)
- https://docs.api.nvidia.com/nim/reference/stabilityai-stable-diffusion-3-medium (alternativa geradora investigada; não implementada)

Meta a medir no Nitro V15 / RTX 3050: 60 FPS em 1920×1080, duas texturas de até 2048 px, 20 minutos, sem aumento persistente de recursos. Não é uma medição já realizada. Profundidade é aparente, produzida por UVs; não há geometria 3D de cena.
