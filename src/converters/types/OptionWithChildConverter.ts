/**
 * Option-With-Child Type Converter (Cascading Select)
 * Story: E3-S01
 * 
 * Converts cascading select values for fields with type: "option-with-child"
 * 
 * Accepts:
 * - Object: { parent: "MP", child: "mp_backyard_01" }
 * - Object (parent only): { parent: "MP" }
 * - Object (child only): { child: "mp_apartment" } (auto-detects parent)
 * - String with arrow: "MP -> mp_backyard_01"
 * - String with comma: "MP, mp_backyard_01"
 * - String with slash: "MP / mp_backyard_01"
 * - String (no delimiter): "mp_apartment" (treated as child, auto-detects parent)
 * - null/undefined for optional fields
 * 
 * Returns: 
 * - Parent only: { id: "10000" }
 * - Parent + child: { id: "10000", child: { id: "10076" } }
 * 
 * Features:
 * - Case-insensitive matching
 * - Ambiguity detection (multiple matches)
 * - Auto-detect parent from child-only input
 * - Multiple delimiter support (priority: -> > , > /)
 * - Handles multiple spaces in input
 * 
 * @example
 * ```typescript
 * // Object format
 * convertOptionWithChildType({ parent: "MP", child: "mp_backyard_01" }, fieldSchema, context)
 * // → { id: "10000", child: { id: "10076" } }
 * 
 * // String with arrow
 * convertOptionWithChildType("MP -> mp_backyard_01", fieldSchema, context)
 * // → { id: "10000", child: { id: "10076" } }
 * 
 * // Child-only (auto-detect parent)
 * convertOptionWithChildType("mp_apartment", fieldSchema, context)
 * // → { id: "10000", child: { id: "10075" } }
 * 
 * // Parent only
 * convertOptionWithChildType({ parent: "MP" }, fieldSchema, context)
 * // → { id: "10000" }
 * ```
 */

import type { FieldConverter } from '../../types/converter.js';
import { ValidationError } from '../../errors/ValidationError.js';
import { AmbiguityError } from '../../errors/AmbiguityError.js';
import { NotFoundError } from '../../errors/NotFoundError.js';
import { resolveUniqueName } from '../../utils/resolveUniqueName.js';
import { extractFieldValue } from '../../utils/extractFieldValue.js';

interface ParsedInput {
  parent?: string;
  child?: string;
}

interface CascadingOption {
  id: string;
  value: string;
  children?: Array<{ id: string; value: string }>;
}

/**
 * Parse input into parent/child components
 */
function parseInput(value: string | object): ParsedInput {
  // Handle object format with parent/child structure
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    
    // If object has parent/child properties, use them directly
    if ('parent' in obj || 'child' in obj) {
      return {
        parent: obj.parent && typeof obj.parent === 'string' ? obj.parent.trim() : undefined,
        child: obj.child && typeof obj.child === 'string' ? obj.child.trim() : undefined,
      };
    }
    
    // Otherwise, try to extract a string value using extractFieldValue
    // This handles { value: "MP -> map1" } or { name: "MP -> map1" } formats
    const extracted = extractFieldValue(value);
    if (typeof extracted === 'string') {
      value = extracted;
      // Fall through to string parsing below
    } else {
      // Complex object we don't understand
      throw new ValidationError(
        `Invalid object format for cascading select field: expected { parent, child } or { value/name: "string" }`,
        { value, type: typeof value }
      );
    }
  }

  // Handle string format - try delimiters in priority order
  if (typeof value === 'string') {
    const trimmed = value.trim();

    // Delimiters in priority order (note: no single hyphen to avoid conflicts with names like "AP-PROJ")
    // -> is highest priority, then comma, slash, greater-than, pipe
    const delimiters = ['->', ',', '/', '>', '|'];

    for (const delimiter of delimiters) {
      // Escape special regex characters
      const escapedDelimiter = delimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Match delimiter with optional/multiple spaces around it
      // \s* before delimiter, \s* after delimiter (not \s+ which requires at least one space)
      const regex = new RegExp(`^(.+?)\\s*${escapedDelimiter}\\s*(.+)$`);
      const match = trimmed.match(regex);

      if (match && match[1] && match[2]) {
        return {
          parent: match[1].trim().replace(/\s+/g, ' '), // Normalize multiple spaces
          child: match[2].trim().replace(/\s+/g, ' '),
        };
      }
    }

    // No delimiter found - treat as child-only (resolver will auto-detect parent or treat as parent)
    return { child: trimmed };
  }

  throw new ValidationError(
    `Invalid input type for cascading select field: expected string or object, got ${typeof value}`,
    { value, type: typeof value }
  );
}

