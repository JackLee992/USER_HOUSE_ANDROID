// Adapter preserves the existing tested engine and its public module path.
import { createSpaceCadetGame } from '../../space-cadet.js';
export const GAME_ID = 'pinball';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export function createGame(env, state) { return createSpaceCadetGame(env, state); }
