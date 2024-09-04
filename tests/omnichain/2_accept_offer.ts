// import * as anchor from '@coral-xyz/anchor';

// import { PublicKey } from '@solana/web3.js';
// import { Program, Wallet } from '@coral-xyz/anchor';
// import { OtcMarket } from '../../target/types/otc_market';

// import { EndpointProgram, UlnProgram, simulateTransaction } from '@layerzerolabs/lz-solana-sdk-v2';
// import { PacketPath, bytes32ToEthAddress } from '@layerzerolabs/lz-v2-utilities';
// import { hexlify } from 'ethers/lib/utils';

// import { solanaToArbSepConfig as peer } from './config/peer';
// import { Accounts, genAccounts } from '../helpers/helper';
// import { ACCEPT_OFFER_AMOUNTS, CREATE_OFFER_AMOUNTS, EXCHANGE_RATE_SD } from '../helpers/constants';
// import { quoteCreateOfferBeet } from './utils/decode';
// import { OfferInfo } from '../helpers/create_offer';

// describe('Accept Offer', () => {
//   const provider = anchor.AnchorProvider.env();
//   anchor.setProvider(provider);
//   const program = anchor.workspace.OtcMarket as Program<OtcMarket>;
//   const programId = program.programId;
//   const connection = provider.connection;
//   const wallet = provider.wallet as Wallet;
//   const commitment = 'confirmed';

//   let accounts: Accounts;
//   let endpoint: EndpointProgram.Endpoint;

//   before(async () => {
//     accounts = await genAccounts(connection, program.programId, wallet.payer);
//     endpoint = new EndpointProgram.Endpoint(accounts.endpoint);
//   });

//   it('should quote accept offer', async () => {
//     const path: PacketPath = {
//       dstEid: peer.to.eid,
//       srcEid: 40168,
//       sender: hexlify(accounts.otcConfig.toBytes()),
//       receiver: bytes32ToEthAddress(peer.peerAddress),
//     };

//     const sendLib = new UlnProgram.Uln(
//       (await endpoint.getSendLibrary(connection, accounts.otcConfig, peer.to.eid)).programId
//     );

//     const buyerAddress = Array.from(wallet.publicKey.toBytes());

//     const acceptOfferParams: anchor.IdlTypes<OtcMarket>['AcceptOfferParams'] = {
//       offerId: Array.from(wallet.publicKey.toBytes()),
//       srcAmountSd: new anchor.BN(ACCEPT_OFFER_AMOUNTS.srcAmountSd),
//       srcBuyerAddress: buyerAddress,
//     };

//     const [peerAccount, _] = PublicKey.findProgramAddressSync(
//       [
//         Buffer.from('Peer', 'utf8'),
//         accounts.otcConfig.toBytes(),
//         new anchor.BN(peer.to.eid).toArrayLike(Buffer, 'be', 4),
//       ],
//       programId
//     );

//     const [enforcedOptions, __] = PublicKey.findProgramAddressSync(
//       [
//         Buffer.from('EnforcedOptions', 'utf8'),
//         accounts.otcConfig.toBuffer(),
//         new anchor.BN(peer.to.eid).toBuffer('be', 4),
//       ],
//       programId
//     );

//     const ix = await program.methods
//       .quoteAcceptOffer(buyerAddress, acceptOfferParams, false)
//       .accounts({
//         otcConfig: accounts.otcConfig,
//         offer: wallet.publicKey, // TODO: created offer
//         dstTokenMint: null, // TODO: fetch it from offer
//         peer: peerAccount,
//         enforcedOptions,
//       })
//       .remainingAccounts(await endpoint.getQuoteIXAccountMetaForCPI(connection, wallet.publicKey, path, sendLib))
//       .instruction();

//     const response = await simulateTransaction(connection, [ix], programId, wallet.publicKey, commitment);

//     const parsed = quoteCreateOfferBeet.read(response, 0);

//     console.log('offer id', parsed[0].offerId);
//     console.log('src amount ld', parsed[0].srcAmountLd);

//     console.log('native fee', parsed[1].nativeFee);
//     console.log('lz token fee', parsed[1].lzTokenFee);
//   });
// });
