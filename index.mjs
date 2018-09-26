import TrezorConnect from 'trezor-connect';


const result = await TrezorConnect.cipherKeyValue(
[(10016 | 0x80000000) >>> 0, 0],
'Unlock encrypted storage?',
'2d650551248d792eabf628f451200d7f51cb63e46aadcbb1038aacb05e8c8aee2d650551248d792eabf628f451200d7f51cb63e46aadcbb1038aacb05e8c8aee',
true, true, true);
console.log(result);
