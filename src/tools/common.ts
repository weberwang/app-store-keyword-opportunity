function renderPreview(value: unknown): string {
  const text = JSON.stringify(value, null, 2);
  if (text.length <= 4000) {
    return text;
  }
  return `${text.slice(0, 4000)}\n...`;
}

export function ok(data: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: renderPreview(data) }],
    structuredContent: data,
  };
}

export function err(message: string, details: Record<string, unknown> = {}) {
  return {
    content: [{ type: "text" as const, text: message }],
    structuredContent: { error: message, ...details },
    isError: true,
  };
}