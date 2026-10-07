// How the loader (widget.js) and the separately loaded widget bundles find
// each other. A widget bundle registers its mount function here when it
// runs; the loader then mounts it into each matching <div>.

export type MountContext = {
  key: string;
  apiOrigin: string;
  // "inline" (default) or "float" (a launcher bubble, like the chat).
  mode: "inline" | "float";
};

export type MountFn = (el: HTMLElement, ctx: MountContext) => void;

type Registry = Record<string, MountFn | undefined>;

declare global {
  interface Window {
    __chatalotWidgets?: Registry;
  }
}

export function registerWidget(name: string, mount: MountFn): void {
  (window.__chatalotWidgets ??= {})[name] = mount;
}

export function registeredWidget(name: string): MountFn | undefined {
  return window.__chatalotWidgets?.[name];
}
