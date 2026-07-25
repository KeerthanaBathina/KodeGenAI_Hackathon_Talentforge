declare module 'socket.io-client' {
  export interface SocketLike {
    on(event: string, handler: (...args: any[]) => void): void;
  }

  export function io(url: string, options?: Record<string, unknown>): SocketLike;
}
