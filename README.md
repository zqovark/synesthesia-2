# Synesthesia 2

Instrumento audiovisual em tempo real para compor imagens, efeitos e modulações sincronizadas ao áudio. Inclui macros editáveis, cenas, biblioteca local, controle por gamepad e geração de imagens por IA.

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

```bash
node --env-file=.env server/index.mjs
```

Imagens locais e efeitos funcionam sem configurar um provedor de IA.

Testes: `npm test`.
