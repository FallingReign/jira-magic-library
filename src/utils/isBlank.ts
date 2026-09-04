/** An unanswered field. Zero and false are meaningful answers. */
export function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}
