type TextContent = {
    type: "text";
    text: string;
};
export declare function ok(data: unknown): {
    content: TextContent[];
};
export declare function err(message: string): {
    content: TextContent[];
    isError: true;
};
export {};
