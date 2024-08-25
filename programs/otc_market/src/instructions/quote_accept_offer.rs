use crate::*;
use anchor_spl::token_interface::{ Mint, TokenInterface };

#[derive(Accounts)]
#[instruction(_dst_buyer_address: [u8; 32], params: AcceptOfferParams)]
pub struct QuoteAcceptOffer<'info> {
    #[account(seeds = [OtcConfig::OTC_SEED], bump = otc_config.bump)]
    pub otc_config: Account<'info, OtcConfig>,

    #[account(
        seeds = [&params.offer_id], 
        bump = offer.bump,
        constraint = offer.dst_eid == OtcConfig::EID @ OtcError::InvalidEid,
        constraint = offer.src_amount_sd >= params.src_amount_sd @ OtcError::ExcessiveAmount
    )]
    pub offer: Account<'info, Offer>,

    #[account(
        mint::token_program = token_program,
        constraint = dst_token_mint.key() == Pubkey::new_from_array(offer.dst_token_address) @ OtcError::InvalidDstTokenMint,
        constraint = dst_token_mint.decimals >= OtcConfig::SHARED_DECIMALS @ OtcError::InvalidLocalDecimals
    )]
    /// NOTICE: required for dst spl token - token_mint
    pub dst_token_mint: Option<InterfaceAccount<'info, Mint>>,

    pub token_program: Option<Interface<'info, TokenInterface>>,
}

impl QuoteAcceptOffer<'_> {
    pub fn apply(
        ctx: &mut Context<QuoteAcceptOffer>,
        _dst_buyer_address: &[u8; 32],
        params: &AcceptOfferParams
    ) -> Result<AcceptOfferReceipt> {
        Ok(
            OtcConfig::to_dst_amount(
                params.src_amount_sd,
                ctx.accounts.offer.exchange_rate_sd,
                ctx.accounts.dst_token_mint.as_ref()
            )
        )
    }
}
