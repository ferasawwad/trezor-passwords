import { TrezorDevice } from './trezor-device';

const trezorDevice = new TrezorDevice(process.stdin, process.stdout);
async function run(device) {
  const masterKey = await trezorDevice.getMasterKey();
  const [fileKey, fileName, encryptionKey] = trezorDevice.getEncryptionData(
    masterKey
  );
  const content = trezorDevice.decryptStorage(fileName, encryptionKey);
  console.log(content);
  while (true) {
    try {
      await trezorDevice.decryptEntry(content);
    } catch (e) {
      break;
    }
  }
  process.exit();
}

run(trezorDevice);

process.on('exit', function() {
  trezorDevice.close();
});
