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
  sendProbe(probeType?: NativeProbeType, useHttps?: boolean): Promise<void>;
  generateCertificate(): Promise<NativeCertificateInfo>;
  getCertificateInfo(): NativeCertificateInfo;
  getCertificateInstallUrl(): string | null;
  getCertificatePemPath(): string | null;
  installCertificate(): Promise<void>;
  getProxyPort(): number;
  getCaptures(): NativeTrafficEntry[];
  clearCaptures(): void;
  setHttpsDecrypt(enabled: boolean): void;
  getHttpsDecrypt(): boolean;
  setOverrides(rulesJson: string): void;
  getOverrides(): string;
  getDiagnostics(): NativeDiagnostics;
}

export default requireNativeModule<LenswireProxyModule>('LenswireProxy');
