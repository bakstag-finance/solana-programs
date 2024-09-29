use crate::*;
use anchor_spl::token_interface::{ Mint, TokenInterface };
use oapp::endpoint::{ instructions::QuoteParams as EndpointQuoteParams, MessagingFee };

#[derive(Accounts)]
#[instruction(offer_id: [u8; 32])]
pub struct QuoteCancelOfferOrder<'info> {
    #[account(
        mut,
        constraint = offer.src_seller_address == seller.key().to_bytes() @ OtcError::OnlySeller,
    )]
    pub seller: Signer<'info>,

    #[account(seeds = [OtcConfig::OTC_SEED], bump = otc_config.bump)]
    pub otc_config: Account<'info, OtcConfig>,

    #[account(
        seeds = [&offer_id], bump = offer.bump,
        constraint = offer.src_eid == OtcConfig::EID @ OtcError::InvalidEid,
        constraint = offer.src_eid != offer.dst_eid @ OtcError::NotCrosschainOffer
    )]
    pub offer: Account<'info, Offer>,

    #[account(
        mint::token_program = token_program,
        constraint = src_token_mint.key() == Pubkey::new_from_array(offer.src_token_address) @ OtcError::InvalidSrcTokenMint,
    )]
    /// NOTICE: required for monochain offer with src spl token - token_mint
    pub src_token_mint: Option<InterfaceAccount<'info, Mint>>,

    #[account(
        seeds = [Peer::PEER_SEED, otc_config.key().as_ref(), &offer.dst_eid.to_be_bytes()],
        bump = peer.bump
    )]
    /// NOTICE: required for crosschain offer
    pub peer: Account<'info, Peer>,

    #[account(
        seeds = [
            EnforcedOptions::ENFORCED_OPTIONS_SEED,
            otc_config.key().as_ref(),
            &offer.dst_eid.to_be_bytes(),
        ],
        bump = enforced_options.bump
    )]
    /// NOTICE: required for crosschain offer
    pub enforced_options: Account<'info, EnforcedOptions>,

    pub token_program: Option<Interface<'info, TokenInterface>>,
}

impl QuoteCancelOfferOrder<'_> {
    pub fn apply(
        ctx: &mut Context<QuoteCancelOfferOrder>,
        offer_id: &[u8; 32],
        extra_options: &Vec<u8>,
        pay_in_lz_token: bool
    ) -> Result<MessagingFee> {
        let payload = build_cancel_offer_payload(&offer_id);

        let messaging_fee = oapp::endpoint_cpi::quote(
            ctx.accounts.otc_config.endpoint_program,
            ctx.remaining_accounts,
            EndpointQuoteParams {
                sender: ctx.accounts.otc_config.key(),
                dst_eid: ctx.accounts.offer.dst_eid,
                receiver: ctx.accounts.peer.address,
                message: payload,
                pay_in_lz_token,
                options: ctx.accounts.enforced_options.combine_options(&None, extra_options)?,
            }
        )?;

        Ok(messaging_fee)
    }
}
