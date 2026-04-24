import path from "node:path";

const outputDir = path.resolve(process.env.OUTPUT_DIR || path.join(process.cwd(), "data"));
const asoSnapshotFile = process.env.ASO_SNAPSHOT_FILE
  ? path.resolve(process.env.ASO_SNAPSHOT_FILE)
  : undefined;

export const env = {
  outputDir,
  dataFile: path.resolve(process.env.DATA_FILE || path.join(outputDir, "keywords.json")),
  asoSnapshotFile,
};