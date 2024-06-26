/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */
import { Logger, Messages } from '@salesforce/core';
import { TestContext } from '@salesforce/core/testSetup';
import { stubMethod } from '@salesforce/ts-sinon';
import { expect } from 'chai';
import { LoggerSetup } from '../../../../../../../src/common/LoggerSetup.js';
import { Setup } from '../../../../../../../src/cli/commands/force/lightning/local/setup.js';
import { RequirementProcessor } from '../../../../../../../src/common/Requirements.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);

describe('Setup Tests', () => {
    const $$ = new TestContext();
    let executeSetupMock: sinon.SinonStub<any[], any>;

    beforeEach(() => {
        executeSetupMock = stubMethod($$.SANDBOX, RequirementProcessor, 'execute');
        executeSetupMock.resolves(Promise.resolve());
    });

    afterEach(() => {
        $$.restore();
    });

    it('Checks that Setup is initialized correctly for iOS', async () => {
        await Setup.run(['-p', 'ios']);
        expect(executeSetupMock.calledOnce).to.be.true;
    });

    it('Checks that Setup is initialized correctly for Android', async () => {
        await Setup.run(['-p', 'android']);
        expect(executeSetupMock.calledOnce).to.be.true;
    });

    it('Checks that Setup fails for invalid Platform flag', async () => {
        try {
            await Setup.run(['-p', 'someplatform']);
        } catch (error) {
            expect(error).to.be.an('error').with.property('message').that.includes('--platform=someplatform');
        }
    });

    it('Checks that Setup will validate API Level flag for iOS platform', async () => {
        await Setup.run(['-p', 'ios', '-l', '1.2.3']);
        expect(executeSetupMock.calledOnce).to.be.true;
    });

    it('Checks that Setup will validate API Level flag for Android platform', async () => {
        await Setup.run(['-p', 'ios', '-l', '1.2.3']);
        expect(executeSetupMock.calledOnce).to.be.true;
    });

    it('Logger must be initialized and invoked', async () => {
        const initPluginLoggersMock = stubMethod($$.SANDBOX, LoggerSetup, 'initializePluginLoggers').resolves(
            Promise.resolve()
        );
        const loggerMock = stubMethod($$.SANDBOX, Logger.prototype, 'info');

        await Setup.run(['-p', 'ios']);
        expect(initPluginLoggersMock.calledOnce).to.be.true;
        expect(loggerMock.calledOnce).to.be.true;
    });

    it('Messages folder should be loaded', async () => {
        expect(!Setup.summary).to.be.false;
    });
});
