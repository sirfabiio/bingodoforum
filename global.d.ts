declare module '@ffmpeg/ffmpeg' {
  export function createFFmpeg(options?: any): any;
}
declare module '@ffmpeg/util' {
  export function fetchFile(path: string | File | Blob): Promise<Uint8Array>;
}
