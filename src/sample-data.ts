import type { Dataset, RecordItem } from './domain';

// Entirely invented portfolio fixtures. Reserved documentation IPs; no tenant exports.
export const sampleData: Dataset = {
  mode: 'sample',
  fetchedAt: '2026-06-18T14:33:00Z',
  warnings: [],
  devices: [
    {
      id: 'atlas',
      name: 'Atlas',
      role: 'Workstation',
      os: 'Windows 11',
      risk: 'high',
      health: 'Active',
      lastSeen: '2026-06-18T14:33:00Z',
      isolation: 'normal',
      protection: 'Active',
      signatures: 'Up to date',
      ip: '192.0.2.10',
    },
    {
      id: 'harbor',
      name: 'Harbor',
      role: 'Application server',
      os: 'Windows Server 2025',
      risk: 'medium',
      health: 'Active',
      lastSeen: '2026-06-18T14:31:00Z',
      isolation: 'isolated',
      protection: 'Active',
      signatures: 'Up to date',
      ip: '192.0.2.20',
    },
    {
      id: 'nova',
      name: 'Nova',
      role: 'Workstation',
      os: 'Windows 11',
      risk: 'none',
      health: 'Active',
      lastSeen: '2026-06-18T14:30:00Z',
      isolation: 'normal',
      protection: 'Active',
      signatures: 'Up to date',
      ip: '192.0.2.30',
    },
    {
      id: 'forge',
      name: 'Forge',
      role: 'Build server',
      os: 'Ubuntu 24.04',
      risk: 'unknown',
      health: 'Onboarding pending',
      lastSeen: '',
      isolation: 'unknown',
      protection: 'Not reported',
      signatures: 'Not reported',
      ip: '192.0.2.40',
    },
  ],
  alerts: [
    {
      id: 'alert-001',
      title: 'Possible credential access',
      severity: 'high',
      status: 'new',
      deviceId: 'atlas',
      category: 'Credential access',
      createdAt: '2026-06-18T14:33:00Z',
      description:
        'A process attempted to read protected application data. A prevention event was recorded; the origin still needs review.',
      evidence: [
        {
          id: 'ev-process',
          type: 'process',
          name: 'powershell.exe',
          detail: 'powershell.exe -NoProfile -File C:\\Demo\\inventory.ps1',
          verdict: 'Origin requires review',
        },
        {
          id: 'ev-file',
          type: 'file',
          name: 'inventory.ps1',
          detail: 'C:\\Demo\\inventory.ps1',
          verdict: 'Illustrative file; not a real sample',
        },
        {
          id: 'ev-registry',
          type: 'registry',
          name: 'Application settings',
          detail: 'HKCU\\Software\\Example\\Settings',
          verdict: 'Read attempt recorded',
        },
      ],
    },
    {
      id: 'alert-002',
      title: 'Unwanted software blocked',
      severity: 'medium',
      status: 'resolved',
      deviceId: 'harbor',
      category: 'Unwanted software',
      createdAt: '2026-06-17T21:33:00Z',
      description:
        'The sample timeline records a quarantine action and a completed analyst review.',
      evidence: [
        {
          id: 'ev-quarantine',
          type: 'file',
          name: 'example-tool.exe',
          detail: 'C:\\Demo\\example-tool.exe',
          verdict: 'Quarantined in the example',
        },
      ],
    },
    {
      id: 'alert-003',
      title: 'Configuration change reviewed',
      severity: 'informational',
      status: 'resolved',
      deviceId: 'atlas',
      category: 'Configuration',
      createdAt: '2026-06-17T18:10:00Z',
      description: 'An analyst correlated the change with an approved maintenance task.',
      evidence: [
        {
          id: 'ev-maintenance',
          type: 'process',
          name: 'maintenance.exe',
          detail: 'C:\\Demo\\maintenance.exe --inventory',
          verdict: 'Approved maintenance in the example',
        },
      ],
    },
  ],
};

