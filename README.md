# Bluesky Follower Info

> A Chrome extension which displays new followers' profile descriptions and stats in the notifications feed

![splash.png](assets/splash.png)

## Features

### Extension

The extension displays:

- Profile description (tidied)
- Posts, followers and following counts
- Icons for:
  - 📝 Posted
  - ✅ Engaged (more than 25 posts)
  - 🔥 Popular (more followers than following)
  - 👍 Following
- Newer followers (< 2 weeks) shown in blue, older ones in grey
- A blue background for notification summaries (so you don't miss them)

Only on-screen notifications are fetched, then cached (and refreshed if > 1 week old)

### Options

The options page lets you configure:

- Process (lists, feed, follows, reposts, likes)
- Profile (show emojis, compact view)
- Icons (posted, engaged, popular, following)
- Thresholds (posted, engaged, stale, old)

## Screenshots

Notifications summary:

![screenshot.png](assets/screenshot-summary.png)

Notifications feed:

![screenshot.png](assets/screenshot-feed.png)

## Installation

Install from the Chrome Web Store:

- https://chromewebstore.google.com/detail/bluesky-follower-info/fokpfcfpgdlmnbjajbdeofkemfblbnbh

Make sure to reload any open Bluesky pages.
