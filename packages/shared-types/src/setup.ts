export type CheckStatus = 'ok' | 'error' | 'warning';

export interface SetupCheck {
  name: string;
  status: CheckStatus;
  message: string;
  actionUrl?: string;
}

export interface SetupStatus {
  ready: boolean;
  checks: SetupCheck[];
}
