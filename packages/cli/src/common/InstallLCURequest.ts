export interface InstallLCURequest {
  LCUPackage: string;

  Organization: string;

  Parameters: { [key: string]: string };

  ProjectCreate: boolean;

  Project: string;
}
