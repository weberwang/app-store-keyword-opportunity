type TextContent = { type: "text"; text: string };

export function ok(data: unknown): { content: TextContent[] } {
  return {
    content: [{ type: "text", text: JSON.stringify(data, replacer, 2) }],
  };
}

export function err(message: string): {
  content: TextContent[];
  isError: true;
} {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) {
    return Object.fromEntries(value);
  }
  return value;
}