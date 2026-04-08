# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [1.3.0](https://github.com/samuelaure/nauthenticity/compare/v1.1.0...v1.3.0) (2026-04-08)


### Features

* **proactive:** add brand and target configuration endpoints ([ab022d4](https://github.com/samuelaure/nauthenticity/commit/ab022d4c77880e40aefa22f2b818d81a6e3e35ab))
* **proactive:** ensure all proactive modules are committed ([602475c](https://github.com/samuelaure/nauthenticity/commit/602475c18e086cb5c7f330e9534db3864fb4bfbb))
* **proactive:** implement brand config schema and fanout processor ([2a69890](https://github.com/samuelaure/nauthenticity/commit/2a69890bb4502f07505dd8cf4c0cbabe1e019f37))

# 1.2.0 (2026-04-07)

### Features
- **proactive**: implemented Brand Fanout Processor for deduplicated scraping.
- **proactive**: added Zazu Dispatcher for asynchronous notification delivery.
- **proactive**: added OpenAI Multiplexer for brand-aware comment generation (2 options).
- **api**: exposed `/v1/generate-comment`, `/v1/comment-feedback`, and `/v1/trigger-fanout`.
- **db**: added `BrandConfig`, `BrandTarget`, and `CommentFeedback` models.
