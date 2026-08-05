# Architecture Integration Brief: cloud-readiness-blockers

## Existing ownership

- Package/component/module/library:
  - `src/types/config.ts` owns public configuration types, including `TimeoutConfig` and `JMLConfig`.
  - `src/client/EndpointResolver.ts` owns deployment-aware REST path generation (`apiBase`, issue create/bulk, project, field, user search).
  - `src/jml.ts` owns deployment auto-detection and passes `() => this.getEndpointResolver()` into Cloud-aware components.
  - `src/operations/IssueOperations.ts` owns public `jml.issues.create(...)`, single/bulk create routing, manifest/retry/progress behavior, Cloud payload adaptation, and current create endpoint resolution.
  - `src/operations/JiraBulkApiWrapper.ts` owns POSTing to the Jira bulk-create API and normalizing bulk API results.
  - `src/schema/SchemaDiscovery.ts`, `src/converters/FieldResolver.ts`, and converter type modules own schema/lookup API reads used during create conversion.
- Current owner rationale:
  - `EndpointResolver` is explicitly documented as the centralized deployment-aware URL builder and already exposes the exact endpoint methods needed.
  - `JML` already creates/caches an `EndpointResolver` for explicit deployment and lazy auto-detection; new Cloud routing should consume that instead of creating a parallel detector.
  - `IssueOperations` already receives `endpointResolverFn`, has `resolveIssueCreateEndpoint()` and `resolveBulkCreateEndpoint()`, and constructs `CloudCreateAdapter`.
  - `JiraBulkApiWrapper` already has a constructor-level `bulkEndpoint` fallback, so call-time endpoint override belongs there rather than a new bulk client.
- Source evidence:
  - `src/client/EndpointResolver.ts:1-128` centralizes `/rest/api/{2|3}` paths and has `issueCreate()`/`issueBulkCreate()`/`projectList()`/`projectGet()`/`userSearch()`.
  - `src/jml.ts:217-222` creates resolver eagerly for explicit deployment; `src/jml.ts:556-586` lazily detects and returns resolver for `auto`.
  - `src/jml.ts:258-269` passes `deploymentSetting !== 'auto' ? deploymentSetting : undefined` plus `() => this.getEndpointResolver()` to `IssueOperations`.
  - `src/operations/IssueOperations.ts:160-164` creates `CloudCreateAdapter` only for explicit non-auto deployment today.
  - `src/operations/IssueOperations.ts:644-649` resolves single-create endpoint before POST; `src/operations/IssueOperations.ts:1579-1590` has an unused bulk endpoint resolver.
  - `src/operations/JiraBulkApiWrapper.ts:60-76` owns bulk timeout/endpoint defaults; `src/operations/JiraBulkApiWrapper.ts:107-121` posts to `this.bulkEndpoint ?? '/rest/api/2/issue/bulk'`.
  - `src/schema/SchemaDiscovery.ts:53-56,152-190`, `src/converters/FieldResolver.ts:268,420-422,456-458`, and converter files contain hardcoded `/rest/api/2` reads.

## Existing interaction model

- User/system behaviors that already exist:
  - Users create single or bulk issues through one API: `jml.issues.create(...)`.
  - Single create resolves project/issue type and fields, fetches schema, converts values, optionally dry-runs with `validate`, adapts for Cloud when adapter exists, and posts to Jira.
  - Bulk create builds payloads by calling `createSingle(..., { validate: true })`, supports partial validation failures, stores manifests, retries failed rows, supports hierarchy level batching, progress markers, marker cleanup, and progress-based timeout.
  - Deployment can be explicit (`cloud`/`server`) or `auto`; `auto` lazily calls `DeploymentDetector` through `JML.getEndpointResolver()`.
  - Legacy auth `{ token }` remains accepted via config migration; requested slice explicitly says no auth code change.
  - `timeout.default`, `timeout.bulk`, progress timeout/polling, and cleanup marker settings already exist; `timeout.single` was removed from docs/changelog but must be restored as type-only compatibility.
- Behaviors that must remain unchanged:
  - Server/DC defaults must continue using `/rest/api/2` when no resolver exists or detection fails.
  - Explicit `deployment: 'server'` must not receive Cloud payload transformations.
  - Explicit `deployment: 'cloud'` must still adapt rich text/user/issuetype payloads and use API v3 unless `apiVersion` overrides it.
  - Auto-detection must remain lazy, cached, and deduplicated by `JML`; `IssueOperations`, schema, and converters must not perform their own detection.
  - Bulk manifest/retry/index remapping/progress-marker behavior must not change while only the endpoint path changes.
  - Existing converter cache keys and graceful cache degradation should remain compatible.
