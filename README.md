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
- **Geração de imagens:** a opção recomendada é a geração local, sem chave, com AUTOMATIC1111 / Forge (`A1111_URL`); veja abaixo. Dois provedores hospedados também estão disponíveis — selecione no painel de geração ou voz e informe sua chave (válida até encerrar o serviço), ou configure no `.env`:

| Provedor | Variável |
| --- | --- |
| Local · AUTOMATIC1111 / Forge (sem chave) | `A1111_URL` |
| OpenAI · GPT Image | `OPENAI_API_KEY` |
| Google · Gemini / Nano Banana | `GEMINI_API_KEY` |

- **Voz:** ative na interface. Para transcrição de gravações, use a transcrição local (abaixo), configure `GROQ_API_KEY` ou `VOICE_TRANSCRIPTION_URL`; também há reconhecimento do navegador quando disponível.

```bash
node --env-file=.env server/index.mjs
```

Imagens locais e efeitos funcionam sem configurar um provedor de IA.
O preview online oferece os decks e o temporizador; voz com geração e chaves usam a versão local.

Testes: `npm test`. Testes do serviço de transcrição local: veja abaixo.

### Transcrição local em português

`scripts/local_asr.py` é um serviço opcional que roda neste computador com faster-whisper em CPU (int8, 4 threads, um pedido por vez). Ele expõe `POST /v1/audio/transcriptions` (multipart, campo `file`, compatível com o formato OpenAI) e `GET /health`. O áudio é processado em memória e não é salvo em disco; o serviço só escuta em `127.0.0.1`, aceita apenas WAV PCM mono 16 bits 16 kHz de até 20 segundos e responde somente com texto. Português é o padrão; `pt-BR` é normalizado para `pt`.

Preparação (uma vez):

```bash
python3 -m venv .venv-asr
.venv-asr/bin/pip install -r scripts/requirements-asr.txt
```

Baixe manualmente um modelo faster-whisper no formato CTranslate2 para um diretório local. O serviço carrega somente do disco (`local_files_only`) e não baixa nada durante a execução.

Execução (use um token novo e aleatório; o serviço não inicia sem `LOCAL_ASR_TOKEN`):

```bash
LOCAL_ASR_TOKEN='troque-por-um-token-longo' LOCAL_ASR_MODEL=/caminho/para/modelo-ct2 .venv-asr/bin/python scripts/local_asr.py
```

Verificação: `curl http://127.0.0.1:9000/health` deve retornar `"ready": true` depois que o modelo carregar.

Para o Synesthesia usar o serviço, defina no `.env` do aplicativo (use o mesmo token):

```bash
VOICE_TRANSCRIPTION_URL=http://127.0.0.1:9000/v1/audio/transcriptions
VOICE_API_KEY=troque-por-um-token-longo
VOICE_LANGUAGE=pt-BR
```

Se `GROQ_API_KEY` também estiver definida, o endereço configurado em `VOICE_TRANSCRIPTION_URL` continua sendo usado; remova `GROQ_API_KEY` para não confundir a configuração. A interface mostra "Transcrição local configurada" quando o endereço é loopback.

Testes do serviço (no mesmo ambiente; `httpx` é necessário para o cliente de teste):

```bash
.venv-asr/bin/pip install httpx
python3 -m unittest discover -s tests/python -p 'test_*.py'
```

Recursos: o modelo fica na memória. Modelos `base` ou `small` em CPU int8 costumam caber em algumas centenas de MB a cerca de 1–2 GB de RAM; modelos maiores exigem mais. Uma transcrição de até 20 segundos leva alguns segundos em 4 núcleos. Esses valores são estimativas, não medidas neste projeto.

Fluxo de uso:

1. Marque **Ativar voz** no painel **Voz**. Isso autoriza o envio de cada pedido.
2. Clique em **◉ Voz** ou em **◉ Falar** (ou pressione LS). O microfone só abre depois desse clique.
3. Descreva a imagem em português.
4. Clique em **■ Finalizar gravação** (ou pressione de novo). A transcrição é enviada ao serviço local e o texto reconhecido aparece em um campo editável.
5. Revise ou edite o texto. Clique em **✦ Gerar imagem** para gerar, ou em **◉ Regravar** para falar de novo.
6. A imagem pronta entra no deck B; o temporizador continua exibindo a imagem atual.

Se o serviço não responder ou não reconhecer a fala, a mensagem de erro aparece no painel; nenhum texto é inventado.
