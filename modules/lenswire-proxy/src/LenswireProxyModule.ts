import { NativeModule, requireNativeModule } from 'expo';

import type {
  NativeCertificateInfo,
  NativeDiagnostics,
  NativeProbeType,
  NativeProxyStatus,
  NativeTrafficEntry,
} from './LenswireProxy.types';

declare class LenswireProxyModule extends NativeModule {
  getStatus(): NativeProxyStatus;
  startCapture(): Promise<void>;
  stopCapture(): Promise<void>;
  setRecordingPaused(paused: boolean): void;
  getRecordingPaused(): boolean;
  sendProbe(probeType?: NativeProbeType, useHttps?: boolean): Promise<void>;
  generateCertificate(): Promise<NativeCertificateInfo>;
  getCertificateInfo(): NativeCertificateInfo;
  getCertificateInstallUrl(): string | null;
  getCertificateExportPath(): string | null;
  installCertificate(): Promise<void>;
  getProxyPort(): number;
  getCapturesRevision(): number;
  getCaptures(): Promise<NativeTrafficEntry[]>;
  getCapture(id: string): Promise<NativeTrafficEntry | null>;
  clearCaptures(): void;
  setHttpsDecrypt(enabled: boolean): void;
  getHttpsDecrypt(): boolean;
  setOverrides(rulesJson: string): void;
  getOverrides(): string;
  getDiagnostics(): NativeDiagnostics;
}

export default requireNativeModule<LenswireProxyModule>('LenswireProxy');
