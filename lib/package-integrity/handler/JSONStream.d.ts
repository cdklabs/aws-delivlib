/**
 * Partial hand-written declarations for the JSONStream module. Refer to the JS
 * module's documentation for additional operations, and more explanations on
 * possible usage.
 *
 * @see https://github.com/dominictarr/JSONStream
 */
 declare module 'JSONStream' {

  export function parse(pattern: any, map?: (value: any) => any): JSONStream;
  export function parse(patterns: any[], map?: (value: any) => any): JSONStream;

  interface JSONStream extends NodeJS.ReadWriteStream {
    on(event: 'header', handler: (value: any) => void): this;
    once(event: 'header', handler: (value: any) => void): this;

    on(event: 'data', handler: (value: any) => void): this;
    once(event: 'data', handler: (value: any) => void): this;

    on(event: 'footer', handler: (value: any) => void): this;
    once(event: 'footer', handler: (value: any) => void): this;

    on(event: 'error', handler: (cause: any) => void): this;
    once(event: 'error', handler: (cause: any) => void): this;

    on(event: 'end', handler: () => void): this;
    once(event: 'end', handler: () => void): this;
  }
}