import * as Application from 'expo-application';
import Constants from 'expo-constants';

export const APP_AUTHOR = 'Dmitry Shelomanov';
export const APP_CONTACT_EMAIL = 'dmitryshelomanov@mail.ru';
export const APP_LICENSE = 'MIT';

export function getAppInfo() {
  const version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '1.0.0';
  const build = Application.nativeBuildVersion ?? null;
  return { name: 'Lenswire', version, build, author: APP_AUTHOR, license: APP_LICENSE };
}
