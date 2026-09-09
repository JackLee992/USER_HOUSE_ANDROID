// Adapter preserves the existing tested engine and its public module path.
import { createZumaGame } from '../../zuma.js';
export const GAME_ID = 'zuma';
export const GAME_VERSION = '1.1.0';
export const HOST_API_VERSION = 1;
export function createGame(env, state) { return createZumaGame(state, env); }
