export function ok(data) {
    return {
        content: [{ type: "text", text: JSON.stringify(data, replacer, 2) }],
    };
}
export function err(message) {
    return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
    };
}
function replacer(_key, value) {
    if (value instanceof Map) {
        return Object.fromEntries(value);
    }
    return value;
}
//# sourceMappingURL=common.js.map