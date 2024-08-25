use crate::*;
use anchor_spl::token_interface::{ Mint, TokenInterface };

#[derive(Accounts)]
#[instruction(src_seller_address: [u8; 32], offer_id: [u8; 32])]
pub struct QuoteCancelOfferOrder<'info> {
    #[account(mut)]
    /// NOTICE: required for monochain offer
    pub seller: Option<Signer<'info>>,

    #[account(seeds = [OtcConfig::OTC_SEED], bump = otc_config.bump)]
    pub otc_config: Account<'info, OtcConfig>,

    #[account(
        seeds = [&offer_id], bump = offer.bump,
        constraint = offer.src_eid == OtcConfig::EID @ OtcError::InvalidEid,
        constraint = offer.src_seller_address == src_seller_address @ OtcError::OnlySeller,
    )]
    pub offer: Account<'info, Offer>,

    #[account(
        mint::token_program = token_program,
        constraint = src_token_mint.key() == Pubkey::new_from_array(offer.src_token_address) @ OtcError::InvalidSrcTokenMint,
    )]
    /// NOTICE: required for monochain offer with src spl token - token_mint
    pub src_token_mint: Option<InterfaceAccount<'info, Mint>>,

    pub token_program: Option<Interface<'info, TokenInterface>>,
}

impl QuoteCancelOfferOrder<'_> {
    pub fn apply(
        _ctx: &mut Context<QuoteCancelOfferOrder>,
        _src_seller_address: &[u8; 32],
        _params: &AcceptOfferParams
    ) -> Result<()> {
        Ok(())
    }
}
