use crate::*;

#[event]
pub struct OfferCreated {
    pub offer_id: [u8; 32],
    pub src_seller_address: [u8; 32],
    pub dst_seller_address: [u8; 32],
    pub src_eid: u32,
    pub dst_eid: u32,
    pub src_token_address: [u8; 32],
    pub dst_token_address: [u8; 32],
    pub src_amount_sd: u64,
    pub exchange_rate_sd: u64,
}

#[event]
pub struct OfferAccepted {
    pub offer_id: [u8; 32],
    pub src_amount_sd: u64,
    pub src_buyer_address: [u8; 32],
    pub dst_buyer_address: [u8; 32],
}

#[event]
pub struct OfferCanceled {
    pub offer_id: [u8; 32],
}