/**
 * Resolve parent option name to ID
 */
function resolveParent(
  parentName: string,
  options: CascadingOption[],
  fieldName: string
): { id: string; value: string } {
  // Use resolveUniqueName for fuzzy matching with fuse.js
  const allowedValues = options.map((opt) => ({ id: opt.id, name: opt.value }));
  const matched = resolveUniqueName(parentName, allowedValues, {
    field: fieldName,
    fieldName: `${fieldName} (parent option)`
  });
  
  return { id: matched.id, value: matched.name };
}

/**
 * Resolve child option name to ID within a specific parent
 */
function resolveChild(
  childName: string,
  children: Array<{ id: string; value: string }>,
  parentName: string,
  fieldName: string
): { id: string; value: string } {
  // Use resolveUniqueName for fuzzy matching with fuse.js
  const allowedValues = children.map((child) => ({ id: child.id, name: child.value }));
  const matched = resolveUniqueName(childName, allowedValues, {
    field: fieldName,
    fieldName: `${fieldName} (child option under parent '${parentName}')`
  });
  
  return { id: matched.id, value: matched.name };
}

/**
 * Try to split a value on a single non-alphanumeric group as a fallback.
 * 
 * Valid splits have exactly ONE consecutive group of non-alphanumeric characters
 * (excluding pure whitespace) between alphanumeric words.
 * 
 * Examples:
 * - "Design - Level" → { parent: "Design", child: "Level" }
 * - "Product Design --# Level One" → { parent: "Product Design", child: "Level One" }
 * - "A & B" → { parent: "A", child: "B" }
 * 
 * Ambiguous (multiple split points):
 * - "Product-Design - Level-One" → throws AmbiguityError
 * - "Design - Level_One" → throws AmbiguityError
 * 
 * @returns ParsedInput with parent and child, or null if no valid split found
 * @throws AmbiguityError if multiple split points detected
 */
function tryFallbackSplit(value: string, fieldName: string): ParsedInput | null {
  const trimmed = value.trim();
  
  // Strategy: Find all non-alphanumeric "separator groups" (sequences that contain
  // at least one non-alphanumeric, non-whitespace character).
  // If there's exactly one such group, split on it.
  // If there are multiple, it's ambiguous.
  
  // First, normalize multiple spaces to single space
  const normalized = trimmed.replace(/\s+/g, ' ');
  
  // Find all separator groups: sequences containing at least one non-alnum, non-space char
  // This regex finds any run of characters that includes at least one [^a-zA-Z0-9\s]
  // Pattern: match sequences that are NOT pure alphanumeric and NOT pure whitespace
  
  // Split the string into tokens: alphanumeric words vs separator groups
  // A separator group is any sequence between alphanumeric words that contains non-alnum chars
  
  // Find all matches of: (optional spaces)(one or more non-alnum chars with optional spaces)(optional spaces)
  // But we need to identify DISTINCT separator groups
  
  // Simpler approach: find all positions where a non-alnum (non-space) char appears
  // Group consecutive non-alnum (including adjacent spaces) as one separator
  
  // Use a state machine approach: iterate through and identify separator regions
  const separatorGroups: Array<{ start: number; end: number; content: string }> = [];
  let i = 0;
  
  while (i < normalized.length) {
    const char = normalized[i]!;
    
    // Skip alphanumeric characters
    if (/[a-zA-Z0-9]/.test(char)) {
      i++;
      continue;
    }
    
    // Found start of a potential separator group
    const start = i;
    let hasNonSpace = false;
    
    // Consume all non-alphanumeric characters (including spaces within the group)
    while (i < normalized.length && !/[a-zA-Z0-9]/.test(normalized[i]!)) {
      if (!/\s/.test(normalized[i]!)) {
        hasNonSpace = true;
      }
      i++;
    }
    
    // Only count as separator if it contains at least one non-space, non-alnum char
    if (hasNonSpace) {
      separatorGroups.push({
        start,
        end: i,
        content: normalized.substring(start, i),
      });
    }
  }
  
  if (separatorGroups.length === 0) {
    // No separator found
    return null;
  }
  
  if (separatorGroups.length === 1) {
    // Exactly one separator group - valid split
    const sep = separatorGroups[0]!;
    const parent = normalized.substring(0, sep.start).trim();
    const child = normalized.substring(sep.end).trim();
    
    if (parent && child) {
      return { parent, child };
    }
    // One of them is empty (separator at start or end)
    return null;
  }
  
  // Multiple separator groups - ambiguous
  // Extract the parts between separators for the error message
  const parts: string[] = [];
  let lastEnd = 0;
  for (const sep of separatorGroups) {
    const part = normalized.substring(lastEnd, sep.start).trim();
    if (part) parts.push(part);
    lastEnd = sep.end;
  }
  const lastPart = normalized.substring(lastEnd).trim();
  if (lastPart) parts.push(lastPart);
  
  throw new AmbiguityError(
    `Ambiguous input '${value}' for field "${fieldName}" has multiple potential split points. ` +
    `Please use a supported delimiter: -> , / > |`,
    {
      field: fieldName,
      input: value,
      candidates: parts.map(p => ({ id: '', name: p })),
    }
  );
}

