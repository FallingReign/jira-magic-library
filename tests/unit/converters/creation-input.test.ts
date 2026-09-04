import { ConverterRegistry } from '../../../src/converters/ConverterRegistry.js';
import { FieldResolver } from '../../../src/converters/FieldResolver.js';
import { parseInput } from '../../../src/parsers/InputParser.js';
import type { FieldSchema, ProjectSchema } from '../../../src/types/schema.js';

const field = (id: string, name: string, type: string, required = false): FieldSchema =>
  ({ id, name, type, required, schema: { type } });
const fields = {
  summary: field('summary', 'Summary', 'string', true),
  timetracking: field('timetracking', 'Time Tracking', 'timetracking'),
  customfield_1: field('customfield_1', 'Sprint', 'sprint'),
  duedate: field('duedate', 'Due Date', 'date'),
  points: field('points', 'Points', 'number'),
  flag: field('flag', 'Flag', 'boolean'),
};
const schema: ProjectSchema = { projectKey: 'TEST', issueType: 'Task', fields };
const context = { projectKey: 'TEST', issueType: 'Task', operation: 'create' as const };

describe('creation field contract', () => {
  it.each([
    ['yaml', 'Summary: Test\nTime Tracking: 2h'],
    ['yaml', 'Summary: Test\nTime Tracking: "2h"'],
    ['yaml', 'Summary: Test\nTime Tracking:\n  originalEstimate: "2h"'],
    ['yaml', 'Summary: Test\nOriginal Estimate: 2h'],
    ['json', '{"Summary":"Test","Time Tracking":"2h"}'],
    ['json', '{"Summary":"Test","Time Tracking":{"originalEstimate":"2h"}}'],
    ['csv', 'Summary,Time Tracking\nTest,2h'],
  ] as const)('%s estimate input produces a Jira time-tracking object', async (format, data) => {
    const input = (await parseInput({ data, format })).data[0]!;
    const resolver = new FieldResolver({ getFieldsForIssueType: async () => schema } as any);
    const resolved = await resolver.resolveFields('TEST', 'Task', input);
    const output = await new ConverterRegistry().convertFields(schema, resolved, context);
    expect(output.timetracking).toEqual({ originalEstimate: '2h' });
  });

  it.each([null, undefined, '', ' \t\r\n '])('omits blank optional values (%p)', async value => {
    const result = await new ConverterRegistry().convertFields(schema, { summary: 'Test', customfield_1: value, duedate: value }, context);
    expect(result).toEqual({ summary: 'Test' });
  });

  it.each([null, undefined, '', ' \t '])('rejects blank required values (%p)', async summary => {
    await expect(new ConverterRegistry().convertFields(schema, { summary }, context)).rejects.toThrow('Summary');
  });

  it('does not consider zero or false blank', async () => {
    const output = await new ConverterRegistry().convertFields(schema, { summary: 'Test', points: 0, flag: false }, context);
    expect(output).toEqual({ summary: 'Test', points: 0, flag: false });
  });

  it('does not apply creation blank rules to other conversion contexts', async () => {
    await expect(new ConverterRegistry().convertFields(schema, { customfield_1: '' }, { projectKey: 'TEST', issueType: 'Task' })).rejects.toThrow('Empty string');
  });

  it('rejects misspelled nested estimate fields instead of silently dropping them', async () => {
    await expect(new ConverterRegistry().convertFields(schema,
      { summary: 'Test', timetracking: { originalEstmate: '2h' } }, context)).rejects.toThrow('originalEstmate');
  });
});

describe('required fields and Jira defaults during creation', () => {
  it('leaves required fields with Jira defaults for Jira to populate', async () => {
    const defaulted = { ...schema, fields: { ...fields, defaulted: { ...field('defaulted', 'Defaulted', 'string', true), hasDefaultValue: true } } };
    expect(await new ConverterRegistry().convertFields(defaulted, { summary: 'Test', defaulted: '' }, context)).toEqual({ summary: 'Test' });
  });
  it('rejects an empty required collection', async () => {
    const required = { ...schema, fields: { ...fields, tags: field('tags', 'Tags', 'array', true) } };
    await expect(new ConverterRegistry().convertFields(required, { summary: 'Test', tags: [] }, context)).rejects.toThrow('Tags');
  });
  it.each([{}, { originalEstimate: '', remainingEstimate: null }, { originalEstimate: undefined }])('omits an empty optional time-tracking object %p', async timetracking => {
    expect(await new ConverterRegistry().convertFields(schema, { summary: 'Test', timetracking }, context)).toEqual({ summary: 'Test' });
  });
  it('rejects an empty required time-tracking object', async () => {
    const required = { ...schema, fields: { ...fields, timetracking: { ...fields.timetracking, required: true } } };
    await expect(new ConverterRegistry().convertFields(required, { summary: 'Test', timetracking: {} }, context)).rejects.toThrow('Time Tracking');
  });
  it.each([['2h', '2h'], [0, '0m']])('combines scalar original estimate %p with a virtual remaining estimate', async (original, expected) => {
    const resolver = new FieldResolver({ getFieldsForIssueType: async () => schema } as any);
    const resolved = await resolver.resolveFields('TEST', 'Task', { Summary: 'Test', 'Time Tracking': original, 'Remaining Estimate': '30m' });
    expect((await new ConverterRegistry().convertFields(schema, resolved, context)).timetracking).toEqual({ originalEstimate: expected, remainingEstimate: '30m' });
  });
});
