# Synesthesia 2

Instrumento audiovisual em tempo real para compor imagens, efeitos e modulações sincronizadas ao áudio. Inclui macros editáveis, cenas, biblioteca local, controle por gamepad e geração de imagens por IA.

Dois decks com CUE, temporizador por imagem e transições. Voz opcional pelo botão **Voz** ou **LS**: descreva a próxima imagem para gerá-la e prepará-la no deck B.

[Abrir preview](https://zqovark.github.io/synesthesia-2/)

## Executar

Requer Node.js 22+ e navegador com WebGL 2.

```bash
git clone https://github.com/zqovark/synesthesia-2.git
cd synesthesia-2
npm start
```

Abra http://127.0.0.1:4310.

## Configuração

- **Áudio do sistema no Linux:** PipeWire/PulseAudio com `pactl` e `parec` disponíveis.
- **Geração de imagens:** selecione um provedor no painel de geração ou voz e informe sua chave (válida até encerrar o serviço). Também é possível configurar no `.env`:

| Provedor | Variável |
| --- | --- |
| NVIDIA · Cosmos3 Nano (Free Endpoint / preview) | `NVIDIA_API_KEY` |
| OpenAI · GPT Image | `OPENAI_API_KEY` |
| Google · Gemini / Nano Banana | `GEMINI_API_KEY` |
| Black Forest Labs · FLUX.2 Pro | `BFL_API_KEY` |
| fal.ai · FLUX.2 | `FAL_KEY` |
| Replicate · FLUX.2 Pro | `REPLICATE_API_TOKEN` |

O preview gratuito da NVIDIA exige chave e está sujeito a limites e disponibilidade. AUTOMATIC1111 local (`A1111_URL`) também está disponível.

- **Voz:** ative na interface. Para transcrição de gravações, configure `GROQ_API_KEY` ou `VOICE_TRANSCRIPTION_URL`; também há reconhecimento do navegador quando disponível.

```bash
node --env-file=.env server/index.mjs
```

Imagens locais e efeitos funcionam sem configurar um provedor de IA.
O preview online oferece os decks e o temporizador; voz com geração e chaves usam a versão local.

Testes: `npm test`.
