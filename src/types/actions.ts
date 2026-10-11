/**
 * Standard ActionResponse type per Google Anti-Gravity Global Rules
 */
export type ActionResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };
