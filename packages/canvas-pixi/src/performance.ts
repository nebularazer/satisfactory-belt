export type RenderPerformanceSnapshot = Readonly<{
  rendersPerSecond: number;
  cpuMilliseconds: number;
  visibleItems: number;
  totalItems: number;
}>;

/** Samples actual renders without scheduling canvas work. Disabled monitors have no timer. */
export class RenderPerformance {
  private timer: ReturnType<typeof setInterval> | undefined;
  private started = 0;
  private renders = 0;
  private cpu = 0;
  private visibleItems = 0;
  private totalItems = 0;
  private listeners = new Set<() => void>();
  private snapshot: RenderPerformanceSnapshot = {
    rendersPerSecond: 0,
    cpuMilliseconds: 0,
    visibleItems: 0,
    totalItems: 0,
  };

  get enabled() {
    return this.timer !== undefined;
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  setEnabled(enabled: boolean, visibleItems = 0, totalItems = 0) {
    if (enabled === this.enabled) return;
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    this.renders = 0;
    this.cpu = 0;
    this.visibleItems = visibleItems;
    this.totalItems = totalItems;
    this.publish(0, 0);
    if (enabled) {
      this.started = performance.now();
      this.timer = setInterval(() => this.sample(), 250);
    }
  }

  record(cpuMilliseconds: number, visibleItems: number, totalItems: number) {
    if (!this.enabled) return;
    this.renders++;
    this.cpu += cpuMilliseconds;
    this.visibleItems = visibleItems;
    this.totalItems = totalItems;
  }

  private sample() {
    const now = performance.now();
    const elapsed = now - this.started;
    const rate = elapsed > 0 ? (this.renders * 1000) / elapsed : 0;
    const cpu = this.renders ? this.cpu / this.renders : 0;
    this.started = now;
    this.renders = 0;
    this.cpu = 0;
    this.publish(Math.round(rate), Math.round(cpu * 10) / 10);
  }

  private publish(rendersPerSecond: number, cpuMilliseconds: number) {
    const { visibleItems, totalItems } = this;
    const previous = this.snapshot;
    if (
      previous.rendersPerSecond === rendersPerSecond &&
      previous.cpuMilliseconds === cpuMilliseconds &&
      previous.visibleItems === visibleItems &&
      previous.totalItems === totalItems
    )
      return;
    this.snapshot = { rendersPerSecond, cpuMilliseconds, visibleItems, totalItems };
    for (const listener of this.listeners) listener();
  }

  destroy() {
    this.setEnabled(false);
    this.listeners.clear();
  }
}