/**
 * Auto-detect parent from child-only input by searching all parents' children
 */
function resolveChildAcrossParents(
  childName: string,
  options: CascadingOption[],
  fieldName: string
): { parentId: string; childId: string } {
  const matchingParents: Array<{ parent: CascadingOption; childId: string; childName: string }> =
    [];

  // Search all parents' children using fuzzy matching
  for (const parent of options) {
    if (!parent.children || parent.children.length === 0) continue;

    try {
      // Try to resolve child within this parent using fuzzy matching
      const allowedValues = parent.children.map((child) => ({ id: child.id, name: child.value }));
      const matched = resolveUniqueName(childName, allowedValues, {
        field: fieldName,
        fieldName: `${fieldName} (child option under parent '${parent.value}')`
      });
      
      // Found match in this parent
      matchingParents.push({ 
        parent, 
        childId: matched.id,
        childName: matched.name
      });
    } catch (err) {
      // No match in this parent, continue searching
      // AmbiguityError should bubble up immediately (multiple matches in one parent)
      if (err instanceof AmbiguityError) {
        throw err;
      }
      // ValidationError or NotFoundError - continue to next parent
    }
  }

  if (matchingParents.length === 0) {
    // Before giving up, try fallback splitting on single non-alphanumeric group
    try {
      const fallbackParsed = tryFallbackSplit(childName, fieldName);
      if (fallbackParsed && fallbackParsed.parent && fallbackParsed.child) {
        // Try to resolve with the split parent and child
        const parent = resolveParent(fallbackParsed.parent, options, fieldName);
        const parentOption = options.find((opt) => opt.id === parent.id);
        
        if (parentOption?.children) {
          const child = resolveChild(fallbackParsed.child, parentOption.children, parent.value, fieldName);
          return {
            parentId: parent.id,
            childId: child.id,
          };
        }
      }
    } catch (err) {
      // If fallback throws AmbiguityError, propagate it
      if (err instanceof AmbiguityError) {
        throw err;
      }
      // Otherwise continue to NotFoundError
    }
    
    throw new NotFoundError(
      `Child option '${childName}' not found in any parent for field "${fieldName}"`,
      { field: fieldName, value: childName }
    );
  }

  if (matchingParents.length > 1) {
    throw new AmbiguityError(
      `Child '${childName}' exists under multiple parents for field "${fieldName}": ${matchingParents
        .map((mp) => mp.parent.value)
        .join(', ')}. Please specify parent.`,
      {
        field: fieldName,
        input: childName,
        parents: matchingParents.map((mp) => mp.parent.value),
        candidates: matchingParents.map((mp) => ({ id: mp.parent.id, name: mp.parent.value })),
      }
    );
  }

  // matchingParents.length === 1 guaranteed here
  return {
    parentId: matchingParents[0]!.parent.id,
    childId: matchingParents[0]!.childId,
  };
}

