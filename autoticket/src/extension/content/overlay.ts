import type { Phase } from '../../core/types';
import { displayStatus } from '../../core/types';

/**
 * Indicador na página (Shadow DOM, fora do <body>): o usuário sempre vê o que o
 * robô está fazendo e tem um botão de parada na própria aba. Fica fora do body
 * para não interferir na leitura de texto da página pelos detectores.
 */
const COLORS: Record<string, string> = {
  PARADO: '#6b7280',
  EXECUTANDO: '#2563eb',
  AGUARDANDO: '#d97706',
  PROCESSANDO: '#7c3aed',
  PAUSADO: '#6b7280',
  FINALIZADO: '#16a34a',
  ERRO: '#dc2626',
};

export class Overlay {
  private host: HTMLElement | null = null;
  private label: HTMLElement | null = null;
  private dot: HTMLElement | null = null;
  private reason: HTMLElement | null = null;

  constructor(
    private readonly doc: Document,
    private readonly onStop: () => void,
  ) {}

  show(phase: Phase, reason?: string): void {
    if (!this.host) this.mount();
    const status = displayStatus(phase);
    if (this.label) this.label.textContent = `AutoTicket · ${status}`;
    if (this.dot) this.dot.style.background = COLORS[status] ?? '#6b7280';
    if (this.reason) this.reason.textContent = reason ?? '';
  }

  remove(): void {
    this.host?.remove();
    this.host = null;
  }

  private mount(): void {
    const host = this.doc.createElement('autoticket-status');
    host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647; top: 12px; right: 12px;';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `
      <style>
        .box { font: 12px/1.35 system-ui, sans-serif; background: rgba(17,24,39,.92); color: #f9fafb; border-radius: 10px;
               padding: 8px 10px; max-width: 280px; box-shadow: 0 4px 16px rgba(0,0,0,.35); }
        .row { display: flex; align-items: center; gap: 8px; }
        .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
        .label { font-weight: 600; flex: 1; }
        .reason { margin-top: 4px; color: #d1d5db; }
        button { all: unset; cursor: pointer; background: #dc2626; color: #fff; border-radius: 6px; padding: 2px 8px; font-weight: 600; }
        button:focus-visible { outline: 2px solid #fff; }
      </style>
      <div class="box" role="status" aria-live="polite">
        <div class="row"><span class="dot"></span><span class="label"></span><button type="button" title="Parar o robô">Parar</button></div>
        <div class="reason"></div>
      </div>`;
    this.dot = root.querySelector('.dot');
    this.label = root.querySelector('.label');
    this.reason = root.querySelector('.reason');
    root.querySelector('button')?.addEventListener('click', () => this.onStop());
    // Anexado ao <html>, não ao <body>.
    this.doc.documentElement.appendChild(host);
    this.host = host;
  }
}
