/* Typed façade over the shared server-side catalogue modules (see scripts/sync-core.mjs). */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as searchCore from './search.js';
import * as packArt from './packArt.js';

export const normalize: (s?: string | null) => string = (searchCore as any).normalize;
export const searchNorm: (...parts: any[]) => string = (searchCore as any).searchNorm;
export const similarity: (a: string, b: string) => number = (searchCore as any).similarity;
export const queryTokens: (q: string, minLen?: number) => string[] = (searchCore as any).queryTokens;
export const rankCandidates: (q: string, rows: any[], fields: string[], limit?: number, minScore?: number) => { row: any; score: number; matchedField?: string }[] = (searchCore as any).rankCandidates;
export const packSvg: (p: any) => string = (packArt as any).packSvg;
export const capsuleSvg: (d: any) => string = (packArt as any).capsuleSvg;
