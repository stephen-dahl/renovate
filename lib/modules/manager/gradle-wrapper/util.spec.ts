import type { Stats } from 'node:fs';
import os from 'node:os';
import { codeBlock } from 'common-tags';
import { fs, partial } from '../../../../test/util';
import {
  extractGradleVersion,
  getJavaConstraint,
  getJavaLanguageVersion,
  getJvmConfiguration,
  gradleWrapperFileName,
  prepareGradleCommand,
} from './utils';

const platform = vi.spyOn(os, 'platform');
vi.mock('../../../util/fs');

describe('modules/manager/gradle-wrapper/util', () => {
  describe('getJavaConstraint()', () => {
    describe('returns Java constraint based on gradle support', () => {
      it.each`
        gradleVersion | javaConstraint
        ${''}         | ${'^11.0.0'}
        ${'4'}        | ${'^8.0.0'}
        ${'4.9'}      | ${'^8.0.0'}
        ${'6.0'}      | ${'^11.0.0'}
        ${'7.0.1'}    | ${'^16.0.0'}
        ${'7.3.0'}    | ${'^17.0.0'}
        ${'8.0.1'}    | ${'^17.0.0'}
        ${'8.5.0'}    | ${'^21.0.0'}
        ${'9.0.1'}    | ${'^21.0.0'}
      `(
        '$gradleVersion | $javaConstraint',
        async ({ gradleVersion, javaConstraint }) => {
          expect(await getJavaConstraint(gradleVersion, '')).toBe(
            javaConstraint,
          );
        },
      );
    });

    it('returns toolChainVersion constraint if daemon JVM configured', async () => {
      const daemonJvm = codeBlock`
        #This file is generated by updateDaemonJvm
        toolchainVersion=999
      `;
      fs.readLocalFile.mockResolvedValue(daemonJvm);
      expect(await getJavaConstraint('8.8', './gradlew')).toBe('^999.0.0');
    });

    it('returns languageVersion constraint if found', async () => {
      const buildGradle = codeBlock`
        java { toolchain { languageVersion = JavaLanguageVersion.of(456) } }
      `;
      fs.localPathExists.mockResolvedValueOnce(true);
      fs.readLocalFile.mockResolvedValue(buildGradle);
      expect(await getJavaConstraint('6.7', './gradlew')).toBe('^456.0.0');
    });
  });

  describe('getJvmConfiguration', () => {
    it('extracts toolChainVersion value', async () => {
      const daemonJvm = codeBlock`
        #This file is generated by updateDaemonJvm
        toolchainVersion=21
      `;
      fs.readLocalFile.mockResolvedValue(daemonJvm);
      expect(await getJvmConfiguration('')).toBe('21');
    });

    it('returns null if gradle-daemon-jvm.properties file not found', async () => {
      fs.readLocalFile.mockResolvedValueOnce(null);
      expect(await getJvmConfiguration('sub/gradlew')).toBeNull();
      expect(fs.readLocalFile).toHaveBeenCalledWith(
        'sub/gradle/gradle-daemon-jvm.properties',
        'utf8',
      );
    });
  });

  describe('getJavaLanguageVersion', () => {
    it('extract languageVersion value', async () => {
      const buildGradle = codeBlock`
        java { toolchain { languageVersion = JavaLanguageVersion.of(21) } }
      `;
      fs.localPathExists.mockResolvedValue(true);
      fs.readLocalFile.mockResolvedValue(buildGradle);
      expect(await getJavaLanguageVersion('')).toBe('21');
    });

    it('returns null if build.gradle or build.gradle.kts file not found', async () => {
      fs.localPathExists.mockResolvedValue(false);
      fs.readLocalFile.mockResolvedValue(null);
      expect(await getJavaLanguageVersion('sub/gradlew')).toBeNull();
      expect(fs.readLocalFile).toHaveBeenCalledWith(
        'sub/build.gradle.kts',
        'utf8',
      );
    });

    it('returns null if build.gradle does not include languageVersion', async () => {
      const buildGradle = codeBlock`
        dependencies { implementation "com.google.protobuf:protobuf-java:2.17.0" }
      `;
      fs.localPathExists.mockResolvedValue(true);
      fs.readLocalFile.mockResolvedValue(buildGradle);
      expect(await getJavaLanguageVersion('')).toBeNull();
    });
  });

  describe('extractGradleVersion()', () => {
    it('returns null', () => {
      const properties = codeBlock`
        distributionSha256Sum=038794feef1f4745c6347107b6726279d1c824f3fc634b60f86ace1e9fbd1768
        zipStoreBase=GRADLE_USER_HOME
      `;
      expect(extractGradleVersion(properties)).toBeNull();
    });

    it('returns gradle version', () => {
      const properties = codeBlock`
        distributionSha256Sum=038794feef1f4745c6347107b6726279d1c824f3fc634b60f86ace1e9fbd1768
        distributionUrl=https\\://services.gradle.org/distributions/gradle-6.3-bin.zip
        zipStoreBase=GRADLE_USER_HOME
      `;
      expect(extractGradleVersion(properties)).toStrictEqual({
        url: 'https\\://services.gradle.org/distributions/gradle-6.3-bin.zip',
        version: '6.3',
      });
    });
  });

  describe('gradleWrapperFileName()', () => {
    it('works on windows', () => {
      platform.mockReturnValueOnce('win32');
      expect(gradleWrapperFileName()).toBe('gradlew.bat');
    });

    it('works on linux', () => {
      platform.mockReturnValueOnce('linux');
      expect(gradleWrapperFileName()).toBe('./gradlew');
    });
  });

  describe('prepareGradleCommand', () => {
    it('works', async () => {
      platform.mockReturnValue('linux');
      fs.statLocalFile.mockResolvedValue(
        partial<Stats>({
          isFile: () => true,
          mode: 0o550,
        }),
      );
      expect(await prepareGradleCommand('./gradlew')).toBe('./gradlew');
    });

    it('returns null', async () => {
      fs.statLocalFile.mockResolvedValue(
        partial<Stats>({
          isFile: () => false,
        }),
      );
      expect(await prepareGradleCommand('./gradlew')).toBeNull();
    });
  });
});
