const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const basePath = BASE_PATH;

export function withBase(path: string): string {
  return BASE_PATH ? `${BASE_PATH}${path}` : path;
}