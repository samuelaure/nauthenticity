# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [1.8.1](https://github.com/samuelaure/nauthenticity/compare/v1.8.0...v1.8.1) (2026-04-20)


### Bug Fixes

* **platform:** consolidate sso, infrastructure and intelligence stabilization ([0d3ebdd](https://github.com/samuelaure/nauthenticity/commit/0d3ebdda5b192cc7c8ed5d84a8a844879e9926a1))

## [1.8.0](https://github.com/samuelaure/nauthenticity/compare/v1.7.2...v1.8.0) (2026-04-20)


### Features

* **phase-19:** implement graceful platform-level voice and strategy fallbacks ([5edb201](https://github.com/samuelaure/nauthenticity/commit/5edb201e0ad5314cbd2f8df89bbdfd8aa6a1024c))

### [1.7.2](https://github.com/samuelaure/nauthenticity/compare/v1.7.1...v1.7.2) (2026-04-20)

### Bug Fixes

- **db:** remove BOM from init migration (caused Postgres syntax error) ([85f32f9](https://github.com/samuelaure/nauthenticity/commit/85f32f98a725663641196f6b48b82314fc70be4a))

### [1.7.1](https://github.com/samuelaure/nauthenticity/compare/v1.7.0...v1.7.1) (2026-04-20)

### Bug Fixes

- **nauth:** remove deprecated brandName property usage after workspace refactor ([200edbc](https://github.com/samuelaure/nauthenticity/commit/200edbc58aeec8f1303e839644a8a37baa14e8e8))

## [1.7.0](https://github.com/samuelaure/nauthenticity/compare/v1.5.9...v1.7.0) (2026-04-20)

### Features

- **db:** fresh init migration ([c56510d](https://github.com/samuelaure/nauthenticity/commit/c56510df73bff55f3d64a1e02e295f6d3463bb8a))

## [1.6.0](https://github.com/samuelaure/nauthenticity/compare/v1.5.9...v1.6.0) (2026-04-20)

### Features

- **db:** fresh init migration ([c56510d](https://github.com/samuelaure/nauthenticity/commit/c56510df73bff55f3d64a1e02e295f6d3463bb8a))

### [1.5.9](https://github.com/samuelaure/nauthenticity/compare/v1.6.0...v1.5.9) (2026-04-19)

### [1.5.6](https://github.com/samuelaure/nauthenticity/compare/v1.5.5...v1.5.6) (2026-04-18)

### [1.5.4](https://github.com/samuelaure/nauthenticity/compare/v1.5.3...v1.5.4) (2026-04-18)

### [1.5.3](https://github.com/samuelaure/nauthenticity/compare/v1.5.2...v1.5.3) (2026-04-18)

### [1.5.2](https://github.com/samuelaure/nauthenticity/compare/v1.5.1...v1.5.2) (2026-04-18)

### Features

- **database:** add migration for synthesis engine and mechanical tracking ([54eee04](https://github.com/samuelaure/nauthenticity/commit/54eee04ba8c5d1de3015522534ce32af6e42799a))

### [1.5.1](https://github.com/samuelaure/nauthenticity/compare/v1.5.0...v1.5.1) (2026-04-17)

### Bug Fixes

- **synthesis:** correct OpenAI SDK usage and casting issues found in production build ([4a5568f](https://github.com/samuelaure/nauthenticity/commit/4a5568fe37b56dff4cc82d830671f1efbc76aa5b))

## [1.5.0](https://github.com/samuelaure/nauthenticity/compare/v1.4.3...v1.5.0) (2026-04-17)

### Features

- **ci:** implement safe sequential deployment and disk health monitoring ([91d7533](https://github.com/samuelaure/nauthenticity/commit/91d7533973b65da47a1cffc7991a616511d38410))
- **db:** add BrandSynthesis and request tracking for mechanical ideation ([8610123](https://github.com/samuelaure/nauthenticity/commit/86101234b3f17c015d58ec90bc8c656bc0718ede))
- **ideation:** implement mechanical content synthesis engine and digest endpoint ([ed0a238](https://github.com/samuelaure/nauthenticity/commit/ed0a238697c2fd811673cd049587343aebe85a47))

## [1.5.0](https://github.com/samuelaure/nauthenticity/compare/v1.4.3...v1.5.0) (2026-04-17)

### Features

- **ci:** implement safe sequential deployment and disk health monitoring ([91d7533](https://github.com/samuelaure/nauthenticity/commit/91d7533973b65da47a1cffc7991a616511d38410))
- **db:** add BrandSynthesis and request tracking for mechanical ideation ([8610123](https://github.com/samuelaure/nauthenticity/commit/86101234b3f17c015d58ec90bc8c656bc0718ede))
- **ideation:** implement mechanical content synthesis engine and digest endpoint ([ed0a238](https://github.com/samuelaure/nauthenticity/commit/ed0a238697c2fd811673cd049587343aebe85a47))

### [1.4.2](https://github.com/samuelaure/nauthenticity/compare/v1.4.1...v1.4.2) (2026-04-10)

### Bug Fixes

- **deploy:** resolve failed migration state before retry ([6565295](https://github.com/samuelaure/nauthenticity/commit/656529583f2622e9bce592a90517ae91add477eb))

### [1.4.1](https://github.com/samuelaure/nauthenticity/compare/v1.4.0...v1.4.1) (2026-04-10)

### Bug Fixes

- **db:** correct comment suggester migration to create missing tables ([c2ca53f](https://github.com/samuelaure/nauthenticity/commit/c2ca53f20bbe0e23b0949d7fc2d48e92067c8f6b))

## [1.4.0](https://github.com/samuelaure/nauthenticity/compare/v1.3.0...v1.4.0) (2026-04-09)

### Features

- **api:** expand proactive controller with brand/target/feedback endpoints ([7961d23](https://github.com/samuelaure/nauthenticity/commit/7961d234981cadaaf940e61e41166d952b03d32f))
- **db:** expand schema for comment suggester v2 ([101c9d6](https://github.com/samuelaure/nauthenticity/commit/101c9d6a2b1b8186d8ed0bce62519b9c78c79970))
- **fanout:** implement smart 15m/60m threshold scheduling with window awareness ([75f5ec6](https://github.com/samuelaure/nauthenticity/commit/75f5ec62bb63cd8efab6da9722e2a6d2215b41a6))
- **intelligence:** implement 5-level comment suggestion prompt ([bb06ada](https://github.com/samuelaure/nauthenticity/commit/bb06adaa62e32b1f7f4ce7000d5601a9a4693cfa))
- **scheduler:** add internal node-cron fanout scheduler (every 15 min) ([36fd72b](https://github.com/samuelaure/nauthenticity/commit/36fd72b933c89e681dc029a47abcf9e1b41ba550))

### Bug Fixes

- **deploy:** add GHCR docker login for private image pull on server ([bdc90e4](https://github.com/samuelaure/nauthenticity/commit/bdc90e45ccdab259b1fbb5bc1d11840e6f70b7ee))
- **deploy:** strip CRLF in .env, run migrations on start, bind redis pass ([c1d0dd9](https://github.com/samuelaure/nauthenticity/commit/c1d0dd906f0d90f13d9996be06af5fc6625bb49c))
- switch app service to GHCR image instead of local build ([9f9cc76](https://github.com/samuelaure/nauthenticity/commit/9f9cc76d26f426e331cb0dd2d2d94a42fad4fd4e))
- write .env from GHA secrets and use GHCR image ([7dac534](https://github.com/samuelaure/nauthenticity/commit/7dac53430c3f9d3fa3a90d5c202ee26884ea38bc))

## [1.3.0](https://github.com/samuelaure/nauthenticity/compare/v1.1.0...v1.3.0) (2026-04-08)

### Features

- **proactive:** add brand and target configuration endpoints ([ab022d4](https://github.com/samuelaure/nauthenticity/commit/ab022d4c77880e40aefa22f2b818d81a6e3e35ab))
- **proactive:** ensure all proactive modules are committed ([602475c](https://github.com/samuelaure/nauthenticity/commit/602475c18e086cb5c7f330e9534db3864fb4bfbb))
- **proactive:** implement brand config schema and fanout processor ([2a69890](https://github.com/samuelaure/nauthenticity/commit/2a69890bb4502f07505dd8cf4c0cbabe1e019f37))

# 1.2.0 (2026-04-07)

### Features

- **proactive**: implemented Brand Fanout Processor for deduplicated scraping.
- **proactive**: added Zazu Dispatcher for asynchronous notification delivery.
- **proactive**: added OpenAI Multiplexer for brand-aware comment generation (2 options).
- **api**: exposed `/v1/generate-comment`, `/v1/comment-feedback`, and `/v1/trigger-fanout`.
- **db**: added `BrandConfig`, `BrandTarget`, and `CommentFeedback` models.
