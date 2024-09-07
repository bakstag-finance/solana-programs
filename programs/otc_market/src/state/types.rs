use anchor_lang::prelude::*;

#[derive(Clone, AnchorSerialize, AnchorDeserialize, Default)]
pub struct MessagingFee {
    pub native_fee: u64,
    pub lz_token_fee: u64,
}
