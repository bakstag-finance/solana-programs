import { PublicKey } from '@solana/web3.js'

import type { OmniPointHardhat } from '@layerzerolabs/toolbox-hardhat'
import { DVN_CONFIG_SEED, EXECUTOR_CONFIG_SEED } from '@layerzerolabs/lz-solana-sdk-v2'
import { addressToBytes32, Options } from '@layerzerolabs/lz-v2-utilities'
import { EndpointId } from '@layerzerolabs/lz-definitions'

type SolanaPeerConfig = {
  to: OmniPointHardhat
  peerAddress: Uint8Array
  // Based on token decimals, e.g., 6 decimal tokens will set 10000000000 for a capacity of 10000 tokens (6 decimals)
  sendLibrary: PublicKey
  receiveLibraryConfig: {
    receiveLibrary: PublicKey
    gracePeriod: bigint
  }
  sendUlnConfig: {
    confirmations: number
    requiredDvnCount: number
    optionalDvnCount: number
    optionalDvnThreshold: number
    requiredDvns: Array<PublicKey>
    optionalDvns: Array<PublicKey>
  }
  receiveUlnConfig: {
    confirmations: number
    requiredDvnCount: number
    optionalDvnCount: number
    optionalDvnThreshold: number
    requiredDvns: Array<PublicKey>
    optionalDvns: Array<PublicKey>
  }
  executorConfig: {
    executor: PublicKey
    maxMessageSize: number
  }
  sendOptions: Uint8Array
  sendAndCallOptions: Uint8Array
}

const uln = new PublicKey('7a4WjyR8VZ7yZz5XJAKm39BUGn5iT9CKcv2pmG9tdXVH')
const executor = new PublicKey('6doghB248px58JSSwG4qejQ46kFMW4AMj7vzJnWZHNZn')
const lzDVN = new PublicKey('HtEYV4xB4wvsj5fgTkcfuChYpvGYzgzwvNhgDZQNh7wW')
const lzDVNConfigAccount = PublicKey.findProgramAddressSync([Buffer.from(DVN_CONFIG_SEED, 'utf8')], lzDVN)[0]

export const solanaToArbSepConfig: SolanaPeerConfig = {
  // Arbitrum Sepolia Config
  to: {
    eid: EndpointId.ARBITRUM_V2_TESTNET,
  },
  peerAddress: addressToBytes32('0x010425EC6E7beC3A92c8220cE2237497AD762E63'),
  sendLibrary: uln,
  receiveLibraryConfig: {
    receiveLibrary: uln,
    gracePeriod: BigInt(0),
  },
  // Based on token decimals, e.g., 6 decimal tokens will set 10000000000 for a capacity of 10000 tokens (6 decimals)
  sendUlnConfig: {
    confirmations: 100,
    requiredDvnCount: 1,
    optionalDvnCount: 0,
    optionalDvnThreshold: 0,
    requiredDvns: [lzDVNConfigAccount],
    optionalDvns: [],
  },
  receiveUlnConfig: {
    confirmations: 100,
    requiredDvnCount: 1,
    optionalDvnCount: 0,
    optionalDvnThreshold: 0,
    requiredDvns: [lzDVNConfigAccount],
    optionalDvns: [],
  },
  executorConfig: {
    executor: PublicKey.findProgramAddressSync([Buffer.from(EXECUTOR_CONFIG_SEED, 'utf8')], executor)[0],
    maxMessageSize: 10000,
  },
  sendOptions: Options.newOptions().addExecutorLzReceiveOption(65000, 0).toBytes(),
  sendAndCallOptions: Options.newOptions()
    .addExecutorLzReceiveOption(65000, 0)
    .addExecutorComposeOption(0, 50000, 0)
    .toBytes(),
}
