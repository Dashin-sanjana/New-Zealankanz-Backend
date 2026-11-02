# Production demo image handling

The production content approval covers the 22 source records, but individual third-party gallery image reuse is not verified. Production therefore stores no source image URLs for these demo listings. The frontend displays its labeled “Image unavailable” state on cards and detail pages.

Affected WordPress source IDs (all 22): 2075, 2078, 1972, 1609, 1601, 1508, 223, 268, 276, 1474, 1501, 200, 184, 291, 1494, 238, 210, 343, 190, 298, 232, 218. The importer stores zero unverified gallery URLs.
