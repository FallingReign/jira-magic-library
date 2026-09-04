import { parseInput } from '../../../src/parsers/InputParser.js';

describe('literal descriptions and standard input', () => {
  const descriptions = [
    'He said "hello".\nPath: C:\\temp\\notes',
    '{"note":"He said "hello""}\nDetails: "a quote"',
    '  indented\n    deeper  ',
    'first\nsecond\r\nthird\rfourth',
    'Developer 👩‍💻, ①, ², e\u0301, non\u00a0breaking space',
    '\n\nleading and trailing blank lines\n\n',
    'tabs\there\u0000\b\f and literal \\n',
    '',
  ];

  it.each(descriptions)('preserves valid JSON text: %p', async description => {
    for (const preprocessQuotes of [false, true]) {
      const result = await parseInput({ data: JSON.stringify({ Description: description }), format: 'json', preprocessQuotes });
      expect(result.data[0]!.Description).toBe(description);
    }
  });

  it.each(['json', 'yaml', 'csv'] as const)('%s preserves bare and quoted blocks', async format => {
    for (const description of descriptions) for (const wrapper of ['', '"']) {
      const block = `${wrapper}<<<\n${description}\n>>>${wrapper}`;
      const data = format === 'json' ? `{"Description": ${block}, "Summary": "Test"}`
        : format === 'yaml' ? `Description: ${block}\nSummary: Test`
        : `Description,Summary\n${block},Test`;
      for (const preprocessQuotes of [false, true]) {
        const result = await parseInput({ data, format, preprocessQuotes });
        expect(result.data[0]).toEqual({ Description: description, Summary: 'Test' });
      }
    }
  });

  it('does not interpret markers inside valid strings or YAML block scalars', async () => {
    const description = '<<<\nnot a JiraMagic block\n>>>';
    expect((await parseInput({ data: JSON.stringify({ Description: description }), format: 'json' })).data[0]!.Description).toBe(description);
    const data = 'Description: |\n  Note: <<<\n  This is ordinary YAML text.\n  >>>\nSummary: Test';
    expect((await parseInput({ data, format: 'yaml' })).data[0]!.Description).toBe('Note: <<<\nThis is ordinary YAML text.\n>>>\n');
  });

  it.each(['json', 'yaml', 'csv'] as const)('%s reports an unclosed block with its location', async format => {
    const data = format === 'json' ? '{"Description": <<<\nmissing end}'
      : format === 'yaml' ? 'Description: <<<\nmissing end' : 'Description\n<<<\nmissing end';
    await expect(parseInput({ data, format })).rejects.toThrow(/Unclosed.*line/i);
  });

  it('requires an explicit compatibility option for malformed quoted text', async () => {
    const data = '{"Description":"He said "hello""}';
    await expect(parseInput({ data, format: 'json' })).rejects.toThrow();
    expect((await parseInput({ data, format: 'json', preprocessQuotes: true })).data[0]!.Description).toBe('He said "hello"');
  });

  it('does not let compatibility repair modify a literal block', async () => {
    const data = '{"Summary":"He said "hello"", "Description": <<<\n{"note":"raw \\n"}\n>>>}';
    expect((await parseInput({ data, format: 'json', preprocessQuotes: true })).data[0]).toEqual({
      Summary: 'He said "hello"', Description: '{"note":"raw \\n"}',
    });
  });
});

it('preserves YAML dates and comments around literal blocks', async () => {
  const input = '# <<<\nDate: 2026-09-04\nDescription: <<<\ntext # "quote"\n>>> # close\nSummary: next';
  const result = await parseInput({ data: input, format: 'yaml' });
  expect(result.data[0].Date).toEqual(new Date('2026-09-04T00:00:00Z'));
  expect(result.data[0].Description).toBe('text # "quote"');
  expect(result.data[0].Summary).toBe('next');
});
it('keeps literal-looking lines inside a standard YAML block scalar', async () => {
  const result = await parseInput({ data: 'Description: |\n  <<<\n  text\n  >>>\nSummary: after', format: 'yaml' });
  expect(result.data[0]).toEqual({ Description: '<<<\ntext\n>>>\n', Summary: 'after' });
});
