import { app, $, el, input, field, select, button, help, panelError, openDrawer, notify, safe } from './app.js';
import { VoiceInput, voiceWav } from './input/voice.js';
import { STATIC_PREVIEW } from './runtime.js';
let enabled = false,
  mode = 'recording',
  phase = 'idle',
  transcript = '',
  errorMessage = '',
  operation = 0,
  abort = null,
  capabilities = null;
if (app.db) {
  const saved = await app.db.get('settings', 'voice').catch(() => null);
  enabled = saved?.enabled === true;
  mode = saved?.mode === 'browser' ? 'browser' : 'recording';
}
const labels = {
  idle: 'Pronto para o próximo pedido',
  permission: 'Aguardando permissão do microfone',
  recording: 'Gravando · pressione novamente para finalizar',
  recognizing: 'Escutando · diga como será a próxima imagem',
  transcribing: 'Transcrevendo o pedido',
  review: 'Revise o texto e clique em “Gerar imagem”',
  generating: 'Gerando a próxima imagem',
  queued: 'Imagem pronta no deck B',
  cancelled: 'Pedido cancelado',
  error: 'Não foi possível concluir o pedido'
};
function render() {
  $('#voice-open').setAttribute('aria-pressed', String(capture.listening));
  $('#voice-open').textContent = capture.listening ? '■ Parar voz' : '◉ Voz';
  const state = $('#voice-phase');
  if (state) state.textContent = labels[phase] ?? phase;
  const text = $('#voice-transcript');
  // Keep the editable field in sync with the transcript, but never clobber what
  // the user is actively editing before generation.
  if (text && text !== document.activeElement) text.value = transcript;
  if (text) text.disabled = STATIC_PREVIEW || capture.listening || ['transcribing', 'generating'].includes(phase);
  const error = $('#voice-error');
  if (error) error.textContent = errorMessage;
  const control = $('#voice-record');
  if (control) {
    control.textContent = capture.listening ? '■ Finalizar gravação' : (phase === 'review' ? '◉ Regravar' : '◉ Falar');
    control.disabled = STATIC_PREVIEW || !enabled || ['transcribing', 'generating'].includes(phase);
  }
  const generate = $('#voice-generate');
  if (generate) {
    generate.hidden = phase !== 'review';
    generate.disabled = STATIC_PREVIEW || phase !== 'review' || !transcript.trim();
  }
  const provider = $('#image-provider');
  if (provider) provider.disabled = capture.listening || ['transcribing', 'generating'].includes(phase);
}
function fail(error) {
  if (error.name === 'AbortError') return;
  phase = 'error';
  errorMessage = error.message;
  notify(error.message);
  render();
}
function setPhase(next) {
  phase = next;
  render();
}
const capture = new VoiceInput({
  onState(state) {
    if (state !== 'idle') setPhase(state);else render();
  },
  onError: fail,
  onText: text => received(text, operation),
  onAudio: blob => void transcribe(blob, operation)
});
async function persist() {
  await app.db?.put('settings', {
    id: 'voice',
    enabled,
    mode
  });
}
// Transcribed text is shown for review and editing; generation waits for an
// explicit "Gerar imagem" click (or re-record) so the user controls the prompt.
function received(text, ticket) {
  if (ticket !== operation) return;
  transcript = text;
  setPhase('review');
}
async function confirmGenerate() {
  if (phase !== 'review') return;
  const text = (($('#voice-transcript')?.value ?? transcript)).trim();
  if (!text) {
    errorMessage = 'Descreva a imagem antes de gerar.';
    render();
    return;
  }
  await submit(text, operation);
}
async function submit(text, ticket) {
  if (ticket !== operation) return;
  try {
    transcript = text;
    setPhase('generating');
    await app.generation.generateNext(text);
    if (ticket !== operation) return;
    setPhase('queued');
  } catch (error) {
    if (ticket === operation) fail(error);
  }
}
async function transcribe(blob, ticket) {
  try {
    setPhase('transcribing');
    const wav = await voiceWav(blob);
    if (ticket !== operation) return;
    const bytes = new Uint8Array(await wav.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    abort = new AbortController();
    const result = await app.api('/api/voice/transcribe', {
      audio: btoa(binary),
      confirmed: true
    }, {
      signal: abort.signal
    });
    if (ticket !== operation) return;
    received(result.text, ticket);
  } catch (error) {
    if (ticket === operation) fail(error);
  }
}
function cancel() {
  ++operation;
  abort?.abort();
  abort = null;
  capture.cancel();
  if (phase === 'generating') void safe(() => app.generation.cancel())();
  phase = 'cancelled';
  errorMessage = '';
  transcript = '';
  render();
}
function panel() {
  openDrawer('Próxima imagem por voz', body => {
    body.append(help(STATIC_PREVIEW ? 'O pedido por voz com geração de imagem está disponível na versão local. O temporizador e os decks funcionam neste preview.' : 'Como usar: 1) ative a voz abaixo; 2) clique em “Falar” ou pressione LS; 3) descreva a imagem; 4) clique em “Finalizar gravação”; 5) revise ou edite o texto transcrito; 6) clique em “Gerar imagem”. A imagem pronta entra no deck B; o temporizador continua exibindo a imagem atual.'));
    const opt = input('checkbox');
    opt.id = 'voice-enabled';
    opt.checked = enabled;
    opt.disabled = STATIC_PREVIEW;
    opt.onchange = safe(async () => {
      enabled = opt.checked;
      if (!enabled) cancel();
      await persist();
      render();
    });
    body.append(field('Ativar voz e autorizar o envio de cada pedido para transcrição e geração de imagem (pode consumir créditos).', opt));
    const recognitionAvailable = !!capture.Recognition;
    const methods = [['recording', 'Gravação + transcrição configurada'], ...(recognitionAvailable ? [['browser', 'Reconhecimento do navegador']] : [])];
    const choice = select(methods, mode);
    choice.id = 'voice-method';
    choice.disabled = STATIC_PREVIEW;
    choice.onchange = safe(async () => {
      if (capture.listening) cancel();
      mode = choice.value;
      await persist();
    });
    body.append(field('Reconhecimento de fala · português', choice));
    const providers = el('div');
    body.append(providers);
    void app.generation.providerControls(providers).then(render).catch(e => notify(e.message));
    body.append(help('O microfone só é aberto ao iniciar um pedido. A gravação termina em até 20 segundos e não é salva. O reconhecimento do navegador pode enviar áudio ao serviço de voz do navegador.'));
    const state = el('div', 'voice-state');
    state.id = 'voice-phase';
    state.setAttribute('role', 'status');
    const text = el('textarea', 'voice-transcript');
    text.id = 'voice-transcript';
    text.rows = 3;
    text.placeholder = 'O texto reconhecido aparece aqui para você revisar antes de gerar.';
    text.setAttribute('aria-label', 'Texto reconhecido · edite se necessário');
    text.value = transcript;
    text.oninput = () => {
      transcript = text.value;
      const generate = $('#voice-generate');
      if (generate) generate.disabled = phase !== 'review' || !transcript.trim();
    };
    const error = el('p', 'error');
    error.id = 'voice-error';
    const record = button('◉ Falar', () => toggle());
    record.id = 'voice-record';
    const generate = button('✦ Gerar imagem', () => confirmGenerate());
    generate.id = 'voice-generate';
    generate.hidden = phase !== 'review';
    body.append(state, text, error, record, generate, button('Cancelar pedido', cancel));
    if (!STATIC_PREVIEW && capabilities?.voice?.configured === false) body.append(help('Para gravação, configure GROQ_API_KEY ou VOICE_TRANSCRIPTION_URL no serviço local. O modo de reconhecimento do navegador pode ser usado quando disponível.'));
    if (!STATIC_PREVIEW && capabilities?.voice?.configured) body.append(help(capabilities.voice.local ? 'Transcrição local configurada: o áudio é processado neste computador, em memória, e não é salvo.' : 'Transcrição configurada em serviço externo ao computador.'));
    panelError(body);
    render();
  }, 'VOICE → NEXT IMAGE');
}
async function toggle() {
  if (capture.listening) {
    capture.stop();
    render();
    return;
  }
  if (!enabled || STATIC_PREVIEW) {
    panel();
    return;
  }
  if (['transcribing', 'generating'].includes(phase)) {
    panel();
    return;
  }
  if (app.generation.busy) {
    notify('Aguarde a geração atual antes de gravar outro pedido.');
    return;
  }
  if (mode === 'recording' && capabilities?.voice?.configured === false) {
    panel();
    errorMessage = 'Configure a transcrição ou selecione reconhecimento do navegador.';
    render();
    return;
  }
  ++operation;
  errorMessage = '';
  transcript = '';
  panel();
  try {
    await capture.start(mode);
    render();
  } catch (error) {
    fail(error);
  }
}
app.voice = {
  toggle: () => void safe(toggle)(),
  cancel,
  panel,
  get listening() {
    return capture.listening;
  }
};
if (!STATIC_PREVIEW) fetch('/api/session').then(r => r.json()).then(data => capabilities = data).catch(() => {});
render();
