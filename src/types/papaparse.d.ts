// Type definitions for papaparse
// This file is needed because the @types/papaparse package might not be installed

declare module 'papaparse' {
  export interface ParseConfig {
    delimiter?: string;
    newline?: string;
    quoteChar?: string;
    escapeChar?: string;
    header?: boolean;
    dynamicTyping?: boolean;
    preview?: number;
    encoding?: string;
    worker?: boolean;
    comments?: boolean | string;
    download?: boolean;
    skipEmptyLines?: boolean | 'greedy';
    fastMode?: boolean;
    withCredentials?: boolean;
    delimitersToGuess?: string[];
    chunk?: (results: ParseResult<any>, parser: Parser) => void;
    complete?: (results: ParseResult<any>, file: File) => void;
    error?: (error: Error, file: File) => void;
    transform?: (value: string, field: string | number) => any;
    transformHeader?: (header: string, index: number) => string;
  }

  export interface UnparseConfig {
    quotes?: boolean | boolean[] | ((value: any) => boolean);
    quoteChar?: string;
    escapeChar?: string;
    delimiter?: string;
    header?: boolean;
    newline?: string;
    skipEmptyLines?: boolean;
    columns?: string[];
  }

  export interface ParseError {
    type: string;
    code: string;
    message: string;
    row: number;
  }

  export interface ParseMeta {
    delimiter: string;
    linebreak: string;
    aborted: boolean;
    fields: string[];
    truncated: boolean;
    cursor: number;
  }

  export interface ParseResult<T> {
    data: T[];
    errors: ParseError[];
    meta: ParseMeta;
  }

  export interface Parser {
    abort: () => void;
  }

  export function parse<T = any>(input: string | File, config?: ParseConfig): ParseResult<T>;
  export function unparse<T = any>(data: T[] | object, config?: UnparseConfig): string;
}