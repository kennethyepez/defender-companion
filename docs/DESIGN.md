# Interface system

The approved mobile reference suggested a light canvas, violet actions, generous reading space and a stable bottom navigation. The implementation applies those principles to investigation: exception → evidence → recommendation → next action. Desktop uses a persistent workspace sidebar and places device context beside recent activity; it does not stretch a phone frame across the screen.

## Tokens

- Canvas `#f6f6f9`; surface white; text `#25232c`; secondary text `#686572`.
- Primary action `#7139d8`, hover `#5c25bd`; supporting surface `#eee7fb`.
- Semantic risk is expressed with text and color: high red, medium amber, success green.
- System sans-serif typography; no remote fonts.
- Reading panels use approximately 20 px radii; actions 12 px; status labels 6 px.
- Five mobile destinations: Overview, Alerts, Devices, Activity, More.

## Android 1.0.1 refinement

Connection starts with a compact identity, one QR action and a manual-address disclosure. The offline demo and privacy entry remain visible at normal text size. Native text follows Android font and weight preferences.

Overview leads with the highest-priority unresolved alert, its device and time, then a visible review action. A three-column summary separates device count, open alerts and source-resolved alerts from device rows and the activity timeline. Secondary workspaces precede account settings in More. Detail screens use the actual object as their single main heading.

The mobile navigation uses five equal targets, an icon-sized selected pill and persistent labels. One layer owns Android system/keyboard insets: the native container consumes them, and the bundled document does not add another bottom safe area. Regular web browsers retain CSS safe-area support. Content and toast spacing reserve the navigation area.

Risk includes readable text; unknown origin stays “Not confirmed.” Unavailable response controls and private-service descriptions use neutral locks rather than green health checks. Notification options explicitly save preferences without implying a connected delivery service. Scan history preserves the selected device and shows an empty state when that snapshot has no record.

## Appearance and refresh in 1.0.2

Violet app bars anchor both light and dark workspaces. Dark mode uses a near-black canvas, distinct raised surfaces and a lighter violet action color. More → Appearance offers System, Light and Dark; the choice persists locally and also styles Android connection and QR screens. System follows changes to the operating system theme.

Pulling down from the top of the page reveals Pull to refresh, then Release to refresh. Releasing beyond the threshold invokes the existing refresh operation once. Short, horizontal and cancelled gestures do not refresh; editing fields and open dialogs do not initiate the gesture. More retains Refresh data for keyboard and assistive-technology access. The demo explicitly reports that its snapshot is up to date rather than claiming a new tenant read.

Route arrival lasts 180 ms, with subtle button and navigation feedback. Reduced-motion preferences remove these transitions. Privacy & access uses spare height at the bottom of Android onboarding, retaining scrolling when larger text or the manual form needs more room.

Public examples inspected for this refinement were [SmartGym dark onboarding](https://screensdesign.com/apps/smartgym-gym-home-workouts/?id=1119&av=3558) and [YNAB light/dark budget screens](https://screensdesign.com/apps/ynab/?ts=0&vt=1&id=344&av=4296) on ScreensDesign. They informed surface hierarchy, compact rows and colored navigation; the application retains its own identity and assets.

## Interaction contracts

Links change location. Buttons perform explicit local operations. Alerts retain source status when a review note or reminder changes. API failures do not show a success state. Filtering preserves source records. Dialogs are native, labelled and keyboard-contained. Route transitions move focus to the destination heading. Motion is restrained and disabled for reduced-motion users.

The design avoids third-party logos, decorative status strips and fictional security outcomes. Screen coverage and connected-provider coverage are distinct. The catalog makes every designed state inspectable without implying every provider is live.
