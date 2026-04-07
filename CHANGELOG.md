# 1.2.0 (2026-04-07)

### Features
- **proactive**: implemented Brand Fanout Processor for deduplicated scraping.
- **proactive**: added Zazu Dispatcher for asynchronous notification delivery.
- **proactive**: added OpenAI Multiplexer for brand-aware comment generation (2 options).
- **api**: exposed `/v1/generate-comment`, `/v1/comment-feedback`, and `/v1/trigger-fanout`.
- **db**: added `BrandConfig`, `BrandTarget`, and `CommentFeedback` models.