- Runtime or UX evidence:
  - `IssueOperations.create()` dispatches single vs bulk at `src/operations/IssueOperations.ts:241-260`.
  - Bulk retry and hierarchy paths call `JiraBulkApiWrapper.createBulk(...)` in multiple places: `src/operations/IssueOperations.ts:433,999,1359`.
  - `PayloadPreview` expects the same endpoint/deployment/adaptation model as create, but currently receives direct `cloudAdapter` state from `IssueOperations` (`src/operations/PayloadPreview.ts:50-61,130-142`).

## Existing extension points

- APIs/hooks/components/library features/stores/conventions to use:
  - Use `EndpointResolver` for every REST path changed in this slice.
  - Use the existing `endpointResolverFn?: () => Promise<EndpointResolver>` pattern; add it to constructors/contexts where needed while preserving optional fallback behavior.
  - Use `CloudCreateAdapter` for Cloud payload adaptation; lazily instantiate it from the resolved `EndpointResolver` instead of creating another adaptation path.
  - Use existing `JiraClient.get/post` methods and existing cache abstractions (`CacheClient`, `LookupCache`, `GenericCache`) rather than new HTTP/cache layers.
  - Preserve TypeScript `.js` import extensions in source files.
- Relevant docs or library capabilities:
  - `CHANGELOG.md:11` claims the endpoint resolver replaces all hardcoded `/rest/api/2/` paths; current code conflicts with this.
  - `CHANGELOG.md:28` claims `IssueOperations` uses `EndpointResolver` for all API paths; current bulk calls and auto Cloud adapter activation conflict with this.
  - `CHANGELOG.md:38-39` documents removal of `TimeoutConfig.single`; requested compatibility restoration intentionally reverses this type-level removal without making runtime use of it.
  - `README.md:75` and `docs/architecture/system-architecture.md:4,22,27` still say Cloud is not implemented/roadmap, which conflicts with current Cloud-support code and changelog.
- Existing examples in this codebase:
  - `ProjectDiscovery`, `IssueTypeDiscovery`, and `FieldMetadataDiscovery` use constructor-injected `resolverFn` and call `await resolverFn()` before API reads.
  - `IssueOperations.resolveIssueCreateEndpoint()` and `resolveBulkCreateEndpoint()` are existing endpoint fallback helpers.
  - Converter context already carries `client`, `cache`, `cacheClient`, and `config`; extending `ConversionContext` with optional `endpointResolverFn` follows that pattern.

## Do-not-bypass list

- Systems/libraries/components not to duplicate or replace:
  - Do not duplicate deployment detection outside `JML`/`DeploymentDetector`.
  - Do not hardcode new Cloud/Server conditionals when `EndpointResolver` already owns path differences.
  - Do not replace `CloudCreateAdapter`; fix its lazy activation in `IssueOperations`.
  - Do not replace `JiraBulkApiWrapper`, manifest storage, hierarchy preprocessing, progress tracking, marker injection, or retry flow.
  - Do not alter `AuthStrategy`, config migration, or auth behavior.
- Shortcuts or parallel paths to avoid:
  - Avoid adding a second bulk wrapper/client just to post to `/rest/api/3`.
  - Avoid constructor-only endpoint wiring for bulk; the requested behavior is call-time resolved endpoint from `endpointResolverFn`.
  - Avoid making `timeout.single` functional unless a separate requirement requests runtime behavior; this slice is type-only compatibility.
  - Avoid passing raw `/rest/api/3` strings through converter code; use resolver or fallback to existing v2 paths.
- Invariants:
  - Backward compatibility: no `endpointResolverFn` supplied means current `/rest/api/2` behavior remains.
  - `EndpointResolver` is the single owner for API version/deployment path selection.
  - Cloud auto-detection must happen lazily and once via `JML.getEndpointResolver()`.
  - Existing tests expecting v2 defaults should remain green, with new tests covering resolver-supplied v3 paths.

## Integration plan

