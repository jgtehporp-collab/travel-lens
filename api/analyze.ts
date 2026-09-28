import { analyzeHandler } from "../server/analyze.js";

// 메뉴판(사고 포함)은 오래 걸릴 수 있으므로 넉넉히
export const maxDuration = 180;
export const POST = analyzeHandler;
