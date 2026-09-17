/**
 * Wrapper sicuro per inserire testo nel DOM.
 * Usa textContent dove possibile per prevenire XSS.
 * [Source: architecture.md#Security Patterns — XSS]
 */
export function safeSetText(element: HTMLElement, text: string): void {
  element.textContent = text;
}
