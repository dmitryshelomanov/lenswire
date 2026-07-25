import { NativeModule, requireNativeModule } from 'expo';

import type {
  NativeCertificateInfo,
  NativeProxyStatus,
  NativeTrafficEntry,
} from './LenswireProxy.types';

declare class LenswireProxyModule extends NativeModule {
  isSimulator(): boolean;
  getStatus(): NativeProxyStatus;
  startCapture(): Promise<void>;
  stopCapture(): Promise<void>;
  sendProbe(): Promise<void>;
  generateCertificate(): Promise<NativeCertificateInfo>;
  getCertificateInfo(): NativeCertificateInfo;
  getCertificateInstallUrl(): string | null;
  getCertificatePemPath(): string | null;
  installCertificate(): Promise<void>;
  getProxyPort(): number;
  getCaptures(): NativeTrafficEntry[];
  clearCaptures(): void;
}

export default requireNativeModule<LenswireProxyModule>('LenswireProxy');