export const convertOptionWithChildType: FieldConverter = async (value, fieldSchema, _context) => {
  // Ensure async function contains an await for lint rule compliance
  // (Converter remains effectively synchronous.)
  await Promise.resolve();
  // Handle optional fields
  if (value === null || value === undefined) {
    return value;
  }

  // Validate field has allowedValues
  if (!fieldSchema.allowedValues || fieldSchema.allowedValues.length === 0) {
    throw new ValidationError(
      `Field "${fieldSchema.name}" has no allowed values (cascading select options not available)`,
      { field: fieldSchema.id, fieldName: fieldSchema.name }
    );
  }

  const options = fieldSchema.allowedValues as unknown as CascadingOption[];

  // Bypass: If value is already in valid JIRA API format, pass through unchanged
  // Check if the value matches the expected JIRA response structure by validating IDs against schema
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    
    // Check if this looks like JIRA API format (has id or value property at root level)
    // AND if child exists, it should also have id or value
    const hasValidParent = 'id' in obj || 'value' in obj;
    const hasValidChild = !obj.child || (typeof obj.child === 'object' && obj.child !== null && ('id' in obj.child || 'value' in obj.child));
    
    if (hasValidParent && hasValidChild) {
      // Validate that the IDs/values exist in the schema
      const parentIdentifier = (obj.id as string | number) || (obj.value as string | number);
      const childObj = obj.child as Record<string, unknown> | undefined;
      const childIdentifier = childObj ? ((childObj.id as string | number) || (childObj.value as string | number)) : undefined;
      
      // Check if parent exists in allowedValues
      const parentExists = options.some(opt => 
        opt.id === String(parentIdentifier) || opt.value === String(parentIdentifier)
      );
      
      // If parent exists and either no child or child is valid, pass through
      if (parentExists) {
        if (!childIdentifier) {
          return value; // Parent-only, valid
        }
        
        // Validate child exists in parent's children
        const parentOption = options.find(opt => 
          opt.id === String(parentIdentifier) || opt.value === String(parentIdentifier)
        );
        
        if (parentOption?.children) {
          const childExists = parentOption.children.some(child =>
            child.id === String(childIdentifier) || child.value === String(childIdentifier)
          );
          
          if (childExists) {
            return value; // Parent + child, both valid
          }
        }
      }
      
      // If we reach here, the format looks like JIRA API but IDs don't match schema
      // Fall through to converter logic which will give better error messages
    }
  }

  // Parse input format (options already declared above)
  const input = parseInput(value);

  // Case 1: Parent specified
  if (input.parent) {
    const parent = resolveParent(input.parent, options, fieldSchema.name);

    // Case 1a: Parent + child specified
    if (input.child) {
      const parentOption = options.find((opt) => opt.id === parent.id);
      if (!parentOption?.children) {
        throw new ValidationError(
          `Parent '${parent.value}' has no children for field "${fieldSchema.name}"`,
          { field: fieldSchema.id, parent: parent.value }
        );
      }

      const child = resolveChild(input.child, parentOption.children, parent.value, fieldSchema.name);

      return {
        id: parent.id,
        child: { id: child.id },
      };
    }

    // Case 1b: Parent only
    return { id: parent.id };
  }

  // Case 2: Child-only input (auto-detect parent)
  if (input.child) {
    // First, check if input.child is actually a valid parent name (edge case)
    try {
      const parent = resolveParent(input.child, options, fieldSchema.name);
      // If successful, treat as parent-only
      return { id: parent.id };
    } catch {
      // Not a parent name, continue to child resolution
    }

    // Search for child across all parents
    const { parentId, childId } = resolveChildAcrossParents(
      input.child,
      options,
      fieldSchema.name
    );

    return {
      id: parentId,
      child: { id: childId },
    };
  }

  // Case 3: Neither parent nor child specified (should not happen after parseInput)
  throw new ValidationError(
    `Must specify parent, child, or both for cascading select field "${fieldSchema.name}"`,
    { field: fieldSchema.id, value }
  );
};
