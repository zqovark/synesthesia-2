# Synesthesia 2

Instrumento audiovisual local: imagens, áudio, macros e gamepad. Identidade cósmica e sublime bíblico. Projeto independente do Synesthesia original.

## Executar

Node 22 ou superior. Não há dependências npm de execução nem recursos de CDN.

```bash
git clone https://github.com/zqovark/synesthesia-2.git
cd synesthesia-2
npm start
```

Abra **http://127.0.0.1:4310** no Firefox ou Chromium com WebGL 2 habilitado. Use esse endereço exato; o serviço aceita apenas loopback e verifica origem e sessão. Não publique este servidor diretamente na internet.

O instrumento abre com duas matérias procedurais locais, identificadas como procedurais. Importe PNG, JPEG ou WebP para transformá-las na GPU. Nenhuma imagem inicial é apresentada como resultado de IA.

## Operar

- **Palco:** arraste horizontalmente para profundidade e verticalmente para espiral. O painel lateral oferece mescla, deslocamento, espiral, anéis, túnel, simetria, zoom e luz.
- **Matérias:** selecione até duas camadas A/B. A terceira substitui a mais antiga. Clique novamente para retirar. Biblioteca oferece detalhes, metadados, exportação e exclusão.
- **Macros:** anéis ajustam intensidade; clicar no nome edita destinos, deltas e curvas. “Compor macro” cria uma nova. A interface mostra contribuições `M` manual, `Σ` macros e `♪` áudio por parâmetro.
- **Áudio:** abra um arquivo ou use o monitor de saída do Linux. “Rotear o áudio” configura banda, intensidade, suavização e limites. TAP ou BPM manual alimentam o relógio de batidas; a estimativa automática mostra confiança. Avanço de matéria por batida é opcional.
- **Cenas:** salvam imagens referenciadas, parâmetros, macros, associações e preferências visuais. Exporte a cena **com imagens** para outro navegador ou computador. As imagens importadas e geradas ficam em IndexedDB, não em URLs temporárias. O arquivo de áudio não é incluído na cena.
- **Performance:** o botão ⛶ recolhe os instrumentos; o botão no canto ou Start os traz de volta. Escape fecha painéis. Ajustes oferece luminosidade, pulso (desligado inicialmente) e redução de movimento da interface.

## Áudio do computador no Linux / Omarchy

O serviço lê `pactl get-default-sink`, verifica o monitor `<saída>.monitor` e inicia `parec` nesse monitor. Ele não captura microfone e não reproduz novamente o som. Só características espectrais são enviadas à interface, por SSE. Trocar a saída do sistema exige parar e iniciar a captura novamente.

No Arch / Omarchy, confira se os utilitários estão disponíveis:

```bash
sudo pacman -S pipewire-pulse libpulse
command -v pactl
command -v parec
pactl list short sources
```

No Kubuntu, os utilitários vêm de `pulseaudio-utils` e a compatibilidade PulseAudio do PipeWire deve estar ativa. Falta de executável, monitor ou permissão aparece como erro. Em outros sistemas, use arquivo de áudio nesta versão. Captura de tela do navegador não é usada como promessa de áudio do sistema.

## Controle Xbox

| Entrada | Operação padrão |
| --- | --- |
| Direcional | Navegar; esquerda/direita ajustam o campo numérico, seletor ou slider em foco |
| A / B | Operar / fechar painel ou voltar aos instrumentos |
| LB / RB | Selecionar macro anterior / próxima |
| LT / RT | Diminuir / aumentar intensidade da macro selecionada |
| RS horizontal | Alterar o efeito selecionado, de forma relativa |
| Back / pressionar RS | Selecionar efeito anterior / próximo |
| X / Y | Próxima matéria / cena salva |
| Start | Recolher / mostrar os instrumentos |

Requer gamepad com mapeamento `standard` na Gamepad API. Após conectar, pressione um botão se o navegador ainda não o expuser e solte todos os comandos para armar a entrada. Desconectar mantém os valores; reconectar exige posição neutra para evitar saltos. Ajustes permite trocar botões e zona morta. Eixos/gatilhos usam o layout Xbox padrão.

Presets, seed, ajustes e confirmação de geração são acessíveis por foco/direcional. Prompts livres e nomes aceitam teclado. O seletor nativo de arquivos depende da navegação oferecida pelo sistema operacional.

## Gerar imagens

O motor visual não depende de conta externa. A geração usa um serviço separado e nunca é disparada por eixo contínuo.

**NVIDIA SDXL:** configure uma credencial com acesso ao endpoint gerador. Copie `.env.example` para `.env`, preencha `NVIDIA_API_KEY` e inicie:

```bash
node --env-file=.env server/index.mjs
```

**AUTOMATIC1111 local:** inicie sua instalação com `--api` e defina `A1111_URL=http://127.0.0.1:7860`; opcionalmente `A1111_MODEL` fixa o checkpoint. O aplicativo não instala nem baixa modelos. Use o `/docs` da sua instalação para conferir a compatibilidade. Geração local compete pela GPU com a composição; ajuste a carga ao hardware.

“Gerar matéria” oferece onze famílias de presets, prompt editável, seed, variações, passos, orientação e salvamento de presets. Cada envio exige confirmação explícita de possível consumo de créditos. Um job roda por vez; progresso é indeterminado quando o provedor não informa percentual. Cancelar aborta a requisição local, mas não garante que o provedor pare de processar nem que deixe de cobrar. Não há repetição automática.

Resultados são adicionados à biblioteca e composição, com prompt, seed solicitada/retornada, modelo, provedor e parâmetros. Repetir seed e parâmetros não garante reprodução idêntica. Os resultados temporários do serviço expiram após dez minutos; a cópia salva no navegador permanece até exclusão ou limpeza dos dados do navegador.

## Validação

```bash
npm test
npm run check
# Opcional no Linux com Mesa EGL / libGL:
python scripts/check-gpu.py
# Opcional: integração em navegador
npm install --no-save --package-lock=false playwright@1.62.1
npx playwright install chromium
node scripts/smoke-browser.mjs
```

Veja [o registro de validação e roteiro de hardware](docs/VALIDATION.md), [a arquitetura](docs/ARCHITECTURE.md) e [o mapa técnico para estudar](docs/LEARNING.md). O workflow verifica Node 22/24 e um navegador Chromium com entradas e geração simuladas; não usa credenciais de IA.

Os adaptadores de geração foram testados com respostas simuladas. Áudio de monitor real, gamepad físico e desempenho no Nitro V15 precisam de validação nesse hardware. A meta de 60 FPS em 1080p é um objetivo de medição, não um resultado afirmado.