- Insert the change at:
  - `src/types/config.ts`: add deprecated optional `single?: number` to `TimeoutConfig` with documentation that it is ignored/type-only and `timeout.default` controls single requests.
  - `src/operations/IssueOperations.ts`: add async `getCloudAdapter()` that calls `endpointResolverFn`, infers Cloud from `resolver.isCloud`, caches a `CloudCreateAdapter('cloud')` or server adapter as appropriate, and preserves explicit deployment adapter behavior. Replace direct `this.cloudAdapter` use in `createSingle` adaptation and `preview` construction/deployment with the lazy helper where async flow permits.
  - `src/operations/JiraBulkApiWrapper.ts`: extend `createBulk(payloads, timeoutOverride?, endpointOverride?)` and compute endpoint as `endpointOverride ?? this.bulkEndpoint ?? '/rest/api/2/issue/bulk'`.
  - `src/operations/IssueOperations.ts`: before each bulk wrapper call, resolve `const bulkEndpoint = await this.resolveBulkCreateEndpoint()` and pass it to `createBulk`. Cover flat bulk, retry flat bulk, retry hierarchy flat fallback, and hierarchy level batching.
  - `src/schema/SchemaDiscovery.ts`: accept optional `endpointResolverFn` in constructor. Add private resolver helper methods that return `resolver.apiBase`/`resolver.createMetaFields(...)` or v2 fallback. Replace hardcoded createmeta paths in `getIssueTypesForProject()` and `fetchAndCacheSchema()`.
  - `src/converters/FieldResolver.ts`: accept optional `endpointResolverFn` in constructor and use it for project lookup/list and createmeta issue type lookup, with v2 fallbacks.
  - `src/types/converter.ts`: add optional `endpointResolverFn?: () => Promise<EndpointResolver>` to `ConversionContext` using type-only import.
  - `src/converters/types/UserConverter.ts`: use `context.endpointResolverFn` for `userSearch()` and `userSearchParam`, preserving v2 username wildcard fallback if resolver is absent. Cloud wildcard behavior may differ, so tests should verify endpoint/param routing, not live full-directory semantics unless Cloud supports it.
  - `src/converters/types/ProjectConverter.ts`: use `context.endpointResolverFn` for project get/list paths. Preserve server list array handling; if Cloud `projectList()` returns paginated `{ values }`, normalize to array.
  - `src/converters/types/IssueTypeConverter.ts`: use `context.endpointResolverFn` or `resolver.apiBase` for createmeta.
  - `src/jml.ts`: pass `() => this.getEndpointResolver()` into `SchemaDiscovery`, `FieldResolver`, and converter context through `IssueOperations` so core create/converter paths share JML-owned detection.
- Why this is the correct integration point:
  - These are the modules already owning type config, endpoint resolution, create flows, bulk posting, schema discovery, and field conversion. The patch fixes incomplete integration with existing owners instead of creating new Cloud-specific modules.
- Alternatives considered and rejected:
  - Add Cloud-specific methods/classes for schema/converters: rejected as a parallel path around `EndpointResolver` and existing discovery/converter owners.
  - Instantiate `CloudCreateAdapter` directly in `JML` for auto: rejected because auto detection is lazy and async; `IssueOperations` already has the resolver callback.
  - Change auth to infer Cloud: rejected by explicit user request and existing `AuthStrategy` ownership.
  - Make `timeout.single` affect runtime single-create requests: rejected because request asks type-only compat and changelog says single operations use `timeout.default`.

## Regression checklist

- Behavior: Existing Server/DC single create still posts `/rest/api/2/issue` and does not Cloud-adapt payloads.
- Behavior: Explicit Cloud single create still adapts payloads and posts `/rest/api/3/issue` by default.
- Behavior: Auto-detected Cloud single create now adapts payloads after `endpointResolverFn` resolves Cloud.
- Behavior: Bulk create/retry/hierarchy routes use resolved `/rest/api/3/issue/bulk` for Cloud and `/rest/api/2/issue/bulk` for Server/fallback.
- Behavior: Bulk validation failures, index remapping, manifest storage, retry merging, hierarchy UID replacement, progress callbacks, progress HTTP timeout `Infinity`, and marker cleanup remain unchanged.
- Behavior: Schema discovery and field/project/user/issuetype converters still work without resolver callback by falling back to current v2 paths.
- Behavior: Existing public config objects with `timeout.single` compile, but runtime timeout behavior remains based on `timeout.default`/`timeout.bulk`.
- Behavior: No auth tests or code paths change.

