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
- **Geração de imagens:** configure `NVIDIA_API_KEY` ou `A1111_URL` no `.env` e execute:
- **Voz:** ative na interface. Para transcrição de gravações, configure `GROQ_API_KEY` ou `VOICE_TRANSCRIPTION_URL`; também há reconhecimento do navegador quando disponível.

```bash
node --env-file=.env server/index.mjs
```

Imagens locais e efeitos funcionam sem configurar um provedor de IA.

Testes: `npm test`.
