// Adapter preserves the existing tested engine and its public module path.
import { createFreeCellGame } from '../../freecell.js';
export const GAME_ID = 'freecell';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export function createGame(env, state) { return createFreeCellGame(env, state); }
