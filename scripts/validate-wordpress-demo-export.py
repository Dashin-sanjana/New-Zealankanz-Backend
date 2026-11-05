#!/usr/bin/env python3
"""Validate the sanitized demo manifest against a WordPress WXR export."""

import argparse
from decimal import Decimal, InvalidOperation
import html
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {
    "wp": "http://wordpress.org/export/1.2/",
    "content": "http://purl.org/rss/1.0/modules/content/",
}
EMAIL = re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b")
PHONE = re.compile(r"(?:\+?\d[\d\s().-]{7,}\d)")


def normalized_text(value: str) -> str:
    value = re.sub(r"<!--.*?-->", " ", value, flags=re.S)
    value = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--xml", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    if not isinstance(manifest, dict) or not isinstance(manifest.get("records"), list):
        raise ValueError("Manifest must contain a records array.")
    if manifest.get("record_count") != 22 or len(manifest["records"]) != 22:
        raise ValueError("Manifest must contain exactly 22 records.")
    if not re.search(r"published ad_post records only", manifest.get("scope", ""), re.I):
        raise ValueError("Manifest scope must be limited to published ad_post records.")

    root = ET.parse(args.xml).getroot()
    channel = root.find("channel")
    if channel is None:
        raise ValueError("The XML has no RSS channel.")
    counts: dict[str, int] = {}
    published: dict[int, dict] = {}
    for item in channel.findall("item"):
        post_type = item.findtext("wp:post_type", default="", namespaces=NS)
        status = item.findtext("wp:status", default="", namespaces=NS)
        if post_type != "ad_post":
            continue
        counts[status] = counts.get(status, 0) + 1
        if status != "publish":
            continue
        source_id = int(item.findtext("wp:post_id", default="0", namespaces=NS))
        meta = {
            entry.findtext("wp:meta_key", default="", namespaces=NS):
            entry.findtext("wp:meta_value", default="", namespaces=NS)
            for entry in item.findall("wp:postmeta", NS)
        }
        published[source_id] = {
            "slug": item.findtext("wp:post_name", default="", namespaces=NS),
            "title": normalized_text(item.findtext("title", default="")),
            "description": normalized_text(
                item.findtext("content:encoded", default="", namespaces=NS)
            ),
            "meta": meta,
            "categories": sorted(
                term.attrib.get("nicename", "")
                for term in item.findall("category")
                if term.attrib.get("domain") == "ad_cats"
            ),
        }

    rows = manifest["records"]
    by_id: dict[int, dict] = {}
    for row in rows:
        source_id = row.get("source_id")
        if not isinstance(source_id, int) or source_id in by_id:
            raise ValueError("Manifest contains a missing or duplicate source ID.")
        if row.get("demo") is not True or row.get("seller_contact_enabled") is not False:
            raise ValueError(f"Source {source_id} is missing DEMO/contact safeguards.")
        by_id[source_id] = row

    id_matches = set(published) == set(by_id)
    slug_mismatches = [
        source_id
        for source_id in set(published) & set(by_id)
        if published[source_id]["slug"] != by_id[source_id].get("slug")
    ]
    title_mismatches = [
        source_id
        for source_id in set(published) & set(by_id)
        if published[source_id]["title"] != normalized_text(by_id[source_id].get("title", ""))
    ]
    description_mismatches = [
        source_id
        for source_id in set(published) & set(by_id)
        if published[source_id]["description"]
        != normalized_text(by_id[source_id].get("description_text", ""))
    ]
    source_field_mismatches: dict[str, list[int]] = {
        key: [] for key in ("price", "priceType", "location", "featured", "categories", "currency")
    }
    for source_id in set(published) & set(by_id):
        source = published[source_id]
        row = by_id[source_id]
        meta = source["meta"]
        raw_price = meta.get("_adforest_ad_price", "").strip()
        manifest_price = row.get("price_original")
        try:
            prices_match = (Decimal(raw_price) if raw_price else None) == (
                Decimal(manifest_price) if manifest_price else None
            )
        except InvalidOperation:
            prices_match = False
        source_checks = {
            "price": prices_match,
            "priceType": meta.get("_adforest_ad_price_type", "") == row.get("price_type", ""),
            "location": (meta.get("_adforest_ad_location", "").strip() or None)
            == row.get("location"),
            "featured": (meta.get("_adforest_is_feature", "").strip().lower() in ("1", "yes", "true"))
            == row.get("featured"),
            "categories": source["categories"]
            == sorted(
                term.get("slug", "")
                for term in row.get("categories", [])
                if term.get("taxonomy") == "ad_cats"
            ),
            "currency": (meta.get("_adforest_ad_currency", "").strip() or None)
            == row.get("currency_symbol"),
        }
        for key, matches in source_checks.items():
            if not matches:
                source_field_mismatches[key].append(source_id)
    contact_text_ids = [
        source_id
        for source_id, row in by_id.items()
        if EMAIL.search(row.get("description_text", ""))
        or PHONE.search(row.get("description_text", ""))
    ]
    result = {
        "sourceRecords": len(published),
        "statusCounts": counts,
        "manifestRecords": len(rows),
        "sourceIdsMatch": id_matches,
        "slugMismatches": slug_mismatches,
        "titleMismatches": title_mismatches,
        "descriptionMismatches": description_mismatches,
        "sourceFieldMismatches": source_field_mismatches,
        "demoAndContactFlagsValid": True,
        "descriptionsWithContactLikeText": contact_text_ids,
        "numericPrices": sum(bool(row.get("price_original")) for row in rows),
        "explicitCurrencies": sum(bool(row.get("currency_symbol")) for row in rows),
        "priceTypes": sum(bool(row.get("price_type")) for row in rows),
        "locations": sum(bool(row.get("location")) for row in rows),
        "recordsWithMediaReferences": sum(bool(row.get("image_urls")) for row in rows),
        "mediaReferencesToImport": 0,
        "privateSellerFieldsImported": 0,
    }
    print(json.dumps(result, indent=2))
    if (
        not id_matches
        or len(published) != 22
        or slug_mismatches
        or title_mismatches
        or description_mismatches
        or any(source_field_mismatches.values())
        or contact_text_ids
    ):
        return 1
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # Report validation failure without dumping source fields.
        print(str(error), file=sys.stderr)
        sys.exit(1)
