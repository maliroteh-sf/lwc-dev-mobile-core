/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Logger, SfError } from '@salesforce/core';
import { AndroidUtils } from '../AndroidUtils.js';
import { Version } from '../Common.js';
import { CryptoUtils, SSLCertificateData } from '../CryptoUtils.js';
import { BaseDevice, DeviceType, LaunchArgument } from './BaseDevice.js';

export enum AndroidOSType {
    googleAPIs = 'google_apis',
    googlePlayStore = 'google_apis_playstore',
    androidDesktop = 'android-desktop',
    googleTV = 'google-tv',
    androidWear = 'android-wear',
    androidAutomotive = 'android-automotive'
}

export class AndroidDevice implements BaseDevice {
    public logger?: Logger;
    public readonly id: string;
    public readonly name: string;
    public readonly deviceType: DeviceType;
    public readonly osType: string;
    public readonly osVersion: string | Version;
    public readonly isPlayStore: boolean;

    private port: number = -1;

    public constructor(
        id: string,
        name: string,
        deviceType: DeviceType,
        osType: string,
        osVersion: Version | string,
        isPlayStore: boolean,
        logger?: Logger
    ) {
        this.id = id;
        this.name = name;
        this.deviceType = deviceType;
        this.osType = osType;
        this.osVersion = osVersion;
        this.isPlayStore = isPlayStore;
        this.logger = logger;
    }

    /**
     * A string representation of an AppleDevice which includes Device Name, OS Type, and OS Version
     */
    public toString(): string {
        return `${this.name}, ${this.osType} ${this.osVersion.toString()}`;
    }

    public emulatorPort(): number {
        return this.port;
    }

    /**
     * Attempts to boot up the device.
     *
     * @param waitForBoot Optional boolean indicating whether to wait for the device to boot up. Defaults to true.
     * @param systemWritable Optional boolean indicating whether the emulator should launch with the '-writable-system' flag. Defaults to false.
     */
    public async boot(waitForBoot = true, systemWritable = false): Promise<void> {
        if (systemWritable && this.isPlayStore) {
            throw new SfError('Play Store devices cannot be booted with writable system.');
        }

        this.port = await AndroidUtils.startEmulator(this.id, systemWritable, waitForBoot, this.logger);
    }

    /**
     * Attempts to reboot the device.
     *
     * @param waitForBoot Optional boolean indicating whether to wait for the device to boot up. Defaults to true.
     */
    public async reboot(waitForBoot = true): Promise<void> {
        if (this.port === -1) {
            // Has not been booted yet so instead of rebooting just start it up.
            await this.boot(waitForBoot);
        } else {
            await AndroidUtils.rebootEmulator(this.port, waitForBoot);
        }
    }

    /**
     * Attempts to shutdown the device.
     */
    public async shutdown(): Promise<void> {
        await AndroidUtils.stopEmulator(this.port, true, this.logger);
    }

    /**
     * Attempts to launch the browser and navigate to the provided URL.
     *
     * @param url The URL to navigate to.
     */
    public async openUrl(url: string): Promise<void> {
        await AndroidUtils.launchURLIntent(url, this.port, this.logger);
    }

    /**
     * Determines if a specific app is installed on the device.
     *
     * @param target The bundle ID of the app. Eg "com.salesforce.chatter"
     * @returns A boolean indicating if the app is installed on the device or not.
     */
    public async hasApp(target: string): Promise<boolean> {
        // If the caller passes in package id + activity name, just grab the package id.
        const pkgId = target.split('/')[0];
        let result = '';
        try {
            result = await AndroidUtils.executeAdbCommand(
                `shell pm list packages | grep "${pkgId}"`,
                this.port,
                this.logger
            );
        } catch {
            // ignore and continue
        }

        return Promise.resolve(result?.trim() ? true : false);
    }

    /**
     * Attempts to launch a native app on the device. If the app is not installed then this method will attempt to install it first.
     *
     * @param target The bundle ID of the app to be launched + the activity name to be used when launching the app. Eg "com.salesforce.chatter/.Chatter"
     * @param appBundlePath Optional path to the app bundle of the native app. This will be used to install the app if not already installed.
     * @param launchArguments Extra arguments to be passed to the app upon launch.
     */
    public async launchApp(target: string, appBundlePath?: string, launchArguments?: LaunchArgument[]): Promise<void> {
        await AndroidUtils.launchAppInBootedEmulator(this.port, target, appBundlePath, launchArguments, this.logger);
    }

    /**
     * Checks to see if a certificate is already installed on the device.
     *
     * @param certData An SSLCertificateData object containing the certificate data.
     * @returns A boolean indicating if a certificate is already installed on the device or not.
     */
    public async isCertInstalled(certData: SSLCertificateData): Promise<boolean> {
        // For Android emulators, certificates are installed in files named as their subject hash.
        // We can query the device to see if it has the file with the name as the subject hash of the
        // provided certificate. If so then we can say that the cert is already installed.
        const subjectHash = CryptoUtils.getSubjectHashOld(certData);
        const fileName = `${subjectHash}.0`; // this is the special file name

        try {
            // start adb as root so that we can query specific folder location
            await AndroidUtils.executeAdbCommand('root', this.port, this.logger);

            // see if the file exists already
            const result = await AndroidUtils.executeAdbCommand(
                'shell "ls /data/misc/user/0/cacerts-added"',
                this.port,
                this.logger
            );
            return result.includes(fileName);
        } catch (error) {
            // If file doesn't exist then an error is thrown on some versions of adb.
            // Also determining if cert is already installed is a best effort so if any errors
            // occur we will continue and assume that cert is not installed.
            this.logger?.warn(error);
        }
        return false;
    }

    /**
     * Installs a certificate on the device.
     *
     * @param certData An SSLCertificateData object containing the certificate data.
     */
    public async installCert(certData: SSLCertificateData): Promise<void> {
        // For Android emulators, we need to save the PEM certificate in a file named as the cert subject hash.
        const subjectHash = CryptoUtils.getSubjectHashOld(certData);
        const pemContent = certData.pemCertificate ?? CryptoUtils.derToPem(certData.derCertificate);
        const fileName = `${subjectHash}.0`; // this is the special file name
        const certFilePath = path.join(os.tmpdir(), fileName);
        fs.writeFileSync(certFilePath, pemContent);

        // We then need to push the file to the emulator (needs to be root-mountable).
        await AndroidUtils.mountAsRootWritableSystem(this.id, this.logger); // boot with writable system access
        await AndroidUtils.executeAdbCommand(
            `push ${certFilePath} /data/misc/user/0/cacerts-added/${fileName}`,
            this.port,
            this.logger
        );
        await AndroidUtils.executeAdbCommand(
            `shell "su 0 chmod 644 /data/misc/user/0/cacerts-added/${fileName}"`,
            this.port,
            this.logger
        );
    }
}
