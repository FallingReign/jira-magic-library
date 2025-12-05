import { detectUids } from '../../../../src/operations/bulk/UidDetector.js';
import { ValidationError } from '../../../../src/errors/index.js';

describe('UidDetector', () => {
  it('should build uid maps for string and number values', () => {
    const input = [
      { uid: 'epic-1', Summary: 'Epic' },
      { uid: 123, Summary: 'Story' },
    ];

    const result = detectUids(input);

    expect(result.hasUids).toBe(true);
    expect(result.uidMap).toEqual({ 'epic-1': 0, '123': 1 });
    expect(result.uidsByIndex).toEqual({ 0: 'epic-1', 1: '123' });
  });

  it('should skip null, undefined, empty, and non-string/number UIDs', () => {
    const input = [
      { uid: null },
      { uid: undefined },
      { uid: '' },
      { uid: { value: 'not-allowed' } },
    ];

    const result = detectUids(input);

    expect(result.hasUids).toBe(false);
    expect(result.uidMap).toEqual({});
    expect(result.uidsByIndex).toEqual({});
  });

  it('should skip UIDs that become empty after trimming', () => {
    const input = [
      { uid: '   ' }, // Whitespace only - becomes empty after trim
      { uid: '\t\n' }, // Tab and newline
      { uid: 'valid-uid' },
    ];

    const result = detectUids(input);

    expect(result.hasUids).toBe(true);
    expect(result.uidMap).toEqual({ 'valid-uid': 2 });
    expect(result.uidsByIndex).toEqual({ 2: 'valid-uid' });
  });

  it('should throw ValidationError on duplicate UIDs with index details', () => {
    const input = [
      { uid: 'dup-1' },
      { uid: 'dup-1' },
      { uid: 'unique' },
      { uid: 'dup-1' },
    ];

    expect(() => detectUids(input)).toThrow(ValidationError);
    expect(() => detectUids(input)).toThrow(/Duplicate UID "dup-1" found at indices 0 and 1/);
  });
});
