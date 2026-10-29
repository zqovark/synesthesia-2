/** Speech transcription adapter. URL/credentials are server configuration, never browser input. */
export class VoiceService {
  constructor(env=process.env,fetcher=fetch){
    this.fetcher=fetcher;
    this.endpoint=env.VOICE_TRANSCRIPTION_URL||(env.GROQ_API_KEY?'https://api.groq.com/openai/v1/audio/transcriptions':'');
    this.key=env.VOICE_API_KEY||env.GROQ_API_KEY||'';
    this.model=env.VOICE_TRANSCRIPTION_MODEL||(env.GROQ_API_KEY?'whisper-large-v3-turbo':'');
    this.language=env.VOICE_LANGUAGE||(env.GROQ_API_KEY?'pt':'pt-BR');
    if(this.endpoint){const u=new URL(this.endpoint);if(u.username||u.password||!(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))))throw new Error('VOICE_TRANSCRIPTION_URL deve usar HTTPS ou HTTP local.');}
    this.busy=false;
  }
  status(){return {configured:!!this.endpoint,model:this.model||null,language:this.language};}
  async transcribe(input,signal){
    if(!this.endpoint)throw new Error('Configure GROQ_API_KEY ou VOICE_TRANSCRIPTION_URL para transcrever a voz.');
    if(this.busy)throw new Error('Já existe uma transcrição em andamento.');
    if(input?.confirmed!==true)throw new Error('Ative o controle por voz antes de enviar áudio.');
    if(typeof input.audio!=='string'||input.audio.length>1400000)throw new Error('Gravação excede o limite de 20 segundos.');
    const bytes=Buffer.from(input.audio,'base64');
    if(bytes.length<44||bytes.length>640044||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE'||bytes.readUInt32LE(24)!==16000||bytes.readUInt16LE(22)!==1||bytes.readUInt16LE(34)!==16)throw new Error('Envie WAV PCM mono, 16 bits e 16 kHz, até 20 segundos.');
    const form=new FormData();form.set('file',new Blob([bytes],{type:'audio/wav'}),'voice.wav');form.set('response_format','json');form.set('language',this.language);if(this.model)form.set('model',this.model);
    this.busy=true;
    try{
      const response=await this.fetcher(this.endpoint,{method:'POST',headers:this.key?{Authorization:'Bearer '+this.key}:{},body:form,redirect:'error',signal:AbortSignal.any([signal??new AbortController().signal,AbortSignal.timeout(45000)])});
      if(!response.ok){await response.body?.cancel();throw new Error(response.status===401||response.status===403?'Credencial de transcrição recusada.':'Transcrição retornou HTTP '+response.status+'.');}
      const reader=response.body.getReader(),chunks=[];let size=0;
      for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw new Error('Resposta de transcrição excede o limite.');}chunks.push(Buffer.from(value));}
      const result=JSON.parse(Buffer.concat(chunks).toString()),text=result.text?.trim();
      if(typeof text!=='string'||!text||text.length>4000)throw new Error('Não foi possível reconhecer um pedido. Tente falar novamente.');
      return {text,model:this.model||null};
    }finally{this.busy=false;}
  }
}
