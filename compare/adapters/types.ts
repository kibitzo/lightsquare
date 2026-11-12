/** What the benchmark asks of every board, so that each one is driven the same way. */
export interface Handle {
  /** Resolves when the board shows its first position. */
  ready: Promise<void>;
  /** Show a position, sliding the pieces or not. May return a promise that ends when the board has taken the change. */
  set(fen: string, animate: boolean): void | Promise<unknown>;
  /** Let the user move any piece anywhere, as far as the board allows it. */
  movable(): void;
  destroy(): void;
}

export interface Setup {
  fen: string;
  /** How long a slide takes, in milliseconds: the same for every board. */
  ms: number;
}

export type Create = (el: HTMLElement, setup: Setup) => Handle;
