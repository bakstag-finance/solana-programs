use crate::*;

#[derive(Clone, AnchorSerialize, AnchorDeserialize, Default)]
/// NOTICE: required for correct view() performance
pub struct MessagingFee {
    pub native_fee: u64,
    pub lz_token_fee: u64,
}
