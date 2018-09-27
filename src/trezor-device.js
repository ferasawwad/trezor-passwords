import * as trezor from 'trezor.js';
import readline from 'readline';
import { hmac } from 'fast-sha256';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import url from 'url';

const BIP32_PATH = [(10016 | 0x80000000) >>> 0, 0];

export class TrezorDevice {
  constructor(input, output, debug) {
    this.rl = readline.createInterface({
      input,
      output,
    });
    this.list = new trezor.DeviceList({ debug: debug });
    this.device = this.initDevice(this.list, this.rl, debug);
  }

  async getMasterKey() {
    const device = await this.device;
    const result = await device
      .waitForSessionAndRun(async session => {
        const { message } = await session.cipherKeyValue(
          BIP32_PATH,
          'Activate TREZOR Password Manager?',
          '2d650551248d792eabf628f451200d7f51cb63e46aadcbb1038aacb05e8c8aee2d650551248d792eabf628f451200d7f51cb63e46aadcbb1038aacb05e8c8aee',
          true,
          true,
          true
        );
        return message.value;
      })
      .catch(console.log);
    return result;
  }

  getEncryptionData(masterKey) {
    const fileKey = masterKey.substring(0, masterKey.length / 2);
    const encryptionKey = masterKey.substring(
      masterKey.length / 2,
      masterKey.length
    );
    const FILENAME_MESS =
      '5f91add3fa1c3c76e90c90a3bd0999e2bd7833d06a483fe884ee60397aca277a';
    const digest = hmac(Buffer.from(fileKey), Buffer.from(FILENAME_MESS));
    return [
      fileKey,
      Buffer.from(digest).toString('hex') + '.pswd',
      encryptionKey,
    ];
  }

  decryptStorage(fileName, encryptionKey) {
    const filepath = path.join(
      process.env.HOME,
      '/Dropbox/Apps/TREZOR Password Manager/',
      fileName
    );
    const content = fs.readFileSync(filepath);
    const iv = content.slice(0, 12);
    const tag = content.slice(12, 12 + 16);

    const key = Buffer.from(encryptionKey, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, {
      authTagLength: 16,
    });
    decipher.setAuthTag(tag);

    let decrypted = '';
    for (let i = 12 + 16; i < content.length; i += 16) {
      const slice = content.slice(i, i + 16);
      decrypted += decipher.update(slice, null, 'utf8');
    }
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  }

  async decryptEntry(decrypted) {
    return new Promise((resolve, reject) => {
      this.rl.question(
        'Which entry you want?(blank to exit): ',
        async answer => {
          if (!Number.parseInt(answer)) {
            console.log('Answer not number, exiting');
            reject();
          }
          const entry = decrypted.entries[answer];
          const nonce = await this.getDecryptedNonce(entry);

          const pwdArr = entry['password']['data'];
          console.log(
            'password: ',
            await this.decryptEntryValue(nonce, Buffer.from(pwdArr))
          );

          const safeNoteArr = entry['safe_note']['data'];
          console.log(
            'safe_note:',
            await this.decryptEntryValue(nonce, Buffer.from(safeNoteArr))
          );
          resolve();
        }
      );
    });
  }

  async decryptEntryValue(nonce, hexValue) {
    const iv = hexValue.slice(0, 12);
    const tag = hexValue.slice(12, 12 + 16);

    const key = Buffer.from(nonce, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, {
      authTagLength: 16,
    });
    decipher.setAuthTag(tag);

    let decrypted = '';
    for (let i = 12 + 16; i < hexValue.length; i += 16) {
      const slice = hexValue.slice(i, i + 16);
      decrypted += decipher.update(slice, null, 'utf8');
    }
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  async getDecryptedNonce(entry) {
    let item;
    if (entry['item']) {
      item = entry['item'];
    } else {
      item = entry['title'];
    }

    const pr = url.parse(item);
    if (pr.scheme && pr.host) {
      item = pr.host;
    }

    const ENC_KEY = `Unlock ${item} for user ${entry['username']}?`;
    const ENC_VALUE = entry['nonce'];
    const device = await this.device;
    const result = await device
      .waitForSessionAndRun(async session => {
        const { message } = await session.cipherKeyValue(
          BIP32_PATH,
          ENC_KEY,
          Buffer.from(ENC_VALUE, 'hex'),
          false,
          false,
          true
        );
        return message.value;
      })
      .catch(console.log);
    return result;
  }

  close() {
    this.rl.close();
    this.list.onbeforeunload();
  }

  initDevice(list, rl, debug) {
    const devicePromise = new Promise((resolve, reject) => {
      list.on('connect', async function(device) {
        if (debug) {
          console.log('Connected a device:', device);
          console.log('Devices:', list.asArray());
        }
        console.log('Connected device ' + device.features.label);

        function handleButton(label, code) {
          if (debug) {
            console.log('User is now asked for an action on device', code);
          }
          console.log(
            'Look at device ' + label + ' and press the button, human.'
          );
        }

        function handlePin(type, cb) {
          rl.question(
            'Please enter PIN\n_______\n|7|8|9|\n|4|5|6|\n|1|2|3|\n\u203E\u203E\u203E\u203E\u203E\u203E\u203E\nUse the table instead of actual numbers:',
            answer => {
              cb(null, answer);
            }
          );
        }

        function handlePass(cb) {
          rl.question('Please enter passphrase: ', answer => {
            cb(null, answer);
          });
        }

        // What to do on user interactions:
        device.on('button', function(code) {
          handleButton(device.features.label, code);
        });
        device.on('passphrase', handlePass);
        device.on('pin', handlePin);

        // For convenience, device emits 'disconnect' event on disconnection.
        device.on('disconnect', function() {
          if (debug) {
            console.log('Disconnected an opened device');
          }
        });

        // You generally want to filter out devices connected in bootloader mode:
        if (device.isBootloader()) {
          throw new Error('Device is in bootloader mode, re-connected it');
        }
        resolve(device);
      });
    });

    list.on('disconnect', function(device) {
      if (debug) {
        console.log('Disconnected a device:', device);
        console.log('Devices:', list.asArray());
      }
      console.log('Disconnected device ' + device.features.label);
    });

    // This gets called on general error of the devicelist (no transport, etc)
    list.on('error', function(error) {
      console.error('List error:', error);
    });

    // On connecting unacquired device
    list.on('connectUnacquired', function(device) {
      askUserForceAcquire(function() {
        device.steal().then(function() {
          console.log('steal done. now wait for another connect');
        });
      });
    });

    function askUserForceAcquire(callback) {
      return setTimeout(callback, 1000);
    }
    return devicePromise;
  }
}
