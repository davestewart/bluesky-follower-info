# Bluesky Follower Info

> A Chrome extension which displays new followers' profile descriptions directly in the notifications feed.

![splash](images/splash.svg)

## Overview

Normally, the Bluesky feed is just a list of names and handles, with no real information about the follower:

![01-no-extension.png](images/01-no-extension.png)

With the extension installed, all follow notifications are augmented with the user's profile description:

![02-extension-feed.png](images/02-extension-feed.png)

This is more apparent in the rolled-down follows list, and makes it much easier to grok who to follow:

![03-extension-list.png](images/03-extension-list.png)

If someone looks interesting, just hover over their avatar and click the follow button as normal:

![04-extension-list-hover.png](images/04-extension-list-hover.png)

Profiles are loaded on demand as the page loads or scrolls, and descriptions are stored locally so will only be fetched once and will display instantly on reload.

## Installation

Install from the Chrome Web Store:

- https://chromewebstore.google.com/detail/bluesky-follower-info/fokpfcfpgdlmnbjajbdeofkemfblbnbh

Then, reload any open Bluesky pages.
