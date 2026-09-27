/*
 * Traductor del pequeño subconjunto de PyMongo que se acepta en los editores.
 *
 * No intenta ejecutar Python ni convertir un programa general. Sólo adapta la
 * sintaxis de consulta y actualización que se usa en la asignatura a la
 * fachada JavaScript que hay sobre mingo. Para ampliar el dialecto, añade
 * primero una equivalencia a una de las tablas y un caso a
 * tests/mongo-pymongo-compat.test.mjs.
 */

export const PYTHON_LITERALS = Object.freeze({
  None: "null",
  True: "true",
  False: "false"
});

export const PYMONGO_METHODS = Object.freeze({
  count_documents: "countDocuments",
  find_one: "findOne",
  update_one: "updateOne",
  update_many: "updateMany",
  to_list: "all"
});

export const PYMONGO_ATTRIBUTES = Object.freeze({
  matched_count: "matchedCount",
  modified_count: "modifiedCount",
  upserted_id: "upsertedId"
});

export const PYMONGO_ARGUMENTS = Object.freeze({
  allow_disk_use: "allowDiskUse",
  array_filters: "arrayFilters",
  bypass_document_validation: "bypassDocumentValidation"
});

function isIdentifierStart(character) {
  return /[A-Za-z_$]/.test(character || "");
}

function isIdentifierPart(character) {
  return /[A-Za-z0-9_$]/.test(character || "");
}

function previousNonSpace(text, index) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (!/\s/.test(text[cursor])) return text[cursor];
  }
  return "";
}

function translateNamesAndLiterals(source) {
  let output = "";
  let index = 0;
  let quote = null;
  let escaped = false;

  while (index < source.length) {
    const character = source[index];

    if (quote !== null) {
      output += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      index += 1;
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      output += character;
      index += 1;
      continue;
    }

    if (character === "#") {
      const end = source.indexOf("\n", index);
      const comment = end === -1 ? source.slice(index + 1) : source.slice(index + 1, end);
      output += "//" + comment;
      index = end === -1 ? source.length : end;
      continue;
    }

    if (character === "/" && source[index + 1] === "/") {
      const end = source.indexOf("\n", index);
      output += end === -1 ? source.slice(index) : source.slice(index, end);
      index = end === -1 ? source.length : end;
      continue;
    }

    if (isIdentifierStart(character)) {
      let end = index + 1;
      while (end < source.length && isIdentifierPart(source[end])) end += 1;
      const identifier = source.slice(index, end);
      const isMember = previousNonSpace(source, index) === ".";
      let after = end;
      while (/\s/.test(source[after] || "")) after += 1;
      const isMethod = isMember && source[after] === "(";
      output += isMethod && PYMONGO_METHODS[identifier]
        ? PYMONGO_METHODS[identifier]
        : (isMember && !isMethod && PYMONGO_ATTRIBUTES[identifier]
          ? PYMONGO_ATTRIBUTES[identifier]
          : (PYTHON_LITERALS[identifier] || identifier));
      index = end;
      continue;
    }

    output += character;
    index += 1;
  }

  return output;
}

function splitTopLevel(text) {
  const parts = [];
  let start = 0;
  let quote = null;
  let escaped = false;
  const stack = [];
  const opening = new Set(["(", "[", "{"]);
  const closing = { ")": "(", "]": "[", "}": "{" };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote !== null) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (opening.has(character)) stack.push(character);
    else if (Object.hasOwn(closing, character)) {
      if (stack.at(-1) === closing[character]) stack.pop();
    } else if (character === "," && stack.length === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function findClosing(text, start, opening, closing) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (quote !== null) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === opening) depth += 1;
    else if (character === closing) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function translateSortList(argument) {
  const leading = argument.match(/^\s*/)[0];
  const trailing = argument.match(/\s*$/)[0];
  const trimmed = argument.trim();
  if (!trimmed.startsWith("[") || findClosing(trimmed, 0, "[", "]") !== trimmed.length - 1) {
    return argument;
  }

  const entries = splitTopLevel(trimmed.slice(1, -1));
  let changed = false;
  const translated = entries.map(function (entry) {
    const item = entry.trim();
    if (!item.startsWith("(") || findClosing(item, 0, "(", ")") !== item.length - 1) return entry;
    const pair = splitTopLevel(item.slice(1, -1));
    if (pair.length !== 2) return entry;
    changed = true;
    const prefix = entry.match(/^\s*/)[0];
    const suffix = entry.match(/\s*$/)[0];
    return prefix + "[" + pair[0] + "," + pair[1] + "]" + suffix;
  });
  return changed ? leading + "[" + translated.join(",") + "]" + trailing : argument;
}

