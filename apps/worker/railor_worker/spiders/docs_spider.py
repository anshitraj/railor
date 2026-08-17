"""Example Scrapy spider for multi-page documentation sites.

Used when a provider's coverage information is spread across a docs tree rather
than a single page. It stays inside the documented section, obeys robots.txt and
rate limits, and emits the same `Claim` objects the single-page pipeline uses —
so a Scrapy crawl and an HTTP fetch converge on one review queue.

    scrapy runspider railor_worker/spiders/docs_spider.py \
        -a start=https://demo.railor.dev/sources/northwind/coverage \
        -a provider=northwind-rails
"""

from __future__ import annotations

from urllib.parse import urlparse

import scrapy

from railor_worker.extract import RuleExtractor, to_text


class ProviderDocsSpider(scrapy.Spider):
    name = "provider_docs"

    custom_settings = {
        "ROBOTSTXT_OBEY": True,
        "DOWNLOAD_DELAY": 2.0,
        "CONCURRENT_REQUESTS_PER_DOMAIN": 2,
        "AUTOTHROTTLE_ENABLED": True,
        "USER_AGENT": "RailorBot/0.1 (+https://railor.dev/bot; infrastructure capability mapping)",
        "DEPTH_LIMIT": 3,
    }

    def __init__(self, start: str, provider: str, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.start_urls = [start]
        self.provider = provider
        self.allowed_domains = [urlparse(start).netloc]
        self._prefix = start.rsplit("/", 1)[0]
        self._extractor = RuleExtractor()

    def parse(self, response: scrapy.http.Response):
        text = to_text(response.text)

        for claim in self._extractor.extract(text):
            yield {
                "provider": self.provider,
                "url": response.url,
                "kind": claim.kind,
                "key": claim.key,
                "availability": claim.availability,
                "confidence": claim.confidence,
                "excerpt": claim.excerpt,
                "derivation": claim.derivation,
            }

        # Stay within the documentation section that was pointed at.
        for href in response.css("a::attr(href)").getall():
            target = response.urljoin(href)
            if target.startswith(self._prefix):
                yield response.follow(target, callback=self.parse)
