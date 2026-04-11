import "dotenv/config";
import path from "path";

function optionalEnv(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

const outputDir = path.resolve(
  optionalEnv("OUTPUT_DIR", path.join(process.cwd(), "data")),
);

export const env = {
  outputDir,
  dataFile: path.resolve(
    optionalEnv("DATA_FILE", path.join(outputDir, "keywords.json")),
  ),
};