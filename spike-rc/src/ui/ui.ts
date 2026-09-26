import type { SpikeHub } from "spike-link";
import { RemotePad, type Locale } from "./remote";

type State = "disconnected" | "connecting" | "connected" | "error";

const LOCALE_KEY = "spike-rc-locale";

export class UI {
  private locale: Locale = (localStorage.getItem(LOCALE_KEY) as Locale) || "en";
  private state: State = "disconnected";
  private remote: RemotePad;
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly root: HTMLElement, private readonly hub: SpikeHub) {
    this.remote = new RemotePad(
      hub,
      (message, kind) => this.notify(message, kind),
      (en, cs) => this.l(en, cs),
      () => this.locale,
    );
    this.render();
    hub.connection.onDisconnected(() => {
      this.remote.release();
      this.remote.renderSensors(undefined);
      this.state = "disconnected";
      this.updateConnection();
    });
    hub.onTelemetry(state => this.remote.renderSensors(state));
    hub.logger.subscribe(entries => {
      const latest = entries.at(-1);
      if (latest?.type === "ERROR") this.notify(latest.message, "error");
    });
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    window.addEventListener("blur", this.releaseKeys);
    window.addEventListener("beforeunload", () => this.releaseHub());
    window.addEventListener("pagehide", () => this.releaseHub());
  }

  private l(en: string, cs: string): string {
    return this.locale === "cs" ? cs : en;
  }

  private render(): void {
    document.documentElement.lang = this.locale;
    this.root.innerHTML = `<main class="rc-shell">
      <header class="rc-header">
        <div class="rc-brand">
          <div class="rc-brand-mark">RC</div>
          <div>
            <strong>${this.l("SPIKE Remote", "SPIKE Dálkové")}</strong>
            <span>Prime · Web Bluetooth</span>
          </div>
        </div>
        <div class="rc-actions">
          <label class="rc-language">
            <span>Language</span>
            <select id="locale">
              <option value="en" ${this.locale === "en" ? "selected" : ""}>EN</option>
              <option value="cs" ${this.locale === "cs" ? "selected" : ""}>CS</option>
            </select>
          </label>
          <button id="connect" class="rc-connect" type="button"><i></i><span>${this.l("Connect", "Připojit")}</span></button>
        </div>
      </header>
      <div class="rc-main">${this.remote.markup()}</div>
      <footer class="rc-footer">
        <div class="rc-footer-credits">
          <span>${this.l("Created by", "Vytvořil")} <a href="https://lempera.cz" target="_blank" rel="noreferrer">lempera.cz</a></span>
          <span>${this.l("Made with", "Vytvořeno s")} <b aria-label="${this.l("love", "láskou")}">♥</b> ${this.l("for", "pro")} <a href="https://robohrani.cz" target="_blank" rel="noreferrer">robohrani.cz</a></span>
        </div>
      </footer>
      <div id="rc-toast" class="rc-toast" role="status" aria-live="polite"></div>
    </main>`;
    this.bind();
    this.updateConnection();
  }

  private bind(): void {
    this.remote.bind(this.root);
    this.remote.setActive(true);
    this.el("connect").addEventListener("click", () => void (this.hub.connected ? this.disconnect() : this.connect()));
    this.el("locale").addEventListener("change", event => {
      this.locale = (event.target as HTMLSelectElement).value as Locale;
      localStorage.setItem(LOCALE_KEY, this.locale);
      this.render();
    });
  }

  private async connect(): Promise<void> {
    this.state = "connecting";
    this.updateConnection();
    try {
      await this.hub.connect();
      this.state = "connected";
    } catch (error) {
      this.state = "error";
      this.notify(error instanceof Error ? error.message : String(error), "error");
    }
    this.updateConnection();
  }

  private disconnect(): void {
    this.releaseHub();
    this.state = "disconnected";
    this.updateConnection();
  }

  private releaseHub(): void {
    this.remote.release();
    void this.hub.shutdown(this.remote.haltCommands());
  }

  private updateConnection(): void {
    const button = this.root.querySelector<HTMLButtonElement>("#connect");
    if (!button) return;
    button.className = `rc-connect ${this.state}`;
    button.querySelector("span")!.textContent =
      this.state === "connected" ? this.l("Disconnect", "Odpojit")
        : this.state === "connecting" ? this.l("Connecting…", "Připojování…")
          : this.l("Connect", "Připojit");
    button.disabled = this.state === "connecting";
    const online = this.state === "connected";
    this.remote.setLink(online);
  }

  private notify(message: string, kind: "info" | "error" = "info"): void {
    if (kind !== "error") return;
    const toast = this.root.querySelector("#rc-toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.remove("show"), 4200);
  }

  private keyDown = (event: KeyboardEvent): void => {
    if (event.repeat || this.isTyping(event.target)) return;
    if (this.remote.handleKey(event.code, true)) event.preventDefault();
  };

  private keyUp = (event: KeyboardEvent): void => {
    if (this.remote.handleKey(event.code, false)) event.preventDefault();
  };

  private releaseKeys = (): void => {
    this.remote.release();
  };

  private isTyping(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
  }

  private el<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = this.root.querySelector<T>(`#${id}`);
    if (!element) throw new Error(`Missing #${id}`);
    return element;
  }
}
