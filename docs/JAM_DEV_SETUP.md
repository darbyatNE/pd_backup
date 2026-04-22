# Jam.dev Team Feedback Setup

Jam.dev is integrated into the PowerDime frontend to let team members capture bugs, change requests, and feedback with full technical context (console logs, network requests, user actions).

## How It Works

There are **two ways** team members can submit feedback:

### Option 1: Chrome Extension (Recommended for frequent reviewers)
1. Install the [Jam Chrome Extension](https://chromewebstore.google.com/detail/jam/iohjgamcilhbgmhbnllfolmkmmekfmci)
2. Navigate to the deployed PowerDime app
3. Click the Jam extension icon → capture screenshot or video
4. Annotate and describe the issue/change request
5. Submit — a Jam link is created with full technical context

### Option 2: Recording Links (No extension needed)
1. Admin creates a Recording Link at [jam.dev/s/settings/recording-links](https://jam.dev/s/settings/recording-links)
2. Share the link with the team member
3. They click the link → PowerDime opens with Jam's recorder overlay
4. They interact with the app, reproduce the issue, and submit
5. Console logs, network requests, and user actions are captured automatically

## What Gets Captured Automatically

Every Jam includes:
- **Screenshot / Video** with annotation tools
- **Console logs** and **network requests** (via capture script in index.html)
- **User clicks** and navigation events
- **Browser**, OS, viewport, and device info
- **Custom metadata** (via Jam SDK):
  - User ID, email, role
  - Company name
  - Current page path
  - Authentication status

## Admin Setup (One-Time)

### 1. Register Your Recording URL
1. In Jam.dev settings → [Recording Links tab](https://jam.dev/s/settings/recording-links)
2. Add your CloudFront URL (e.g., `https://d1234abcdef.cloudfront.net`) as a Recording URL
3. Verify the installation

### 2. Connect Your PM Tool (Optional)
In Jam.dev workspace settings, connect:
- **Linear** / **Jira** / **GitHub Issues** — auto-create tickets from Jams
- **Slack** — get notified of new Jams

The team ID (`1f0bcf9a-e411-4365-b703-d789fd36e9ac`) is already hardcoded in `index.html`.

## Local Development

The Jam.dev scripts are loaded in all environments (including local dev). The recorder/capture scripts are lightweight and only activate when:
- A user has the Jam Chrome extension installed, or
- A user opens the app via a Recording Link

The `JamMetadata` component always attaches user context so any Jam captured locally will also include debug info.

## Architecture

| Component | File | Purpose |
|-----------|------|---------|
| Recorder script | `index.html` | Enables Recording Links overlay UI |
| Capture script | `index.html` | Captures console/network logs during recordings |
| Team meta tag | `index.html` | Associates captures with your Jam team |
| JamMetadata | `src/components/JamMetadata.tsx` | Attaches user context (ID, role, etc.) to every Jam |

## Pricing

- **Free**: Unlimited Jams, basic features
- **Pro** (~$8-14/user/mo): Longer recordings, advanced features
- See [jam.dev/pricing](https://jam.dev/pricing) for current plans