export const records: Record<string, RecordItem[]> = {
  incidents: [
    {
      id: 'incident-001',
      name: 'Credential access on Atlas',
      subtitle: 'Atlas · 1 alert · 3 evidence items',
      status: 'Needs review',
      severity: 'high',
      description:
        'Follow the process, establish its origin, and compare the activity with the approved change record.',
      facts: [
        ['First activity', 'Jun 18, 14:33 UTC'],
        ['Affected devices', '1'],
        ['Assigned analyst', 'Unassigned'],
        ['Classification', 'Not determined'],
      ],
    },
  ],
  software: [
    {
      id: 'software-001',
      name: 'Example Runtime',
      subtitle: 'Atlas · Version 8.0.1',
      status: 'Update available',
      severity: 'medium',
      description: 'An invented software record demonstrating version and recommendation context.',
      facts: [
        ['Installed version', '8.0.1'],
        ['Example target', '8.0.2'],
        ['Publisher', 'Example Software'],
        ['Affected devices', '1'],
      ],
    },
    {
      id: 'software-002',
      name: 'Example Browser',
      subtitle: 'Nova · Version 124.0',
      status: 'No recommendation',
      description: 'An illustrative application inventory entry.',
      facts: [
        ['Version', '124.0'],
        ['Publisher', 'Example Software'],
        ['Affected devices', '1'],
      ],
    },
  ],
  vulnerabilities: [
    {
      id: 'vulnerability-001',
      name: 'Outdated application runtime',
      subtitle: 'Example Runtime · Atlas',
      status: 'Remediation required',
      severity: 'high',
      description:
        'A fictional vulnerability, used to demonstrate an investigation. This is not a published advisory.',
      facts: [
        ['Advisory', 'Illustrative — no real CVE'],
        ['Exposure', 'One sample device'],
        ['Exploit status', 'Not assessed'],
        ['Recommended step', 'Review the update'],
      ],
    },
  ],
  recommendations: [
    {
      id: 'recommendation-001',
      name: 'Update Example Runtime',
      subtitle: 'Atlas · Software maintenance',
      status: 'Pending review',
      severity: 'medium',
      description:
        'Confirm application compatibility, schedule the update, and verify the installed version. This app cannot install updates.',
      facts: [
        ['Affected devices', '1'],
        ['Category', 'Application'],
        ['Action', 'Review update'],
        ['Automatic remediation', 'Not enabled'],
      ],
    },
  ],
  investigations: [
    {
      id: 'investigation-001',
      name: 'Credential access investigation',
      subtitle: 'Atlas · Started Jun 18, 14:34 UTC',
      status: 'Running',
      description:
        'Illustrative automated investigation context. No investigation is started from this app.',
      facts: [
        ['Source', 'Sample investigation'],
        ['Related alert', 'alert-001'],
        ['Pending actions', '0'],
      ],
    },
  ],
  actions: [
    {
      id: 'action-001',
      name: 'Quarantine unwanted file',
      subtitle: 'Harbor · Jun 17, 21:33 UTC',
      status: 'Completed',
      description: 'A historical sample action. Reading this record does not repeat the operation.',
      facts: [
        ['Action type', 'Quarantine'],
        ['Outcome', 'Completed in example'],
        ['Device', 'Harbor'],
        ['Initiator', 'Sample automated investigation'],
      ],
    },
  ],
  indicators: [
    {
      id: 'indicator-001',
      name: 'Example network indicator',
      subtitle: '198.51.100.18 · Reserved documentation address',
      status: 'Illustrative',
      description:
        'Reserved IP data demonstrates indicator context without publishing a real indicator or adding a block rule.',
      facts: [
        ['Indicator type', 'IP address'],
        ['Value', '198.51.100.18'],
        ['Action', 'None — sample record'],
        ['Expiration', 'Not applicable'],
      ],
    },
  ],
  entities: [
    {
      id: 'entity-001',
      name: 'analyst@example.test',
      subtitle: 'Account · Reserved example domain',
      status: 'Needs context',
      description:
        'Review sign-in and device context in the source system. No identity-provider data is connected to this demo.',
      facts: [
        ['Entity type', 'Account'],
        ['Domain', 'example.test'],
        ['Linked device', 'Atlas'],
        ['Related alerts', '1'],
      ],
    },
  ],
};
