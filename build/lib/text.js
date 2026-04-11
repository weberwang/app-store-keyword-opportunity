export function normalizeTerm(value) {
    return String(value || "")
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[''`]/g, "")
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}
export function toCsvList(value) {
    if (!value)
        return [];
    if (Array.isArray(value))
        return value.flatMap((item) => toCsvList(item));
    return String(value)
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean);
}
export function uniqueTerms(values) {
    const seen = new Set();
    const terms = [];
    for (const item of toCsvList(values)) {
        const normalized = normalizeTerm(item);
        if (!normalized || seen.has(normalized))
            continue;
        seen.add(normalized);
        terms.push(item.trim());
    }
    return terms;
}
export function tokenize(value) {
    return normalizeTerm(value).split(" ").filter(Boolean);
}
export function overlapRatio(left, right) {
    const leftWords = new Set(tokenize(left));
    const rightWords = new Set(tokenize(right));
    if (!leftWords.size || !rightWords.size)
        return 0;
    let overlap = 0;
    for (const word of leftWords) {
        if (rightWords.has(word))
            overlap += 1;
    }
    return overlap / Math.max(leftWords.size, rightWords.size);
}
export function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}
//# sourceMappingURL=text.js.map