# JIRA Field Types - Complete Reference

**Source**: JIRA REST API createmeta responses  
**Date**: October 9, 2025

---

## Complete JIRA Field Type List

Based on actual JIRA API responses, these are the field types we need to support:

### Basic Types
- `string` - Simple text (Summary, etc.)
- `number` - Numeric values (Story Points, etc.)
- `date` - Date only (Due Date)
- `datetime` - Date with time
- `any` - Unconstrained value

### Lookup Types (ID-based)
- `priority` - Priority field (High, Medium, Low)
- `user` - User/assignee fields
- `component` - Components (returns ID)
- `version` - Versions/Fix Versions
- `issuetype` - Issue type
- `project` - Project reference

### Link Types
- `issuelink` - Single issue link
- `issuelinks` - Multiple issue links

### Complex Types
- `option` - Single-select custom field
- `option-with-child` - Cascading select (parent→child)
- `timetracking` - Original/Remaining Estimate
- `attachment` - File attachments
- `checklist-item` - Checklist items

### Container Type
- `array` - Container for multiple values
  - Uses `items` property to specify contained type
  - Examples:
    - `{ type: "array", items: "string" }` → Labels
    - `{ type: "array", items: "component" }` → Components
    - `{ type: "array", items: "version" }` → Fix Versions
    - `{ type: "array", items: "option" }` → Multi-select

---

## Field vs Type Distinction

### ❌ WRONG: Convert by Field Name
```typescript
// Bad - field name based
if (fieldName === 'Priority') {
  return convertPriority(value);
}
```

### ✅ CORRECT: Convert by Field Type
```typescript
// Good - type based
const converter = registry.get(fieldSchema.type);
return converter(value, fieldSchema, context);
```

---

## Type Conversion Patterns

### Simple Conversion (no lookup)
**Types**: `string`, `number`, `date`, `datetime`, `any`

```typescript
// Input: "3.5"
// Type: "number"
// Output: 3.5
```

### Lookup Conversion (query JIRA for ID)
**Types**: `priority`, `user`, `component`, `version`, `issuetype`, `project`, `option`

```typescript
// Input: "High"
// Type: "priority"
// Process: Query JIRA priorities → find ID
// Output: { id: "1" }
```

### Array Conversion (container)
**Type**: `array` (with `items` attribute)

```typescript
// Input: ["Backend", "API"]
// Type: { type: "array", items: "component" }
// Process: 
//   1. Iterate array
//   2. Convert each item using "component" converter
//   3. Return array of converted values
// Output: [{ id: "10001" }, { id: "10002" }]
```

### Complex Conversion
**Types**: `option-with-child`, `timetracking`, `issuelink`, `attachment`

```typescript
// Input: "Hardware -> Keyboard"
// Type: "option-with-child"
// Output: { value: "10100", child: { value: "10101" } }
```

---

## Epic 2 Scope Decision

### MVP Types (Epic 2) - Core Field Types
These are the most common types needed for basic issue creation:

1. ✅ `string` (already implemented)
2. ✅ `any` (passthrough, already implemented)
3. 🆕 `number`
4. 🆕 `date`
5. 🆕 `datetime`
6. 🆕 `array` (generic container)
7. 🆕 `priority`
8. 🆕 `user`
9. 🆕 `component` (as array item)
10. 🆕 `version` (as array item)
11. 🆕 `option` (single-select)

### Epic 3 Types - Complex Field Types
More advanced types for specialized workflows:

12. `option-with-child` (cascading select)
13. `timetracking`
14. `issuelink` / `issuelinks`
15. `issuetype` (usually set via API, not converted)
16. `project` (usually set via API, not converted)
17. `attachment`
18. `checklist-item`

---

## Array Handler Strategy

**Question**: How do we handle arrays with different item types?

### Option A: Single Array Converter
```typescript
registry.register('array', (value, fieldSchema, context) => {
  const itemType = fieldSchema.schema.items; // "component", "string", etc.
  const itemConverter = registry.get(itemType);
  
  return value.map(item => itemConverter(item, fieldSchema, context));
});
```

**Pros**: Single converter handles all arrays  
**Cons**: Needs to delegate to item converters

### Option B: Type-Specific Array Converters
```typescript
registry.register('array:component', convertComponentArray);
registry.register('array:string', convertStringArray);
registry.register('array:version', convertVersionArray);
```

**Pros**: Explicit, clear  
**Cons**: More converters, harder to extend

### Recommendation: **Option A**

The array converter acts as a **container converter** that delegates to item type converters. This follows the JIRA schema structure exactly.

---

## Revised Epic 2 Breakdown

### Core Type Converters (No Lookups)
1. **Number Type Converter** - `type: "number"`
2. **Date Type Converter** - `type: "date"`
3. **DateTime Type Converter** - `type: "datetime"`
4. **Array Type Converter** - `type: "array"` (generic container)