function findMethodCallOutsideStrings(source, start) {
  let quote = null;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== null) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "#" || (character === "/" && source[index + 1] === "/")) {
      const end = source.indexOf("\n", index);
      if (end === -1) return null;
      index = end;
      continue;
    }
    if (character !== "." || !isIdentifierStart(source[index + 1])) continue;
    let nameEnd = index + 2;
    while (nameEnd < source.length && isIdentifierPart(source[nameEnd])) nameEnd += 1;
    let opening = nameEnd;
    while (/\s/.test(source[opening] || "")) opening += 1;
    if (source[opening] === "(") {
      return { start: index, name: source.slice(index + 1, nameEnd), opening: opening };
    }
    index = nameEnd - 1;
  }
  return null;
}

function translateKeywordArgumentList(argument) {
  const parts = splitTopLevel(argument);
  const positional = [];
  const keywords = [];
  parts.forEach(function (part) {
    const match = part.match(/^\s*([A-Za-z_]\w*)\s*=(?!=)([\s\S]*)$/);
    if (!match) {
      positional.push(part);
      return;
    }
    const key = PYMONGO_ARGUMENTS[match[1]] || match[1];
    keywords.push(JSON.stringify(key) + ":" + match[2]);
  });
  if (!keywords.length) return argument;
  positional.push("{" + keywords.join(",") + "}");
  return positional.join(",");
}

function translateKeywordArguments(source) {
  let output = "";
  let cursor = 0;
  while (cursor < source.length) {
    const call = findMethodCallOutsideStrings(source, cursor);
    if (!call) return output + source.slice(cursor);
    const closing = findClosing(source, call.opening, "(", ")");
    if (closing === -1) return output + source.slice(cursor);
    output += source.slice(cursor, call.opening + 1);
    const argument = source.slice(call.opening + 1, closing);
    const nested = translateKeywordArguments(argument);
    output += translateKeywordArgumentList(nested) + ")";
    cursor = closing + 1;
  }
  return output;
}

function translateSortTuples(source) {
  let output = "";
  let cursor = 0;
  const marker = ".sort";

  function findMarkerOutsideStrings(start) {
    let quote = null;
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const character = source[index];
      if (quote !== null) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === quote) quote = null;
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        continue;
      }
      if (character === "#" || (character === "/" && source[index + 1] === "/")) {
        const end = source.indexOf("\n", index);
        if (end === -1) return -1;
        index = end;
        continue;
      }
      if (source.startsWith(marker, index) && !isIdentifierPart(source[index + marker.length])) {
        return index;
      }
    }
    return -1;
  }

  while (cursor < source.length) {
    const found = findMarkerOutsideStrings(cursor);
    if (found === -1) return output + source.slice(cursor);
    output += source.slice(cursor, found);
    let opening = found + marker.length;
    while (/\s/.test(source[opening] || "")) opening += 1;
    if (source[opening] !== "(") {
      output += marker;
      cursor = found + marker.length;
      continue;
    }
    const closing = findClosing(source, opening, "(", ")");
    if (closing === -1) return output + source.slice(found);
    const argument = source.slice(opening + 1, closing);
    output += source.slice(found, opening + 1) + translateSortList(argument) + ")";
    cursor = closing + 1;
  }
  return output;
}

export function translatePythonQuery(source) {
  return translateNamesAndLiterals(translateKeywordArguments(translateSortTuples(String(source))));
}
