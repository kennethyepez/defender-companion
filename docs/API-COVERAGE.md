# Microsoft API coverage

The active private runtime uses only the existing alert collector and its sole `SecurityAlert.Read.All` role. The backend reads a minimized handoff and has no Microsoft credential. The public deployment uses fixtures only. The other endpoints below describe a standalone reference adapter, not an active connection or requested grant. Do not add permissions to make an unavailable view work.

| View                                      | Endpoint                             | Minimum documented application permission | Implemented                   |
| ----------------------------------------- | ------------------------------------ | ----------------------------------------- | ----------------------------- |
| Alerts and attached evidence              | Graph `GET /v1.0/security/alerts_v2` | `SecurityAlert.Read.All`                  | Private read adapter          |
| Incidents                                 | Graph `GET /v1.0/security/incidents` | `SecurityIncident.Read.All`               | Private read adapter          |
| Machines                                  | MDE `GET /api/machines`              | `Machine.Read.All`                        | Private read adapter          |
| Software                                  | MDE `GET /api/Software`              | `Software.Read.All`                       | Private read adapter          |
| Vulnerabilities                           | MDE `GET /api/vulnerabilities`       | `Vulnerability.Read.All`                  | Private read adapter          |
| Recommendations                           | MDE `GET /api/recommendations`       | `SecurityRecommendation.Read.All`         | Private read adapter          |
| Investigations                            | MDE `GET /api/investigations`        | `Alert.ReadWrite.All`                     | Excluded: write-capable grant |
| Machine-action history                    | MDE `GET /api/machineactions`        | `Machine.ReadWrite.All`                   | Excluded: write-capable grant |
| Indicators                                | MDE `GET /api/indicators`            | `Ti.ReadWrite` / `Ti.ReadWrite.All`       | Excluded: write-capable grant |
| Entities and full antivirus scan progress | No provider in this release          | Not requested                             | Demo-only                     |

## Official references

- [Graph alerts](https://learn.microsoft.com/en-us/graph/api/security-list-alerts_v2?view=graph-rest-1.0)
- [Graph incidents](https://learn.microsoft.com/en-us/graph/api/security-list-incidents?view=graph-rest-1.0)
- [Machines](https://learn.microsoft.com/en-us/defender-endpoint/api/get-machines)
- [Software](https://learn.microsoft.com/en-us/defender-endpoint/api/get-software)
- [Vulnerabilities](https://learn.microsoft.com/en-us/defender-endpoint/api/get-all-vulnerabilities)
- [Recommendations](https://learn.microsoft.com/en-us/defender-endpoint/api/get-all-recommendations)
- [Investigation permission boundary](https://learn.microsoft.com/en-us/defender-endpoint/api/get-investigation-collection)
- [Machine-action permission boundary](https://learn.microsoft.com/en-us/defender-endpoint/api/get-machineactions-collection)
- [Indicator permission boundary](https://learn.microsoft.com/en-us/defender-endpoint/api/get-ti-indicators-collection)

API availability and permission definitions can change; review the official references before granting access. Unit tests use controlled upstream responses. They do not establish that an arbitrary tenant has consented permissions or that every licensed provider exposes the same data.
