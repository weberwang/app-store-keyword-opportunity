import type { Snapshot } from "../types.js";
export declare function readSnapshot(filePath: string): Promise<Snapshot>;
export declare function writeSnapshot(filePath: string, snapshot: Snapshot): Promise<void>;