### Lookup Infrastructure
5. **Lookup Cache Infrastructure** - Cache for priority/component/version lists
6. **Ambiguity Detection** - Handle non-unique names

### Lookup Type Converters
7. **Priority Type Converter** - `type: "priority"`
8. **User Type Converter** - `type: "user"`
9. **Option Type Converter** - `type: "option"` (single-select custom fields)

### Item Type Converters (for arrays)
10. **Component Item Converter** - `items: "component"`
11. **Version Item Converter** - `items: "version"`

### Testing
12. **Integration Tests** - All type converters

**Total: 12 stories**

---

## Key Architecture Principles

### 1. Type-Driven Conversion
```typescript
// Always use fieldSchema.type
const converter = registry.get(fieldSchema.type);

// For arrays, also check items
if (fieldSchema.type === 'array') {
  const itemConverter = registry.get(fieldSchema.schema.items);
}
```

### 2. No Field Name Logic
```typescript
// ❌ NEVER do this
if (fieldName === 'components') { ... }

// ✅ ALWAYS do this
if (fieldSchema.type === 'array' && fieldSchema.schema.items === 'component') { ... }
```

### 3. Extensibility
```typescript
// Users can register custom converters for custom types
jml.registerConverter('my-custom-type', (value, schema, context) => {
  // Custom conversion logic
  return convertedValue;
});
```

---

## Examples from Real JIRA

### String Type
```json
{
  "summary": {
    "schema": { "type": "string", "system": "summary" },
    "name": "Summary"
  }
}
```

### Array of Components
```json
{
  "components": {
    "schema": { "type": "array", "items": "component", "system": "components" },
    "name": "Components",
    "allowedValues": [
      { "id": "10001", "name": "Backend" },
      { "id": "10002", "name": "Frontend" }
    ]
  }
}
```

### Priority
```json
{
  "priority": {
    "schema": { "type": "priority", "system": "priority" },
    "name": "Priority",
    "allowedValues": [
      { "id": "1", "name": "High" },
      { "id": "2", "name": "Medium" },
      { "id": "3", "name": "Low" }
    ]
  }
}
```

### Custom Single-Select
```json
{
  "customfield_10024": {
    "schema": { "type": "option", "custom": "com.atlassian.jira.plugin.system.customfieldtypes:select", "customId": 10024 },
    "name": "Environment",
    "allowedValues": [
      { "id": "10100", "value": "Production" },
      { "id": "10101", "value": "Staging" }
    ]
  }
}
```

---

## Implications for Current Implementation

### What Needs to Change

1. ✅ **ConverterRegistry** - Already type-based, no changes needed
2. ✅ **FieldResolver** - Already resolves field names to IDs, no changes needed
3. ❌ **Story Names** - Need to update to reflect type-based approach
4. ❌ **Story Scope** - Remove any field-name specific logic

### Current Stories Review

| Current Story | Type-Based? | Keep? |
|---------------|-------------|-------|
| Number Field Converter | ✅ Yes (type: "number") | ✅ Keep |
| Date Field Converter | ✅ Yes (type: "date") | ✅ Keep |
| Boolean Field Converter | ⚠️ Maybe (not in JIRA type list) | ❓ Research |
| Labels Field Converter | ⚠️ Specific field | ❌ Change to "Array of Strings" |
| Priority Field Resolution | ✅ Yes (type: "priority") | ✅ Keep |
| User Search & Resolution | ✅ Yes (type: "user") | ✅ Keep |
| Component Resolution | ✅ Yes (items: "component") | ✅ Keep |
| Version Resolution | ✅ Yes (items: "version") | ✅ Keep |

### Boolean/Checkbox Question

**JIRA doesn't have a "boolean" field type in the schema.**

Checkboxes are custom fields with type:
```json
{
  "customfield_10030": {
    "schema": { 
      "type": "array", 
      "items": "option",
      "custom": "com.atlassian.jira.plugin.system.customfieldtypes:multicheckboxes"
    }
  }
}
```

**Decision**: Remove "Boolean" story, handle via array/option converters.

---

## Final Recommendation

Update Epic 2 to be **purely type-based**:

1. Number Type Converter (`number`)
2. Date Type Converter (`date`)
3. DateTime Type Converter (`datetime`)
4. Array Type Converter (`array` container)
5. Lookup Cache Infrastructure
6. Ambiguity Detection
7. Priority Type Converter (`priority`)
8. User Type Converter (`user`)
9. Option Type Converter (`option`)
10. Component Item Converter (for `array` with `items: "component"`)
11. Version Item Converter (for `array` with `items: "version"`)
12. Integration Tests

**No field-name specific logic anywhere.**
