Reference calendars. Each JSON carries `source`, `fetched_on` and `verified`.
`verified: false` means the file was assembled from the rule in the spec (section 6) or from
widely published dates but could not be re-fetched from the source site in the build sandbox.
Run `python scripts/fetch_static_calendars.py` with network access to refresh and set `verified: true`.
