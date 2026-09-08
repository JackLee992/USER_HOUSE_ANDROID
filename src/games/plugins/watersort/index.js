// Adapter preserves the existing tested engine and its public module path.
import { createWaterSortGame } from '../../water-sort.js';
export const GAME_ID = 'watersort';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export function createGame(env, state) { return createWaterSortGame(state, env); }
