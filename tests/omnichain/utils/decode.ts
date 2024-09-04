import * as beet from '@metaplex-foundation/beet';

import * as anchor from '@coral-xyz/anchor';
import { OtcMarket } from '../../../target/types/otc_market';

type MessagingFee = {
  nativeFee: anchor.BN;
  lzTokenFee: anchor.BN;
};

export const messagingFeeBeet = new beet.BeetArgsStruct<MessagingFee>(
  [
    ['nativeFee', beet.u64 as beet.FixedSizeBeet<anchor.BN>],
    ['lzTokenFee', beet.u64 as beet.FixedSizeBeet<anchor.BN>],
  ],
  'MessagingFee'
);

type CreateOfferReceipt = anchor.IdlTypes<OtcMarket>['CreateOfferReceipt'];

const createOfferReceiptBeet = new beet.BeetArgsStruct<CreateOfferReceipt>(
  [
    ['offerId', beet.uniformFixedSizeArray(beet.u8, 32)],
    ['srcAmountLd', beet.u64 as beet.FixedSizeBeet<anchor.BN>],
  ],
  'CreateOfferReceipt'
);

export const quoteCreateOfferBeet: beet.FixedSizeBeet<[CreateOfferReceipt, MessagingFee]> = beet.fixedSizeTuple([
  createOfferReceiptBeet,
  messagingFeeBeet,
]);

type AcceptOfferReceipt = anchor.IdlTypes<OtcMarket>['AcceptOfferReceipt'];

const acceptOfferReceiptBeet = new beet.BeetArgsStruct<AcceptOfferReceipt>(
  [
    ['dstAmountLd', beet.u64 as beet.FixedSizeBeet<anchor.BN>],
    ['feeLd', beet.u64 as beet.FixedSizeBeet<anchor.BN>],
  ],
  'AcceptOfferReceipt'
);

export const quoteAcceptOfferBeet: beet.FixedSizeBeet<[AcceptOfferReceipt, MessagingFee]> = beet.fixedSizeTuple([
  acceptOfferReceiptBeet,
  messagingFeeBeet,
]);
