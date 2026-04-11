import { readFile, mkdir, writeFile } from "fs/promises";
import { dirname } from "path";
const EMPTY_SNAPSHOT = {
    meta: {
        generatedAt: null,
        country: "us",
        language: "en-us",
        seeds: [],
        totalKeywords: 0,
    },
    keywords: [],
};
export async function readSnapshot(filePath) {
    try {
        const content = await readFile(filePath, "utf8");
        return JSON.parse(content);
    }
    catch (error) {
        if (error.code === "ENOENT")
            return EMPTY_SNAPSHOT;
        throw error;
    }
}
export async function writeSnapshot(filePath, snapshot) {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}
//# sourceMappingURL=json-store.js.map