/**
 * Contrato do ADAPTER DE SITE. O núcleo do robô só conhece estes tipos; toda
 * particularidade de um site (URLs, seletores, textos) vive num SiteProfile
 * declarativo (JSON), que pode ser atualizado sem tocar no núcleo.
 */

/** Estratégia de seleção. Uma lista de Sel é avaliada em ordem: principal → fallbacks. */
export interface Sel {
  /** Seletor CSS. */
  css: string;
  /** Se informado, o texto do elemento precisa conter algum destes termos (normalizado). */
  text?: string[];
  /** Seletor CSS (relativo ao elemento) de onde ler o texto. */
  textIn?: string;
  /** Exige elemento visível (padrão: true). */
  visible?: boolean;
}

export type MatchSource = 'sectors' | 'categories' | 'events' | 'any';

interface StepBase {
  id: string;
  label: string;
  /** Passo opcional: se o elemento não aparecer, segue para o próximo. */
  optional?: boolean;
  /** Timeout específico do passo (ms). Padrão: settings.timeouts.elementMs. */
  timeoutMs?: number;
}

/** Escolhe um item (setor/categoria/evento) pela lista de preferências do usuário. */
export interface PickStep extends StepBase {
  kind: 'pick';
  items: Sel[];
  /** Seletor (relativo ao item) de onde ler o nome. Padrão: o próprio item. */
  textIn?: string;
  source: MatchSource;
  /** Seletor (relativo ao item) do elemento a clicar. Padrão: o próprio item. */
  clickTarget?: string;
  /** Usado para verificar disponibilidade antes de entrar em SELECTING. */
  probe?: boolean;
}

/** Ajusta a quantidade (input/select ou botão "+"). */
export interface QuantityStep extends StepBase {
  kind: 'quantity';
  input?: Sel[];
  increment?: Sel[];
  /** 'picked': procura dentro do último item escolhido; 'document': na página toda. */
  scope?: 'picked' | 'document';
}

/** Clique simples em botão/link. `critical` = protegido pelo ledger (ex.: adicionar ao carrinho). */
export interface ClickStep extends StepBase {
  kind: 'click';
  target: Sel[];
  critical?: boolean;
}

/** Aguarda um elemento aparecer. */
export interface WaitStep extends StepBase {
  kind: 'wait';
  for: Sel[];
}

export type Step = PickStep | QuantityStep | ClickStep | WaitStep;

export interface PageRules {
  eventList?: string[];
  event?: string[];
  cart?: string[];
  checkout?: string[];
  login?: string[];
  success?: string[];
  queue?: string[];
  blocked?: string[];
}

export interface DomSignals {
  eventList?: Sel[];
  event?: Sel[];
  cart?: Sel[];
  checkout?: Sel[];
  login?: Sel[];
  success?: Sel[];
  loading?: Sel[];
  challenge?: Sel[];
  queue?: Sel[];
  blocked?: Sel[];
  error?: Sel[];
  /** Indicador de que já há itens no carrinho (badge/contador). */
  cartFilled?: Sel[];
}

export interface TextSignals {
  soldOut?: string[];
  challenge?: string[];
  queue?: string[];
  blocked?: string[];
  error?: string[];
  /** Mensagens que confirmam inclusão no carrinho. */
  cartConfirmed?: string[];
  /** Mensagens que indicam que a ação crítica foi rejeitada (esgotado, limite, etc.). */
  actionFailed?: string[];
}

export interface SiteProfile {
  id: string;
  name: string;
  /** Versão do perfil; incremente ao atualizar seletores. */
  version: number;
  /** Domínios atendidos (sufixo). Ex.: "eleventickets.com". */
  hosts: string[];
  /** Perfil testado contra o site real? (perfis herdados do código antigo começam como false). */
  verified?: boolean;
  notes?: string;
  pages: PageRules;
  dom?: DomSignals;
  texts?: TextSignals;
  /** Página de lista de eventos: itens e link a clicar. */
  eventList?: { items: Sel[]; textIn?: string; clickTarget?: string };
  /** Passos de seleção na página do evento, em ordem. */
  steps: Step[];
  /** Botão para seguir do carrinho ao checkout (sem pagar). */
  cart?: { proceed?: Sel[] };
}
