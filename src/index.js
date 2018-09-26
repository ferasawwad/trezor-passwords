import * as trezor from 'trezor.js';
import readline from 'readline';

const debug = false;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const list = new trezor.DeviceList({ debug: debug });

list.on('connect', async function(device) {
  if (debug) {
    console.log('Connected a device:', device);
    console.log('Devices:', list.asArray());
  }
  console.log('Connected device ' + device.features.label);

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

  await device
    .waitForSessionAndRun(async session => {
      const value = await session.cipherKeyValue(
        [(10016 | 0x80000000) >>> 0, 0],
        'Unlock encrypted storage?',
        '2d650551248d792eabf628f451200d7f51cb63e46aadcbb1038aacb05e8c8aee2d650551248d792eabf628f451200d7f51cb63e46aadcbb1038aacb05e8c8aee',
        true,
        true,
        true
      );
      console.log(value);
    })
    .catch(console.log);
});

// Note that this is a bit duplicate to device.on('disconnect')
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

// an example function, that asks user for acquiring and
// calls callback if use agrees
// (in here, we will call agree always, since it's just an example)
function askUserForceAcquire(callback) {
  return setTimeout(callback, 1000);
}

function handleButton(label, code) {
  if (debug) {
    // We can (but don't necessarily have to) show something to the user, such
    // as 'look at your device'.
    // Codes are in the format ButtonRequest_[type] where [type] is one of the
    // types, defined here:
    // https://github.com/trezor/trezor-common/blob/master/protob/types.proto#L78-L89
    console.log('User is now asked for an action on device', code);
  }
  console.log('Look at device ' + label + ' and press the button, human.');
}

function handlePin(type, cb) {
  rl.question('Please enter PIN: ', answer => {
    cb(null, answer);
  });
}

function handlePass(cb) {
  rl.question('Please enter passphrase: ', answer => {
    cb(null, answer);
  });
}

process.on('exit', function() {
  rl.close();
  list.onbeforeunload();
});
