import { atom } from 'jotai';

// Global cache for address -> primary name mappings
export const addressNamesAtom = atom<Map<string, string>>(new Map());

