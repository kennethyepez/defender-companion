# Interface system

The approved mobile reference suggested a light canvas, violet actions, generous reading space and a stable bottom navigation. The implementation applies those principles to investigation: exception → evidence → recommendation → next action. Desktop uses a persistent workspace sidebar and places device context beside recent activity; it does not stretch a phone frame across the screen.

## Tokens

- Canvas `#f6f6f9`; surface white; text `#25232c`; secondary text `#686572`.
- Primary action `#7139d8`, hover `#5c25bd`; supporting surface `#eee7fb`.
- Semantic risk is expressed with text and color: high red, medium amber, success green.
- System sans-serif typography; no remote fonts.
- Reading panels use approximately 20 px radii; actions 12 px; status labels 6 px.
- Five mobile destinations: Overview, Alerts, Devices, Activity, More.

## Interaction contracts

Links change location. Buttons perform explicit local operations. Alerts retain source status when a review note or reminder changes. API failures do not show a success state. Filtering preserves source records. Dialogs are native, labelled and keyboard-contained. Route transitions move focus to the destination heading. Motion is restrained and disabled for reduced-motion users.

The design avoids third-party logos, decorative status strips and fictional security outcomes. Screen coverage and connected-provider coverage are distinct. The catalog makes every designed state inspectable without implying every provider is live.
