/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */
import { CommonUtils } from '../CommonUtils';
import os from 'os';
import fs from 'fs';
import path from 'path';

describe('CommonUtils', () => {
    test('replaceTokens function', async () => {
        const template =
            // tslint:disable-next-line:no-invalid-template-strings
            'A quick brown ${animal1} jumped over the lazy ${animal2}';

        const formatted = CommonUtils.replaceTokens(template, {
            animal1: 'fox',
            animal2: 'dog'
        });
        expect(formatted).toBe('A quick brown fox jumped over the lazy dog');

        const notFormatted = CommonUtils.replaceTokens(template, {});
        expect(notFormatted).toBe(
            // tslint:disable-next-line:no-invalid-template-strings
            'A quick brown ${animal1} jumped over the lazy ${animal2}'
        );
    });

    test('createTempDirectory function', async () => {
        const tmpDir = os.tmpdir();
        const folderPrefix = 'lwc-mobile-';
        const tempFolderPath = path.join(tmpDir, folderPrefix);

        const folder = await CommonUtils.createTempDirectory();
        expect(fs.existsSync(folder)).toBeTruthy();
        expect(folder.includes(tempFolderPath)).toBeTruthy();

        jest.spyOn(fs, 'mkdtemp').mockImplementationOnce((_, callback) =>
            callback(new Error(), '')
        );

        try {
            await CommonUtils.createTempDirectory();
        } catch (error) {
            const message = `Could not create a temp folder at ${tempFolderPath}: `;
            expect(error.message.includes(message)).toBeTruthy();
        }
    });
});