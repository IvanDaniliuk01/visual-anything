/** How the inspector reads what was typed into its text boxes. */

/** Whether two texts stand for the same optional text: every blank one stands for none. */
export function sameOptionalText(a: string, b: string): boolean {
  const optional = (text: string) => (text.trim() === '' ? '' : text);
  return optional(a) === optional(b);
}
