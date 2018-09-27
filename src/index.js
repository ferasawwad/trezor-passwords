import { TrezorDevice } from './trezor-device';

const trezorDevice = new TrezorDevice(process.stdin, process.stdout);
async function run(device) {
  const masterKey = await trezorDevice.getMasterKey();
  const [
    fileKey,
    fileName,
    encryptionKey,
  ] = await trezorDevice.getEncryptionData(masterKey);
  const content = await trezorDevice.decryptStorage(fileName, encryptionKey);
  console.log(content);
}

run(trezorDevice);

process.on('exit', function() {
  trezorDevice.close();
});
