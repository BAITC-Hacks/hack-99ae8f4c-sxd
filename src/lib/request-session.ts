/** Prevent overlapping UI actions and discard completions from a reset session. */
export class RequestSession {
  private version = 0;
  private active = false;
  begin(): number | undefined {
    if (this.active) return undefined;
    this.active = true;
    return ++this.version;
  }
  isCurrent(token: number): boolean { return token === this.version; }
  finish(token: number): boolean {
    if (!this.isCurrent(token)) return false;
    this.active = false;
    return true;
  }
  reset(): void { this.version++; this.active = false; }
}