## Test plan

- Existing tests to keep green:
  - `npm run type-check`
  - `npm run test -- --runInBand`
  - Targeted current suites: `tests/unit/client/EndpointResolver.test.ts`, `tests/unit/operations/IssueOperations.test.ts`, `tests/unit/operations/JiraBulkApiWrapper.test.ts`, `tests/unit/operations/CloudCreateAdapter.test.ts`, `tests/unit/schema/SchemaDiscovery.test.ts`, `tests/unit/converters/FieldResolver.test.ts`, `tests/unit/converters/types/UserConverter.test.ts`, `ProjectConverter.test.ts`, `IssueTypeConverter.test.ts`, `tests/unit/jml.test.ts`.
- New tests to add before/with implementation:
  - `TimeoutConfig` compile/type test or config unit test fixture proving `timeout: { single: 123 }` is accepted.
  - `IssueOperations` auto Cloud test: construct with `deployment` undefined plus resolverFn returning Cloud v3; assert dry-run/single create uses Cloud adaptation (ADF description) and POST endpoint `/rest/api/3/issue`.
  - `IssueOperations` bulk tests for flat, retry, and hierarchy path(s) passing endpoint override to `JiraBulkApiWrapper.createBulk`; at minimum assert normal flat bulk uses `/rest/api/3/issue/bulk` when resolver is Cloud.
  - `JiraBulkApiWrapper` test for per-call endpoint override taking precedence over constructor/default endpoint.
  - `SchemaDiscovery` tests that resolver-supplied Cloud base routes createmeta calls through `/rest/api/3/...`, with existing no-resolver tests still expecting `/rest/api/2/...`.
  - `FieldResolver` tests for project ID lookup, project list, and issue type lookup using resolver paths while preserving fallback.
  - Converter tests for `UserConverter`, `ProjectConverter`, and `IssueTypeConverter` proving `ConversionContext.endpointResolverFn` is used and fallback remains v2.
  - `JML` construction test proving `SchemaDiscovery`/`FieldResolver` receive the resolver callback indirectly by observing create/converter calls use Cloud resolver in auto mode.
- Live proof required:
  - Run targeted unit tests above and `npm run type-check`.
  - If credentials/environment exist, run one Cloud dry-run/preview or mocked integration showing auto-detected Cloud produces `/rest/api/3/issue` and `/rest/api/3/issue/bulk`. Do not require live Jira credentials for unit completion.

## Risk assessment

- Risk: Adding async lazy adapter use can change `createSingle` sequencing or preview behavior.
- Risk: Resolver callback failures could mask real deployment errors if broad catch fallback is overused.
- Risk: Cloud project list endpoint returns paginated wrapper while existing converter expects an array.
- Risk: UserConverter currently relies on Server/DC wildcard `username: '.'`; Cloud user search semantics may not support equivalent full-directory fetch.
- Risk: Changing constructor signatures can break tests or external internal usage if optional parameters are inserted in the wrong position.
- Risk: Bulk endpoint override argument order can be confused with timeout override.
- Mitigation:
  - Keep new constructor params optional and appended.
  - Use helper methods with narrow resolver fallback to current v2 strings.
  - Add endpoint-specific unit tests for fallback, Server, and Cloud.
  - Keep `timeout.single` documented as deprecated/no-op type compatibility only.
  - Prefer `resolver` methods and `resolver.apiBase` over constructing raw version numbers outside `EndpointResolver`.

## Decision confidence

- Confidence: high
- Reasons:
  - Ownership is clear: `EndpointResolver`, `JML.getEndpointResolver()`, `IssueOperations`, `JiraBulkApiWrapper`, schema discovery, and converters already contain the relevant seams.
  - The requested changes mostly complete partially implemented Cloud support rather than introduce new architecture.
  - Existing tests and modules provide clear places to add regression coverage.
- Open questions:
  - Cloud full-user-directory lookup may require a different strategy than Server wildcard search; this brief recommends routing through `EndpointResolver` now and separately validating live Cloud semantics if user conversion is in scope beyond endpoint readiness.
  - Docs conflict: architecture/README still describe Cloud as future/not implemented, while changelog and code describe Cloud support. This slice should flag but not fully rewrite product docs unless implementation scope explicitly includes doc cleanup.
