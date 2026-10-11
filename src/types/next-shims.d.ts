// Global TypeScript declarations for Next.js shims
declare module '*.css' {
  const content: { [className: string]: string };
  export default content;
}

declare module 'next' {
  import type { ReactNode } from 'react';

  export interface Metadata {
    metadataBase?: URL | null;
    title?: string | { default: string; template: string };
    description?: string;
    icons?: any;
    openGraph?: any;
    robots?: any;
    alternates?: any;
    [key: string]: any;
  }

  export type NextPage<P = {}, IP = P> = {
    (props: P): ReactNode;
    defaultProps?: Partial<P>;
    displayName?: string;
  };

  const next: any;
  export default next;
}

declare module 'next/navigation' {
  export interface ReadonlyURLSearchParams extends URLSearchParams {
    get(name: string): string | null;
    getAll(name: string): string[];
    has(name: string): boolean;
    keys(): IterableIterator<string>;
    values(): IterableIterator<string>;
    entries(): IterableIterator<[string, string]>;
    forEach(callback: (value: string, key: string, parent: URLSearchParams) => void): void;
  }

  export function redirect(url: string, type?: 'replace' | 'push'): never;
  export function permanentRedirect(url: string, type?: 'replace' | 'push'): never;
  export function notFound(): never;
  export function usePathname(): string;
  export function useSearchParams(): ReadonlyURLSearchParams;
  export function useParams<T = Record<string, string | string[]>>(): T;
  export function useRouter(): {
    push(href: string, options?: any): void;
    replace(href: string, options?: any): void;
    refresh(): void;
    back(): void;
    forward(): void;
    prefetch(href: string): void;
  };
}

declare module 'next/server' {
  export class NextRequest extends Request {
    readonly nextUrl: URL;
    readonly cookies: any;
    readonly ip?: string;
    readonly geo?: any;
  }

  export class NextResponse<Body = unknown> extends Response {
    static json<JsonBody>(data: JsonBody, init?: ResponseInit): NextResponse<JsonBody>;
    static redirect(url: string | URL, status?: number): NextResponse<never>;
    static next(init?: any): NextResponse<never>;
    readonly cookies: any;
  }
}

declare module 'next/link' {
  import type { ComponentProps, ForwardRefExoticComponent, RefAttributes } from 'react';
  
  export interface LinkProps extends ComponentProps<'a'> {
    href: string | any;
    replace?: boolean;
    scroll?: boolean;
    prefetch?: boolean;
    passHref?: boolean;
    legacyBehavior?: boolean;
  }

  const Link: ForwardRefExoticComponent<LinkProps & RefAttributes<HTMLAnchorElement>>;
  export default Link;
}

declare module 'next/types.js' {
  export type Route = string;
  export type ResolvingMetadata = Promise<any>;
  export type ResolvingViewport = Promise<any>;
}

declare module 'next/server.js' {
  export * from 'next/server';
}
