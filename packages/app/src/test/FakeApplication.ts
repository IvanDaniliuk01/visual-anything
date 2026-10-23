/**
 * Stands in for PixiJS's `Application`, which needs WebGL and jsdom has none. Each `init` stays pending
 * until the test settles it, so tests can interleave initialization with mounting and unmounting.
 */
export class FakeApplication {
  static created: FakeApplication[] = [];

  readonly canvas = document.createElement('canvas');
  readonly stage = {
    contents: [] as unknown[],
    addChild: (item: unknown): unknown => {
      this.stage.contents.push(item);
      return item;
    },
  };
  readonly renderer = {
    resolution: 1,
    screen: { width: 1, height: 1 },
    resize: (width: number, height: number): void => {
      this.renderer.screen = { width, height };
    },
  };
  renders = 0;
  destroyed = false;
  initOptions: Record<string, unknown> | undefined;
  private settle: { resolve: () => void; reject: (error: Error) => void } | undefined;

  constructor() {
    FakeApplication.created.push(this);
  }

  init(options: Record<string, unknown>): Promise<void> {
    this.initOptions = options;
    return new Promise((resolve, reject) => {
      this.settle = { resolve, reject };
    });
  }

  render(): void {
    this.renders += 1;
  }

  destroy(removeView?: boolean | { removeView?: boolean }): void {
    this.destroyed = true;
    if (removeView === true || (typeof removeView === 'object' && removeView.removeView)) {
      this.canvas.remove();
    }
  }

  /** Lets a pending `init` succeed. */
  finishInit(): void {
    this.settle?.resolve();
  }

  /** Makes a pending `init` fail, as it does where WebGL is unavailable. */
  failInit(error: Error): void {
    this.settle?.reject(error);
  }
}

/** Stands in for `ResizeObserver`, which jsdom lacks; `resizeAll` delivers a resize to every observer. */
export class FakeResizeObserver {
  static observers: FakeResizeObserver[] = [];

  private readonly targets = new Set<Element>();

  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.observers.push(this);
  }

  observe(target: Element): void {
    this.targets.add(target);
  }

  unobserve(target: Element): void {
    this.targets.delete(target);
  }

  disconnect(): void {
    this.targets.clear();
  }

  static resizeAll(): void {
    for (const observer of FakeResizeObserver.observers) {
      if (observer.targets.size > 0) observer.callback([], observer);
    }
  }
}
