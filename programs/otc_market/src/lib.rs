use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
mod instructions;
pub mod state;

use errors::*;
use events::*;
use instructions::*;
use state::*;

declare_id!("3HbQENo1YoAPd4FDuNJECRWwbbhfbpy2Hjpa59JwH7bu");

#[program]
pub mod otc_market {
    use super::*;

    pub fn initialize(mut ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        Initialize::apply(&mut ctx, &params)
    }

    pub fn create_offer(
        mut ctx: Context<CreateOffer>,
        params: CreateOfferParams
    ) -> Result<CreateOfferReceipt> {
        CreateOffer::apply(&mut ctx, &params)
    }

    pub fn quote_create_offer(
        mut ctx: Context<QuoteCreateOffer>,
        src_seller_address: [u8; 32],
        params: CreateOfferParams
    ) -> Result<CreateOfferReceipt> {
        QuoteCreateOffer::apply(&mut ctx, &src_seller_address, &params)
    }

    pub fn hash_offer(
        mut _ctx: Context<HashOffer>,
        src_seller_address: [u8; 32],
        src_eid: u32,
        dst_eid: u32,
        src_token_address: [u8; 32],
        dst_token_address: [u8; 32],
        exchange_rate_sd: u64
    ) -> Result<[u8; 32]> {
        HashOffer::apply(
            &src_seller_address,
            src_eid,
            dst_eid,
            &src_token_address,
            &dst_token_address,
            exchange_rate_sd
        )
    }

    pub fn quote_accept_offer(
        mut ctx: Context<QuoteAcceptOffer>,
        dst_buyer_address: [u8; 32],
        params: AcceptOfferParams
    ) -> Result<AcceptOfferReceipt> {
        QuoteAcceptOffer::apply(&mut ctx, &dst_buyer_address, &params)
    }

    pub fn accept_offer(
        mut ctx: Context<AcceptOffer>,
        params: AcceptOfferParams
    ) -> Result<AcceptOfferReceipt> {
        AcceptOffer::apply(&mut ctx, &params)
    }

    pub fn quote_cancel_offer(
        mut ctx: Context<QuoteCancelOfferOrder>,
        src_seller_address: [u8; 32],
        params: AcceptOfferParams
    ) -> Result<()> {
        QuoteCancelOfferOrder::apply(&mut ctx, &src_seller_address, &params)
    }
}
