type Child = Node | string | null | undefined | false;

/** Tiny element builder, so the editor panels read top to bottom without a framework. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Omit<HTMLElementTagNameMap[K], "style" | "children">> & { class?: string; title?: string; for?: string } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { class: className, for: htmlFor, ...rest } = props as Record<string, unknown>;
  if (className) node.className = className as string;
  if (htmlFor) node.setAttribute("for", htmlFor as string);
  Object.assign(node, rest);
  for (const c of children) if (c) node.append(c);
  return node;
}

let counter = 0;
export const uid = (prefix: string) => `${prefix}-${++counter}`;

/** Downloads text as a file. */
export function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = el("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const fileName = (name: string) => `${name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "waverider"}.json`;

/** Calls `fn` once after `ms` of quiet. */
export function debounce(fn: () => void, ms: number): () => void {
  let timer = 0;
  return () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(fn, ms);
  };
}
