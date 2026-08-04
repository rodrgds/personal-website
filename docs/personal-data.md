# Personal data store

The site keeps durable copies of activity data in Directus. Visitor requests read
Directus only. Scheduled jobs call GitHub, Hevy, LeetCode, and Last.fm outside the
request path.

## Data model

- `data_sources` stores import cursors, health, and non-secret provider state.
- `sync_runs` records each import attempt and its outcome.
- `activity_days` stores sparse daily values for the homepage calendar.
- `metric_summaries` stores public totals and start dates.
- `music_scrobbles` stores normalized Last.fm history.
- `workouts` stores Hevy workouts and deletion tombstones.
- `routines` stores Hevy routines and folder membership.
- `health_days` stores daily phone aggregates.
- `sleep_sessions` stores Health Connect sleep sessions with stable IDs.

Credentials remain in the service environment. They are never stored in a
Directus item.

## Imports

The schema command is additive and safe to rerun:

```bash
bun run personal-data schema
```

Run one incremental import:

```bash
bun run personal-data sync --source lastfm
```

Run a full reconciliation:

```bash
bun run personal-data sync --source all --full
```

Raw rows use deterministic IDs. An interrupted job can rerun without creating
duplicates. A source cursor advances only after raw rows and public projections
have been written.

Production schedules Last.fm every 15 minutes, Hevy every four hours, and GitHub
and LeetCode every six hours. A weekly full reconciliation refreshes complete
provider views and records Hevy deletions. Stored scrobbles remain append-only so
a later Last.fm deletion does not erase the local copy.

## Android health upload

The preferred phone-side collector is
[HC Webhook](https://github.com/mcnaveen/health-connect-webhook). It reads the
Android Health Connect store, so the website can keep its own durable steps and
sleep history. In HC Webhook:

1. Grant read access only to Steps and Sleep plus background reads.
2. Enable only Steps and Sleep. Set Steps to **Daily** and Sleep to
   **Summary**. Summary keeps the session duration but leaves out sleep stages,
   which keeps webhook payloads and the Directus database small.
3. Add this webhook URL:
   `https://rgo.pt/api/personal-data/health?timezone=Europe%2FLisbon`.
4. Add the custom header
   `Authorization: Bearer <PERSONAL_DATA_API_KEY>`.
5. Use scheduled syncs at 00:15, 04:10, 08:10, 12:10, 16:10, 20:10, and
   23:50. The post-midnight run captures the completed previous day.

The endpoint accepts HC Webhook's normal JSON envelope with `steps` and `sleep`
arrays. Steps become one row per day. Each sleep session receives a stable ID
and is attributed to the date on which it ended, so the activity square appears
on the wake-up day. Repeated syncs and overlapping backfills update the existing
records instead of adding duplicates.

### Health history backfill

Automatic HC Webhook runs use its rolling 48-hour incremental window. To import
older Health Connect history, use HC Webhook's **Manual Sync** section, select
Steps and Sleep, choose **Past 30 days** or **Custom**, and send it to the
`rgo.pt` webhook. Ranges older than 30 days require Health Connect's history
permission.

Backfill at most one year at a time. The website accepts up to 400 daily Steps
records and 800 Sleep sessions in one authenticated request, then writes them in
Directus batches. Use adjacent, non-overlapping yearly ranges for a longer
history. Re-sending a range is safe: the date remains the stable Steps key and
the sleep session end time remains the stable Sleep key.

### MacroDroid fallback

Send `POST` or `PUT` to `https://rgo.pt/api/personal-data/health` with these
headers:

```text
Authorization: Bearer <PERSONAL_DATA_API_KEY>
Content-Type: application/json
```

Example body:

```json
{
  "date": "2026-08-04",
  "timezone": "Europe/Lisbon",
  "observed_at": "2026-08-04T22:00:00+01:00",
  "steps": 10432,
  "sleep_minutes": 452
}
```

`observed_at` prevents an older phone reading from replacing a newer one. The
endpoint accepts partial updates and preserves measurements omitted from the new
request. Repeating the same reading does not create another daily row.

MacroDroid should send one final update near the end of the day. It can also send
updates during the day because the date is the stable row key.

## Backups and recovery

The VPS creates one compressed Directus archive each day. Each archive contains a
SQLite online backup and the uploads directory. Only the newest seven archives
and their checksums remain. A weekly job extracts the newest archive and runs
SQLite's integrity check.

The archives live on the same VPS under `/var/backup/directus`. They protect
against bad migrations and accidental data changes, but not loss of the whole
server. Add an encrypted off-site target before treating this as disaster
recovery.

To restore, stop Directus, verify the archive checksum, extract
`database.sqlite`, replace `/var/lib/directus/database/data.db`, restore the
`uploads` directory, fix ownership to UID/GID 1000, and start Directus. Keep the
current database until the restored instance passes its health check.
