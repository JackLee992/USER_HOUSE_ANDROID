// Adapter preserves the existing tested engine and its public module path.
import { createMatch3Game } from '../../match3.js';
export const GAME_ID = 'match3';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export function createGame(env, state) { return createMatch3Game(env, state); }
