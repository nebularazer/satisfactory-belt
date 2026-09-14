export type UnrealValue = string | UnrealValue[] | { [key: string]: UnrealValue };

/** Parse the tuple/struct syntax used by Docs recipe fields, preserving quoted references. */
export function parseUnreal(text: string): UnrealValue {
  if (text.trim() === "") return [];
  let offset = 0;
  const skip = () => {
    while (/\s/.test(text[offset] ?? "") && offset < text.length) offset++;
  };
  function fail(): never {
    throw new Error(`Invalid Unreal value at offset ${offset}: ${text.slice(0, 160)}`);
  }
  function value(): UnrealValue {
    skip();
    if (text[offset] === "(") {
      offset++;
      const entries: UnrealValue[] = [];
      const fields = new Map<string, UnrealValue>();
      skip();
      while (text[offset] !== ")") {
        if (offset >= text.length) fail();
        const entry = value();
        skip();
        if (text[offset] === "=") {
          if (typeof entry !== "string" || fields.has(entry) || entries.length > 0) fail();
          offset++;
          fields.set(entry, value());
        } else {
          if (fields.size > 0) fail();
          entries.push(entry);
        }
        skip();
        if (text[offset] === ",") {
          offset++;
          skip();
          if (text[offset] === ")") fail();
        } else if (text[offset] !== ")") fail();
      }
      offset++;
      return fields.size > 0 ? Object.fromEntries(fields) : entries;
    }
    if (text[offset] === '"') {
      const start = offset++;
      while (offset < text.length) {
        if (text[offset] === "\\") {
          offset += 2;
          continue;
        }
        if (text[offset++] === '"') {
          const parsed: unknown = JSON.parse(text.slice(start, offset));
          if (typeof parsed !== "string") fail();
          return parsed;
        }
      }
      return fail();
    }
    const start = offset;
    while (offset < text.length && !/[(),=]/.test(text[offset]!)) offset++;
    const token = text.slice(start, offset).trim();
    if (!token) fail();
    return token;
  }
  const parsed = value();
  skip();
  if (offset !== text.length) fail();
  return parsed;
}

export function classId(reference: string): string {
  const match = /\.([A-Za-z0-9_-]+)'?$/.exec(reference);
  if (!reference.startsWith("/") || !match?.[1])
    throw new Error(`Invalid class reference: ${reference}`);
  return match[1];
}
