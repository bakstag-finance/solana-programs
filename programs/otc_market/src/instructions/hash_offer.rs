use crate::*;

#[derive(Accounts)]
pub struct HashOffer {}

impl HashOffer {
    pub fn apply(
        src_seller_address: &[u8; 32],
        src_eid: u32,
        dst_eid: u32,
        src_token_address: &[u8; 32],
        dst_token_address: &[u8; 32],
        exchange_rate_sd: u64
    ) -> Result<[u8; 32]> {
        Ok(
            Offer::hash_offer(
                src_seller_address,
                src_eid,
                dst_eid,
                src_token_address,
                dst_token_address,
                exchange_rate_sd
            )
        )
    }
}
