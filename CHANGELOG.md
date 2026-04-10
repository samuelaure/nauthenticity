# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [1.4.1](https://github.com/samuelaure/nauthenticity/compare/v1.4.0...v1.4.1) (2026-04-10)


### Bug Fixes

* **db:** correct comment suggester migration to create missing tables ([c2ca53f](https://github.com/samuelaure/nauthenticity/commit/c2ca53f20bbe0e23b0949d7fc2d48e92067c8f6b))

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
