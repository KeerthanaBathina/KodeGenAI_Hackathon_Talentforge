declare module 'socket.io-client' {
  export interface SocketLike {
    on(event: string, handler: (...args: any[]) => void): void;
    emit(event: string, ...args: any[]): void;
    off(event: string, handler?: (...args: any[]) => void): void;
    connect(): void;
    disconnect(): void;
    connected: boolean;
  }

  export function io(url: string, options?: Record<string, unknown>): SocketLike;
}
