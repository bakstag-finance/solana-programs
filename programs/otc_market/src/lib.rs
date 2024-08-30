use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
mod instructions;
pub mod state;

use errors::*;
use events::*;
use instructions::*;
use state::*;

use oapp::endpoint::{ MessagingFee, MessagingReceipt };

declare_id!("3qAAAcRzN2j6ZJd7SvSndGLkeN9wbxzCnyBy1aciHsXP");

#[program]
pub mod otc_market {
    use super::*;

    /// see [initialize]
    pub fn initialize(mut ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        Initialize::apply(&mut ctx, &params)
    }

    /// see [set_peer]
    pub fn set_peer(mut ctx: Context<SetPeer>, params: SetPeerParams) -> Result<()> {
        SetPeer::apply(&mut ctx, &params)
    }

    /// see [set_enforced_options]
    pub fn set_enforced_options(
        mut ctx: Context<SetEnforcedOptions>,
        params: SetEnforcedOptionsParams
    ) -> Result<()> {
        SetEnforcedOptions::apply(&mut ctx, &params)
    }

    /// see [send]
    pub fn send(mut ctx: Context<Send>, params: SendParams) -> Result<MessagingReceipt> {
        Send::apply(&mut ctx, &params)
    }

    /// see [quote]
    pub fn quote(ctx: Context<Quote>, params: QuoteParams) -> Result<MessagingFee> {
        Quote::apply(&ctx, &params)
    }

    /// see [otc]
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

    /// see [quote_create_offer]
    pub fn quote_create_offer(
        mut ctx: Context<QuoteCreateOffer>,
        src_seller_address: [u8; 32],
        params: CreateOfferParams
    ) -> Result<CreateOfferReceipt> {
        QuoteCreateOffer::apply(&mut ctx, &src_seller_address, &params)
    }

    /// see [create_offer]
    pub fn create_offer(
        mut ctx: Context<CreateOffer>,
        params: CreateOfferParams
    ) -> Result<CreateOfferReceipt> {
        CreateOffer::apply(&mut ctx, &params)
    }

    /// see [quote_accept_offer]
    pub fn quote_accept_offer(
        mut ctx: Context<QuoteAcceptOffer>,
        dst_buyer_address: [u8; 32],
        params: AcceptOfferParams
    ) -> Result<AcceptOfferReceipt> {
        QuoteAcceptOffer::apply(&mut ctx, &dst_buyer_address, &params)
    }

    /// see [accept_offer]
    pub fn accept_offer(
        mut ctx: Context<AcceptOffer>,
        params: AcceptOfferParams
    ) -> Result<AcceptOfferReceipt> {
        AcceptOffer::apply(&mut ctx, &params)
    }

    /// see [quote_cancel_offer]
    pub fn quote_cancel_offer(
        mut ctx: Context<QuoteCancelOfferOrder>,
        src_seller_address: [u8; 32],
        offer_id: [u8; 32]
    ) -> Result<()> {
        QuoteCancelOfferOrder::apply(&mut ctx, &src_seller_address, &offer_id)
    }

    /// see [cancel_offer]
    pub fn cancel_offer(mut ctx: Context<CancelOffer>, offer_id: [u8; 32]) -> Result<()> {
        CancelOffer::apply(&mut ctx, &offer_id)
    }
}
