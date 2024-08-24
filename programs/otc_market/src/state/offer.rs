use crate::*;
use anchor_lang::solana_program::keccak::hash;

#[account]
#[derive(InitSpace)]
pub struct Offer {
    pub src_seller_address: [u8; 32],
    pub dst_seller_address: [u8; 32],
    pub src_eid: u32,
    pub dst_eid: u32,
    pub src_token_address: [u8; 32],
    pub dst_token_address: [u8; 32],
    pub src_amount_sd: u64,
    pub exchange_rate_sd: u64,

    pub bump: u8,
}

impl Offer {
    pub fn hash_offer(
        src_seller_address: &[u8; 32],
        src_eid: u32,
        dst_eid: u32,
        src_token_address: &[u8; 32],
        dst_token_address: &[u8; 32],
        exchange_rate_sd: u64
    ) -> [u8; 32] {
        hash(
            &[
                src_seller_address,
                &src_eid.to_be_bytes()[..],
                &dst_eid.to_be_bytes()[..],
                src_token_address,
                dst_token_address,
                &exchange_rate_sd.to_be_bytes()[..],
            ].concat()
        ).to_bytes()
    }

    pub fn init(&mut self, offer: &Offer) -> [u8; 32] {
        self.src_seller_address = offer.src_seller_address;
        self.dst_seller_address = offer.dst_seller_address;
        self.src_eid = offer.src_eid;
        self.dst_eid = offer.dst_eid;
        self.src_token_address = offer.src_token_address;
        self.dst_token_address = offer.dst_token_address;
        self.src_amount_sd = offer.src_amount_sd;
        self.exchange_rate_sd = offer.exchange_rate_sd;

        self.bump = offer.bump;

        Offer::hash_offer(
            &offer.src_seller_address,
            offer.src_eid,
            offer.dst_eid,
            &offer.src_token_address,
            &offer.dst_token_address,
            offer.exchange_rate_sd
        )
    }
}
