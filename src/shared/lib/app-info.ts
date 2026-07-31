import Constants from 'expo-constants';

export const APP_AUTHOR = 'Dmitry Shelomanov';
export const APP_LICENSE = 'MIT';

export function getAppInfo() {
  const version = Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? '1.0.0';
  const build = Constants.nativeBuildVersion ?? null;
  return { name: 'Lenswire', version, build, author: APP_AUTHOR, license: APP_LICENSE };
}
